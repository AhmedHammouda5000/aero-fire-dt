// Headless browser check of the dashboard: loads app/index.html from file://, collects JS
// errors, visits every scenario/page and saves screenshots to docs/screenshots/.
// Run: node tools/screenshots.js
const { chromium } = require("playwright-core");
const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });
const url = "file:///" + path.join(root, "app", "index.html").replace(/\\/g, "/");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(url);
  await page.waitForTimeout(1500);
  const shots = [
    { k: 0, t: -60, page: "zone", name: "A1_dark_cockpit" },
    { k: 0, t: 420, page: "zone", name: "A2_prealarm_zone" },
    { k: 0, t: 640, page: "zone", name: "A3_fire_confirmed_zone" },
    { k: 0, t: 640, page: "forecast", name: "A4_forecast" },
    { k: 0, t: 640, page: "sensors", name: "A5_sensors" },
    { k: 0, t: 640, page: "why", name: "A6_why" },
    { k: 0, t: 640, page: "ssi", name: "A7_ssi" },
    { k: 1, t: 100, page: "why", name: "B1_aerosol_why" },
    { k: 1, t: 100, page: "ssi", name: "B2_aerosol_ssi" },
    { k: 2, t: 70, page: "sensors", name: "C1_exhaust_co" },
    { k: 3, t: 700, page: "zone", name: "D1_drift" },
    { k: 4, t: 200, page: "why", name: "E1_welding_limit" },
  ];
  for (const s of shots) {
    await page.evaluate(({ k, t, p }) => {
      const A = window.AFDT_APP; A.setScenario(k, false); A.showPage(p, true); A.seekT(t);
    }, { k: s.k, t: s.t, p: s.page });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, s.name + ".png") });
  }
  // results modal
  await page.click("#btn-results"); await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, "R1_results.png") });
  await page.click("#btn-close-results");
  // smaller laptop screen
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => { const A = window.AFDT_APP; A.setScenario(0, true); A.showPage("forecast", true); A.seekT(660); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, "L1_laptop_1366.png") });
  // video mode runs without errors for a few seconds
  await page.evaluate(() => window.AFDT_APP.runVideo());
  await page.waitForTimeout(9000);
  await page.screenshot({ path: path.join(out, "V1_video_mode.png") });
  await page.evaluate(() => window.AFDT_APP.stopVideo());
  console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "No JS errors");
  await browser.close();
})();
