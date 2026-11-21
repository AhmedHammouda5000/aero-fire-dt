// Physics validation of the real-time CFD engine (app/js/cfd.js) against classic fire-engineering
// correlations. Run: node tests/test_cfd.js   (writes docs/results/cfd_validation.json)
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const { Sim, flameHeight } = require(path.join(root, "app/js/cfd.js"));
const hall = JSON.parse(fs.readFileSync(path.join(root, "twin/hall.json"), "utf8"));
const out = {}; let fail = 0;
const check = (name, ok, info) => { out[name] = Object.assign({ ok }, info); console.log((ok ? "PASS " : "FAIL ") + name, JSON.stringify(info)); if (!ok) fail++; };
const empty = () => { const s = new Sim(hall, { tamb: 20 }); s.fuel = []; return s; };

// 1) Plume centreline temperature vs Heskestad (steady 1 MW fire at the hall centre)
{
  const s = empty(), Q = 1000, D = 1.2;
  s.addFire(11, 5, D, Q, "carton");
  for (let n = 0; n < 50; n++) s.step(0.5);           // 25 s: plume established, ceiling layer still thin
  const Qc = 0.7 * Q, z0 = 0.083 * Math.pow(Q, 0.4) - 1.02 * D;
  const rows = [3.0, 4.0, 5.0].map(z => {
    let sim = 0; for (let k = 0; k < 10; k++) { s.step(0.5); sim += s.sampleT(11, z, 5); } sim /= 10;
    const ref = 9.1 * Math.pow(293 / (9.81 * 1.005 ** 2 * 1.2 ** 2), 1 / 3) * Math.pow(Qc, 2 / 3) * Math.pow(z - z0, -5 / 3);
    return { z, cfd_dT: +sim.toFixed(1), heskestad_dT: +ref.toFixed(1), ratio: +(sim / ref).toFixed(2) };
  });
  const ok = rows.every(r => r.ratio > 0.33 && r.ratio < 3);
  check("plume_centreline_vs_heskestad", ok, { rows, tolerance: "factor 3 (0.5 m cells smear the plume)" });
}
// 2) Ceiling-jet temperature vs Alpert (r/H > 0.18). Alpert's correlation holds for an UNCONFINED
//    ceiling, i.e. before a hot layer accumulates; in this 10 m wide closed hall the layer builds up
//    within ~15 s, so the comparison is made in the jet-only regime (t = 8-11 s after ignition).
{
  const s = empty(), Q = 1000;
  s.addFire(11, 5, 1.2, Q, "carton");
  for (let n = 0; n < 16; n++) s.step(0.5);
  const H = 8, rows = [3, 5].map(r => {
    const c = s.clone(); let sim = 0; for (let k = 0; k < 6; k++) { c.step(0.5); sim += c.sampleT(11 + r, H - 0.35, 5); } sim /= 6;
    const ref = 5.38 * Math.pow(Q / r, 2 / 3) / H;
    return { r, cfd_dT: +sim.toFixed(1), alpert_dT: +ref.toFixed(1), ratio: +(sim / ref).toFixed(2) };
  });
  check("ceiling_jet_vs_alpert", rows.every(r => r.ratio > 0.33 && r.ratio < 3), { rows, tolerance: "factor 3" });
}
// 3) Smoke mass balance in a closed hall (semi-Lagrangian transport is not exactly conservative)
{
  const s = empty();
  s.addFire(11, 5, 1.2, 1500, "carton");
  let produced = 0;
  for (let n = 0; n < 240; n++) { s.step(0.5); produced += s.prodSoot; }
  const inHall = s.totalSoot(), ratio = inHall / produced;
  check("smoke_mass_balance_closed_hall", ratio > 0.7 && ratio < 1.3, { produced_kg: +produced.toFixed(3), in_hall_kg: +inHall.toFixed(3), ratio: +ratio.toFixed(2), tolerance: "±30 %" });
}
// 4) Opening the door + roof vents evacuates smoke
{
  const run = (door, vent) => { const s = empty(); s.setOpenings(door, vent); s.addFire(11, 5, 1.2, 1500, "carton"); for (let n = 0; n < 360; n++) s.step(0.5); return { soot: s.totalSoot(), layer: s.layerHeight() }; };
  const closed = run(0, 0), open = run(4, 12);
  check("openings_evacuate_smoke", open.soot < closed.soot * 0.95, { closed_kg: +closed.soot.toFixed(3), open_kg: +open.soot.toFixed(3), layer_closed_m: closed.layer, layer_open_m: open.layer });
}
// 5) Fire spread: neighbours ignite, distant fuel does not
{
  const s = new Sim(hall, { tamb: 25 });
  s.ignite(3.5, 2.6, 0.0469, 5000);
  const tIg = {};
  for (let n = 0; n < 600; n++) { s.step(0.5); s.fuel.forEach(p => { if (p.burning && tIg[p.id] === undefined) tIg[p.id] = s.time; }); }
  const near = Object.keys(tIg).filter(k => k.startsWith("A1"));
  check("fire_spread_neighbours_vs_distant", near.length >= 2 && tIg["C-fûts"] === undefined,
    { ignition_times_s: tIg, hrr_MW_at_300s: +(s.totalHRR() / 1000).toFixed(2) });
}
// 6) Flame height (Heskestad) sanity
{
  const L = flameHeight(1000, 1.2), ref = 0.235 * Math.pow(1000, 0.4) - 1.02 * 1.2;
  check("flame_height_heskestad", Math.abs(L - ref) < 1e-9 && L > 2 && L < 4, { Q_kW: 1000, D_m: 1.2, L_m: +L.toFixed(2) });
}
// 7) Speed
{
  const s = new Sim(hall, { tamb: 25 }); s.ignite(3.5, 2.6, 0.0469, 5000);
  const t = Date.now(); for (let n = 0; n < 200; n++) s.step(0.5);
  const ms = (Date.now() - t) / 200;
  check("realtime_speed", ms < 40, { ms_per_step: +ms.toFixed(1), cells: s.N, dt_s: 0.5, speedup_vs_realtime: +(500 / ms).toFixed(0) });
}
fs.writeFileSync(path.join(root, "docs/results/cfd_validation.json"), JSON.stringify(out, null, 2));
console.log(fail ? fail + " FAILED" : "OK: all CFD physics checks passed");
process.exit(fail ? 1 : 0);
