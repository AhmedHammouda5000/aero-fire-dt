"""Export the trained alarm verifier (sklearn HistGradientBoostingClassifier) to plain JSON so it runs
in the browser (free-test bench), plus reference predictions to check the JS implementation.

Usage: python -m ai.alarm_verifier.export_js
"""
from __future__ import annotations

import json
import pickle

import numpy as np
import pandas as pd

from ai.alarm_verifier import verifier as V
from ai.common.data import FEATURES, ROOT

RES = ROOT / "ai" / "alarm_verifier" / "results"
APP = ROOT / "app" / "data"


def main() -> None:
    model = pickle.load(open(RES / "model.pkl", "rb"))
    trees = []
    for it in model._predictors:
        nodes = it[0].nodes
        trees.append({
            "f": nodes["feature_idx"].astype(int).tolist(),
            "t": nodes["num_threshold"].astype(float).tolist(),   # full precision: values sit exactly on thresholds
            "l": nodes["left"].astype(int).tolist(),
            "r": nodes["right"].astype(int).tolist(),
            "v": nodes["value"].astype(float).tolist(),
            "leaf": nodes["is_leaf"].astype(int).tolist(),
            "mleft": nodes["missing_go_to_left"].astype(int).tolist(),
        })
    out = {
        "name": "Aero-Fire DT alarm verifier (HistGradientBoosting)", "features": FEATURES,
        "baseline": float(np.ravel(model._baseline_prediction)[0]), "trees": trees,
        "settings": {k: getattr(V, k) for k in ["CH_A_PM", "CH_B_CO", "CH_B_H2", "CH_B_VOC", "CH_C_TEMP",
                                               "OPTICAL_TRIP", "P_FIRE", "P_NUIS", "CONFIRM_BINS", "EMA"]},
    }
    (APP / "verifier_data.js").write_text("window.AFDT_VERIFIER = " + json.dumps(out, separators=(",", ":")) + ";\n", encoding="utf-8")
    f = pd.read_pickle(ROOT / "data_raw" / "hall_features.pkl")
    sample = f.sample(300, random_state=1)[FEATURES].values
    (RES / "js_verifier_check.json").write_text(json.dumps({"x": sample.tolist(), "p": model.predict_proba(sample)[:, 1].tolist()}), encoding="utf-8")
    print(f"exported {len(trees)} trees -> app/data/verifier_data.js ({(APP / 'verifier_data.js').stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
