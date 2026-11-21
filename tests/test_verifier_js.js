// The browser verifier (app/js/verifier.js) must give the same fire probability as Python/sklearn.
// Run: node tests/test_verifier_js.js
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const { predict } = require(path.join(root, "app/js/verifier.js"));
const js = fs.readFileSync(path.join(root, "app/data/verifier_data.js"), "utf8");
const model = JSON.parse(js.slice(js.indexOf("{"), js.lastIndexOf("}") + 1));
const chk = JSON.parse(fs.readFileSync(path.join(root, "ai/alarm_verifier/results/js_verifier_check.json"), "utf8"));
let maxd = 0;
chk.x.forEach((x, i) => { maxd = Math.max(maxd, Math.abs(predict(model, x) - chk.p[i])); });
console.log("trees:", model.trees.length, "max |JS - Python| =", maxd.toExponential(2));
if (maxd > 1e-4) { console.error("MISMATCH"); process.exit(1); }
console.log("OK: JS verifier matches Python");
