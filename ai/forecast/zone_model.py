"""Two-zone smoke-filling model for a single large compartment (warehouse / industrial hall).

Simplified engineering model (same family as CFAST), pure Python, explicit Euler with dt = 1 s.
Equations (SI units, Q in kW):
  * Fire: Q(t) = min(alpha * t^2, Q_max); convective part Qc = 0.7 Q.
  * Plume entrainment (Heskestad): m_p = 0.071 Qc^(1/3) z^(5/3) + 0.0018 Qc   [kg/s],
    z = height from fire base to the smoke-layer interface.
  * Upper layer: volume V and excess enthalpy E,
        dV/dt = (m_p - m_out) / rho_u
        dE/dt = (1 - lambda_loss) Qc - m_out cp (T_u - T_a)
    with E = cp rho_a T_a V (1 - T_a / T_u)   (ideal gas, constant pressure).
  * Smoke outflow through a door (soffit height H_d, width W_d) when the layer drops below the
    soffit, and through a roof vent of area A_v (buoyancy-driven, Cd = 0.6).
  * Ceiling jet at radius r (Alpert): dT = 16.9 Q^(2/3) / H^(5/3)       (r/H <= 0.18)
                                      dT = 5.38 (Q/r)^(2/3) / H           (r/H > 0.18)
                                      U  = 0.96 (Q/H)^(1/3)               (r/H <= 0.15)
                                      U  = 0.195 Q^(1/3) H^(1/2) / r^(5/6)(r/H > 0.15)
  * Detector response (RTI model): dTd/dt = sqrt(U) (T_jet - Td) / RTI.
  * Smoke detector proxy: ceiling-jet temperature rise >= 5 K (Heskestad rule of thumb range 4-13 K).
  * Untenable conditions: smoke layer interface below 2.0 m OR upper layer above 60 degC
    (simplified criterion; ISO 13571 FED is the full method).
Limits: one compartment, uniform layer, no flame spread model, no sprinklers, no wind.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

G = 9.81
CP = 1.005      # kJ/kg/K
RHO_A0 = 1.204  # kg/m3 at 20 degC

ALPHA = {"lent": 0.00293, "moyen": 0.01172, "rapide": 0.0469, "ultra-rapide": 0.1876}

# Typical fire growth class of stored goods (NFPA 72 / SFPE classes; textiles & plastics on
# pallets are usually fast to ultra-fast).
MATERIALS = {
    "carton": "moyen",
    "palettes bois": "rapide",
    "textile / friperie": "rapide",
    "plastiques": "ultra-rapide",
}


@dataclass
class Scenario:
    floor_area: float = 220.0       # m2 (Industrial Hall: 10 x 22 m)
    height: float = 8.0             # m
    alpha: float = ALPHA["rapide"]  # kW/s2
    q_max: float = 5000.0           # kW (fuel or ventilation limit)
    door_width: float = 0.0         # m (0 = closed)
    door_height: float = 3.0        # m
    roof_vent: float = 0.0          # m2
    t_amb: float = 25.0             # degC
    loss_fraction: float = 0.6      # share of convective heat lost to walls/roof
    detector_r: float = 5.0         # m, radial distance of nearest ceiling detector
    rti: float = 50.0               # m^0.5 s^0.5 (fast heat detector ~50)
    duration: int = 900             # s


@dataclass
class Result:
    t: np.ndarray
    q: np.ndarray
    z: np.ndarray            # layer interface height above floor (m)
    t_upper: np.ndarray      # upper layer temperature (degC)
    jet_dt: np.ndarray       # ceiling-jet temperature rise at detector (K)
    t_smoke_detect: float | None
    t_heat_detect: float | None
    t_untenable: float | None
    meta: dict = field(default_factory=dict)


def ceiling_jet(q: float, h: float, r: float) -> tuple[float, float]:
    if q <= 0:
        return 0.0, 0.0
    if r / h <= 0.18:
        dt = 16.9 * q ** (2 / 3) / h ** (5 / 3)
    else:
        dt = 5.38 * (q / r) ** (2 / 3) / h
    if r / h <= 0.15:
        u = 0.96 * (q / h) ** (1 / 3)
    else:
        u = 0.195 * q ** (1 / 3) * h ** 0.5 / r ** (5 / 6)
    return dt, u


def simulate(s: Scenario, dt: float = 1.0) -> Result:
    n = int(s.duration / dt) + 1
    ta_k = s.t_amb + 273.15
    rho_a = RHO_A0 * 293.15 / ta_k
    t = np.arange(n) * dt
    q_arr, z_arr, tu_arr, jet_arr = (np.zeros(n) for _ in range(4))
    v = 1e-3 * s.floor_area          # tiny initial layer
    e = 0.0
    td = s.t_amb                     # detector element temperature
    t_smoke = t_heat = t_unt = None
    for i in range(n):
        q = min(s.alpha * t[i] ** 2, s.q_max)
        qc = 0.7 * q
        z = max(s.height - v / s.floor_area, 0.05)
        denom = 1 - e / (CP * rho_a * ta_k * v) if v > 0 else 1
        # Upper layer capped at 1000 degC: beyond flashover (~600 degC) the two-zone model is
        # out of its validity domain; the dashboard flags "hors domaine (embrasement)".
        tu_k = ta_k / max(denom, ta_k / 1273.15)
        rho_u = rho_a * ta_k / tu_k
        # outflows (buoyancy-driven); only when the layer reaches the opening
        m_out = 0.0
        dtk = max(tu_k - ta_k, 0.0)
        if s.door_width > 0 and z < s.door_height:
            depth = s.door_height - z
            m_out += (2 / 3) * 0.6 * s.door_width * rho_u * np.sqrt(2 * G * depth * dtk / ta_k) * depth
        if s.roof_vent > 0:
            depth = s.height - z
            m_out += 0.6 * s.roof_vent * rho_u * np.sqrt(2 * G * depth * dtk / ta_k)
        m_p = 0.071 * qc ** (1 / 3) * z ** (5 / 3) + 0.0018 * qc if qc > 0 else 0.0
        # cannot vent more than the layer contains
        m_out = min(m_out, m_p + rho_u * v / dt * 0.5)
        dv = (m_p - m_out) / rho_u * dt
        de = ((1 - s.loss_fraction) * qc - m_out * CP * dtk) * dt
        v = float(np.clip(v + dv, 1e-3 * s.floor_area, s.floor_area * (s.height - 0.05)))
        e = max(e + de, 0.0)
        # ceiling jet + detector
        jdt, u = ceiling_jet(q, s.height, s.detector_r)
        t_jet = s.t_amb + jdt
        td += np.sqrt(max(u, 1e-6)) * (t_jet - td) / s.rti * dt
        q_arr[i], z_arr[i], tu_arr[i], jet_arr[i] = q, z, tu_k - 273.15, jdt
        if t_smoke is None and jdt >= 5.0:
            t_smoke = float(t[i])
        if t_heat is None and td >= 57.0:
            t_heat = float(t[i])
        if t_unt is None and (z < 2.0 or tu_k - 273.15 > 60.0):
            t_unt = float(t[i])
    return Result(t, q_arr, z_arr, tu_arr, jet_arr, t_smoke, t_heat, t_unt, meta=s.__dict__.copy())


def closed_room_filling_time(q_kw: float, area: float, height: float, z_target: float) -> float:
    """Analytic check (steady fire, closed room, constant layer density, Zukoski-type
    entrainment m = k z^(5/3), k = 0.071 Qc^(1/3)): t = (3/2) rho A / k (z^-2/3 - H^-2/3).
    Used only as a sanity check of the numerical model."""
    qc = 0.7 * q_kw
    k = 0.071 * qc ** (1 / 3)
    return 1.5 * RHO_A0 * area / k * (z_target ** (-2 / 3) - height ** (-2 / 3))
