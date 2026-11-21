"""Data loading, episode definition and causal feature engineering for Aero-Fire DT.

All features are causal: at time t they only use measurements from times <= t of the same
sensor node, so they could run live on an edge gateway.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
HALL_CSV = ROOT / "data_raw" / "industrial_hall" / "industrial_hall.csv"
EN54_CSV = ROOT / "data_raw" / "en54" / "en54_room.csv"

# Sensors present in both datasets (Industrial Hall and EN54 room).
SENSORS = {
    "CO2": "CO2_Room",
    "CO": "CO_Room",
    "H2": "H2_Room",
    "VOC": "VOC_Room_RAW",
    "PM05": "PM05_Room",
    "PM10": "PM10_Room",
    "PM25": "PM25_Room",
    "PMTOT": "PM_Total_Room",
    "PMSIZE": "PM_Room_Typical_Size",
    "TEMP": "Temperature_Room",
    "HUM": "Humidity_Room",
}

FIRE_SCENARIOS = {"Wood", "Candles", "Cable", "Lunts"}
# CO and Ethanol are released on purpose in the hall tests: they are nuisances
# (the CSV labels them fire=0 and nuisance=0, we treat them as nuisances).
NUISANCE_SCENARIOS = {"Deodorant", "Exhaust", "Smoke", "CO", "Ethanol", "Welding",
                      "Abrasive_Cutting", "Green_Waste", "Hairspray"}

SCENARIO_FR = {
    "Wood": "Bois", "Candles": "Bougies", "Cable": "Câble", "Lunts": "Mèches (lunts)",
    "Deodorant": "Déodorant", "Exhaust": "Gaz d'échappement", "Smoke": "Machine à fumée",
    "CO": "Rejet de CO", "Ethanol": "Éthanol", "Welding": "Soudure",
    "Abrasive_Cutting": "Découpe abrasive", "Green_Waste": "Déchets verts",
    "Hairspray": "Laque", "Background": "Normal",
}

BASELINE_WINDOW = "30min"   # slow-tracking clean-air baseline per node
BASELINE_Q = 0.10           # low quantile: robust to the rise we want to detect
SLOPE_STEPS = 6             # ~60 s at 10 s sampling


def load_hall() -> pd.DataFrame:
    df = pd.read_csv(HALL_CSV, parse_dates=["Date"])
    df = df.rename(columns={v: k for k, v in SENSORS.items()})
    df["node"] = df["Sensor_ID"].str[-2:].astype(int)
    df["scenario"] = df["scenario_label"]
    df["exp"] = df["experiment_number"].fillna(0).astype(int)
    keep = ["Date", "node", "scenario", "exp", "progress_label", *SENSORS]
    return df[keep].sort_values(["node", "Date"]).reset_index(drop=True)


def load_en54() -> pd.DataFrame:
    df = pd.read_csv(EN54_CSV)
    df["Date"] = pd.to_datetime(df["Date"], format="ISO8601", utc=True)
    df = df.rename(columns={v: k for k, v in SENSORS.items()})
    df["node"] = df["Sensor_ID"].str[-2:].astype(int)
    df["scenario"] = df["scenario_label"]
    # EN54 file has no repetition number: number contiguous blocks of each scenario.
    df = df.sort_values("Date").reset_index(drop=True)
    is_event = df["scenario"] != "Background"
    t = df["Date"]
    new_block = (df["scenario"] != df["scenario"].shift()) | (t.diff() > pd.Timedelta("10min"))
    block = new_block.cumsum()
    df["exp"] = 0
    ev_blocks = df.loc[is_event, ["scenario"]].assign(block=block[is_event])
    first = ev_blocks.groupby("block")["scenario"].first()
    rep = first.groupby(first).cumcount() + 1
    df.loc[is_event, "exp"] = block[is_event].map(rep).values
    keep = ["Date", "node", "scenario", "exp", *SENSORS]
    return df[keep].sort_values(["node", "Date"]).reset_index(drop=True)


def label_of(scenario: str) -> str:
    if scenario in FIRE_SCENARIOS:
        return "fire"
    if scenario in NUISANCE_SCENARIOS:
        return "nuisance"
    return "background"


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Per-node causal features: rise above a slow baseline, 60 s slopes, ratios."""
    out = []
    raw = [s for s in SENSORS if s != "PMSIZE"]
    for node, g in df.groupby("node", sort=False):
        g = g.sort_values("Date").copy()
        gi = g.set_index("Date")
        base = (gi[raw].rolling(BASELINE_WINDOW, closed="left", min_periods=5)
                .quantile(BASELINE_Q))
        base = base.fillna(gi[raw].iloc[0])  # start of recording: assume clean air
        delta = gi[raw].values - base.values
        for i, s in enumerate(raw):
            g[f"d_{s}"] = delta[:, i]
        for s in ["CO", "H2", "VOC", "PMTOT", "TEMP", "CO2"]:
            g[f"slope_{s}"] = g[s] - g[s].shift(SLOPE_STEPS)
        g["PMSIZE_v"] = g["PMSIZE"]
        out.append(g)
    f = pd.concat(out).sort_values(["Date", "node"]).reset_index(drop=True)
    pm = f["d_PMTOT"].clip(lower=0)
    f["log_dPM"] = np.log1p(pm)
    f["log_dPM05"] = np.log1p(f["d_PM05"].clip(lower=0))
    f["log_dPM25"] = np.log1p(f["d_PM25"].clip(lower=0))
    f["coarse_ratio"] = np.log1p(f["d_PM10"].clip(lower=0)) - f["log_dPM05"]
    gas = f["d_CO"].clip(lower=0) + 0.5 * f["d_H2"].clip(lower=0)
    f["gas_per_smoke"] = np.log1p(gas) - 0.25 * f["log_dPM"]
    f["voc_per_smoke"] = np.log1p(f["d_VOC"].clip(lower=0)) - 0.25 * f["log_dPM"]
    return f.fillna(0.0)


FEATURES = [
    "d_CO", "d_H2", "d_VOC", "d_CO2", "d_TEMP", "d_HUM",
    "log_dPM", "log_dPM05", "log_dPM25", "coarse_ratio", "PMSIZE_v",
    "slope_CO", "slope_H2", "slope_VOC", "slope_PMTOT", "slope_TEMP", "slope_CO2",
    "gas_per_smoke", "voc_per_smoke",
]
