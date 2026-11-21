"""Export validated metrics to app/data/results_data.js (shown in the dashboard "Résultats" panel).
Usage: python scripts/export_results.py"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
v = json.loads((ROOT / "ai/alarm_verifier/results/metrics.json").read_text(encoding="utf-8"))
f = json.loads((ROOT / "ai/forecast/results/metrics.json").read_text(encoding="utf-8"))
out = {
    "verifier": {
        "fires": [v["fire_runs_detected_ai"], v["fire_runs"]],
        "nuisances_rejected": [v["nuisance_runs"] - v["nuisance_runs_false_alarm_ai"], v["nuisance_runs"]],
        "optical_nuisances_rejected": [v["nuisance_runs"] - v["nuisance_runs_false_alarm_optical"], v["nuisance_runs"]],
        "panel_false_alarms": v["operational_hall"]["panel_false_alarms"],
        "panel_false_alarms_flagged": v["operational_hall"]["panel_false_alarms_flagged_nuisance_by_ai"],
        "fires_ai_before_panel": v["operational_hall"]["fires_ai_before_panel"],
        "fires_ai_within_60s": v["operational_hall"]["fires_ai_within_60s_of_panel"],
        "background_hours": v["background"]["background_hours"],
        "background_ai_events": v["background"]["ai_fire_events"],
        "background_optical_events": v["background"]["optical_trip_events"],
        "row_balanced_accuracy": v["row_level_balanced_accuracy_loeo"],
        "cross_site": {
            "fires": [v["cross_site_en54"]["fire_runs_detected_ai"], v["cross_site_en54"]["fire_runs"]],
            "nuisances_rejected": [v["cross_site_en54"]["nuisance_runs"] - v["cross_site_en54"]["nuisance_runs_false_alarm_ai"],
                                   v["cross_site_en54"]["nuisance_runs"]],
            "row_balanced_accuracy": v["cross_site_en54"]["row_level_balanced_accuracy"],
        },
        "feature_importance": dict(list(v["feature_importance"].items())[:8]),
    },
    "forecast": {k: round(f[k], 3) if isinstance(f[k], float) else f[k] for k in [
        "scenarios", "rmse_layer_height_t60_m", "rmse_temperature_t60_C", "mae_time_to_untenable_s",
        "persistence_baseline_rmse_layer_height_t60_m", "persistence_baseline_rmse_temperature_t60_C",
        "untenable_within_60s_accuracy", "surrogate_ms_per_forecast", "zone_model_ms_per_900s_run"]},
}
(ROOT / "app/data/results_data.js").write_text(
    "window.AFDT_RESULTS = " + json.dumps(out, ensure_ascii=False) + ";\n", encoding="utf-8")
print(json.dumps(out, indent=1, ensure_ascii=False))
