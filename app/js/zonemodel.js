/* Aero-Fire DT — two-zone smoke-filling model, JavaScript port of ai/forecast/zone_model.py
 * (same equations; checked against Python by tests/test_zonemodel_js.js). */
(function (root) {
  const G = 9.81, CP = 1.005, RHO_A0 = 1.204;
  const ALPHA = { "lent": 0.00293, "moyen": 0.01172, "rapide": 0.0469, "ultra-rapide": 0.1876 };

  function ceilingJet(q, h, r) {
    if (q <= 0) return [0, 0];
    const dt = r / h <= 0.18 ? 16.9 * Math.pow(q, 2 / 3) / Math.pow(h, 5 / 3)
                             : 5.38 * Math.pow(q / r, 2 / 3) / h;
    const u = r / h <= 0.15 ? 0.96 * Math.pow(q / h, 1 / 3)
                            : 0.195 * Math.pow(q, 1 / 3) * Math.sqrt(h) / Math.pow(r, 5 / 6);
    return [dt, u];
  }

  function simulate(p) {
    const s = Object.assign({
      floor_area: 220, height: 8, alpha: ALPHA["rapide"], q_max: 5000, door_width: 0,
      door_height: 3, roof_vent: 0, t_amb: 25, loss_fraction: 0.6, detector_r: 5, rti: 50,
      duration: 900,
    }, p);
    const n = Math.floor(s.duration) + 1;
    const taK = s.t_amb + 273.15, rhoA = RHO_A0 * 293.15 / taK;
    const t = new Float64Array(n), q = new Float64Array(n), z = new Float64Array(n),
      tu = new Float64Array(n), jet = new Float64Array(n);
    let v = 1e-3 * s.floor_area, e = 0, td = s.t_amb;
    let tSmoke = null, tHeat = null, tUnt = null;
    for (let i = 0; i < n; i++) {
      t[i] = i;
      const qi = Math.min(s.alpha * i * i, s.q_max), qc = 0.7 * qi;
      const zi = Math.max(s.height - v / s.floor_area, 0.05);
      const denom = v > 0 ? 1 - e / (CP * rhoA * taK * v) : 1;
      const tuK = taK / Math.max(denom, taK / 1273.15);
      const rhoU = rhoA * taK / tuK;
      let mOut = 0;
      const dtk = Math.max(tuK - taK, 0);
      if (s.door_width > 0 && zi < s.door_height) {
        const depth = s.door_height - zi;
        mOut += (2 / 3) * 0.6 * s.door_width * rhoU * Math.sqrt(2 * G * depth * dtk / taK) * depth;
      }
      if (s.roof_vent > 0) {
        const depth = s.height - zi;
        mOut += 0.6 * s.roof_vent * rhoU * Math.sqrt(2 * G * depth * dtk / taK);
      }
      const mP = qc > 0 ? 0.071 * Math.pow(qc, 1 / 3) * Math.pow(zi, 5 / 3) + 0.0018 * qc : 0;
      mOut = Math.min(mOut, mP + rhoU * v * 0.5);
      const dv = (mP - mOut) / rhoU;
      const de = (1 - s.loss_fraction) * qc - mOut * CP * dtk;
      v = Math.min(Math.max(v + dv, 1e-3 * s.floor_area), s.floor_area * (s.height - 0.05));
      e = Math.max(e + de, 0);
      const [jdt, u] = ceilingJet(qi, s.height, s.detector_r);
      td += Math.sqrt(Math.max(u, 1e-6)) * (s.t_amb + jdt - td) / s.rti;
      q[i] = qi; z[i] = zi; tu[i] = tuK - 273.15; jet[i] = jdt;
      if (tSmoke === null && jdt >= 5) tSmoke = i;
      if (tHeat === null && td >= 57) tHeat = i;
      if (tUnt === null && (zi < 2 || tuK - 273.15 > 60)) tUnt = i;
    }
    return { t, q, z, t_upper: tu, jet_dt: jet, t_smoke_detect: tSmoke, t_heat_detect: tHeat,
             t_untenable: tUnt, params: s };
  }

  const api = { simulate, ALPHA };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AFDT_ZoneModel = api;
})(typeof window !== "undefined" ? window : globalThis);
