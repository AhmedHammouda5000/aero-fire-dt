"""Independent TEST of the alarm verifier on NIST FR 4019 (Cleary 2003, "Alarm Response to
Nuisance Sources", manufactured-home tests MHN06..MHN47; details in NIST TN 1455 chapter 6).

The NIST data are used ONLY for testing. Nothing here is fitted, tuned or selected on NIST:
  * a REDUCED-feature verifier (only features computable on NIST) is trained on the Mendeley
    Industrial Hall data, with the same model family, hyper-parameters, channel thresholds,
    EMA / confirmation / P_FIRE / P_NUIS settings as the main verifier;
  * its leave-one-episode-out (LOEO) score on the hall is reported first (cost of the reduction);
  * the final hall model is then applied frozen to the 42 NIST tests.

Steps (each is reproducible):
  python -I ai/external_test/nist_fr4019.py download   # files + sha256 manifest
  python -I ai/external_test/nist_fr4019.py run        # parse, hall LOEO, NIST evaluation
  python -I ai/external_test/nist_fr4019.py all

Downloaded files are untrusted: they are only parsed with xlrd (no macros, no eval).
Main verifier files (ai/alarm_verifier/results/*, model.pkl, app/data/*) are only READ.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:          # -I mode: add the project root (not the data folder)
    sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
from sklearn.metrics import balanced_accuracy_score

from ai.common.data import add_features, load_hall
from ai.alarm_verifier import verifier as V
from ai.alarm_verifier.train_eval import episode_table

DATA = ROOT / "data_raw" / "nist_fr4019"
OUT_JSON = ROOT / "docs" / "results" / "nist_fr4019.json"
PAGE_URL = "https://www.nist.gov/node/437741"
FILE_URL = "https://www.nist.gov/document/mhn{n:02d}xls"
TN1455_URL = "https://nvlpubs.nist.gov/nistpubs/Legacy/TN/nbstechnicalnote1455.pdf"

# --------------------------------------------------------------------------------------------
# Test metadata. Description and label: NIST FR 4019 page table. Nominal end of the source
# activity (t_end, s after t=0): read from the TN 1455 chapter 6 text (cooking / burning time),
# rounded up; it is a labelling/window choice made BEFORE looking at any model output.
# --------------------------------------------------------------------------------------------
_M = [
    # n, description, source type, label, fan, t_end_s
    (6, "Toasted bread, fan off", "toast", "nuisance", "off", 600),
    (7, "Toasted bread, fan off (open window)", "toast", "nuisance", "off", 600),
    (8, "225 g bacon on gas burner, fan off", "bacon", "nuisance", "off", 720),
    (9, "225 g bacon on gas burner, fan off", "bacon", "nuisance", "off", 720),
    (10, "Broiled pizza, fan off", "pizza", "nuisance", "off", 800),
    (11, "150 g spaghetti, fan off", "spaghetti", "nuisance", "off", 1000),
    (12, "300 g spaghetti, fan off", "spaghetti", "nuisance", "off", 1000),
    (13, "14 g butter, fan off", "butter/margarine", "nuisance", "off", 420),
    (14, "14 g butter, fan off", "butter/margarine", "nuisance", "off", 420),
    (15, "Two cigarettes, fan off", "cigarettes", "nuisance", "off", 300),
    (16, "Four hamburgers broiled, fan off", "hamburgers", "nuisance", "off", 1000),
    (17, "Four hamburgers broiled, fan on", "hamburgers", "nuisance", "on", 1000),
    (18, "10 tortillas (deep-fried), fan off", "tortillas", "nuisance", "off", 960),
    (19, "Three hamburgers fried, fan off", "hamburgers", "nuisance", "off", 720),
    (20, "Two bagel halves toasted, fan off", "bagels", "nuisance", "off", 600),
    (21, "Two bagel halves toasted, fan on", "bagels", "nuisance", "on", 600),
    (22, "Toasted bread, fan on", "toast", "nuisance", "on", 600),
    (23, "Toasted bread, fan on", "toast", "nuisance", "on", 600),
    (24, "225 g spaghetti, lid on, fan off", "spaghetti", "nuisance", "off", 1000),
    (25, "Three hamburgers fried, fan on (open window)", "hamburgers", "nuisance", "on", 720),
    (26, "Three hamburgers fried, fan on", "hamburgers", "nuisance", "on", 720),
    (27, "225 g spaghetti, lid on, fan off", "spaghetti", "nuisance", "off", 1000),
    (28, "14 g margarine, cast iron pan, fan off", "butter/margarine", "nuisance", "off", 420),
    (29, "14 g margarine, cast iron pan, fan on", "butter/margarine", "nuisance", "on", 420),
    (30, "14 g butter, cast iron pan, fan on", "butter/margarine", "nuisance", "on", 420),
    (31, "14 g butter, cast iron pan, fan off", "butter/margarine", "nuisance", "off", 420),
    (32, "Bake/broil pizza, fan off", "pizza", "nuisance", "off", 1250),
    (33, "Bake/broil pizza, fan on", "pizza", "nuisance", "on", 1250),
    (34, "450 g french fried potatoes, fan off", "fries", "nuisance", "off", 1200),
    (35, "Four tea candles, fan off", "candles", "nuisance", "off", 900),
    (36, "225 g bacon on electric range, fan off", "bacon", "nuisance", "off", 600),
    (37, "225 g bacon on electric range, fan on", "bacon", "nuisance", "on", 600),
    (38, "Two cigarettes, fan off", "cigarettes", "nuisance", "off", 300),
    (39, "Four hamburgers broiled, fan on", "hamburgers", "nuisance", "on", 1000),
    (40, "Smoldering PU foam block, fan off (flamed ~800 s)", "PU foam smoulder", "fire", "off", 900),
    (41, "Smoldering PU foam block, fan off (stopped)", "PU foam smoulder", "fire", "off", 800),
    (42, "Smoldering PU foam block, fan on", "PU foam smoulder", "fire", "on", 900),
    (43, "Smoldering PU foam block, fan off", "PU foam smoulder", "fire", "off", 900),
    (44, "Eight wood blocks on hotplate, fan off", "wood blocks pyrolysis", "fire", "off", 1200),
    (45, "Eight wood blocks on hotplate, fan on", "wood blocks pyrolysis", "fire", "on", 1200),
    (46, "32 cotton wicks, fan off", "cotton wick smoulder", "fire", "off", 1830),
    (47, "32 cotton wicks, fan on", "cotton wick smoulder", "fire", "on", 1830),
]
META = {m[0]: dict(zip(["description", "source", "label", "fan", "t_end_s"], m[1:])) for m in _M}

# --------------------------------------------------------------------------------------------
# Reduced feature set: only what NIST measures with a meaning compatible with our features.
# Dropped (not faked): d_H2, d_VOC, d_CO2, slope_H2, slope_VOC, slope_CO2, log_dPM05, log_dPM25,
# coarse_ratio, PMSIZE_v, voc_per_smoke, slope_PMTOT (raw-count slope: unit-dependent).
# gas_per_smoke is recomputed with CO only (the H2 term is removed), on hall AND NIST.
# --------------------------------------------------------------------------------------------
RED_FEATURES = ["d_CO", "d_TEMP", "d_HUM", "log_dPM", "slope_CO", "slope_TEMP", "gas_per_smoke_co"]
OPTICAL_PE_MED = 0.083   # TN 1455 table 22: photoelectric alarm, medium sensitivity (1/m)
ION_MED = 0.033          # TN 1455 table 22: ionization alarm, medium sensitivity (1/m)
BIN = 10                 # s, same as hall


# ============================================================================ download
def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _get(url: str, dest: Path) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (research-client)"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        return e.code
    dest.write_bytes(data)
    return 200


def download(force: bool = False) -> dict:
    DATA.mkdir(parents=True, exist_ok=True)
    manifest = {"page": PAGE_URL, "files": {}, "missing": []}
    for n in range(1, 51):
        dest = DATA / f"mhn{n:02d}.xls"
        if force or not dest.exists():
            code = _get(FILE_URL.format(n=n), dest)
            if code != 200:
                manifest["missing"].append({"test": n, "http": code})
                continue
        if dest.read_bytes()[:8] != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":   # OLE2 (.xls) magic
            dest.unlink()
            manifest["missing"].append({"test": n, "http": "not an xls (HTML error page)"})
            continue
        manifest["files"][f"MHN{n:02d}"] = {"url": FILE_URL.format(n=n), "bytes": dest.stat().st_size,
                                             "sha256": sha256(dest)}
    pdf = DATA / "nbstechnicalnote1455.pdf"
    if force or not pdf.exists():
        _get(TN1455_URL, pdf)
    if pdf.exists():
        manifest["tn1455_pdf"] = {"url": TN1455_URL, "bytes": pdf.stat().st_size, "sha256": sha256(pdf)}
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"{len(manifest['files'])} test files, missing: {[m['test'] for m in manifest['missing']]}")
    return manifest


# ============================================================================ parse
def _num(vals) -> np.ndarray:
    out = np.full(len(vals), np.nan)
    for i, v in enumerate(vals):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            out[i] = float(v)
    return out


# Physically plausible ranges: values outside are logger glitches (NIST caveat) -> NaN.
VALID = {"TEMP": (0, 100), "HUM": (0, 100), "NUM": (0, 1e8), "MASS": (0, 400),
         "CO": (-50, 2000), "PE": (-1, 10), "ION": (-1, 10)}


def _bin(t: np.ndarray, x: np.ndarray, med: int, kind: str) -> pd.Series:
    """Drop implausible values, despike (trailing rolling median of `med` samples), 10 s bin means."""
    lo, hi = VALID[kind]
    x = np.where((x >= lo) & (x <= hi), x, np.nan)
    s = pd.Series(x, index=t)
    s = s[~np.isnan(s.index.values)].sort_index()
    s = s[~s.index.duplicated()]
    s = s.rolling(med, min_periods=1).median()
    b = (np.floor(s.index.values / BIN) * BIN).astype(int)
    return s.groupby(b).mean()


def parse_test(n: int) -> dict:
    """Return 10 s binned series: instruments (shared) and per-position sensors (CO, PE, ion)."""
    import xlrd
    wb = xlrd.open_workbook(str(DATA / f"mhn{n:02d}.xls"), on_demand=True)
    ins = wb.sheet_by_name("Instruments")
    hdr = [str(h) for h in ins.row_values(0)]
    t = _num(ins.col_values(0)[1:])

    def icol(key, kind):
        for j, h in enumerate(hdr):
            if key.lower() in h.lower():
                return _bin(t, _num(ins.col_values(j)[1:]), 5, kind)
        return None

    inst = {"TEMP": icol("T (deg C)", "TEMP"), "HUM": icol("Rel Humidity", "HUM"),
            "NUM": icol("Number conc", "NUM"), "MASS": icol("Mass conc", "MASS")}

    sen = wb.sheet_by_name("Sensors")
    shdr = [str(h) for h in sen.row_values(0)]
    groups, cur = {}, None
    for j, h in enumerate(shdr):          # a group starts at each "X - Time" column
        if "Time" in h:
            cur = h.strip()[0]
            groups[cur] = {"time": j}
        elif cur is not None:
            if "CO" in h:
                groups[cur]["CO"] = j
            elif "PE" in h:
                groups[cur]["PE"] = j
            elif "Ion" in h:
                groups[cur]["ION"] = j
    pos = {}
    for g, cols in groups.items():
        ts = _num(sen.col_values(cols["time"])[1:])
        d = {}
        for k in ("CO", "PE", "ION"):
            if k in cols:
                x = _num(sen.col_values(cols[k])[1:])
                if np.isfinite(x).sum() > 20:
                    d[k] = _bin(ts, x, 5, k)
        if d:
            pos[g] = d
    return {"inst": inst, "pos": pos}


def _baseline(s: pd.Series) -> float:
    pre = s[s.index < 0].dropna()
    return float(pre.median()) if len(pre) >= 3 else np.nan   # >= 30 s of pre-test data


def nist_frame(n: int, parsed: dict, particles: str = "NUM") -> tuple[pd.DataFrame | None, str]:
    """One row per (10 s bin, position). Each position = one 'node': its own CO, shared ceiling
    thermocouple, RH probe and particle instrument (single kitchen sampling point)."""
    inst = parsed["inst"]
    pm = inst.get(particles)
    if pm is None or inst["TEMP"] is None or inst["HUM"] is None:
        return None, f"missing instrument ({particles if pm is None else 'T/RH'})"
    grid = pd.Index(sorted(set(pm.index) | set(inst["TEMP"].index)), name="t")
    pmv = pm.reindex(grid).ffill(limit=6)
    if particles == "MASS":
        pmv = pmv * 1000.0          # mg/m3 -> ug/m3 (only a log-rise is used)
    T = inst["TEMP"].reindex(grid).ffill(limit=6)
    H = inst["HUM"].reindex(grid).ffill(limit=6)
    common = pd.DataFrame({
        "d_TEMP": T - _baseline(T), "d_HUM": H - _baseline(H),
        "log_dPM": np.log1p((pmv - _baseline(pmv)).clip(lower=0)),
        "slope_TEMP": T - T.shift(V_SLOPE),
    }, index=grid)
    rows = []
    for g, d in parsed["pos"].items():
        if "CO" not in d:
            continue
        co = d["CO"].reindex(grid).ffill(limit=6)
        if co[co.index >= 0].notna().mean() < 0.5:
            continue                   # position with mostly blank CO data in this test
        f = common.copy()
        f["d_CO"] = co - _baseline(co)
        f["slope_CO"] = co - co.shift(V_SLOPE)
        f["node"] = g
        rows.append(f)
    if not rows:
        return None, "no usable CO position"
    f = pd.concat(rows).reset_index()
    f["gas_per_smoke_co"] = np.log1p(f["d_CO"].clip(lower=0)) - 0.25 * f["log_dPM"]
    f["d_H2"] = 0.0     # NOT model inputs: only disables these terms in channel B / intensity
    f["d_VOC"] = 0.0    # of the shared V.hall_timeline (channel B = CO only on NIST and hall)
    f["Date"] = pd.Timestamp("2003-01-01") + pd.to_timedelta(f["t"], unit="s")
    f = f.dropna(subset=RED_FEATURES)
    return f, "ok"


V_SLOPE = 6   # 60 s at 10 s bins, same as ai.common.data.SLOPE_STEPS


# ============================================================================ hall model
def hall_frame() -> pd.DataFrame:
    cache = ROOT / "data_raw" / "hall_features.pkl"     # read-only reuse of the main cache
    f = pd.read_pickle(cache) if cache.exists() else add_features(load_hall())
    f = f.copy()
    f["gas_per_smoke_co"] = np.log1p(f["d_CO"].clip(lower=0)) - 0.25 * f["log_dPM"]
    from ai.common.data import label_of
    f["label"] = f["scenario"].map(label_of)
    f["episode"] = np.where(f["label"] == "background", "", f["scenario"] + "#" + f["exp"].astype(str))
    f["d_H2"] = 0.0     # reduced verifier: channel B = CO only (same rule as on NIST)
    f["d_VOC"] = 0.0
    ch = V.channels(f)
    f["active"] = ch["chA"] | ch["chB"]
    return f


def fit_reduced(rows: pd.DataFrame):
    y = (rows["label"] == "fire").astype(int).values
    m = V.make_model()
    m.fit(rows[RED_FEATURES].values, y, sample_weight=V.episode_weights(rows["episode"], y))
    return m


def verdict_of(tl: pd.DataFrame) -> str:
    v = tl["verdict"]
    if (v == "FIRE").any():
        return "FIRE"
    if (v == "NUISANCE").any():
        return "NUISANCE"
    if (v == "UNCERTAIN").any():
        return "UNCERTAIN"
    return "NO_ACTIVITY"


def hall_loeo(f: pd.DataFrame) -> dict:
    eps = episode_table(f)
    train = f[(f["episode"] != "") & f["active"]]
    res, yt, yp = [], [], []
    for r in eps.itertuples():
        m = fit_reduced(train[train["episode"] != r.Index])
        win = f[(f["Date"] >= r.start) & (f["Date"] <= r.end)]
        tl = V.hall_timeline(win, m.predict_proba(win[RED_FEATURES].values)[:, 1])
        tl["t_rel"] = (tl["t"] - r.start.floor("10s")).dt.total_seconds()
        tl = tl[tl["t_rel"] >= 0]
        fire = tl["verdict"] == "FIRE"
        res.append({"episode": r.Index, "scenario": r.scenario, "label": r.label,
                    "verdict": verdict_of(tl), "t_fire_s": float(tl.loc[fire, "t_rel"].iloc[0]) if fire.any() else None,
                    "optical_trip": bool(tl["optical"].any())})
        held = train[train["episode"] == r.Index]
        if len(held):
            yt += list((held["label"] == "fire").astype(int))
            yp += list(m.predict(held[RED_FEATURES].values))
    e = pd.DataFrame(res)
    fi, nu = e[e.label == "fire"], e[e.label == "nuisance"]
    out = {
        "fire_runs": len(fi), "fire_confirmed": int((fi.verdict == "FIRE").sum()),
        "nuisance_runs": len(nu), "nuisance_false_fire": int((nu.verdict == "FIRE").sum()),
        "optical_fire_trips": int(fi.optical_trip.sum()), "optical_nuisance_trips": int(nu.optical_trip.sum()),
        "t_fire_median_s": float(fi.t_fire_s.dropna().median()) if fi.t_fire_s.notna().any() else None,
        "row_level_balanced_accuracy": round(balanced_accuracy_score(yt, yp), 4),
        "false_fire_nuisances": nu[nu.verdict == "FIRE"].episode.tolist(),
        "missed_fires": fi[fi.verdict != "FIRE"].episode.tolist(),
    }
    out["episodes"] = e.to_dict(orient="records")
    return out


# ============================================================================ NIST evaluation
def first_t(tl, mask):
    return float(tl.loc[mask, "t_rel"].iloc[0]) if mask.any() else None


def eval_test(n: int, parsed: dict, model, particles: str, full_file: bool = False) -> dict:
    meta = META[n]
    out = {"test": f"MHN{n:02d}", **meta}
    f, status = nist_frame(n, parsed, particles)
    if f is None:
        out.update(status=status, verdict="NOT_EVALUABLE")
        return out
    t_end = f["t"].max() if full_file else meta["t_end_s"]
    win = f[(f["t"] >= 0) & (f["t"] <= t_end)].sort_values(["Date", "node"])
    tl = V.hall_timeline(win, model.predict_proba(win[RED_FEATURES].values)[:, 1])
    tl["t_rel"] = (tl["t"] - pd.Timestamp("2003-01-01")).dt.total_seconds()
    fire = tl["verdict"] == "FIRE"
    dual = tl["chA"] & (tl["chB"] | tl["chC"])
    # classic NIST photo / ion alarms at the 7 positions (zero-offset by pre-test median)
    pe_t, ion_t = [], []
    for g, d in parsed["pos"].items():
        for key, thr, acc in (("PE", OPTICAL_PE_MED, pe_t), ("ION", ION_MED, ion_t)):
            if key in d:
                s = d[key] - _baseline(d[key])
                s = s[(s.index >= 0) & (s.index <= t_end)]
                above = s >= thr
                hit = s[above & above.shift(1, fill_value=False)]   # 2 consecutive 10 s bins
                if len(hit):
                    acc.append(float(hit.index[0]) - BIN)
    out.update(
        status="ok", nodes=sorted(win["node"].unique().tolist()), window_end_s=float(t_end),
        verdict=verdict_of(tl), t_fire_s=first_t(tl, fire),
        max_p_smoothed=float(np.nanmax(tl["p"])) if tl["p"].notna().any() else None,
        max_p_raw=float(np.nanmax(tl["p_raw"])) if tl["p_raw"].notna().any() else None,
        t_first_activity_s=first_t(tl, tl["active_nodes"] > 0),
        dual_channel_bins=int(dual.sum()),
        max_log_dPM=float(tl["max_log_dPM"].max()), max_dCO=float(tl["max_dCO"].max()),
        max_dTEMP=float(tl["max_dTEMP"].max()),
        particle_trip=bool(tl["optical"].any()), t_particle_trip_s=first_t(tl, tl["optical"]),
        nist_photo_alarm=bool(pe_t), t_nist_photo_s=min(pe_t) if pe_t else None,
        nist_ion_alarm=bool(ion_t), t_nist_ion_s=min(ion_t) if ion_t else None,
    )
    return out


def wilson(k: int, n: int, z: float = 1.96) -> list:
    if n == 0:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(c - h, 3), round(c + h, 3)]


def summarize(rows: list[dict]) -> dict:
    e = pd.DataFrame(rows)
    ok = e[e["status"] == "ok"].copy()
    for c in ("particle_trip", "nist_photo_alarm", "nist_ion_alarm"):
        ok[c] = ok[c].astype(bool)
    fi, nu = ok[ok.label == "fire"], ok[ok.label == "nuisance"]

    def rate(k, n):
        return {"k": int(k), "n": int(n), "rate": round(k / n, 3) if n else None, "wilson95": wilson(int(k), int(n))}

    s = {
        "not_evaluable": e[e["status"] != "ok"][["test", "status"]].to_dict(orient="records"),
        "ai_fires_confirmed": rate((fi.verdict == "FIRE").sum(), len(fi)),
        "ai_nuisances_rejected": rate((nu.verdict != "FIRE").sum(), len(nu)),
        "ai_nuisance_verdict_explicit": int((nu.verdict == "NUISANCE").sum()),
        "particle_threshold_fires_detected": rate(fi.particle_trip.sum(), len(fi)),
        "particle_threshold_nuisances_rejected": rate((~nu.particle_trip).sum(), len(nu)),
        "nist_photo_fires_detected": rate(fi.nist_photo_alarm.sum(), len(fi)),
        "nist_photo_nuisances_rejected": rate((~nu.nist_photo_alarm).sum(), len(nu)),
        "nist_ion_fires_detected": rate(fi.nist_ion_alarm.sum(), len(fi)),
        "nist_ion_nuisances_rejected": rate((~nu.nist_ion_alarm).sum(), len(nu)),
        "ai_t_fire_median_s": float(fi.t_fire_s.dropna().median()) if fi.t_fire_s.notna().any() else None,
        "verdict_counts": {lab: ok[ok.label == lab].verdict.value_counts().to_dict() for lab in ("fire", "nuisance")},
    }
    by = []
    for src, g in ok.groupby("source", sort=False):
        by.append({"source": src, "label": g.label.iloc[0], "n": len(g),
                   "ai_fire": int((g.verdict == "FIRE").sum()),
                   "ai_nuisance": int((g.verdict == "NUISANCE").sum()),
                   "ai_uncertain": int((g.verdict == "UNCERTAIN").sum()),
                   "ai_no_activity": int((g.verdict == "NO_ACTIVITY").sum()),
                   "particle_trip": int(g.particle_trip.sum()),
                   "nist_photo": int(g.nist_photo_alarm.sum()), "nist_ion": int(g.nist_ion_alarm.sum())})
    s["by_source"] = by
    return s


def run() -> dict:
    t0 = time.time()
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    tests = sorted(int(k[3:]) for k in manifest["files"])
    for k, v in manifest["files"].items():              # integrity check against the manifest
        if sha256(DATA / f"{k.lower()}.xls") != v["sha256"]:
            raise SystemExit(f"sha256 mismatch for {k}")

    # 1) reduced verifier on the hall: LOEO first, then final model on all hall runs
    hf = hall_frame()
    loeo = hall_loeo(hf)
    print("hall LOEO (reduced):", {k: v for k, v in loeo.items() if k != "episodes"})
    final = fit_reduced(hf[(hf["episode"] != "") & hf["active"]])
    ref = json.loads((ROOT / "ai" / "alarm_verifier" / "results" / "metrics.json").read_text(encoding="utf-8"))

    # 2) frozen application to NIST
    parsed = {n: parse_test(n) for n in tests}
    variants = {}
    for name, particles, full in (("primary_CPC_number", "NUM", False),
                                  ("sensitivity_Dustrak_mass", "MASS", False),
                                  ("sensitivity_CPC_full_file", "NUM", True)):
        rows = [eval_test(n, parsed[n], final, particles, full) for n in tests]
        variants[name] = {"summary": summarize(rows), "tests": rows}
        s = variants[name]["summary"]
        print(name, "fires", s["ai_fires_confirmed"], "nuis rejected", s["ai_nuisances_rejected"])

    result = {
        "dataset": {"name": "NIST FR 4019 (Cleary 2003), manufactured home, TN 1455 ch. 6",
                    "page": PAGE_URL, "files": manifest["files"], "missing": manifest["missing"],
                    "tn1455_pdf": manifest.get("tn1455_pdf"),
                    "use": "TEST ONLY - no training, no threshold tuning, no feature selection on NIST"},
        "method": {
            "features_used": RED_FEATURES,
            "features_dropped": ["d_H2", "d_VOC", "d_CO2", "slope_H2", "slope_VOC", "slope_CO2",
                                 "log_dPM05", "log_dPM25", "coarse_ratio", "PMSIZE_v", "voc_per_smoke",
                                 "slope_PMTOT", "gas_per_smoke (H2 term) -> gas_per_smoke_co"],
            "model": "HistGradientBoosting, same hyper-parameters and episode weights as ai/alarm_verifier/verifier.py",
            "training_data": "Mendeley Industrial Hall only (active event rows, channel B = CO only)",
            "channels": {"A": f"log_dPM > {V.CH_A_PM}", "B": f"d_CO > {V.CH_B_CO} ppm (CO only)",
                         "C": f"d_TEMP > {V.CH_C_TEMP} degC"},
            "verdict": {"EMA": V.EMA, "CONFIRM_BINS": V.CONFIRM_BINS, "P_FIRE": V.P_FIRE,
                        "P_NUIS": V.P_NUIS, "DUAL_CHANNEL": V.DUAL_CHANNEL, "fusion": "top-3 active positions"},
            "nist_mapping": {
                "nodes": "sensor positions A-G (own CO cell); T (ceiling thermocouple), RH probe and particle "
                         "instrument are single instruments at the kitchen sampling point, shared by all nodes",
                "particles_primary": "TSI 3007 CPC number conc. (p/cm3, >10 nm) - hall counter is optical (>0.3 um); "
                                     "only the log-rise log1p(rise) is used, no rescaling",
                "particles_sensitivity": "Dustrak mass (ug/m3), log-rise",
                "baseline": "median of all pre-test data (t<0, 1-4 min) instead of 30-min q10",
                "despike": "implausible values -> NaN, trailing 5-sample rolling median, then 10 s bin mean; baseline needs >= 3 pre-test bins",
                "window": "t = 0 (source start) to nominal end of source activity from TN 1455 text",
                "baseline_detectors": f"particle threshold log_dPM > {V.OPTICAL_TRIP} (hall optical rule); "
                                      f"NIST photo sensors >= {OPTICAL_PE_MED} 1/m and ion >= {ION_MED} 1/m at "
                                      "any position (TN 1455 table 22, medium sensitivity), sustained 2 consecutive 10 s bins",
            },
        },
        "hall_loeo_reduced": loeo,
        "hall_loeo_full_reference": {k: ref.get(k) for k in [
            "fire_runs", "fire_runs_detected_ai", "nuisance_runs", "nuisance_runs_false_alarm_ai",
            "t_ai_fire_median_s", "row_level_balanced_accuracy_loeo"]},
        "nist": variants,
        "runtime_s": round(time.time() - t0, 1),
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print("written", OUT_JSON, f"({result['runtime_s']} s)")
    return result


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("download", "all"):
        download()
    if cmd in ("run", "all"):
        run()
