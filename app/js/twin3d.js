/* Aero-Fire DT — realistic 3D digital twin of the hall (three.js r147 + GLTFLoader, offline).
 * Real CC0 assets from Poly Haven (app/data/assets_data.js, see ASSETS_CREDITS.md).
 * Physics drives the visuals:
 *   - flame height from Heskestad's correlation L = 0.235 Q^0.4 - 1.02 D (Q = zone-model HRR)
 *   - smoke-layer interface = zone-model layer height; hot layer darker/redder
 *   - sensor colours / haze = measured data; ceiling detectors = simulated SSI loop states. */
(function (root) {
  const COL = { green: 0x22d36b, amber: 0xffb000, red: 0xff2a2a, grey: 0x777777 };

  /* ---------- helpers ---------- */
  function b64ToBuf(b64) {
    const bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  const softTex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.75)");
    r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  const puffTex = canvasTex(128, 128, (g, w) => {
    // irregular smoke puff: many soft blobs
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 26; k++) {
      const x = w / 2 + (rnd() - 0.5) * w * 0.45, y = w / 2 + (rnd() - 0.5) * w * 0.45, rr = w * (0.12 + rnd() * 0.22);
      const r = g.createRadialGradient(x, y, 0, x, y, rr);
      r.addColorStop(0, "rgba(255,255,255,0.22)"); r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    }
  });

  /* GPU particle system: CPU-simulated, drawn as soft rotated point sprites */
  class Particles {
    constructor(n, tex, blending, scene) {
      this.n = n;
      this.pos = new Float32Array(3 * n); this.col = new Float32Array(4 * n);
      this.size = new Float32Array(n); this.rot = new Float32Array(n);
      this.vel = new Float32Array(3 * n); this.life = new Float32Array(n); this.max = new Float32Array(n);
      this.rs = new Float32Array(n); this.s0 = new Float32Array(n); this.k = new Float32Array(n);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
      g.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
      g.setAttribute("rot", new THREE.BufferAttribute(this.rot, 1));
      this.mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, uScale: { value: 400 } },
        vertexShader: `attribute float size; attribute vec4 color; attribute float rot;
          varying vec4 vC; varying float vR; uniform float uScale;
          void main(){ vC = color; vR = rot; vec4 mv = modelViewMatrix * vec4(position,1.0);
            gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D map; varying vec4 vC; varying float vR;
          void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR);
            vec2 uv = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5; vec4 t = texture2D(map, uv);
            float a = vC.a * t.a; if (a < 0.003) discard; gl_FragColor = vec4(vC.rgb, a); }`,
        transparent: true, depthWrite: false, blending,
      });
      this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
      scene.add(this.points); this.cursor = 0; this.acc = 0;
      for (let i = 0; i < n; i++) this.life[i] = this.max[i] = 1;
    }
    spawn(x, y, z, vx, vy, vz, life, s0, k) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
      this.pos.set([x, y, z], 3 * i); this.vel.set([vx, vy, vz], 3 * i);
      this.life[i] = 0; this.max[i] = life; this.s0[i] = s0; this.k[i] = k || 0;
      this.rot[i] = Math.random() * 6.28; this.rs[i] = (Math.random() - 0.5) * 1.2;
    }
    commit() {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
      g.attributes.size.needsUpdate = true; g.attributes.rot.needsUpdate = true;
    }
  }

  function Twin3D(container, hall) {
    const W = hall.size.length, D = hall.size.width, H = hall.size.height;
    const A = window.AFDT_ASSETS;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090c);
    scene.fog = new THREE.Fog(0x06090c, 45, 95);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    const center = new THREE.Vector3(W / 2, 2.6, D / 2);
    let az = -0.72, el = 0.5, dist = 31;

    /* ---------- lights ---------- */
    scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x2a2420, 0.55));
    const sun = new THREE.DirectionalLight(0xfff1dd, 0.9);
    sun.position.set(W * 0.75, 18, -6); sun.target.position.set(W / 2, 0, D / 2);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 50 });
    sun.shadow.bias = -0.0008; scene.add(sun, sun.target);
    const lampLights = [];
    [W * 0.25, W * 0.75].forEach(x => { const l = new THREE.PointLight(0xffe2b0, 0.55, 22, 1.6); l.position.set(x, H - 1.4, D / 2); scene.add(l); lampLights.push(l); });

    /* ---------- textures ---------- */
    const texLoader = new THREE.TextureLoader();
    function pbr(id, rx, ry, colorTint) {
      const t = A.textures[id], set = (tex, srgb) => { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(rx, ry); tex.anisotropy = 8; if (srgb) tex.encoding = THREE.sRGBEncoding; return tex; };
      const arm = set(texLoader.load(t.arm));
      return new THREE.MeshStandardMaterial({ map: set(texLoader.load(t.diff), true), normalMap: set(texLoader.load(t.nor)),
        roughnessMap: arm, metalnessMap: arm, aoMap: arm, color: colorTint || 0xffffff, side: THREE.DoubleSide });
    }

    /* ---------- floor + zone markings ---------- */
    const floorGeo = new THREE.PlaneGeometry(W, D); floorGeo.setAttribute("uv2", floorGeo.attributes.uv);
    const floor = new THREE.Mesh(floorGeo, pbr("concrete_floor_worn_001", W / 3.5, D / 3.5));
    floor.material.metalness = 0; floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2);
    floor.receiveShadow = true; scene.add(floor);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 1 }));
    outside.rotation.x = -Math.PI / 2; outside.position.set(W / 2, -0.02, D / 2); outside.receiveShadow = true; scene.add(outside);
    const yellow = new THREE.MeshBasicMaterial({ color: 0xd8b23a });
    hall.zones.forEach((z, k) => {
      if (k > 0) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, D - 0.4), yellow); l.rotation.x = -Math.PI / 2; l.position.set(z.x0, 0.01, D / 2); scene.add(l); }
      scene.add(floorText(z.id, (z.x0 + z.x1) / 2, D / 2 + 1.2, 2.6, "rgba(216,178,58,0.55)"));
      scene.add(floorText(z.name.replace(/^Zone [A-C] — /, "").toUpperCase(), (z.x0 + z.x1) / 2, D / 2 + 2.6, 0.55, "rgba(216,178,58,0.6)"));
    });
    // aisle edge lines
    [0.25, D - 0.25].forEach(zz => { const l = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, 0.1), yellow); l.rotation.x = -Math.PI / 2; l.position.set(W / 2, 0.01, zz); scene.add(l); });

    function floorText(text, x, z, size, color) {
      const tex = canvasTex(1024, 256, (g, w, h) => { g.fillStyle = color; g.font = "bold 170px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); return m;
    }
    function sprite(text, x, y, z, size, color) {
      const px = 48, c0 = document.createElement("canvas").getContext("2d"); c0.font = `bold ${px}px Consolas, monospace`;
      const tw = Math.ceil(c0.measureText(text).width) + 20;
      const tex = canvasTex(tw, 68, (g, w, h) => { g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, 0, w, h); g.fillStyle = color; g.font = `bold ${px}px Consolas, monospace`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2); });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
      sp.position.set(x, y, z); sp.scale.set(size * tw / 68, size, 1); return sp;
    }

    /* ---------- walls (cutaway: walls between camera and interior are hidden) ---------- */
    const wallMat = pbr("box_profile_metal_sheet", 1, 1, 0xd5dde3);
    const walls = [];
    function wall(len, rotY, x, z, side) {
      const g = new THREE.Group();
      const geo = new THREE.PlaneGeometry(len, H); geo.setAttribute("uv2", geo.attributes.uv);
      const mat = wallMat.clone(); ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"].forEach(k => { mat[k] = wallMat[k].clone(); mat[k].repeat.set(len / 3, H / 3); mat[k].needsUpdate = true; });
      const m = new THREE.Mesh(geo, mat); m.position.y = H / 2; m.receiveShadow = true; g.add(m);
      // steel columns along the wall
      const colMat = new THREE.MeshStandardMaterial({ color: 0x3d5566, metalness: 0.6, roughness: 0.45 });
      for (let s = 0; s <= len + 0.01; s += len / Math.max(1, Math.round(len / 5.5))) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), colMat); c.position.set(s - len / 2, H / 2, 0.15); c.castShadow = true; g.add(c);
      }
      g.rotation.y = rotY; g.position.set(x, 0, z); scene.add(g); walls.push({ g, side }); return g;
    }
    const wSouth = wall(W, 0, W / 2, 0, "z0");          // z = 0  (sectional door)
    const wNorth = wall(W, Math.PI, W / 2, D, "zD");    // z = D  (emergency exit)
    wall(D, Math.PI / 2, 0, D / 2, "x0");
    wall(D, -Math.PI / 2, W, D / 2, "xW");
    // doors
    hall.doors.forEach(d => {
      const isSouth = d.y === 0, grp = isSouth ? wSouth : wNorth;
      const tex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = isSouth ? "#7d8a93" : "#2f7d47"; g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 3; for (let y = 0; y < h; y += isSouth ? 26 : 256) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.width, d.height), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
      const lx = isSouth ? d.x - W / 2 : -(d.x - W / 2);
      m.position.set(lx, d.height / 2, 0.03); grp.add(m);
      if (!isSouth) { const s = sprite("SORTIE", lx, d.height + 0.45, 0.06, 0.45, "#3dff7a"); grp.add(s); }
    });
    function updateWalls() {
      const p = camera.position;
      walls.forEach(w => {
        w.g.visible = !((w.side === "z0" && p.z < 0) || (w.side === "zD" && p.z > D) || (w.side === "x0" && p.x < 0) || (w.side === "xW" && p.x > W));
      });
    }
    // roof deck: corrugated steel seen from inside (faces down, so it disappears when the camera looks from above)
    const roofMat = wallMat.clone();
    ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"].forEach(k => { if (wallMat[k]) { roofMat[k] = wallMat[k].clone(); roofMat[k].repeat.set(D / 3, W / 3); roofMat[k].needsUpdate = true; } });
    roofMat.color = new THREE.Color(0xc3ccd2); roofMat.emissive = new THREE.Color(0x2a3036);   // lit underside (lamps + skylights)
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D), roofMat);
    roofMat.side = THREE.FrontSide;
    roof.rotation.x = Math.PI / 2; roof.position.set(W / 2, H, D / 2); roof.receiveShadow = true; scene.add(roof);
    [W * 0.25, W * 0.5, W * 0.75].forEach(x => {                // translucent skylight strips
      const sk = new THREE.Mesh(new THREE.PlaneGeometry(1.1, D * 0.8), new THREE.MeshBasicMaterial({ color: 0xbfd6e4, transparent: true, opacity: 0.55 }));
      sk.rotation.x = Math.PI / 2; sk.position.set(x + W / 8, H - 0.02, D / 2); scene.add(sk);
    });
    // roof trusses
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a5b66, metalness: 0.7, roughness: 0.4 });
    for (let x = 0; x <= W + 0.01; x += W / 4) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.45, D), steel); b.position.set(x, H - 0.22, D / 2); b.castShadow = true; scene.add(b);
    }
    [D * 0.25, D * 0.5, D * 0.75].forEach(z => { const p = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, 0.12), steel); p.position.set(W / 2, H - 0.08, z); scene.add(p); });

    /* ---------- tenability line (2 m) ---------- */
    const hh = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, D)),
      new THREE.LineDashedMaterial({ color: 0xff3030, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.85 }));
    hh.rotation.x = -Math.PI / 2; hh.position.set(W / 2, 2.0, D / 2); hh.computeLineDistances(); scene.add(hh);
    scene.add(sprite("2 m : tête des personnes", W + 0.2, 2.0, -0.2, 0.42, "#ff6b6b"));

    /* ---------- burnable items: real objects char and glow themselves (no overlay boxes) ---------- */
    const burnItems = [];
    const CHAR = new THREE.Color(0x0d0b0a), EMBER = new THREE.Color(0x9a2c06);   // dim ember: charring must stay visible
    function burnItem(obj, x, y, z, h, glow) {
      if (!obj) return null;
      const mats = [];
      obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); mats.push({ m: o.material, c0: o.material.color.clone() }); } });
      const it = { obj, x, y, z, h, glow, mats, b: -1, e: -1 }; burnItems.push(it); return it;
    }
    function setBurn(it, b, e) {                       // b: charring 0..1, e: ember glow 0..1
      if (Math.abs(b - it.b) < 0.01 && Math.abs(e - it.e) < 0.02) return;
      it.b = b; it.e = e;
      it.mats.forEach(({ m, c0 }) => { m.color.copy(c0).lerp(CHAR, b); if (m.emissive) m.emissive.copy(EMBER).multiplyScalar(e); });
    }
    // shelf surfaces measured on the real rack model (rays straight down) so boxes sit ON the shelves
    const shelfRay = new THREE.Raycaster();
    function shelfTops(obj, cx, cz, h, seg, depth) {
      if (!obj) return [];
      obj.updateMatrixWorld(true);
      const ys = [];
      [[-0.25, 0], [0.25, 0], [0, 0.2], [0, -0.2]].forEach(([fx, fz]) => {
        shelfRay.set(new THREE.Vector3(cx + fx * seg, h + 2, cz + fz * depth), new THREE.Vector3(0, -1, 0));
        shelfRay.intersectObject(obj, true).forEach(hit => {
          const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
          if (n && n.y > 0.7) ys.push(hit.point.y);
        });
      });
      ys.sort((a, b) => a - b);
      const out = [];
      ys.forEach(y => { if (!out.length || y - out[out.length - 1] > 0.12) out.push(y); else out[out.length - 1] = Math.max(out[out.length - 1], y); });
      return out;
    }

    // "gravity": drop an object straight down until it rests on whatever is below (shelf, pallet, box, floor)
    const dropRay = new THREE.Raycaster();
    function dropToSupport(o) {
      if (!o) return;
      o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o), c = bb.getCenter(new THREE.Vector3()), own = new Set(); o.traverse(m => own.add(m));
      const solids = []; scene.traverse(m => { if (m.isMesh && m.visible && !own.has(m) && !(m.material && m.material.transparent)) solids.push(m); });
      let best = 0;                                    // floor
      [[0, 0], [-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25]].forEach(([fx, fz]) => {
        dropRay.set(new THREE.Vector3(c.x + fx * (bb.max.x - bb.min.x), bb.min.y + 0.05, c.z + fz * (bb.max.z - bb.min.z)), new THREE.Vector3(0, -1, 0));
        const h = dropRay.intersectObjects(solids, false)[0];
        if (h) best = Math.max(best, h.point.y);
      });
      o.position.y += best - bb.min.y; o.updateMatrixWorld(true);
    }

    /* ---------- real 3D models ---------- */
    const loader = new THREE.GLTFLoader();
    const models = {};
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    function loadModel(id) {
      return new Promise(res => {
        if (!A || !A.models[id]) return res(null);
        loader.parse(b64ToBuf(A.models[id]), "", g => {
          g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          res(g.scene);
        }, () => res(null));
      });
    }
    function place(src, x, z, opts) {
      if (!src) return null;
      const o = src.clone(true);
      const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
      const sx = opts.sx ? opts.sx / size.x : null, sy = opts.sy ? opts.sy / size.y : null, sz = opts.sz ? opts.sz / size.z : null;
      const u = opts.uniform ? (sy || sx || sz) : null;
      o.scale.set(u || sx || sy || 1, u || sy || 1, u || sz || sy || 1);
      const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3());
      o.position.set(x - c.x, (opts.y || 0) - b2.min.y, z - c.z);
      if (opts.rotY) { const pivot = new THREE.Group(); pivot.position.set(x, 0, z); o.position.x -= x; o.position.z -= z; pivot.add(o); pivot.rotation.y = opts.rotY; scene.add(pivot); return pivot; }
      scene.add(o); return o;
    }
    Promise.all(["steel_frame_shelves_01", "cardboard_box_01", "portable_welding_cart", "korean_fire_extinguisher_01", "Barrel_01", "hanging_industrial_lamp"]
      .map(id => loadModel(id).then(m => { models[id] = m; }))).then(() => {
      // zone A: textile storage racks full of boxes (bales)
      hall.racks.forEach((r, ri) => {
        const len = r.x1 - r.x0, depth = r.y1 - r.y0, cz = (r.y0 + r.y1) / 2;
        if (r.h >= 3) {
          const n = Math.max(1, Math.round(len / 1.7)), seg = len / n;
          for (let k = 0; k < n; k++) {
            const cx = r.x0 + seg * (k + 0.5);
            const rack = place(models.steel_frame_shelves_01, cx, cz, { sx: seg * 0.98, sy: r.h, sz: depth });
            burnItem(rack, cx, 0, cz, r.h, false);
            let shelves = shelfTops(rack, cx, cz, r.h, seg, depth);
            if (shelves.length < 2) shelves = [0.02, 0.36, 0.69].map(f => f * r.h);
            shelves.forEach((y, si) => {
              const gap = (si + 1 < shelves.length ? shelves[si + 1] : r.h + 0.6) - y - 0.08;   // free height above this shelf
              if (gap < 0.22) return;
              for (let b = 0; b < 3; b++) if (rnd() > 0.15) {
                const sz = Math.min(gap, 0.42 + rnd() * 0.12), bx = cx + (b - 1) * seg * 0.3, bz = cz + (rnd() - 0.5) * 0.15;
                const o = place(models.cardboard_box_01, bx, bz, { sy: sz, uniform: true, y: y + 0.002, rotY: (rnd() - 0.5) * 0.5 });
                if (o) { o.userData.box = true; dropToSupport(o); }
                burnItem(o, bx, y, bz, sz, true);
              }
            });
          }
        } else {
          // zone B: pallets ready to ship
          for (let x = r.x0 + 0.6; x < r.x1 - 0.3; x += 1.3) {
            const pal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1.0), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }));
            pal.position.set(x, 0.075, cz); pal.castShadow = pal.receiveShadow = true; scene.add(pal);
            burnItem(pal, x, 0, cz, 0.15, false);
            for (let lv = 0; lv < 2 + Math.floor(rnd() * 2); lv++) for (let q = 0; q < 2; q++) {
              const bx = x + (q - 0.5) * 0.55, o = place(models.cardboard_box_01, bx, cz, { sy: 0.5, uniform: true, y: 0.15 + lv * 0.5, rotY: (rnd() - 0.5) * 0.2 });
              if (o) { o.userData.box = true; dropToSupport(o); }
              burnItem(o, bx, 0.15 + lv * 0.5, cz, 0.5, true);
            }
          }
        }
      });
      // zone C: workshop
      place(models.portable_welding_cart, 18.6, 3.8, { sy: 1.1, uniform: true, rotY: 0.6 });
      [[20.9, 8.9], [21.5, 8.9], [21.2, 9.45]].forEach(([x, z]) => burnItem(place(models.Barrel_01, x, z, { sy: 0.9, uniform: true, rotY: rnd() * 3 }), x, 0, z, 0.9, false));
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x5d6b73, metalness: 0.5, roughness: 0.5 }));
      bench.position.set(16.6, 0.45, 9.3); bench.castShadow = bench.receiveShadow = true; scene.add(bench);
      // extinguishers near doors and zones
      [[0.5, 9.4], [7.3, 0.5], [14.7, 9.5], [21.5, 0.6], [5.9, 0.5]].forEach(([x, z]) => place(models.korean_fire_extinguisher_01, x, z, { sy: 0.65, uniform: true }));
      // hanging industrial lamps
      for (let x = W / 8; x < W; x += W / 4) place(models.hanging_industrial_lamp, x, D / 2, { sy: 0.9, uniform: true, y: H - 1.35 });
    });

    /* ---------- certified SSI ceiling detectors ---------- */
    const dets = {};
    hall.panel_detectors.forEach(p => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 24), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.35 }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0x441111 }));
      led.position.y = -0.09;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xff2020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(2.2, 2.2, 1); glow.position.y = -0.1;
      g.add(body, led, glow); g.position.set(p.x, H - 0.3, p.y); scene.add(g);
      dets[p.id] = { led, glow, zone: p.zone };
    });

    /* ---------- our multi-sensor nodes (on columns, 3 m) ---------- */
    const nodes = {};
    hall.nodes.forEach(n => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.14), new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.4 }));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, n.z, 8), new THREE.MeshStandardMaterial({ color: 0x55606a, metalness: 0.6 }));
      pole.position.y = -n.z / 2;
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), new THREE.MeshBasicMaterial({ color: COL.green }));
      led.position.set(0, 0.06, 0.08);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: COL.green, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(0.9, 0.9, 1); glow.position.copy(led.position);
      box.castShadow = true;
      g.add(pole, box, led, glow); g.position.set(n.x, n.z, n.y); scene.add(g);
      scene.add(sprite(String(n.id), n.x, n.z + 0.55, n.y, 0.36, "#cfe3ee"));
      nodes[n.id] = { led, glow, x: n.x, y: n.z, z: n.y, dPM: 0, level: 0, excluded: false };
    });

    /* ---------- VFX driven by the CFD physics ---------- */
    const flameTex = canvasTex(64, 96, (g, w, h) => {         // soft flame tongue: gaussian core, tapered tip
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h;       // v: 0 = tip, 1 = base
        const wd = 0.22 + 0.78 * Math.pow(v, 0.65), r = Math.abs(u) / wd;
        const a = Math.exp(-r * r * 3.0) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.04)), 0.7);
        const k = 4 * (y * w + x); img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.max(0, Math.min(255, a * 255));
      }
      g.putImageData(img, 0, 0);
    });
    const flames = new Particles(2600, flameTex, THREE.AdditiveBlending, scene);
    const embers = new Particles(220, softTex, THREE.AdditiveBlending, scene);
    const smoke = new Particles(700, puffTex, THREE.NormalBlending, scene);
    const haze = new Particles(500, puffTex, THREE.NormalBlending, scene);
    smoke.points.renderOrder = 6; haze.points.renderOrder = 6; flames.points.renderOrder = 7; embers.points.renderOrder = 8;
    const ALL = [flames, embers, smoke, haze];
    const fireLight = new THREE.PointLight(0xff7a2a, 0, 20, 1.5); fireLight.castShadow = true; fireLight.shadow.mapSize.set(512, 512); scene.add(fireLight);
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex, color: 0xff6a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.y = 0.02; scene.add(floorGlow);

    // volumetric smoke: ray-marching through the CFD soot / temperature field (Beer-Lambert)
    const VOL_VS = "out vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }";
    const VOL_FS = [
      "precision highp float; precision highp sampler3D;",
      "uniform sampler3D uVol; uniform vec3 uCam; uniform vec3 uSize; uniform vec3 uColor; uniform float uK; uniform float uGlow;",
      "in vec3 vWorld; out vec4 outColor;",
      "void main(){",
      "  vec3 d = normalize(vWorld - uCam);",
      "  vec3 inv = 1.0 / d, t0 = (vec3(0.0) - uCam) * inv, t1 = (uSize - uCam) * inv;",
      "  vec3 tmn = min(t0, t1), tmx = max(t0, t1);",
      "  float a0 = max(max(max(tmn.x, tmn.y), tmn.z), 0.0), a1 = min(min(tmx.x, tmx.y), tmx.z);",
      "  if (a0 >= a1) discard;",
      "  const int N = 80; float stepLen = (a1 - a0) / float(N);",
      "  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
      "  vec3 col = vec3(0.0); float alpha = 0.0;",
      "  for (int i = 0; i < N; i++) {",
      "    vec3 p = uCam + d * (a0 + (float(i) + jit) * stepLen);",
      "    vec4 v = texture(uVol, p / uSize);",
      "    float Kc = v.b * uK, K = v.r * uK + Kc;",
      "    if (K > 0.003) {",
      "      float a = 1.0 - exp(-K * stepLen);",
      "      float hot = smoothstep(0.55, 1.0, v.g);",
      "      vec3 c = mix(uColor * (0.55 + 0.45 * p.y / uSize.y), vec3(0.78, 0.8, 0.82), Kc / max(K, 1e-4)) + vec3(1.0, 0.38, 0.06) * hot * uGlow * 1.4;",
      "      col += (1.0 - alpha) * a * c; alpha += (1.0 - alpha) * a;",
      "      if (alpha > 0.985) break;",
      "    }",
      "  }",
      "  outColor = vec4(col, alpha);",
      "}"].join("\n");
    function volumeMaterial(color, k, glow) {
      return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VOL_VS, fragmentShader: VOL_FS,
        uniforms: { uVol: { value: null }, uCam: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3(W, H, D) },
          uColor: { value: new THREE.Color(color) }, uK: { value: k }, uGlow: { value: glow } },
        transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, toneMapped: false });
    }
    const volBox = new THREE.BoxGeometry(W, H, D);
    const smokeVol = new THREE.Mesh(volBox, volumeMaterial(0x2e3033, 1.5, 1.0));   // display density slightly reduced so the fire stays readable smokeVol.position.set(W / 2, H / 2, D / 2); smokeVol.renderOrder = 5; smokeVol.visible = false; scene.add(smokeVol);
    const ghostVol = new THREE.Mesh(volBox, volumeMaterial(0x0c4f6e, 0.7, 0.0)); ghostVol.position.copy(smokeVol.position); ghostVol.renderOrder = 9; ghostVol.visible = false;
    ghostVol.material.blendDst = THREE.OneFactor; ghostVol.material.blendSrc = THREE.OneFactor; scene.add(ghostVol);   // additive cyan glow on top
    let vol = null, ghostV = null, dangerTex = null, dangerData = null, lastVolTime = -1, lastGhostTime = -1, lastDangerKey = "";
    function makeTex(sim) {
      const data = new Uint8Array(sim.N * 4), t = new THREE.Data3DTexture(data, sim.NX, sim.NY, sim.NZ);
      t.format = THREE.RGBAFormat; t.minFilter = t.magFilter = THREE.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true;
      return { data, tex: t };
    }
    function fillTex(target, soot, T, pmc) {
      const d = target.data, n = soot.length;
      for (let c = 0; c < n; c++) {
        const K = 8700 * soot[c];                                  // extinction coefficient (1/m)
        d[4 * c] = Math.min(255, K / 2.2 * 255); d[4 * c + 1] = T ? Math.min(255, T[c] / 700 * 255) : 0;
        d[4 * c + 2] = pmc ? Math.min(255, 4000 * pmc[c] / 2.2 * 255) : 0; d[4 * c + 3] = 255;   // coarse particles (spray, dust)
      }
      target.tex.needsUpdate = true;
    }
    // danger map at head height (tenability levels from the CFD)
    const dangerPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 1 }));
    dangerPlane.rotation.x = -Math.PI / 2; dangerPlane.position.set(W / 2, 0.035, D / 2); dangerPlane.renderOrder = 1; dangerPlane.visible = false; scene.add(dangerPlane);
    function fillDanger(sim, ten) {
      if (!dangerTex) { dangerData = new Uint8Array(sim.NX * sim.NZ * 4); dangerTex = new THREE.DataTexture(dangerData, sim.NX, sim.NZ, THREE.RGBAFormat); dangerTex.magFilter = THREE.LinearFilter; dangerPlane.material.map = dangerTex; }
      for (let k = 0; k < sim.NZ; k++) for (let i = 0; i < sim.NX; i++) {
        const lv = ten.level[i + sim.NX * k], o = 4 * (i + sim.NX * (sim.NZ - 1 - k));
        const c = lv === 2 ? [255, 40, 40, 150] : lv === 1 ? [255, 176, 0, 95] : [34, 211, 107, 28];
        dangerData.set(c, o);
      }
      dangerTex.needsUpdate = true;
    }
    // fuel packages: glowing when burning, charred when burnt, cyan outline when predicted to ignite
    const fuelFx = {};
    function fuelMesh(p) {
      const g = new THREE.BoxGeometry(p.x1 - p.x0 + 0.06, p.y1 - p.y0 + 0.06, p.z1 - p.z0 + 0.06);
      const glow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const char = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 1, transparent: true, opacity: 0 }));
      const warn = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x33d7ff, transparent: true, opacity: 0 }));
      [glow, char, warn].forEach(m => { m.position.set(p.cx, (p.y0 + p.y1) / 2, p.cz); scene.add(m); });
      return { glow, char, warn };
    }

    const srcVis = [];
    function makeSrcVisual(p) {
      const g = new THREE.Group(), sz = p.x1 - p.x0, m = p.mat;
      const std = (c, r) => new THREE.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.85 : r });
      if (m === "bois") {
        for (let k = 0; k < 6; k++) {
          const L = sz * (0.85 + Math.random() * 0.3), log = new THREE.Mesh(new THREE.CylinderGeometry(0.05 + sz * 0.04, 0.06 + sz * 0.04, L, 10), std(0x6b4a2b));
          log.rotation.z = Math.PI / 2; log.rotation.y = k * Math.PI / 3 + Math.random() * 0.3; log.position.y = 0.07 + Math.floor(k / 3) * (0.1 + sz * 0.06); g.add(log);
        }
      } else if (m === "friperie") {
        const bale = new THREE.Mesh(new THREE.BoxGeometry(sz * 0.9, 0.7, sz * 0.8), std(0x5a6b8a, 1)); bale.position.y = 0.35; g.add(bale);
        [0.2, 0.5].forEach(y => { const st = new THREE.Mesh(new THREE.BoxGeometry(sz * 0.92, 0.03, sz * 0.82), std(0x222222)); st.position.y = y; g.add(st); });
      } else if (m === "plastique") {
        for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(sz * 0.42, 0.3, sz * 0.42), std(k % 2 ? 0x2f6fd0 : 0xe2e2e2, 0.5)); c.position.set((k % 2 - 0.5) * sz * 0.45, 0.15 + Math.floor(k / 2) * 0.3, 0); g.add(c); }
      } else if (m === "bougie") {
        for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 12), std(0xf3efe2, 0.6)); c.position.set((k % 2 - 0.5) * 0.12, 0.075, (Math.floor(k / 2) - 0.5) * 0.12); g.add(c); }
      } else if (m === "cigarette") {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8), std(0xf5f5f0)); c.rotation.z = Math.PI / 2; c.position.y = 0.008; g.add(c);
      } else { const b = new THREE.Mesh(new THREE.BoxGeometry(sz * 0.8, 0.4, sz * 0.8), std(0x9a7a50)); b.position.y = 0.2; g.add(b); }
      g.position.set(p.cx, 0, p.cz); g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      scene.add(g);
      const it = burnItem(g, p.cx, 0, p.cz, 0.5, true); it.own = p; it.src = true;
      srcVis.push({ p, g, it });
    }
    function dropSrcVisual(v) { scene.remove(v.g); const k = burnItems.indexOf(v.it); if (k >= 0) burnItems.splice(k, 1); }
    function resetBurn() {
      srcVis.forEach(dropSrcVisual); srcVis.length = 0;
      burnItems.forEach(it => { it.sim = null; setBurn(it, 0, 0); });
    }

    let st = { nodes: {}, ssiZones: {}, smolder: null, cfd: null };
    const flameH = (q, D) => q <= 0 ? 0 : Math.max(0.3, 0.235 * Math.pow(q, 0.4) - 1.02 * D);

    function updateVFX(dt, time) {
      const C = st.cfd, sim = C && C.sim;
      // --- smoke volume + ghost + danger map from the CFD fields ---
      if (sim) {
        if (!vol) { vol = makeTex(sim); ghostV = makeTex(sim); smokeVol.material.uniforms.uVol.value = vol.tex; ghostVol.material.uniforms.uVol.value = ghostV.tex; }
        if (sim.time !== lastVolTime) { fillTex(vol, sim.soot, sim.T, sim.pmc); lastVolTime = sim.time; }
        smokeVol.visible = true; smokeVol.material.uniforms.uCam.value.copy(camera.position);
        const g = C.ghost;
        ghostVol.visible = !!(C.showGhost && g);
        if (ghostVol.visible) { if (g.time !== lastGhostTime) { fillTex(ghostV, g.soot, null); lastGhostTime = g.time; } ghostVol.material.uniforms.uCam.value.copy(camera.position); }
        const ten = C.showGhost && g ? g.ten : C.ten;
        dangerPlane.visible = !!(C.showDanger && ten);
        const dk = (C.showGhost && g ? "g" + g.time : "n" + sim.time);
        if (dangerPlane.visible && dk !== lastDangerKey) { fillDanger(sim, ten); lastDangerKey = dk; }
        for (const id in fuelFx) { const fx = fuelFx[id]; fx.glow.material.opacity = fx.char.material.opacity = fx.warn.material.opacity = 0; }
        sim.fuel.forEach(p => {
          const key = p.id + "@" + p.cx.toFixed(2) + "," + p.cz.toFixed(2) + "," + (p.x1 - p.x0).toFixed(2);
          const fx = fuelFx[key] || (fuelFx[key] = fuelMesh(p));
          fx.glow.material.opacity = 0; fx.char.material.opacity = 0;      // real objects char themselves (below)
          const willIgnite = C.showGhost && g && g.ignite.includes(p.id) && !p.burning;
          fx.warn.material.opacity = willIgnite ? 0.55 + 0.45 * Math.sin(time * 6) : 0;
        });
        // visible fuel for fires placed on the free-test bench, removed when the physics is reset
        sim.fuel.forEach(p => { if (String(p.id || "").startsWith("src-") && !srcVis.some(v => v.p === p)) makeSrcVisual(p); });
        for (let k = srcVis.length - 1; k >= 0; k--) if (!sim.fuel.includes(srcVis[k].p)) { dropSrcVisual(srcVis[k]); srcVis.splice(k, 1); }
        burnItems.forEach(it => {
          if (it.sim !== sim || it.nf !== sim.fuel.length) {
            it.sim = sim; it.nf = sim.fuel.length;
            it.p = it.own || sim.fuel.find(q => !String(q.id || "").startsWith("src-") && it.x >= q.x0 - 0.15 && it.x <= q.x1 + 0.15 && it.z >= q.z0 - 0.15 && it.z <= q.z1 + 0.15) || null;
          }
          const p = it.p; if (!p) { setBurn(it, 0, 0); return; }
          const age = Math.max(0, sim.time - (p.tig || 0));
          const front = p.burnt ? 99 : p.burning ? p.y0 + 0.4 + age * 0.06 : -1;       // flames climb a rack ~6 cm/s
          const reached = it.y <= front;
          let frac = p.burnt ? 1 : !p.burning ? 0 : it.src ? Math.min(0.9, 0.2 + age / 400) : Math.min(1, p.eBurnt / p.eLoad * 1.4 + 0.25);
          const b = reached ? (p.burning && !it.src ? 0.45 + 0.55 * frac : frac) : 0;
          const e = it.glow && p.burning && reached && frac < 0.97 ? (0.35 + 0.25 * Math.sin(time * 11 + it.x * 3 + it.y * 5)) * Math.min(1, p.q / 300 + 0.4) : 0;
          setBurn(it, b, e);
        });
      } else {
        smokeVol.visible = ghostVol.visible = dangerPlane.visible = false;
        for (const id in fuelFx) { const fx = fuelFx[id]; fx.glow.material.opacity = fx.char.material.opacity = fx.warn.material.opacity = 0; }
        resetBurn();
      }

      // --- flames on every burning package (Heskestad flame height per package) ---
      let qTot = 0, lx = 0, lz = 0, Hmax = 0;
      if (sim) for (const p of sim.fuel) {
        if (p.burning && p.q > 0.02 && p.q < 15) {            // candle / cigarette: tiny flame or glowing tip
          p._acc = (p._acc || 0) + (p.q < 0.1 ? 6 : 20) * dt;
          const yTip = p.mat === "bougie" ? 0.17 : p.mat === "cigarette" ? 0.015 : p.y1 + 0.02;
          while (p._acc >= 1) { p._acc--; flames.spawn(p.cx + (Math.random() - 0.5) * (p.x1 - p.x0) * (p.mat === "bougie" ? 0.4 : 0.1), yTip, p.cz + (Math.random() - 0.5) * (p.z1 - p.z0) * 0.6, 0, p.q < 0.1 ? 0.15 : 0.5, 0, 0.35, p.q < 0.1 ? 0.06 : 0.16, 0.5); }
          continue;
        }
        if (!p.burning || p.q < 15) continue;
        const Lf = Math.min(H - 0.4, flameH(p.q, p.dEq));
        const vertical = p.y1 - p.y0 > 2;                     // racks: the flame front climbs the faces (~6 cm/s)
        const front = vertical ? Math.min(p.y1, p.y0 + 0.4 + Math.max(0, sim.time - (p.tig || 0)) * 0.06) : p.y1;
        const top = Math.min(H - 0.3, vertical ? Math.max(front + 0.6, front + Lf * 0.5) : Math.max(p.y1 + 0.3, Lf));
        qTot += p.q; lx += p.cx * p.q; lz += p.cz * p.q; Hmax = Math.max(Hmax, top);
        const rate = Math.min(420, 40 + p.q / 10);
        p._acc = (p._acc || 0) + rate * dt;
        while (p._acc >= 1) {
          p._acc--;
          let x, z;
          if (vertical && Math.random() < 0.75) {             // most flames lick the outer faces of the rack
            if (Math.random() < 0.7) { x = p.x0 + Math.random() * (p.x1 - p.x0); z = Math.random() < 0.5 ? p.z0 : p.z1; }
            else { z = p.z0 + Math.random() * (p.z1 - p.z0); x = Math.random() < 0.5 ? p.x0 : p.x1; }
          } else { x = p.x0 + Math.random() * (p.x1 - p.x0); z = p.z0 + Math.random() * (p.z1 - p.z0); }
          const y0 = vertical ? Math.random() * front * 0.95 : p.y0 + (p.y1 - p.y0) * 0.6;
          const life = 0.35 + Math.random() * 0.4, rise = Math.max(0.3, (vertical ? Math.min(top, y0 + 1.0 + Math.random() * 1.2) : top) - y0);
          flames.spawn(x, y0, z, (Math.random() - 0.5) * 0.25, rise / life * (0.5 + Math.random() * 0.5), (Math.random() - 0.5) * 0.25, life, 0.55 + Math.min(1.1, p.q / 2000) + Math.random() * 0.4, Math.random());
        }
        p._em = (p._em || 0) + (5 + p.q / 400) * dt;
        while (p._em >= 1) { p._em--; embers.spawn(p.cx + (Math.random() - 0.5) * (p.x1 - p.x0), top * 0.6, p.cz + (Math.random() - 0.5) * (p.z1 - p.z0), (Math.random() - 0.5) * 1.2, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2, 1.6 + Math.random() * 1.4, 0.07, 0); }
        p._sm = (p._sm || 0) + (6 + p.q / 300) * dt;
        while (p._sm >= 1) { p._sm--; smoke.spawn(p.x0 + Math.random() * (p.x1 - p.x0), top, p.z0 + Math.random() * (p.z1 - p.z0), 0, 1.5, 0, 5 + Math.random() * 3, 0.9 + Math.random() * 0.6, 2); }
      }
      // smouldering wisps (incipient real fire, before the simulated growth)
      if (st.smolder && qTot === 0) {
        smoke.acc += (4 + st.smolder.i * 3) * dt;
        while (smoke.acc >= 1) { smoke.acc--; smoke.spawn(st.smolder.x + (Math.random() - 0.5) * 0.4, 0.4, st.smolder.y + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.15, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15, 9, 0.5, 1); }
      }
      for (let i = 0; i < flames.n; i++) {
        if (flames.life[i] >= flames.max[i]) { flames.col[4 * i + 3] = 0; continue; }
        flames.life[i] += dt; const t = Math.min(1, flames.life[i] / flames.max[i]), p = 3 * i;
        flames.vel[p] += Math.sin(time * 7 + i) * 0.9 * dt; flames.vel[p + 2] += Math.cos(time * 6 + i * 1.3) * 0.9 * dt;
        flames.pos[p] += flames.vel[p] * dt; flames.pos[p + 1] += flames.vel[p + 1] * dt; flames.pos[p + 2] += flames.vel[p + 2] * dt;
        let r, g, b;
        if (t < 0.2) { r = 1; g = 0.9 - t; b = 0.5 - t * 2; } else if (t < 0.55) { r = 1; g = 0.7 - (t - 0.2) * 1.15; b = 0.06; } else { r = 0.95 - (t - 0.55) * 1.3; g = 0.3 - (t - 0.55) * 0.55; b = 0.04; }
        flames.col.set([r, Math.max(0, g) * (0.85 + flames.k[i] * 0.15), Math.max(0, b), Math.pow(1 - t, 1.3) * 0.85], 4 * i);
        flames.size[i] = flames.s0[i] * (1.0 - t * 0.45); flames.rot[i] = Math.sin(time * 3 + i) * 0.25;
      }
      for (let i = 0; i < embers.n; i++) {
        if (embers.life[i] >= embers.max[i]) { embers.col[4 * i + 3] = 0; continue; }
        embers.life[i] += dt; const t = embers.life[i] / embers.max[i], p = 3 * i;
        if (sim) { const v = sim.velocityAt(embers.pos[p], embers.pos[p + 1], embers.pos[p + 2]); embers.vel[p] += (v[0] - embers.vel[p]) * dt; embers.vel[p + 2] += (v[2] - embers.vel[p + 2]) * dt; }
        embers.vel[p + 1] -= 0.5 * dt;
        embers.pos[p] += embers.vel[p] * dt; embers.pos[p + 1] = Math.min(H - 0.3, embers.pos[p + 1] + embers.vel[p + 1] * dt); embers.pos[p + 2] += embers.vel[p + 2] * dt;
        embers.col.set([1, 0.55 + 0.3 * Math.sin(time * 20 + i), 0.15, (1 - t) * (0.6 + 0.4 * Math.sin(time * 30 + i))], 4 * i);
        embers.size[i] = 0.08;
      }
      // smoke detail puffs follow the CFD velocity field (falls back to slow rise without CFD)
      for (let i = 0; i < smoke.n; i++) {
        if (smoke.life[i] >= smoke.max[i]) { smoke.col[4 * i + 3] = 0; continue; }
        smoke.life[i] += dt; const t = smoke.life[i] / smoke.max[i], p = 3 * i;
        if (sim && smoke.k[i] === 2) { const v = sim.velocityAt(smoke.pos[p], smoke.pos[p + 1], smoke.pos[p + 2]); smoke.vel[p] = v[0]; smoke.vel[p + 1] = v[1]; smoke.vel[p + 2] = v[2]; }
        smoke.pos[p] = Math.min(W - 0.2, Math.max(0.2, smoke.pos[p] + smoke.vel[p] * dt));
        smoke.pos[p + 1] = Math.min(H - 0.25, Math.max(0.1, smoke.pos[p + 1] + smoke.vel[p + 1] * dt));
        smoke.pos[p + 2] = Math.min(D - 0.2, Math.max(0.2, smoke.pos[p + 2] + smoke.vel[p + 2] * dt));
        const sh = smoke.k[i] === 1 ? 0.55 : 0.08;
        smoke.col.set([sh, sh, sh, Math.min(1, t * 5) * (1 - t) * (smoke.k[i] === 1 ? 0.35 : 0.5)], 4 * i);
        smoke.size[i] = smoke.s0[i] * (1 + t * 2.5); smoke.rot[i] += smoke.rs[i] * dt * 0.3;
      }
      // measured particle haze around our nodes (real recordings) — off when the CFD provides the smoke
      let hz = 0;
      if (!sim) for (const id in nodes) {
        const nd = nodes[id], rise = Math.max(0, nd.dPM - 4.6);
        const rate = rise * rise * 2.2 * dt;
        let k = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
        while (k-- > 0 && hz < 40) { hz++; haze.spawn(nd.x + (Math.random() - 0.5) * 1.5, nd.y + (Math.random() - 0.5) * 1.2, nd.z + (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.2, 0.08, (Math.random() - 0.5) * 0.2, 5 + Math.random() * 3, 1.2 + rise * 0.35, 0); }
      }
      for (let i = 0; i < haze.n; i++) {
        if (haze.life[i] >= haze.max[i]) { haze.col[4 * i + 3] = 0; continue; }
        haze.life[i] += dt; const t = haze.life[i] / haze.max[i], p = 3 * i;
        haze.pos[p] += haze.vel[p] * dt; haze.pos[p + 1] += haze.vel[p + 1] * dt; haze.pos[p + 2] += haze.vel[p + 2] * dt;
        haze.col.set([0.78, 0.8, 0.82, Math.sin(Math.PI * t) * 0.3], 4 * i);
        haze.size[i] = haze.s0[i] * (1 + t); haze.rot[i] += 0.1 * dt;
      }
      ALL.forEach(s => s.commit());
      // fire light (HRR-weighted centre) + floor glow
      if (qTot > 15) {
        const fl = 0.85 + 0.15 * Math.sin(time * 23) * Math.sin(time * 7.3), cx = lx / qTot, cz = lz / qTot;
        fireLight.position.set(cx, Math.min(H - 0.5, 0.8 + Hmax * 0.35), cz); fireLight.intensity = Math.min(5, 0.8 + qTot / 1200) * fl; fireLight.distance = 12 + Math.sqrt(qTot) / 6;
        floorGlow.position.set(cx, 0.02, cz); floorGlow.scale.setScalar(4 + Math.sqrt(qTot) / 12); floorGlow.material.opacity = 0.5 * fl;
      } else { fireLight.intensity = 0; floorGlow.material.opacity = 0; }
      st._dark = sim ? Math.min(1, Math.max(0, (C.ten ? C.ten.fracBad : 0) * 2)) : 0;
    }

    function updateIndicators(time) {
      for (const id in nodes) {
        const s = st.nodes[id], nd = nodes[id]; if (!s) continue;
        nd.dPM = s.excluded ? 0 : s.dPM;
        const col = s.excluded ? COL.grey : s.level === 2 ? COL.red : s.level === 1 ? COL.amber : COL.green;
        nd.led.material.color.setHex(col); nd.glow.material.color.setHex(col);
        const pulse = s.level === 2 ? 0.55 + 0.45 * Math.sin(time * 9) : s.level === 1 ? 0.6 + 0.3 * Math.sin(time * 4) : 0.45;
        nd.glow.material.opacity = s.excluded ? 0.1 : pulse; nd.glow.scale.setScalar(s.level ? 1.3 : 0.9);
      }
      for (const id in dets) {
        const on = !!st.ssiZones[dets[id].zone], blink = on && Math.sin(time * 10) > 0;
        dets[id].led.material.color.setHex(on ? (blink ? 0xff2020 : 0x661010) : 0x331010);
        dets[id].glow.material.opacity = on ? (blink ? 0.9 : 0.25) : 0;
      }
    }

    /* ---------- free-test bench: floor picking + source markers ---------- */
    const raycaster = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    function pickFloor(clientX, clientY) {
      const r = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
      if (hit.x < 0.3 || hit.x > W - 0.3 || hit.z < 0.3 || hit.z > D - 0.3) return null;
      return { x: hit.x, z: hit.z };
    }
    const markerGroup = new THREE.Group(); scene.add(markerGroup);
    function setMarkers(list) {
      while (markerGroup.children.length) markerGroup.remove(markerGroup.children[0]);
      list.forEach(m => {
        const col = m.kind === "fire" ? 0xff7a2a : 0x33d7ff;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(m.x, 0.05, m.z); markerGroup.add(ring);
        markerGroup.add(sprite(m.icon + " " + m.label, m.x, 1.5, m.z, 0.4, m.kind === "fire" ? "#ffb070" : "#8fe6ff"));
        if (m.node) {   // dashed line to the nearest sensor node + distance
          const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(m.x, 0.1, m.z), new THREE.Vector3(m.node.x, m.node.y, m.node.z)]);
          const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: col, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.75 }));
          l.computeLineDistances(); markerGroup.add(l);
          markerGroup.add(sprite(m.dist.toFixed(1) + " m", (m.x + m.node.x) / 2, (0.1 + m.node.y) / 2 + 0.25, (m.z + m.node.z) / 2, 0.3, "#d0d8de"));
        }
      });
    }

    /* ---------- camera, input, loop ---------- */
    function resize() {
      const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
      const cv = renderer.domElement;
      if (cv.width !== Math.floor(w * renderer.getPixelRatio()) || cv.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
      cv.style.width = w + "px"; cv.style.height = h + "px";
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const scale = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      ALL.forEach(s => { s.mat.uniforms.uScale.value = scale; });
    }
    function placeCam() {
      camera.position.set(center.x + dist * Math.cos(el) * Math.cos(az), center.y + dist * Math.sin(el), center.z + dist * Math.cos(el) * Math.sin(az));
      camera.lookAt(center);
    }
    let drag = null;
    renderer.domElement.addEventListener("mousedown", e => { drag = [e.clientX, e.clientY]; });
    window.addEventListener("mouseup", () => { drag = null; });
    window.addEventListener("mousemove", e => {
      if (!drag) return;
      az += (e.clientX - drag[0]) * 0.006; el = Math.min(1.35, Math.max(0.08, el + (e.clientY - drag[1]) * 0.004));
      drag = [e.clientX, e.clientY];
    });
    renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); dist = Math.min(60, Math.max(9, dist + e.deltaY * 0.02)); }, { passive: false });

    const clock = new THREE.Clock();
    function loop() {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta()), time = clock.elapsedTime;
      if (!container.offsetParent) return;
      resize(); placeCam(); updateWalls();
      updateIndicators(time); updateVFX(dt, time);
      lampLights.forEach(l => { l.intensity = 0.55 - 0.35 * (st._dark || 0); });
      renderer.render(scene, camera);
    }
    loop();
    function update(s) { st = Object.assign({ smolder: null, cfd: null }, s); }
    /* wipe every visual effect at once (scenario change, bench reset) */
    function clearFx() {
      ALL.forEach(P => { P.life.fill(0); P.max.fill(0); P.col.fill(0); P.points.geometry.attributes.color.needsUpdate = true; });
      smokeVol.visible = ghostVol.visible = dangerPlane.visible = false;
      lastVolTime = -1; lastGhostTime = -1; lastDangerKey = "";
      for (const id in fuelFx) { const fx = fuelFx[id]; fx.glow.material.opacity = fx.char.material.opacity = fx.warn.material.opacity = 0; }
      fireLight.intensity = 0; floorGlow.material.opacity = 0;
      setMarkers([]); resetBurn();
    }
    const debug = { scene, burnItems, srcVis, roof, flamesAlive: () => { let n = 0; for (let i = 0; i < flames.n; i++) if (flames.life[i] < flames.max[i]) n++; return n; } };
    return { update, resize, renderer, pickFloor, setMarkers, clearFx, debug, setView: (a, e, d, tgt) => { az = a; el = e; dist = d; if (tgt) center.set(tgt[0], tgt[1], tgt[2]); else center.set(W / 2, 2.6, D / 2); } };
  }

  root.AFDT_Twin3D = Twin3D;
})(window);
