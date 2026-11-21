"""Early caution "FEU COUVANT POSSIBLE" evaluated on the leave-one-episode-out hall timelines.

Rule: hall fire score >= P_FIRE for CONFIRM_BINS consecutive bins, at least one channel (particles or gas)
active, and a signal still RISING over the last 60 s (particles +0.5 log, CO +0.3 ppm or H2 +1.0).
It is a caution ("send someone to check"), never a fire confirmation: confirmation keeps the dual-channel rule.
Run: python -m ai.alarm_verifier.early_warning  -> docs/results/early_warning.json
"""
import json
import math

import numpy as np
import pandas as pd

from ai.alarm_verifier import verifier as V
from ai.common.data import ROOT
from scenarios.build_scenarios import EARLY_RISE

RES = ROOT / "ai" / "alarm_verifier" / "results"


def first_early(t: pd.DataFrame):
    t = t.reset_index(drop=True)
    run = 0
    for i in range(len(t)):
        j = max(1, i - 6)   # bin 0 can be partial (window cut mid-bin)
        rising = (t.max_log_dPM[i] - t.max_log_dPM[j] >= EARLY_RISE["pm"] or t.max_dCO[i] - t.max_dCO[j] >= EARLY_RISE["co"]
                  or t.max_dH2[i] - t.max_dH2[j] >= EARLY_RISE["h2"])
        ok = (not np.isnan(t.p[i])) and t.p[i] >= V.P_FIRE and (t.chA[i] or t.chB[i]) and rising
        run = run + 1 if ok else 0
        if run >= V.CONFIRM_BINS:
            return (t["t"][i] - t["t"][0]).total_seconds()
    return None


def wilson(k, n, z=1.96):
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round((c - h) / d, 3), round((c + h) / d, 3)]


def main():
    tls = pd.read_pickle(RES / "timelines_hall_loeo.pkl")
    ep = pd.read_csv(RES / "episodes_hall_loeo.csv").set_index("episode")
    rows = []
    for e, t in tls.items():
        tt = first_early(t)
        rows.append({"episode": e, "label": ep.loc[e, "label"], "t_early_s": tt,
                     "t_ai_fire_s": None if pd.isna(ep.loc[e, "t_ai_fire_s"]) else float(ep.loc[e, "t_ai_fire_s"]),
                     "t_optical_s": None if pd.isna(ep.loc[e, "t_optical_s"]) else float(ep.loc[e, "t_optical_s"])})
    f = [r for r in rows if r["label"] == "fire"]; n = [r for r in rows if r["label"] != "fire"]
    fw = [r for r in f if r["t_early_s"] is not None]
    before = [r for r in fw if r["t_optical_s"] is None or r["t_early_s"] < r["t_optical_s"]]
    gain = [r["t_ai_fire_s"] - r["t_early_s"] for r in fw if r["t_ai_fire_s"] is not None]
    nw = [r["episode"] for r in n if r["t_early_s"] is not None]
    out = {"rule": {"p_min": V.P_FIRE, "bins": V.CONFIRM_BINS, "rise_60s": EARLY_RISE},
           "fires_warned": f"{len(fw)}/{len(f)}", "fires_warned_before_optical": f"{len(before)}/{len(f)}",
           "mean_gain_vs_confirmation_s": round(float(np.mean(gain)), 1), "max_gain_s": max(gain),
           "nuisances_warned": f"{len(nw)}/{len(n)}", "nuisances_warned_list": nw,
           "nuisances_warned_wilson95": wilson(len(nw), len(n)), "episodes": rows}
    (ROOT / "docs" / "results" / "early_warning.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print({k: v for k, v in out.items() if k != "episodes"})


if __name__ == "__main__":
    main()
