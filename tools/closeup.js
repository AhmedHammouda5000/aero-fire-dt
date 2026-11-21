// Close-up screenshots of the physics-driven 3D view (CFD smoke, flames, danger map, +60 s ghost).
// Run: node tools/closeup.js
const { chromium } = require("playwright-core");
const path = require("path");
const fs = require("fs");
async function shot(page, file) {   // Windows may briefly lock files: capture to memory, retry the write
  const buf = await page.screenshot();
  for (let k = 0; k < 10; k++) { try { fs.writeFileSync(file, buf); return; } catch (e) { await new Promise(r => setTimeout(r, 400)); } }
  console.log("could not write " + file);
}
const root = path.resolve(__dirname, "..");
const url = "file:///" + path.join(root, "app", "index.html").split(path.sep).join("/");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(2500);
  const shots = [
    // [scenario time (s), name, camera [az, el, dist], page, ghost, danger]
    [300, "VFX4_smolder", [-0.9, 0.35, 15], "zone", false, false],
    [480, "VFX1_fire_growing", [-0.9, 0.32, 18], "zone", false, true],
    [600, "VFX2_fire_spread", [-0.9, 0.3, 20], "zone", false, true],
    [600, "VFX5_ghost_60s", [-0.75, 0.55, 28], "zone", true, true],
    [760, "VFX3_smoke_filling", [-0.6, 0.45, 30], "zone", false, true],
    [760, "VFX6_forecast_page", [-0.6, 0.45, 30], "forecast", true, true],
  ];
  for (const [t, name, view, page, ghost, danger] of shots) {
    await p.evaluate(([t, v, pg, gh, dg]) => {
      const A = window.AFDT_APP; if (A.st.k !== 0) A.setScenario(0, false);
      A.showPage(pg, true); A.seekT(t); A.twin.setView(v[0], v[1], v[2]);
      A.CFD.showGhost = gh; A.CFD.showDanger = dg;
    }, [t, view, page, ghost, danger]);
    for (let k = 0; k < 240; k++) { const behind = await p.evaluate(() => window.AFDT_APP.cfdBehind()); if (behind < 1) break; await p.waitForTimeout(500); }
    if (ghost || page === "forecast") for (let k = 0; k < 120; k++) { const ok = await p.evaluate(() => !!window.AFDT_APP.CFD.ghost); if (ok) break; await p.waitForTimeout(500); }
    await p.waitForTimeout(3500);
    await shot(p, path.join(root, "docs", "screenshots", name + ".png"));
    console.log("shot", name);
  }
  console.log(errs.length ? "ERRORS " + errs.join("; ") : "No JS errors");
  await b.close();
})();
