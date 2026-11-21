"""Checks the JavaScript zone model (app/js/zonemodel.js) against the Python reference.
Run: python tests/test_zonemodel_js.py   (needs node)"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np

from ai.forecast.zone_model import ALPHA, Scenario, simulate

CASES = [
    {},
    {"alpha": ALPHA["ultra-rapide"], "q_max": 20000, "floor_area": 2000, "height": 10},
    {"alpha": ALPHA["moyen"], "door_width": 4, "door_height": 4, "roof_vent": 10, "t_amb": 40},
]
js = """
const zm = require(process.argv[1]);
const cases = JSON.parse(process.argv[2]);
const out = cases.map(c => { const r = zm.simulate(c);
  return {z: Array.from(r.z), T: Array.from(r.t_upper), unt: r.t_untenable}; });
console.log(JSON.stringify(out));
"""
res = subprocess.run(["node", "-e", js, str(ROOT / "app/js/zonemodel.js"), json.dumps(CASES)],
                     capture_output=True, text=True, check=True)
js_out = json.loads(res.stdout)
worst = 0.0
for c, j in zip(CASES, js_out):
    r = simulate(Scenario(**c))
    dz = np.max(np.abs(r.z - np.array(j["z"])))
    dT = np.max(np.abs(r.t_upper - np.array(j["T"])))
    worst = max(worst, dz, dT)
    print(f"case {c}: max |dz|={dz:.2e} m, max |dT|={dT:.2e} C, untenable py={r.t_untenable} js={j['unt']}")
    assert r.t_untenable == j["unt"]
assert worst < 1e-6, worst
print("OK: JS zone model matches Python")
