// Close-up screenshots of the 3D VFX (fire growth, smoke layer). Run: node tools/closeup.js
const { chromium } = require("playwright-core");
const path = require("path");
// Windows may briefly lock files (antivirus / thumbnails): capture to memory, retry the write.
async function shot(page, file) {
  const buf = await page.screenshot();
  for (let k = 0; k < 10; k++) {
    try { require("fs").writeFileSync(file, buf); return; } catch (e) { await new Promise(r => setTimeout(r, 400)); }
  }
  console.log("could not write " + file);
}

const root = path.resolve(__dirname, "..");
const url = "file:///" + path.join(root, "app", "index.html").split(path.sep).join("/");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(2500);
  const shots = [
    [445, "VFX1_fire_growing", [-0.9, 0.32, 17]],
    [560, "VFX2_fire_big", [-0.9, 0.3, 19]],
    [700, "VFX3_smoke_layer", [-0.6, 0.45, 30]],
    [300, "VFX4_smolder", [-0.9, 0.35, 15]],
  ];
  for (const [t, name, view] of shots) {
    await p.evaluate(([t, v]) => { const A = window.AFDT_APP; A.setScenario(0, false); A.showPage("zone", true); A.seekT(t); A.twin.setView(v[0], v[1], v[2]); }, [t, view]);
    await p.waitForTimeout(3500);
    await shot(p, path.join(root, "docs", "screenshots", name + ".png"));
  }
  console.log(errs.length ? "ERRORS " + errs.join("; ") : "No JS errors");
  await b.close();
})();
