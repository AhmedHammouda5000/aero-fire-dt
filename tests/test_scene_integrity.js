// 3D scene integrity in headless Chrome: no floating boxes, roof present (and hidden from above),
// fire spread visible on the real objects (charring + flames), clean scene after reset / scenario change.
// Run: node tests/test_scene_integrity.js   -> docs/results/scene_integrity.json
const { chromium } = require("../tools/node_modules/playwright-core");
const path = require("path"), fs = require("fs");
const root = path.resolve(__dirname, "..");
const url = "file:///" + path.join(root, "app", "index.html").split(path.sep).join("/");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(3500);
  const R = {};
  // 1) every cardboard box rests on something (shelf, pallet, box or floor) within 3 cm
  R.boxes = await p.evaluate(() => {
    const T = window.THREE, d = window.AFDT_APP.twin.debug, ray = new T.Raycaster();
    const solids = []; d.scene.traverse(o => { if (o.isMesh && o.visible && !o.material.transparent) solids.push(o); });
    const boxes = d.burnItems.filter(it => it.obj && it.obj.userData && it.obj.userData.box);
    let floating = 0, worst = 0; const bad = [];
    boxes.forEach(it => {
      const bb = new T.Box3().setFromObject(it.obj), c = bb.getCenter(new T.Vector3()), own = new Set(); it.obj.traverse(o => own.add(o));
      // support = highest surface under the box footprint (centre + 4 corners), like a real box resting on edges
      let sup = 0;
      [[0, 0], [-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25]].forEach(([fx, fz]) => {
        ray.set(new T.Vector3(c.x + fx * (bb.max.x - bb.min.x), bb.min.y + 0.02, c.z + fz * (bb.max.z - bb.min.z)), new T.Vector3(0, -1, 0));
        const h = ray.intersectObjects(solids, false).filter(h => !own.has(h.object))[0];
        if (h) sup = Math.max(sup, h.point.y);
      });
      const gap = bb.min.y - sup;
      worst = Math.max(worst, gap); if (gap > 0.03) { floating++; bad.push([+c.x.toFixed(2), +bb.min.y.toFixed(2), +c.z.toFixed(2), +gap.toFixed(3)]); }
    });
    return { boxes: boxes.length, floating, worst_gap_m: +worst.toFixed(3), examples: bad.slice(0, 5) };
  });
  R.boxes.ok = R.boxes.boxes > 20 && R.boxes.floating === 0;
  // 2) roof: exists, faces down (visible from inside, culled from above)
  R.roof = await p.evaluate(() => { const r = window.AFDT_APP.twin.debug.roof, n = new window.THREE.Vector3(0, 0, 1).applyQuaternion(r.quaternion); return { exists: !!r, normal_y: +n.y.toFixed(2), side: r.material.side }; });
  R.roof.ok = R.roof.exists && R.roof.normal_y < -0.99 && R.roof.side === 0;
  // 3) fire spread: big wood fire next to a rack -> rack ignites, its boxes char, flames exist
  await p.evaluate(() => { const A = window.AFDT_APP; A.setScenario(A.sandboxIndex(), false); A.st.speed = 30; A.SBX.tool = "bois_grand"; A.sbPlace(3.5, 5.0); });
  for (let k = 0; k < 600; k++) { if (await p.evaluate(() => window.AFDT_APP.SBX.sb.sim.time) >= 240) break; await p.waitForTimeout(400); }
  await p.waitForTimeout(800);
  R.spread = await p.evaluate(() => {
    const A = window.AFDT_APP, d = A.twin.debug, sim = A.SBX.sb.sim;
    const racks = sim.fuel.filter(f => !String(f.id).startsWith("src-") && (f.burning || f.burnt)).map(f => f.id);
    const charred = d.burnItems.filter(it => it.b > 0.3).length;
    return { racks_ignited: racks, charred_items: charred, flames_alive: d.flamesAlive(), source_visual: d.srcVis.length };
  });
  R.spread.ok = R.spread.racks_ignited.length >= 1 && R.spread.charred_items >= 5 && R.spread.flames_alive > 20 && R.spread.source_visual === 1;
  // 4) reset + scenario change -> clean scene
  R.reset = await p.evaluate(async () => {
    const A = window.AFDT_APP, d = A.twin.debug;
    document.getElementById("sb-reset-top").click(); await new Promise(r => setTimeout(r, 300));
    const afterReset = { sources: A.SBX.sb.sources.length, srcVis: d.srcVis.length, charred: d.burnItems.filter(it => it.b > 0.05).length };
    A.setScenario(1, false); await new Promise(r => setTimeout(r, 1500));
    return { afterReset, afterSwitch: { sim: A.CFD.sim === null, flames: d.flamesAlive(), charred: d.burnItems.filter(it => it.b > 0.05).length } };
  });
  R.reset.ok = R.reset.afterReset.sources === 0 && R.reset.afterReset.srcVis === 0 && R.reset.afterReset.charred === 0 && R.reset.afterSwitch.sim && R.reset.afterSwitch.flames === 0;
  R.js_errors = errs; R.ok = R.boxes.ok && R.roof.ok && R.spread.ok && R.reset.ok && !errs.length;
  fs.writeFileSync(path.join(root, "docs/results/scene_integrity.json"), JSON.stringify(R, null, 1));
  for (const k of ["boxes", "roof", "spread", "reset"]) console.log((R[k].ok ? "PASS " : "FAIL ") + k, JSON.stringify(R[k]));
  console.log(R.ok ? "OK: 3D scene integrity" : "FAILED" + (errs.length ? " js errors: " + errs.join("; ") : ""));
  await b.close(); process.exit(R.ok ? 0 : 1);
})();
