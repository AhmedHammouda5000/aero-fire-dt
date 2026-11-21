// Free-test bench: place each source 3-4 m from a sensor node, run the physics, and check what the
// synthetic sensors, the AI and the simulated SSI do. Writes docs/results/sandbox_matrix.json
// Run: node tests/test_sandbox.js [seconds]
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const { Sandbox, SOURCES } = require(path.join(root, "app/js/sandbox.js"));
const hall = JSON.parse(fs.readFileSync(path.join(root, "twin/hall.json"), "utf8"));
const js = fs.readFileSync(path.join(root, "app/data/verifier_data.js"), "utf8");
const model = JSON.parse(js.slice(js.indexOf("{"), js.lastIndexOf("}") + 1));
const T = +(process.argv[2] || 300);
const out = {};
for (const type of Object.keys(SOURCES)) {
  const sb = new Sandbox(hall, model, { tamb: 28 });
  const rec = sb.place(type, 14.0, 5.0);            // zone B, open floor, ~3 m from node 11 (11, 5)
  for (let t = 0; t < T; t += 0.5) sb.step(0.5);
  const s = sb.scn, n = s.t.length - 1;
  const maxNode = k => Math.max(...Object.values(s.nodes).map(v => Math.max(...v[k])));
  const verdicts = [...new Set(s.hall.verdict)];
  const levels = s.alerts.flat().map(a => a.code);
  out[type] = {
    expected: SOURCES[type].kind, dist_to_node_m: +rec.dNode.toFixed(1),
    max_dPM_log: +maxNode("dPM").toFixed(2), max_dCO: +maxNode("dCO").toFixed(2), max_dH2: +maxNode("dH2").toFixed(2),
    max_dVOC: +maxNode("dVOC").toFixed(2), max_dTEMP: +maxNode("dTEMP").toFixed(2),
    max_p: +Math.max(...s.hall.p.filter(v => v !== null), 0).toFixed(2), verdicts, final: s.hall.verdict[n],
    ssi_alarm_s: s.key_times.ssi_alarm, ai_fire_s: s.key_times.ai_fire, alert_codes: [...new Set(levels)],
  };
  console.log(type.padEnd(12), JSON.stringify(out[type]));
}
fs.writeFileSync(path.join(root, "docs/results/sandbox_matrix.json"), JSON.stringify(out, null, 1));
// pass/fail: large fires must be confirmed, no nuisance may ever reach "FEU CONFIRMÉ"
let fail = 0;
for (const k of ["bois_petit", "bois_grand", "textile", "plastique"]) if (!out[k].alert_codes.includes("FIRE_CONFIRMED")) { console.log("FAIL fire not confirmed:", k); fail++; }
for (const k of ["aerosol", "soudure", "echappement", "poussiere"]) if (out[k].alert_codes.includes("FIRE_CONFIRMED")) { console.log("FAIL nuisance confirmed as fire:", k); fail++; }
console.log(fail ? "FAILED" : "OK: fires confirmed, no nuisance confirmed as fire (small candle/cigarette far from sensors = not detected, documented limit)");
process.exit(fail ? 1 : 0);
