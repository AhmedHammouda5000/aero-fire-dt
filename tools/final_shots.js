// Screenshots of the rebuilt fire spread and of the power-cut mode. Run: node tools/final_shots.js
const { chromium } = require("playwright-core");
const OUT = require("path").resolve(__dirname, "../docs/screenshots") + "/";
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto("file:///" + require("path").resolve(__dirname, "../app/index.html").split("\\").join("/")); await p.waitForTimeout(3000);
  await p.evaluate(() => { const A = window.AFDT_APP; A.setScenario(A.sandboxIndex(), false); A.st.speed = 20; A.SBX.tool = "bois_grand"; A.sbPlace(3.5, 5.0); document.getElementById("sb-min").click(); });
  for (let k = 0; k < 600; k++) { if (await p.evaluate(() => window.AFDT_APP.SBX.sb.sim.time) >= 240) break; await p.waitForTimeout(400); }
  await p.evaluate(() => window.AFDT_APP.twin.setView(-0.9, 0.7, 12, [3.5, 1.5, 4.6])); await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + "VFX5_rack_fire_spread.png" });
  await p.click("#btn-power"); await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + "P1_power_cut_battery.png" });
  await b.close();
})();
