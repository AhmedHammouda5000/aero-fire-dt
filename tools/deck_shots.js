// Fresh screenshots for the PDF deliverables (pitch, recap). Run: node tools/deck_shots.js
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs");
const root = path.resolve(__dirname, ".."), out = path.join(root, "docs", "livrables", "pdf_src", "img");
const url = "file:///" + path.join(root, "app", "index.html").split(path.sep).join("/");
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(2500);
  const shots = [
    { k: 0, t: 215, pg: "zone", n: "A_early" }, { k: 0, t: 420, pg: "zone", n: "A_prealarm" },
    { k: 0, t: 660, pg: "zone", n: "A_fire" }, { k: 0, t: 660, pg: "forecast", n: "A_forecast" },
    { k: 0, t: 660, pg: "why", n: "A_why" }, { k: 1, t: 150, pg: "why", n: "B_procedure" },
    { k: 1, t: 150, pg: "zone", n: "B_zone" }, { k: 3, t: 700, pg: "zone", n: "D_drift" },
  ];
  for (const s of shots) {
    await p.evaluate(({ k, t, pg }) => { const A = window.AFDT_APP; A.setScenario(k, false); A.showPage(pg, true); A.seekT(t); }, s);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(out, s.n + ".png") });
  }
  await p.evaluate(() => { const A = window.AFDT_APP; A.setScenario(0, false); A.showPage("zone", true); A.seekT(660); });
  await p.click("#btn-power"); await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(out, "power_cut.png") });
  fs.copyFileSync(path.join(root, "docs", "screenshots", "VFX5_rack_fire_spread.png"), path.join(out, "F_spread.png"));
  fs.copyFileSync(path.join(root, "docs", "screenshots", "SB2_aerosol_workshop.png"), path.join(out, "F_aerosol.png"));
  console.log("errors:", errs.length, errs.slice(0, 3));
  await b.close();
})();
