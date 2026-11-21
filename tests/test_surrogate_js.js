// Checks that the browser (JS) surrogate gives the same outputs as Python/sklearn.
// Run: node tests/test_surrogate_js.js
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const { forward } = require(path.join(root, "app/js/surrogate.js"));
const model = JSON.parse(fs.readFileSync(path.join(root, "app/data/surrogate.json"), "utf8"));
const check = JSON.parse(fs.readFileSync(path.join(root, "ai/forecast/results/js_check.json"), "utf8"));
let maxDiff = 0;
check.x.forEach((x, i) => {
  const y = forward(model, x);
  y.forEach((v, j) => { maxDiff = Math.max(maxDiff, Math.abs(v - check.y[i][j])); });
});
console.log("max |JS - Python| =", maxDiff.toExponential(2));
// weights are rounded to 6 decimals in the export; outputs are in m, degC and s
if (maxDiff > 1e-2) { console.error("MISMATCH"); process.exit(1); }
console.log("OK: JS surrogate matches Python");
