// Free-test bench check in headless Chrome: places sources like a user would, runs the physics,
// screenshots the result. Run: node tools/sandbox_shots.js
const { chromium } = require("playwright-core");
const path = require("path");
const fs = require("fs");
async function shot(page, file) {
  const buf = await page.screenshot();
  for (let k = 0; k < 10; k++) { try { fs.writeFileSync(file, buf); return; } catch (e) { await new Promise(r => setTimeout(r, 400)); } }
}
const root = path.resolve(__dirname, "..");
const url = "file:///" + path.join(root, "app", "index.html").split(path.sep).join("/");
const out = path.join(root, "docs", "screenshots");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(2500);
  const runUntil = async (t) => { for (let k = 0; k < 600; k++) { const tt = await p.evaluate(() => window.AFDT_APP.SBX.sb.sim.time); if (tt >= t) return tt; await p.waitForTimeout(500); } };
  const report = [];
  const cases = [
    { name: "SB1_wood_fire_near_rack", tools: [["bois_grand", 5.0, 2.2]], until: 150, view: [0.9, 0.38, 20] },
    { name: "SB2_aerosol_workshop", tools: [["aerosol", 19.5, 6.5]], until: 120, view: [-0.75, 0.5, 26] },
    { name: "SB3_candle_vs_cigarette", tools: [["bougies", 11.2, 5.4], ["cigarette", 3.0, 5.0]], until: 150, view: [-0.75, 0.5, 26] },
    { name: "SB4_fire_and_nuisance", tools: [["textile", 12.0, 3.0], ["echappement", 18.5, 8.5]], until: 160, view: [-0.75, 0.55, 28] },
  ];
  for (const c of cases) {
    await p.evaluate(([c]) => {
      const A = window.AFDT_APP;

      A.setScenario(A.sandboxIndex(), false);

      A.st.speed = 10; document.getElementById("speed").value = "10";
      c.tools.forEach(([k, x, z]) => { A.SBX.tool = k; A.sbPlace(x, z); });
      A.twin.setView(c.view[0], c.view[1], c.view[2]); A.CFD.showDanger = true;
    }, [c]);
    await runUntil(c.until);
    await p.waitForTimeout(1500);
    await shot(p, path.join(out, c.name + ".png"));
    const info = await p.evaluate(() => {
      const A = window.AFDT_APP, s = A.SBX.sb.scn, i = s.t.length - 1;
      return { t: s.t[i], verdict: s.hall.verdict[i], p: s.hall.p[i], ssi: s.key_times.ssi_alarm, aiFire: s.key_times.ai_fire,
        alerts: (s.alerts[i] || []).map(a => a.title), sources: A.SBX.sb.sources.map(r => r.label + " → capteur " + r.node + " à " + r.dNode.toFixed(1) + " m"),
        burning: A.SBX.sb.sim.fuel.filter(f => f.burning).map(f => f.id) };
    });
    report.push(Object.assign({ case: c.name }, info));
    console.log(c.name, JSON.stringify(info));
  }
  fs.writeFileSync(path.join(root, "docs", "results", "sandbox_browser_runs.json"), JSON.stringify(report, null, 1));
  console.log(errs.length ? "ERRORS " + errs.join("; ") : "No JS errors");
  await b.close();
})();
