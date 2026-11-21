"""Data quality audit of the two public datasets used by the Aero-Fire DT alarm verifier.

Read-only: it never writes into data_raw/ or ai/alarm_verifier/. Prints a text report.

Usage (from the repo root):  python -I ai/data_audit/audit.py  > audit_output.txt
Runtime: ~30-60 s.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))  # works with python -I

from ai.common.data import EN54_CSV, HALL_CSV, SENSORS, label_of  # noqa: E402

pd.set_option("display.width", 220)
pd.set_option("display.max_columns", 40)
pd.set_option("display.max_rows", 300)

RAW = list(SENSORS.values())
PM_COLS = ["PM05_Room", "PM10_Room", "PM25_Room", "PM40_Room", "PM100_Room", "PM_Total_Room"]
GAS = ["CO_Room", "H2_Room", "VOC_Room_RAW", "CO2_Room"]


def title(s: str) -> None:
    print("\n" + "=" * 100 + f"\n{s}\n" + "=" * 100)


# ---------------------------------------------------------------------------------------------
def load():
    h = pd.read_csv(HALL_CSV)
    h["Date"] = pd.to_datetime(h["Date"], utc=True)
    h["node"] = h["Sensor_ID"].str[-2:].astype(int)
    h["exp"] = h["experiment_number"].fillna(0).astype(int)
    h["episode"] = np.where(h["scenario_label"] == "Background", "",
                            h["scenario_label"] + "#" + h["exp"].astype(str))

    e = pd.read_csv(EN54_CSV)
    e["Date"] = pd.to_datetime(e["Date"], format="ISO8601", utc=True)
    e["node"] = e["Sensor_ID"].str[-2:].astype(int)
    # same episode numbering as ai/common/data.py:load_en54 (contiguous blocks)
    e = e.sort_values("Date").reset_index(drop=True)
    new_block = (e["scenario_label"] != e["scenario_label"].shift()) | \
                (e["Date"].diff() > pd.Timedelta("10min"))
    block = new_block.cumsum()
    is_ev = e["scenario_label"] != "Background"
    first = e.loc[is_ev].assign(block=block[is_ev]).groupby("block")["scenario_label"].first()
    rep = first.groupby(first).cumcount() + 1
    e["exp"] = 0
    e.loc[is_ev, "exp"] = block[is_ev].map(rep).values
    e["episode"] = np.where(is_ev, e["scenario_label"] + "#" + e["exp"].astype(str), "")
    return h.sort_values(["node", "Date"]).reset_index(drop=True), \
        e.sort_values(["node", "Date"]).reset_index(drop=True)


# ---------------------------------------------------------------------------------------------
def missing_and_ranges(df: pd.DataFrame, name: str) -> None:
    title(f"[{name}] 1. Shape, missing values, value ranges")
    print(f"rows={len(df):,}  nodes={df['node'].nunique()}  span={df['Date'].min()} -> {df['Date'].max()}")
    na = df.isna().sum()
    print("NaN per column (non-zero only):\n", na[na > 0].to_string() if na.any() else "  none")
    num = [c for c in df.columns if c.endswith("_Room") or c.endswith("_RAW") or c == "PM_Room_Typical_Size"]
    rows = []
    for c in num:
        s = df[c]
        top = s.value_counts().iloc[0] / len(s)
        rows.append({"col": c, "min": s.min(), "p01": s.quantile(.01), "median": s.median(),
                     "p99": s.quantile(.99), "max": s.max(), "n_neg": int((s < 0).sum()),
                     "n_zero": int((s == 0).sum()), "n_at_max": int((s == s.max()).sum()),
                     "mode_share": round(top, 3)})
    print(pd.DataFrame(rows).to_string(index=False))


def physical_checks(df: pd.DataFrame, name: str) -> None:
    title(f"[{name}] 2. Impossible / suspicious values")
    co2 = df["CO2_Room"]
    print(f"CO2 < 350 ppm (below outdoor air, impossible for a calibrated NDIR): {(co2 < 350).sum()} rows; "
          f"CO2 == 0: {(co2 == 0).sum()} rows")
    if (co2 < 350).any():
        print(df.loc[co2 < 350, ["Date", "node", "CO2_Room", "scenario_label"]].head(10).to_string(index=False))
    for c in ["CO_Room", "H2_Room", "VOC_Room_RAW"]:
        neg = df[c] < 0
        print(f"{c}: negative rows={neg.sum():,} ({neg.mean():.1%}), min={df[c].min()}")
    if (df[["CO_Room", "H2_Room", "VOC_Room_RAW"]] < 0).any().any():
        print("  negative gas per node (share of rows):")
        print((df[["CO_Room", "H2_Room", "VOC_Room_RAW"]] < 0).groupby(df["node"]).mean().round(3).to_string())
    print(f"PM_Room_Typical_Size == 0 (no particle counted / invalid size): {(df['PM_Room_Typical_Size'] == 0).sum()}")
    allzero = (df[PM_COLS].sum(axis=1) == 0) & (df["CO2_Room"] == 0)
    print(f"Rows with all PM=0 AND CO2=0 (likely sensor dropout): {allzero.sum()}")
    # PM consistency: total should be >= the sub-bins (Sensirion SPS30-like number counts)
    tot = df["PM_Total_Room"]
    print(f"PM_Total < PM05 (inconsistent): {(tot < df['PM05_Room']).sum()} rows")
    ratio = (df[["PM05_Room", "PM10_Room", "PM25_Room", "PM40_Room", "PM100_Room"]].sum(axis=1) / tot.replace(0, np.nan))
    print(f"(PM05+PM10+PM25+PM40+PM100)/PM_Total: median={ratio.median():.3f} p01={ratio.quantile(.01):.3f} "
          f"p99={ratio.quantile(.99):.3f}  -> bins are disjoint and sum to total if ~1")
    # saturation: long runs of the same maximum value / flat-lines
    print("Saturation / clipping check (value == column max, and longest constant run per node during events):")
    ev = df[df["scenario_label"] != "Background"]
    for c in ["PM_Total_Room", "PM05_Room", "CO_Room", "H2_Room", "VOC_Room_RAW", "CO2_Room"]:
        mx = df[c].max()
        n_mx = (df[c] == mx).sum()
        # longest run of identical non-trivial values within events
        runs = []
        for _, g in ev.groupby("node"):
            v = g[c].values
            if len(v) < 2:
                continue
            chg = np.r_[True, v[1:] != v[:-1]]
            ids = np.cumsum(chg)
            cnt = np.bincount(ids)
            hi = v >= np.quantile(v, 0.99)
            runs.append(int(cnt[ids[hi]].max()) if hi.any() else 0)
        print(f"  {c:14s} max={mx:>9} rows_at_max={n_mx:4d}  longest constant run among top-1% event values="
              f"{max(runs) if runs else 0} samples")


def timestamps(df: pd.DataFrame, name: str, nominal_s: float = 10.0) -> None:
    title(f"[{name}] 3. Timestamps: duplicates, sampling, gaps, node synchronisation")
    dup = df.duplicated(["node", "Date"]).sum()
    dup_full = df.duplicated(["node", "Date"] + RAW).sum()
    print(f"duplicated (node, Date) pairs: {dup}   of which identical sensor values: {dup_full}")
    rows = []
    for n, g in df.groupby("node"):
        dt = g["Date"].diff().dt.total_seconds().dropna()
        rows.append({"node": n, "rows": len(g), "dt_median_s": dt.median(), "dt_p01": dt.quantile(.01),
                     "dt_p99": dt.quantile(.99), "dt_max_s": dt.max(),
                     "gaps>30s": int((dt > 30).sum()), "gaps>5min": int((dt > 300).sum()),
                     "lost_h_in_gaps>5min": round(dt[dt > 300].sum() / 3600, 2)})
    print(pd.DataFrame(rows).to_string(index=False))
    # big gaps (any node): list the >5 min holes for node 1st
    g0 = df[df["node"] == df["node"].min()]
    dt = g0["Date"].diff()
    big = g0.loc[dt > pd.Timedelta("5min"), "Date"]
    print(f"gaps > 5 min on node {df['node'].min()} (end of gap, length):")
    for t in big:
        print(f"   {t}  {dt[g0['Date'] == t].iloc[0]}")
    # node sync: spread of timestamps within the same 10 s bin
    b = df.assign(bin=df["Date"].dt.floor(f"{int(nominal_s)}s")).groupby("bin")["node"].nunique()
    print(f"10 s bins with all nodes present: {(b == df['node'].nunique()).mean():.1%}; "
          f"bins with < half of the nodes: {(b < df['node'].nunique() / 2).mean():.1%}")


def per_node_calibration(df: pd.DataFrame, name: str) -> None:
    title(f"[{name}] 4. Per-node background levels (calibration offsets) and day-to-day drift")
    bg = df[df["scenario_label"] == "Background"]
    cols = ["CO_Room", "H2_Room", "VOC_Room_RAW", "CO2_Room", "PM_Total_Room", "PM_Room_Typical_Size",
            "Temperature_Room", "Humidity_Room"]
    med = bg.groupby("node")[cols].median()
    print("median background value per node:")
    print(med.round(2).to_string())
    spread = (med.max() - med.min())
    noise = bg.groupby("node")[cols].apply(lambda g: (g - g.rolling(30, min_periods=5).median()).abs().median()).median()
    print("\nnode-to-node spread of the median (max-min) vs typical short-term noise (median |x - 5 min median|):")
    print(pd.DataFrame({"spread_between_nodes": spread.round(3), "short_term_noise": noise.round(3),
                        "spread/noise": (spread / noise.replace(0, np.nan)).round(1)}).to_string())
    # drift: daily median per node (background only) for CO, H2, VOC, CO2
    day = bg["Date"].dt.tz_convert("Europe/Berlin").dt.date
    for c in ["CO_Room", "H2_Room", "VOC_Room_RAW", "CO2_Room", "PM_Total_Room"]:
        t = bg.groupby([day, "node"])[c].median().unstack("node")
        print(f"\ndaily background median of {c} (rows=day, cols=node):")
        print(t.round(2).to_string())


def label_consistency_hall(h: pd.DataFrame) -> None:
    title("[HALL] 5. Label consistency")
    print("scenario_label vs (fire, nuisance):")
    print(pd.crosstab(h["scenario_label"], [h["fire"], h["nuisance"]]).to_string())
    for sc in ["CO", "Ethanol"]:
        m = h["scenario_label"] == sc
        print(f"  {sc}: {m.sum()} rows, {h.loc[m, 'episode'].nunique()} runs, fire=1: {int(h.loc[m, 'fire'].sum())}, "
              f"nuisance=1: {int(h.loc[m, 'nuisance'].sum())}, anomaly_label=1: {int(h.loc[m, 'anomaly_label'].sum())}")
    m = (h["scenario_label"] == "Background") & (h["nuisance"] == 1)
    print(f"Background rows flagged nuisance=1: {m.sum()} ({m.sum() / h['node'].nunique():.0f} per node, "
          f"{h.loc[m, 'Date'].min()} -> {h.loc[m, 'Date'].max()}), anomaly_label=1 for all of them: "
          f"{bool(h.loc[m, 'anomaly_label'].eq(1).all())}")
    print(f"Valid_Experiment unique values: {h['Valid_Experiment'].unique().tolist()}  -> constant, carries no information")
    print("anomaly_label == (scenario != Background) except the rows above:",
          int(((h["anomaly_label"] == 1) != (h["scenario_label"] != "Background")).sum()), "mismatching rows")
    print("anomaly_scenario -> scenario(s) (it is an episode id):")
    a = h.dropna(subset=["anomaly_scenario"]).groupby("anomaly_scenario")["episode"].agg(lambda s: sorted(s.unique()))
    print("  ids shared by several episodes:", {int(k): v for k, v in a.items() if len(v) > 1})
    print("progress_label NaN rows by scenario:", h.loc[h["progress_label"].isna(), "scenario_label"].value_counts().to_dict())
    print("progress_label within Background (should be meaningless):",
          h.loc[h["scenario_label"] == "Background", "progress_label"].value_counts(dropna=False).to_dict())
    print("experiment_number==0 outside Background:",
          h.loc[(h["scenario_label"] != "Background") & (h["exp"] == 0), ["Date", "node", "scenario_label"]]
          .to_string(index=False))


def label_consistency_en54(e: pd.DataFrame) -> None:
    title("[EN54] 5. Label consistency")
    print(pd.crosstab(e["scenario_label"], e["ternary_label"]).to_string())
    print(pd.crosstab(e["scenario_label"], e["anomaly_label"]).to_string())
    print("UV_Room (flame UV sensor, absent from the hall dataset): max per episode")
    uv = e[e["episode"] != ""].groupby("episode").agg(scenario=("scenario_label", "first"),
                                                       uv_max=("UV_Room", "max"),
                                                       uv_share_gt0=("UV_Room", lambda s: (s > 0).mean()))
    print(uv.sort_values("scenario").round(3).to_string())
    bg_uv = e.loc[e["scenario_label"] == "Background", "UV_Room"]
    print(f"Background UV: max={bg_uv.max()}, share>0={(bg_uv > 0).mean():.4f}")


def episodes(df: pd.DataFrame, name: str) -> pd.DataFrame:
    title(f"[{name}] 6. Episodes: repetitions, duration, class balance, overlap, gap to previous run")
    ev = df[df["episode"] != ""]
    t = ev.groupby("episode").agg(scenario=("scenario_label", "first"), start=("Date", "min"),
                                  end=("Date", "max"), rows=("Date", "size"))
    t["label"] = t["scenario"].map(label_of)
    t = t.sort_values("start")
    t["dur_min"] = ((t["end"] - t["start"]).dt.total_seconds() / 60).round(1)
    t["gap_from_prev_end_min"] = ((t["start"] - t["end"].shift()).dt.total_seconds() / 60).round(1)
    # does the 30-min baseline window (closed left) reach back into the previous run?
    t["baseline_hits_prev_run"] = t["gap_from_prev_end_min"] < 30
    t["overlap_prev"] = t["gap_from_prev_end_min"] < 0
    print(t.drop(columns=["end"]).to_string())
    print("\nrepetitions per scenario:", t.groupby("scenario").size().to_dict())
    print("runs per class:", t.groupby("label").size().to_dict(),
          " rows per class:", t.groupby("label")["rows"].sum().to_dict())
    print(f"runs with < 50 rows (dropped by train_eval): {t.index[t['rows'] < 50].tolist()}")
    print(f"overlapping runs: {int(t['overlap_prev'].sum())}; runs starting < 1 min after the previous one: "
          f"{t.index[t['gap_from_prev_end_min'] < 1].tolist()}")
    print(f"runs whose 30-min baseline window contains part of the previous run: "
          f"{int(t['baseline_hits_prev_run'].sum())}/{len(t)}")
    bg = df[df["episode"] == ""]
    print(f"background share of rows: {len(bg) / len(df):.1%}")
    return t


def residual_smoke(df: pd.DataFrame, eps: pd.DataFrame, name: str) -> None:
    """After each run, compare background rows with the per-node level of the 10 min BEFORE the run."""
    title(f"[{name}] 7. Residual smoke / gas in 'Background' rows right after a run")
    win = [(0, 5), (5, 15), (15, 30), (30, 60)]
    rows, rec = [], []
    for ep, r in eps.iterrows():
        pre = df[(df["Date"] >= r.start - pd.Timedelta("10min")) & (df["Date"] < r.start)]
        if pre.empty:
            continue
        ref = pre.groupby("node")[["PM_Total_Room", "VOC_Room_RAW", "CO_Room", "H2_Room"]].median()
        nxt = eps.loc[eps["start"] > r.end, "start"].min()
        stop = min(r.end + pd.Timedelta("60min"), nxt if pd.notna(nxt) else r.end + pd.Timedelta("60min"))
        post = df[(df["Date"] > r.end) & (df["Date"] < stop) & (df["episode"] == "")].copy()
        if post.empty:
            continue
        rr = ref.reindex(post["node"]).values
        post["dPM"] = np.log1p((post["PM_Total_Room"].values - rr[:, 0]).clip(min=0))
        post["dVOC"] = post["VOC_Room_RAW"].values - rr[:, 1]
        post["dCO"] = post["CO_Room"].values - rr[:, 2]
        post["min"] = (post["Date"] - r.end).dt.total_seconds() / 60
        post["chA"] = post["dPM"] > 5.0             # same threshold as verifier CH_A_PM
        post["chB"] = (post["dVOC"] > 2.0) | (post["dCO"] > 0.8)
        d = {"episode": ep, "label": r.label}
        for a, b in win:
            w = post[(post["min"] >= a) & (post["min"] < b)]
            d[f"chA_{a}-{b}min"] = round(w["chA"].mean(), 2) if len(w) else np.nan
            d[f"chB_{a}-{b}min"] = round(w["chB"].mean(), 2) if len(w) else np.nan
        # minutes until no node has chA for 5 consecutive minutes
        hall = post.groupby(post["Date"].dt.floor("10s")).agg(m=("min", "first"), a=("chA", "any"),
                                                               b=("chB", "any"))
        clean = ~(hall["a"] | hall["b"])
        run = clean.groupby((~clean).cumsum()).cumsum()
        ok = hall.loc[run >= 30, "m"]
        d["recovery_min"] = round(float(ok.iloc[0]) - 5, 1) if len(ok) else f">{(stop - r.end).total_seconds() / 60:.0f}"
        rows.append(d)
    t = pd.DataFrame(rows)
    print("share of post-run node-rows still above the verifier channel thresholds vs the pre-run level")
    print("(chA = particles log-rise > 5, chB = VOC +2 or CO +0.8). recovery_min = until all nodes clean for 5 min")
    print(t.to_string(index=False))
    for a, b in win:
        print(f"  mean chA share {a}-{b} min after run: {t[f'chA_{a}-{b}min'].mean():.3f}   "
              f"chB share: {t[f'chB_{a}-{b}min'].mean():.3f}")
    num = pd.to_numeric(t["recovery_min"], errors="coerce")
    print(f"  runs with recovery > 15 min (beyond the POST=15 min exclusion of train_eval): "
          f"{int((num > 15).sum() + num.isna().sum())}/{len(t)}")


def background_after_post(h: pd.DataFrame, eps: pd.DataFrame) -> None:
    title("[HALL] 8. What the background false-alarm evaluation actually sees")
    m = h["episode"] == ""
    for r in eps.itertuples():
        m &= ~((h["Date"] >= r.start) & (h["Date"] <= r.end + pd.Timedelta("15min")))
    bg = h[m]
    hours = bg.groupby(bg["Date"].dt.floor("10s")).ngroups * 10 / 3600
    loc = bg["Date"].dt.tz_convert("Europe/Berlin")
    night = (loc.dt.hour < 7) | (loc.dt.hour >= 19)
    print(f"background used for false-alarm rate: ~{hours:.1f} h of hall time; share of rows at night "
          f"(19h-07h, hall empty): {night.mean():.1%}")
    flagged = bg[bg["nuisance"] == 1]
    print(f"rows of this background labelled nuisance=1 in the CSV (unannounced nuisance event): {len(flagged)} "
          f"({flagged['Date'].min()} -> {flagged['Date'].max()})")


def main() -> None:
    h, e = load()
    for df, nm in [(h, "HALL"), (e, "EN54")]:
        missing_and_ranges(df, nm)
        physical_checks(df, nm)
        timestamps(df, nm)
        per_node_calibration(df, nm)
    label_consistency_hall(h)
    label_consistency_en54(e)
    eh = episodes(h, "HALL")
    ee = episodes(e, "EN54")
    residual_smoke(h, eh[eh["rows"] >= 50], "HALL")
    residual_smoke(e, ee[ee["rows"] >= 50], "EN54")
    background_after_post(h, eh[eh["rows"] >= 1])


if __name__ == "__main__":
    main()
