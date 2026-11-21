"""Physics sanity tests for the zone model. Run: python -m pytest -q tests  (or python tests/test_zone_model.py)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from ai.forecast.zone_model import ALPHA, Scenario, closed_room_filling_time, simulate


def test_layer_descends_monotonically_closed_room():
    r = simulate(Scenario(door_width=0, roof_vent=0))
    assert np.all(np.diff(r.z) <= 1e-9)
    assert r.z[-1] < r.z[0]


def test_faster_fire_fills_faster():
    slow = simulate(Scenario(alpha=ALPHA["lent"]))
    fast = simulate(Scenario(alpha=ALPHA["ultra-rapide"]))
    assert fast.t_untenable is not None
    assert slow.t_untenable is None or fast.t_untenable < slow.t_untenable


def test_roof_vent_delays_untenable():
    base = Scenario(alpha=ALPHA["rapide"], q_max=3000, floor_area=1000, height=8, duration=1800)
    closed = simulate(base)
    vented = simulate(Scenario(**{**base.__dict__, "roof_vent": 20.0}))
    assert vented.z[-1] > closed.z[-1]


def test_bigger_room_fills_slower():
    small = simulate(Scenario(floor_area=200))
    big = simulate(Scenario(floor_area=2000))
    assert big.z[300] > small.z[300]


def test_matches_analytic_filling_time_within_35pct():
    # steady 1 MW fire (reached almost instantly), closed room, no heat loss effect on density
    s = Scenario(alpha=1e4, q_max=1000, floor_area=500, height=8, loss_fraction=0.99,
                 duration=2000)
    r = simulate(s)
    z_target = 3.0
    t_num = float(r.t[np.argmax(r.z <= z_target)])
    t_ana = closed_room_filling_time(1000, 500, 8, z_target)
    assert abs(t_num - t_ana) / t_ana < 0.35, (t_num, t_ana)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
