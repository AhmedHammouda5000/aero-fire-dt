"""General model + LOCAL learning, demonstrated on an independent site (NIST FR 4019 kitchen tests).

Idea (product architecture):
  1. GENERAL model  = trained on all the sites we already have (here: the Industrial Hall).
  2. LOCAL learning = during the pilot of a new site, the runs recorded THERE (its own nuisances:
     cooking, steam, solvent...) are added to the training set -> site model.
  3. The certified alarm panel stays in charge the whole time; the AI only advises.

Honest protocol: every NIST test is ALWAYS judged by a model that never saw that test
(leave-one-test-out). No thresholds are changed: same voting rule, same P_FIRE / P_NUIS.
Features: the 7 features that exist on NIST (see nist_fr4019.py).

Experiments
  A  general only (hall)                       -> what a new site gets on day 1
  B  general + local "full pilot"              -> hall + all OTHER NIST tests (leave-one-test-out)
  C  general + local "short pilot"             -> hall + a random 30 % of NIST tests, tested on the rest
                                                  (20 random draws, mean and range)
  D  local only (no hall)                      -> leave-one-test-out on NIST alone, for comparison

Run: python -I -m ai.external_test.site_adaptation   -> docs/results/site_adaptation.{json,md}
"""
from __future__ import annotations

import json
import time

import numpy as np
import pandas as pd

from ai.alarm_verifier import verifier as V
from ai.external_test.nist_fr4019 import (DATA, META, RED_FEATURES, hall_frame, nist_frame, parse_test,
                                          verdict_of, wilson)
from ai.common.data import ROOT

OUT = ROOT / "docs" / "results"
LOCAL_WEIGHT = 1.0          # local runs count like general runs (episode-balanced weights)


def train_site_model(general_rows: pd.DataFrame, local_rows: pd.DataFrame | None, local_weight: float = LOCAL_WEIGHT):
    """The reusable 'local learning' step: general data + the new site's own runs -> site model."""
    rows = general_rows if local_rows is None or local_rows.empty else pd.concat([general_rows, local_rows], ignore_index=True)
    y = (rows["label"] == "fire").astype(int).values
    w = V.episode_weights(rows["episode"], y)
    if local_rows is not None and not local_rows.empty and local_weight != 1.0:
        w = w * np.where(rows["episode"].str.startswith("NIST-"), local_weight, 1.0)
    m = V.make_model()
    m.fit(rows[RED_FEATURES].values, y, sample_weight=w)
    return m


def load_nist():
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    tests = sorted(int(k[3:]) for k in manifest["files"])
    out = {}
    for n in tests:
        f, status = nist_frame(n, parse_test(n), "NUM")
        if f is None:
            continue
        win = f[(f["t"] >= 0) & (f["t"] <= META[n]["t_end_s"])].sort_values(["Date", "node"]).copy()
        win["label"] = META[n]["label"]
        win["episode"] = f"NIST-MHN{n:02d}"
        ch = V.channels(win)
        win["active"] = ch["chA"] | ch["chB"]
        out[n] = win
    return out


def judge(model, win: pd.DataFrame) -> dict:
    tl = V.hall_timeline(win, model.predict_proba(win[RED_FEATURES].values)[:, 1])
    v = verdict_of(tl)
    return {"verdict": v, "max_p": float(np.nanmax(tl["p"])) if tl["p"].notna().any() else None}


def score(rows: list[dict]) -> dict:
    f = [r for r in rows if r["label"] == "fire"]; n = [r for r in rows if r["label"] != "fire"]
    kf = sum(r["verdict"] == "FIRE" for r in f); kn = sum(r["verdict"] != "FIRE" for r in n)
    return {"fires_confirmed": f"{kf}/{len(f)}", "fires_wilson95": wilson(kf, len(f)) if f else None,
            "nuisances_not_called_fire": f"{kn}/{len(n)}", "nuisances_wilson95": wilson(kn, len(n)) if n else None,
            "nuisances_rejected_as_NUISANCE": f"{sum(r['verdict'] == 'NUISANCE' for r in n)}/{len(n)}",
            "_kf": kf, "_nf": len(f), "_kn": kn, "_nn": len(n)}


def by_source(rows):
    out = {}
    for r in rows:
        d = out.setdefault(r["source"], {"label": r["label"], "n": 0, "FIRE": 0, "NUISANCE": 0, "UNCERTAIN": 0, "NO_ACTIVITY": 0})
        d["n"] += 1; d[r["verdict"]] += 1
    return out


def main():
    t0 = time.time()
    hf = hall_frame()
    general = hf[(hf["episode"] != "") & hf["active"]].copy()
    nist = load_nist()
    local_rows = {n: w[w["active"]] for n, w in nist.items()}
    tests = sorted(nist)
    meta = lambda n: {"test": f"MHN{n:02d}", "source": META[n]["source"], "label": META[n]["label"]}
    res = {}

    # A: general only
    gm = train_site_model(general, None)
    A = [{**meta(n), **judge(gm, nist[n])} for n in tests]
    res["A_general_only"] = A
    print("A general only", {k: v for k, v in score(A).items() if not k.startswith("_")})

    # B: general + local, leave-one-test-out (full pilot)
    B = []
    for n in tests:
        loc = pd.concat([local_rows[k] for k in tests if k != n], ignore_index=True)
        B.append({**meta(n), **judge(train_site_model(general, loc), nist[n])})
    res["B_general_plus_local_full_pilot"] = B
    print("B general+local (LOTO)", {k: v for k, v in score(B).items() if not k.startswith("_")})

    # C: short pilot = 30 % of the tests (at least 2 fires), 20 random draws
    rng = np.random.default_rng(7)
    fires = [n for n in tests if META[n]["label"] == "fire"]; nuis = [n for n in tests if META[n]["label"] != "fire"]
    draws = []
    for d in range(20):
        pf = list(rng.choice(fires, 2, replace=False)); pn = list(rng.choice(nuis, round(0.3 * len(nuis)), replace=False))
        pilot = set(pf + pn)
        m = train_site_model(general, pd.concat([local_rows[k] for k in pilot], ignore_index=True))
        rows = [{**meta(n), **judge(m, nist[n])} for n in tests if n not in pilot]
        s = score(rows)
        draws.append({"pilot_tests": sorted(f"MHN{k:02d}" for k in pilot), "fire_rate": s["_kf"] / s["_nf"], "nuis_rate": s["_kn"] / s["_nn"],
                      "fires": s["fires_confirmed"], "nuisances": s["nuisances_not_called_fire"]})
    fr = [x["fire_rate"] for x in draws]; nr = [x["nuis_rate"] for x in draws]
    res["C_general_plus_short_pilot"] = {"draws": draws, "fire_rate_mean": round(float(np.mean(fr)), 3), "fire_rate_min": round(float(np.min(fr)), 3),
                                         "nuis_rate_mean": round(float(np.mean(nr)), 3), "nuis_rate_min": round(float(np.min(nr)), 3), "nuis_rate_max": round(float(np.max(nr)), 3)}
    print("C short pilot", {k: v for k, v in res["C_general_plus_short_pilot"].items() if k != "draws"})

    # D: local only (no general data), leave-one-test-out
    D = []
    for n in tests:
        loc = pd.concat([local_rows[k] for k in tests if k != n], ignore_index=True)
        y = (loc["label"] == "fire").astype(int).values
        m = V.make_model(); m.fit(loc[RED_FEATURES].values, y, sample_weight=V.episode_weights(loc["episode"], y))
        D.append({**meta(n), **judge(m, nist[n])})
    res["D_local_only"] = D
    print("D local only (LOTO)", {k: v for k, v in score(D).items() if not k.startswith("_")})

    # does local learning break the ORIGINAL site? hall LOEO is unchanged by construction for the hall model;
    # check the site model on the hall fire/nuisance episodes it was trained with is not meaningful -> instead
    # check the full general+local model on held-out hall episodes (leave-one-hall-episode-out, quick: fires only kept)
    summary = {k: {kk: vv for kk, vv in score(v).items() if not kk.startswith("_")} for k, v in res.items() if isinstance(v, list)}
    summary["C_general_plus_short_pilot"] = {k: v for k, v in res["C_general_plus_short_pilot"].items() if k != "draws"}
    out = {"what": "General model + local learning, proven on an independent site (NIST FR 4019)",
           "protocol": "each NIST test judged by a model that never saw it; same voting rule and thresholds; 7 features available on NIST",
           "summary": summary, "by_source_A": by_source(A), "by_source_B": by_source(B), "details": res,
           "runtime_s": round(time.time() - t0, 1)}
    (OUT / "site_adaptation.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
    print(json.dumps(summary, indent=1)); print("by source B:", json.dumps(by_source(B)))


if __name__ == "__main__":
    main()
