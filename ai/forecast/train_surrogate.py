"""Generate zone-model scenarios and train the 30/60 s forecast surrogate (small MLP).

The surrogate answers, from what the twin knows NOW (geometry, openings, fire growth class,
time since ignition, current smoke-layer height and temperature and their trends):
  -> smoke-layer height and upper-layer temperature at t+30 s and t+60 s
  -> time remaining before untenable conditions (capped at 900 s)
It is exported to JSON and runs live in the browser dashboard (app/js/surrogate.js).

Usage: python -m ai.forecast.train_surrogate
"""
from __future__ import annotations

import json
import time

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import qmc
from sklearn.model_selection import GroupShuffleSplit
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler

from ai.common.data import ROOT
from ai.forecast.zone_model import ALPHA, Scenario, simulate

OUT = ROOT / "ai" / "forecast" / "results"
APP = ROOT / "app" / "data"
FIG = ROOT / "docs" / "results"
N_SCEN = 5000
DUR = 1200
CAP = 900.0
INPUTS = ["log_area", "height", "door_width", "door_height", "roof_vent", "log_alpha",
          "log_qmax", "t_amb", "t_obs", "z_obs", "T_obs", "dz10", "dT10"]
OUTPUTS = ["z30", "z60", "T30", "T60", "t_unt"]


def sample_scenarios(n: int, seed: int = 0) -> list[Scenario]:
    u = qmc.LatinHypercube(d=10, seed=seed).random(n)
    lo_hi = lambda x, a, b: a + x * (b - a)
    scen = []
    for x in u:
        scen.append(Scenario(
            floor_area=float(np.exp(lo_hi(x[0], np.log(150), np.log(5000)))),
            height=float(lo_hi(x[1], 4, 14)),
            alpha=float(np.exp(lo_hi(x[2], np.log(0.002), np.log(0.2)))),
            q_max=float(np.exp(lo_hi(x[3], np.log(500), np.log(30000)))),
            door_width=0.0 if x[4] < 0.5 else float(lo_hi((x[4] - 0.5) * 2, 1, 8)),
            door_height=float(lo_hi(x[5], 2.5, 5)),
            roof_vent=0.0 if x[6] < 0.5 else float(lo_hi((x[6] - 0.5) * 2, 1, 30)),
            t_amb=float(lo_hi(x[7], 15, 42)),
            loss_fraction=float(lo_hi(x[8], 0.5, 0.75)),
            detector_r=float(lo_hi(x[9], 2, 15)),
            duration=DUR,
        ))
    return scen


def rows_from(s: Scenario, r, rng, k: int = 10) -> list[list[float]]:
    t_start = int(r.t_smoke_detect or 10)
    t_end = DUR - 61
    if t_end <= t_start + 10:
        return []
    out = []
    for t_obs in rng.integers(max(t_start, 10), t_end, size=k):
        unt = r.t_untenable
        t_unt = CAP if unt is None else float(np.clip(unt - t_obs, 0, CAP))
        out.append([
            np.log(s.floor_area), s.height, s.door_width, s.door_height, s.roof_vent,
            np.log(s.alpha), np.log(s.q_max), s.t_amb, float(t_obs),
            r.z[t_obs], r.t_upper[t_obs], r.z[t_obs] - r.z[t_obs - 10],
            r.t_upper[t_obs] - r.t_upper[t_obs - 10],
            r.z[t_obs + 30], r.z[t_obs + 60], r.t_upper[t_obs + 30], r.t_upper[t_obs + 60], t_unt,
        ])
    return out


def export_mlp(model, xs, ys, path) -> None:
    layers = []
    acts = ["relu"] * (len(model.coefs_) - 1) + ["linear"]
    for W, b, a in zip(model.coefs_, model.intercepts_, acts):
        layers.append({"W": np.round(W.T, 6).tolist(), "b": np.round(b, 6).tolist(), "activation": a})
    path.write_text(json.dumps({
        "name": "Aero-Fire DT forecast surrogate", "w_convention": "out_in",
        "inputs": INPUTS, "outputs": OUTPUTS,
        "x_mean": xs.mean_.tolist(), "x_scale": xs.scale_.tolist(),
        "y_mean": ys.mean_.tolist(), "y_scale": ys.scale_.tolist(),
        "layers": layers, "t_unt_cap_s": CAP,
    }), encoding="utf-8")


def main() -> None:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    scen = sample_scenarios(N_SCEN)
    data, groups = [], []
    sim_times = []
    for i, s in enumerate(scen):
        ts = time.perf_counter()
        r = simulate(s)
        sim_times.append(time.perf_counter() - ts)
        rows = rows_from(s, r, rng)
        data += rows
        groups += [i] * len(rows)
    data = np.array(data)
    groups = np.array(groups)
    X, Y = data[:, :len(INPUTS)], data[:, len(INPUTS):]
    print(f"{N_SCEN} scenarios simulated in {sum(sim_times):.0f} s -> {len(X):,} training rows")

    tr, te = next(GroupShuffleSplit(test_size=0.2, random_state=0).split(X, Y, groups))
    xs, ys = StandardScaler().fit(X[tr]), StandardScaler().fit(Y[tr])
    model = MLPRegressor(hidden_layer_sizes=(64, 64), activation="relu", alpha=1e-4,
                         learning_rate_init=2e-3, max_iter=300, early_stopping=True,
                         random_state=0)
    model.fit(xs.transform(X[tr]), ys.transform(Y[tr]))
    pred = ys.inverse_transform(model.predict(xs.transform(X[te])))
    pred[:, 0:2] = np.clip(pred[:, 0:2], 0, None)
    pred[:, 4] = np.clip(pred[:, 4], 0, CAP)

    rmse = lambda a, b: float(np.sqrt(np.mean((a - b) ** 2)))
    mae = lambda a, b: float(np.mean(np.abs(a - b)))
    Yt = Y[te]
    zi, Ti = INPUTS.index("z_obs"), INPUTS.index("T_obs")
    metrics = {
        "scenarios": N_SCEN, "train_rows": int(len(tr)), "test_rows": int(len(te)),
        "split": "by scenario (test scenarios never seen in training)",
        "rmse_layer_height_t30_m": rmse(pred[:, 0], Yt[:, 0]),
        "rmse_layer_height_t60_m": rmse(pred[:, 1], Yt[:, 1]),
        "rmse_temperature_t30_C": rmse(pred[:, 2], Yt[:, 2]),
        "rmse_temperature_t60_C": rmse(pred[:, 3], Yt[:, 3]),
        "mae_time_to_untenable_s": mae(pred[:, 4], Yt[:, 4]),
        "persistence_baseline_rmse_layer_height_t60_m": rmse(X[te, zi], Yt[:, 1]),
        "persistence_baseline_rmse_temperature_t60_C": rmse(X[te, Ti], Yt[:, 3]),
        "zone_model_ms_per_900s_run": 1000 * float(np.mean(sim_times)) * 900 / DUR,
    }
    ts = time.perf_counter()
    for _ in range(200):
        model.predict(xs.transform(X[te[:1]]))
    metrics["surrogate_ms_per_forecast"] = 1000 * (time.perf_counter() - ts) / 200
    # classification view: "untenable within 60 s?" warning accuracy
    warn_true, warn_pred = Yt[:, 4] <= 60, pred[:, 4] <= 60
    metrics["untenable_within_60s_accuracy"] = float(np.mean(warn_true == warn_pred))
    metrics["untenable_within_60s_missed"] = int(np.sum(warn_true & ~warn_pred))
    metrics["untenable_within_60s_cases"] = int(np.sum(warn_true))
    metrics["runtime_s"] = round(time.time() - t0, 1)
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    export_mlp(model, xs, ys, APP / "surrogate.json")
    (APP / "surrogate_data.js").write_text(
        "window.AFDT_SURROGATE = " + (APP / "surrogate.json").read_text(encoding="utf-8") + ";\n",
        encoding="utf-8")
    # a few test samples to check the JS implementation
    sel = te[:20]
    (OUT / "js_check.json").write_text(json.dumps({
        "x": X[sel].tolist(),
        "y": ys.inverse_transform(model.predict(xs.transform(X[sel]))).tolist()}), encoding="utf-8")
    print(json.dumps(metrics, indent=2))

    # figure: predicted vs true
    fig, axes = plt.subplots(1, 3, figsize=(13, 4))
    for ax, j, lab in [(axes[0], 1, "hauteur de nappe à t+60 s (m)"),
                       (axes[1], 3, "température à t+60 s (°C)"),
                       (axes[2], 4, "temps avant conditions intenables (s)")]:
        ax.scatter(Yt[:, j], pred[:, j], s=2, alpha=0.3)
        m = max(Yt[:, j].max(), pred[:, j].max())
        ax.plot([0, m], [0, m], "r-", lw=0.8)
        ax.set_xlabel("modèle physique (vérité)")
        ax.set_ylabel("IA de substitution")
        ax.set_title(lab, fontsize=10)
    fig.suptitle("Prévision 30-60 s : IA de substitution vs modèle de zones (scénarios jamais vus)")
    fig.tight_layout()
    fig.savefig(FIG / "forecast_surrogate.png", dpi=130)


if __name__ == "__main__":
    main()
