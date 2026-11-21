"""Aero-Fire DT alarm verifier: physical channels + ML fire/nuisance score + hall-level verdict.

Design (see docs/Safety_Case): the verifier is ADVISORY. It never acts on the certified panel.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from ai.common.data import FEATURES

# --- Independent physical channels (inspired by dual-loop engine fire detection) -----------
# Thresholds are physical "rise above clean-air baseline" levels, chosen above background noise.
CH_A_PM = 5.0       # particulate/optical: log(1 + rise in particle count) > 5  (~150 particles)
CH_B_CO = 0.8       # chemical: CO rise (ppm)
CH_B_H2 = 2.0       # chemical: H2 rise (sensor units)
CH_B_VOC = 2.0      # chemical: VOC rise (sensor units)
CH_C_TEMP = 1.5     # thermal: temperature rise (degC) above 30-min baseline

# Classic optical smoke detector used as baseline (single criterion, particles only).
OPTICAL_TRIP = 6.9  # log(1 + rise) > 6.9  (~1000 particles)

P_FIRE = 0.70       # hall-level score to declare FIRE
P_NUIS = 0.30       # hall-level score to declare NUISANCE
CONFIRM_BINS = 3    # consecutive 10 s bins needed (anti-chatter, 30 s)
EMA = 0.4           # smoothing of the hall-level score
DUAL_CHANNEL = True # FIRE needs 2 independent physical channels (particles AND gas/heat)


def channels(f: pd.DataFrame) -> pd.DataFrame:
    a = f["log_dPM"] > CH_A_PM
    b = (f["d_CO"] > CH_B_CO) | (f["d_H2"] > CH_B_H2) | (f["d_VOC"] > CH_B_VOC)
    c = f["d_TEMP"] > CH_C_TEMP
    return pd.DataFrame({"chA": a, "chB": b, "chC": c}, index=f.index)


def make_model() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=40,
        l2_regularization=1.0, random_state=0)


def episode_weights(ep: pd.Series, y: np.ndarray) -> np.ndarray:
    """Each episode gets the same total weight; both classes get the same total weight."""
    w = 1.0 / ep.map(ep.value_counts()).values
    for cls in (0, 1):
        m = y == cls
        if m.any():
            w[m] *= 0.5 / w[m].sum()
    return w * len(w)


def fit(f_train: pd.DataFrame) -> HistGradientBoostingClassifier:
    y = (f_train["label"] == "fire").astype(int).values
    model = make_model()
    model.fit(f_train[FEATURES].values, y, sample_weight=episode_weights(f_train["episode"], y))
    return model


def hall_timeline(f: pd.DataFrame, p_node: np.ndarray, bin_s: int = 10) -> pd.DataFrame:
    """Fuse node-level scores into one hall-level score and verdict per time bin."""
    d = f[["Date", "node", "log_dPM", "d_CO", "d_H2", "d_VOC", "d_TEMP"]].copy()
    ch = channels(f)
    d[["chA", "chB", "chC"]] = ch.values
    d["active"] = ch["chA"] | ch["chB"]
    d["p"] = p_node
    d["optical"] = f["log_dPM"] > OPTICAL_TRIP
    d["intensity"] = d["log_dPM"] + 2 * np.log1p(d["d_CO"].clip(lower=0) + d["d_H2"].clip(lower=0))
    d["bin"] = d["Date"].dt.floor(f"{bin_s}s")
    rows = []
    for b, g in d.groupby("bin", sort=True):
        act = g[g["active"]]
        if len(act):
            top = act.nlargest(3, "intensity")
            p = float(top["p"].mean())
        else:
            p = np.nan
        rows.append({
            "t": b, "active_nodes": int(g["active"].sum()), "p_raw": p,
            "chA": bool(g["chA"].any()), "chB": bool(g["chB"].any()), "chC": bool(g["chC"].any()),
            "optical": bool(g["optical"].any()),
            "max_log_dPM": float(g["log_dPM"].max()), "max_dCO": float(g["d_CO"].max()),
            "max_dH2": float(g["d_H2"].max()), "max_dVOC": float(g["d_VOC"].max()),
            "max_dTEMP": float(g["d_TEMP"].max()),
        })
    t = pd.DataFrame(rows)
    # smoothing + verdict state machine
    ema, verdict, run_f, run_n, latched = np.nan, [], 0, 0, False
    p_s = []
    dual = (t["chA"] & (t["chB"] | t["chC"])).values
    for i, p in enumerate(t["p_raw"]):
        if np.isnan(p):
            ema = np.nan
            run_f = run_n = 0
            p_s.append(np.nan)
            verdict.append("FIRE" if latched else "NORMAL")
            continue
        ema = p if np.isnan(ema) else EMA * p + (1 - EMA) * ema
        p_s.append(ema)
        fire_ok = ema >= P_FIRE and (dual[i] or not DUAL_CHANNEL)
        run_f = run_f + 1 if fire_ok else 0
        run_n = run_n + 1 if ema <= P_NUIS else 0
        if run_f >= CONFIRM_BINS:
            latched = True  # a confirmed fire verdict stays until operator reset (safe side)
        if latched:
            verdict.append("FIRE")
        elif run_n >= CONFIRM_BINS:
            verdict.append("NUISANCE")
        else:
            verdict.append("UNCERTAIN")
    t["p"] = p_s
    t["verdict"] = verdict
    t["n_channels"] = t[["chA", "chB", "chC"]].sum(axis=1)
    return t
