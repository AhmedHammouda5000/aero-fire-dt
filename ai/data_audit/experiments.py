"""Quick, read-only experiments for the data audit (does NOT retrain or overwrite the production model).

  E1  where are the background false alarms of the production model (model.pkl)?
      sensitivity of the background rate to the POST exclusion window and to the unannounced
      nuisance event (Background rows with nuisance=1, 13 Jul 14:02-14:15).
  E2  leave-one-SCENARIO-out (LOSO) vs leave-one-episode-out: generalisation to an unseen nuisance type.
  E3  per-node noise normalisation of the model inputs (z-score of rises by each node's own
      background noise, estimated causally on the first 90 min of recording) -> LOEO + EN54.

Usage: python -I ai/data_audit/experiments.py [E1|E2|E3 ...]     (default: all, ~3-4 min)
"""
from __future__ import annotations

import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ai.common.data import FEATURES, add_features, load_en54, load_hall  # noqa: E402
from ai.alarm_verifier import verifier as V  # noqa: E402
from ai.alarm_verifier.train_eval import (episode_table, evaluate_episode, prepare,  # noqa: E402
                                          summarize)

CACHE = ROOT / "data_raw" / "hall_features.pkl"


def hall() -> pd.DataFrame:
    f = pd.read_pickle(CACHE) if CACHE.exists() else add_features(load_hall())
    return prepare(f)


def short(s: dict) -> str:
    return (f"fires {s['fire_runs_detected_ai']}/{s['fire_runs']}  "
            f"nuisances rejected {s['nuisance_runs'] - s['nuisance_runs_false_alarm_ai']}/{s['nuisance_runs']}  "
            f"t_fire_med={s['t_ai_fire_median_s']}s")


# ---------------------------------------------------------------------------------------------
def e1(f: pd.DataFrame) -> None:
    print("\n=== E1  background false alarms of the production model ===")
    with open(ROOT / "ai" / "alarm_verifier" / "results" / "model.pkl", "rb") as fh:
        model = pickle.load(fh)
    raw = pd.read_csv(ROOT / "data_raw" / "industrial_hall" / "industrial_hall.csv",
                      usecols=["Date", "Sensor_ID", "nuisance", "scenario_label"])
    raw["Date"] = pd.to_datetime(raw["Date"], utc=True)
    unann = raw.loc[(raw["scenario_label"] == "Background") & (raw["nuisance"] == 1), "Date"]
    u0, u1 = unann.min(), unann.max()
    eps = episode_table(f, min_rows=1)
    for post_min in (15, 30, 60):
        for drop_unann in (False, True):
            mask = f["label"] == "background"
            for r in eps.itertuples():
                mask &= ~((f["Date"] >= r.start) & (f["Date"] <= r.end + pd.Timedelta(minutes=post_min)))
            if drop_unann:
                mask &= ~((f["Date"] >= u0) & (f["Date"] <= u1 + pd.Timedelta(minutes=post_min)))
            bg = f[mask]
            p = model.predict_proba(bg[FEATURES].values)[:, 1]
            bg = bg.assign(_p=p)
            seg = (bg["Date"].diff() > pd.Timedelta("5min")).cumsum()
            hours, events, opt, where = 0.0, 0, 0, []
            for _, g in bg.groupby(seg):
                if len(g) < 30:
                    continue
                tl = V.hall_timeline(g, g["_p"].values)
                hours += (g["Date"].max() - g["Date"].min()).total_seconds() / 3600
                st = (tl["verdict"] == "FIRE") & (tl["verdict"].shift() != "FIRE")
                events += int(st.sum())
                opt += int((tl["optical"] & ~tl["optical"].shift(fill_value=False)).sum())
                where += [str(t) for t in tl.loc[st, "t"]]
            print(f"  POST={post_min:2d} min  exclude_unannounced={drop_unann!s:5s}  hours={hours:5.1f}  "
                  f"AI FIRE events={events} {where}  optical trips={opt}")


# ---------------------------------------------------------------------------------------------
def e2(f: pd.DataFrame) -> None:
    print("\n=== E2  leave-one-SCENARIO-out (all repetitions of the tested scenario removed) ===")
    eps = episode_table(f)
    train_rows = f[(f["episode"] != "") & f["active"]]
    res = []
    for sc in eps["scenario"].unique():
        model = V.fit(train_rows[train_rows["scenario"] != sc])
        for r in eps[eps["scenario"] == sc].itertuples():
            res.append(evaluate_episode(f, model, r)[0])
    res = pd.DataFrame(res)
    print("  LOSO:", short(summarize(res)))
    wrong = res[(res["label"] == "fire") != res["ai_fire"]]
    print("  wrong verdicts:", wrong[["episode", "label", "ai_fire", "max_p"]].to_dict("records"))
    print("  per scenario (AI FIRE runs / runs):")
    print(res.groupby(["label", "scenario"])["ai_fire"].agg(["sum", "count"]).to_string())


# ---------------------------------------------------------------------------------------------
NORM_COLS = ["d_CO", "d_H2", "d_VOC", "d_CO2", "d_TEMP", "d_HUM",
             "slope_CO", "slope_H2", "slope_VOC", "slope_PMTOT", "slope_TEMP", "slope_CO2"]


def node_scale(f: pd.DataFrame, minutes: int = 90) -> pd.DataFrame:
    """Robust noise scale per node from the first `minutes` of recording (causal: before any run)."""
    t0 = f["Date"].min()
    cal = f[(f["Date"] < t0 + pd.Timedelta(minutes=minutes)) & (f["label"] == "background")]
    mad = cal.groupby("node")[NORM_COLS].agg(lambda s: (s - s.median()).abs().median())
    floor = mad.replace(0, np.nan).median().fillna(1.0)       # avoid /0 on quantised sensors
    return mad.where(mad > 0, floor, axis=1).clip(lower=floor * 0.25, axis=1)


def normalised(f: pd.DataFrame) -> np.ndarray:
    sc = node_scale(f)
    X = f[FEATURES].copy()
    X[NORM_COLS] = f[NORM_COLS].values / sc.reindex(f["node"]).values
    return X.values


def eval_with_X(f, X, model, r):
    idx = np.flatnonzero(((f["Date"] >= r.start) & (f["Date"] <= r.end)).values)
    win = f.iloc[idx]
    p = model.predict_proba(X[idx])[:, 1]
    tl = V.hall_timeline(win, p)
    tl["t_rel_s"] = (tl["t"] - r.start.floor("10s")).dt.total_seconds()
    inside = tl[tl["t_rel_s"] >= 0]
    first = lambda m: (float(inside.loc[m, "t_rel_s"].iloc[0]) if m.any() else None)
    return {"label": r.label, "scenario": r.scenario,
            "ai_fire": bool((inside["verdict"] == "FIRE").any()),
            "t_ai_fire_s": first(inside["verdict"] == "FIRE"),
            "t_first_activity_s": first(inside["active_nodes"] > 0),
            "optical_trip": bool(inside["optical"].any()), "t_optical_s": first(inside["optical"])}


def e3(f: pd.DataFrame) -> None:
    print("\n=== E3  per-node noise normalisation of model inputs (channels/thresholds unchanged) ===")
    sc = node_scale(f)
    print("  hall per-node scale (MAD over first 90 min), selected columns:")
    print(sc[["d_CO", "d_H2", "d_VOC", "d_CO2", "slope_PMTOT"]].round(3).to_string())
    X = normalised(f)
    eps = episode_table(f)
    tr_mask = ((f["episode"] != "") & f["active"]).values
    tr = f[tr_mask]
    Xtr = X[tr_mask]

    def fit(m):
        y = (tr.loc[m, "label"] == "fire").astype(int).values
        mod = V.make_model()
        mod.fit(Xtr[m.values], y, sample_weight=V.episode_weights(tr.loc[m, "episode"], y))
        return mod

    res = [eval_with_X(f, X, fit(tr["episode"] != r.Index), r) for r in eps.itertuples()]
    print("  LOEO normalised:", short(summarize(pd.DataFrame(res))))
    final = fit(pd.Series(True, index=tr.index))
    e = prepare(add_features(load_en54()))
    Xe = normalised(e)
    cs = [eval_with_X(e, Xe, final, r) for r in episode_table(e).itertuples()]
    print("  EN54 cross-site normalised:", short(summarize(pd.DataFrame(cs))))
    print("  (reference production, metrics.json: LOEO 17/17 fires, 11/15 nuisances; EN54 12/13, 7/7)")


if __name__ == "__main__":
    t0 = time.time()
    todo = sys.argv[1:] or ["E1", "E2", "E3"]
    f = hall()
    for k in todo:
        {"E1": e1, "E2": e2, "E3": e3}[k](f)
        print(f"  [{k} done, t={time.time() - t0:.0f}s]")
