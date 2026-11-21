"""Rebuild the whole Aero-Fire DT prototype from the raw open data and run every check.

  python scripts/run_all.py          # full pipeline (~4 min on a laptop CPU)
  python scripts/run_all.py --tests  # checks only

Then open app/index.html in Chrome/Edge/Firefox (works offline, double-click).
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable

PIPELINE = [
    ("Download + verify datasets (sha256)", [PY, "scripts/download_data.py"]),
    ("Alarm verifier: train + leave-one-episode-out evaluation", [PY, "-m", "ai.alarm_verifier.train_eval"]),
    ("Alarm verifier: operational metrics + figures", [PY, "-m", "ai.alarm_verifier.analyze"]),
    ("Forecast: 5,000 zone-model fires + surrogate training", [PY, "-m", "ai.forecast.train_surrogate"]),
    ("Digital twin: IFC hall + JSON", [PY, "twin/make_hall_ifc.py"]),
    ("Dashboard scenarios from real recordings", [PY, "-m", "scenarios.build_scenarios"]),
    ("Export results for the dashboard", [PY, "scripts/export_results.py"]),
    ("Export the alarm verifier to JavaScript (free-test bench)", [PY, "-m", "ai.alarm_verifier.export_js"]),
]
TESTS = [
    ("Physics sanity tests (zone model)", [PY, "tests/test_zone_model.py"]),
    ("JS zone model == Python", [PY, "tests/test_zonemodel_js.py"]),
    ("JS surrogate == Python", ["node", "tests/test_surrogate_js.js"]),
    ("JS alarm verifier == Python (300 trees)", ["node", "tests/test_verifier_js.js"]),
    ("Real-time CFD physics vs fire-engineering correlations", ["node", "tests/test_cfd.js"]),
    ("Free-test bench: every source through physics + AI", ["node", "tests/test_sandbox.js", "200"]),
    ("Read-only gateway vs simulated panel (Modbus)", [PY, "tests/test_readonly_gateway.py"]),
    ("Dashboard in headless Chrome (no JS errors + screenshots)", ["node", "tools/screenshots.js"]),
]


def run(steps) -> bool:
    ok = True
    for name, cmd in steps:
        t = time.time()
        print(f"\n=== {name}")
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-4:])
        status = "OK" if r.returncode == 0 and "ERRORS" not in r.stdout else "FAILED"
        print(tail)
        print(f"--> {status} ({time.time() - t:.0f} s)")
        ok &= status == "OK"
    return ok


if __name__ == "__main__":
    only_tests = "--tests" in sys.argv
    ok = True if only_tests else run(PIPELINE)
    ok = run(TESTS) and ok
    print("\nALL OK" if ok else "\nSOME STEPS FAILED")
    sys.exit(0 if ok else 1)
