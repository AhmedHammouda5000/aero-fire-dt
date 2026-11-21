"""Train and honestly evaluate the Aero-Fire DT alarm verifier.

Evaluation protocol (no leakage):
  1. Leave-one-episode-out on the Industrial Hall dataset: every test run (scenario + repetition)
     is predicted by a model that never saw ANY row of that run.
  2. Baseline: a classic single-criterion optical smoke detector (particles only).
  3. Background false alarms: hall-level verdicts on normal periods (clean air).
  4. Cross-site: model trained on the Industrial Hall, tested on the EN54 room (other site).

Usage: python -m ai.alarm_verifier.train_eval
"""
from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import balanced_accuracy_score

from ai.common.data import (FEATURES, ROOT, SCENARIO_FR, add_features, label_of, load_en54,
                            load_hall)
from ai.alarm_verifier import verifier as V

OUT = ROOT / "ai" / "alarm_verifier" / "results"
PRE = pd.Timedelta("5min")      # context shown before each run
POST = pd.Timedelta("15min")    # lingering smoke after a run is not "clean background"


def prepare(f: pd.DataFrame) -> pd.DataFrame:
    f = f.copy()
    f["label"] = f["scenario"].map(label_of)
    f["episode"] = np.where(f["label"] == "background", "",
                            f["scenario"] + "#" + f["exp"].astype(str))
    ch = V.channels(f)
    f["active"] = ch["chA"] | ch["chB"]
    return f


def episode_table(f: pd.DataFrame, min_rows: int = 50) -> pd.DataFrame:
    ev = f[f["episode"] != ""].groupby("episode").agg(
        scenario=("scenario", "first"), label=("label", "first"),
        start=("Date", "min"), end=("Date", "max"), rows=("Date", "size"))
    return ev[ev["rows"] >= min_rows].sort_values("start")


def evaluate_episode(f, model, ep_row) -> tuple[dict, pd.DataFrame]:
    # The verdict state machine starts at the beginning of the run (features stay causal and
    # use the past baseline): leftover smoke from a previous test cannot pre-latch a verdict.
    win = f[(f["Date"] >= ep_row.start) & (f["Date"] <= ep_row.end)]
    p = model.predict_proba(win[FEATURES].values)[:, 1]
    tl = V.hall_timeline(win, p)
    tl["t_rel_s"] = (tl["t"] - ep_row.start.floor("10s")).dt.total_seconds()
    inside = tl[tl["t_rel_s"] >= 0]
    first = lambda m: (float(inside.loc[m, "t_rel_s"].iloc[0]) if m.any() else None)
    res = {
        "episode": ep_row.Index, "scenario": ep_row.scenario, "label": ep_row.label,
        "duration_s": (ep_row.end - ep_row.start).total_seconds(),
        "ai_fire": bool((inside["verdict"] == "FIRE").any()),
        "t_ai_fire_s": first(inside["verdict"] == "FIRE"),
        "t_first_activity_s": first(inside["active_nodes"] > 0),
        "optical_trip": bool(inside["optical"].any()),
        "t_optical_s": first(inside["optical"]),
        "ai_nuisance_flag": bool((inside["verdict"] == "NUISANCE").any()),
        "max_p": float(np.nanmax(inside["p"])) if inside["p"].notna().any() else None,
    }
    return res, tl


def summarize(eps: pd.DataFrame) -> dict:
    fire, nuis = eps[eps.label == "fire"], eps[eps.label == "nuisance"]
    out = {
        "fire_runs": int(len(fire)),
        "fire_runs_detected_ai": int(fire.ai_fire.sum()),
        "fire_runs_detected_optical": int(fire.optical_trip.sum()),
        "nuisance_runs": int(len(nuis)),
        "nuisance_runs_false_alarm_ai": int(nuis.ai_fire.sum()),
        "nuisance_runs_false_alarm_optical": int(nuis.optical_trip.sum()),
    }
    out["fire_detection_rate_ai"] = out["fire_runs_detected_ai"] / max(1, out["fire_runs"])
    out["nuisance_rejection_rate_ai"] = 1 - out["nuisance_runs_false_alarm_ai"] / max(1, out["nuisance_runs"])
    out["nuisance_rejection_rate_optical"] = 1 - out["nuisance_runs_false_alarm_optical"] / max(1, out["nuisance_runs"])
    tf = fire.t_ai_fire_s.dropna()
    to = fire.t_optical_s.dropna()
    out["t_ai_fire_median_s"] = float(tf.median()) if len(tf) else None
    out["t_ai_fire_max_s"] = float(tf.max()) if len(tf) else None
    out["t_optical_median_s"] = float(to.median()) if len(to) else None
    # Verdict delay after the sensors first notice something (the part the AI controls)
    lag = (fire.t_ai_fire_s - fire.t_first_activity_s).dropna()
    out["ai_verdict_after_first_activity_median_s"] = float(lag.median()) if len(lag) else None
    out["ai_verdict_after_first_activity_max_s"] = float(lag.max()) if len(lag) else None
    return out


def background_false_alarms(f, model) -> dict:
    eps = episode_table(f, min_rows=1)
    mask = f["label"] == "background"
    for r in eps.itertuples():
        mask &= ~((f["Date"] >= r.start) & (f["Date"] <= r.end + POST))
    bg = f[mask]
    p = model.predict_proba(bg[FEATURES].values)[:, 1]
    bg = bg.assign(_p=p)
    seg = (bg["Date"].diff() > pd.Timedelta("5min")).cumsum()
    hours, fire_bins, opt_bins, bins_total, fire_events, opt_events = 0.0, 0, 0, 0, 0, 0
    for _, g in bg.groupby(seg):
        if len(g) < 30:
            continue
        tl = V.hall_timeline(g, g["_p"].values)
        hours += (g["Date"].max() - g["Date"].min()).total_seconds() / 3600
        bins_total += len(tl)
        fire_bins += int((tl["verdict"] == "FIRE").sum())
        opt_bins += int(tl["optical"].sum())
        fire_events += int(((tl["verdict"] == "FIRE") & (tl["verdict"].shift() != "FIRE")).sum())
        opt_events += int((tl["optical"] & ~tl["optical"].shift(fill_value=False)).sum())
    return {"background_hours": round(hours, 1), "ai_fire_events": fire_events,
            "optical_trip_events": opt_events,
            "ai_fire_events_per_100h": round(100 * fire_events / max(hours, 1e-9), 2),
            "optical_trip_events_per_100h": round(100 * opt_events / max(hours, 1e-9), 2)}


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    cache = ROOT / "data_raw" / "hall_features.pkl"
    if cache.exists():
        f = pd.read_pickle(cache)
    else:
        f = add_features(load_hall())
        f.to_pickle(cache)  # reused by scenarios/build_scenarios.py
    f = prepare(f)
    eps = episode_table(f)
    print(f"Industrial Hall: {len(f):,} rows, {len(eps)} test runs "
          f"({(eps.label == 'fire').sum()} fires, {(eps.label == 'nuisance').sum()} nuisances)")

    train_rows = f[(f["episode"] != "") & f["active"]]

    # 1) leave-one-episode-out
    results, timelines, row_true, row_pred = [], {}, [], []
    for r in eps.itertuples():
        model = V.fit(train_rows[train_rows["episode"] != r.Index])
        res, tl = evaluate_episode(f, model, r)
        results.append(res)
        timelines[r.Index] = tl
        held = train_rows[train_rows["episode"] == r.Index]
        if len(held):
            row_true += list((held["label"] == "fire").astype(int))
            row_pred += list(model.predict(held[FEATURES].values))
        print(f"  {r.Index:22s} {r.label:8s} AI fire={res['ai_fire']!s:5s} "
              f"t={res['t_ai_fire_s']}  optical={res['optical_trip']!s:5s} t={res['t_optical_s']}")
    eps_res = pd.DataFrame(results)
    eps_res["scenario_fr"] = eps_res["scenario"].map(SCENARIO_FR)
    summary = summarize(eps_res)
    summary["row_level_balanced_accuracy_loeo"] = round(
        balanced_accuracy_score(row_true, row_pred), 4)

    # 2) final model on all hall runs
    final = V.fit(train_rows)
    with open(OUT / "model.pkl", "wb") as fh:
        pickle.dump(final, fh)

    # 3) background false alarms (normal periods)
    summary["background"] = background_false_alarms(f, final)

    # 4) cross-site: EN54 room
    e = prepare(add_features(load_en54()))
    e_eps = episode_table(e)
    cs = []
    for r in e_eps.itertuples():
        res, _ = evaluate_episode(e, final, r)
        cs.append(res)
    cs = pd.DataFrame(cs)
    cs["scenario_fr"] = cs["scenario"].map(SCENARIO_FR)
    cross = summarize(cs)
    e_rows = e[(e["episode"] != "") & e["active"]]
    cross["row_level_balanced_accuracy"] = round(balanced_accuracy_score(
        (e_rows["label"] == "fire").astype(int), final.predict(e_rows[FEATURES].values)), 4)
    summary["cross_site_en54"] = cross

    # feature importance (permutation, on hall event rows) for the "why" panel
    from sklearn.inspection import permutation_importance
    sample = train_rows.sample(min(20000, len(train_rows)), random_state=0)
    pi = permutation_importance(final, sample[FEATURES].values,
                                (sample["label"] == "fire").astype(int).values,
                                n_repeats=3, random_state=0, scoring="balanced_accuracy")
    summary["feature_importance"] = dict(sorted(
        zip(FEATURES, np.round(pi.importances_mean, 4).tolist()), key=lambda kv: -kv[1]))

    summary["settings"] = {k: getattr(V, k) for k in
                           ["CH_A_PM", "CH_B_CO", "CH_B_H2", "CH_B_VOC", "CH_C_TEMP",
                            "OPTICAL_TRIP", "P_FIRE", "P_NUIS", "CONFIRM_BINS", "EMA", "DUAL_CHANNEL"]}
    summary["runtime_s"] = round(time.time() - t0, 1)

    eps_res.to_csv(OUT / "episodes_hall_loeo.csv", index=False)
    cs.to_csv(OUT / "episodes_en54_crosssite.csv", index=False)
    with open(OUT / "timelines_hall_loeo.pkl", "wb") as fh:
        pickle.dump(timelines, fh)
    (OUT / "metrics.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
