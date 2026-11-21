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
            place(models.steel_frame_shelves_01, cx, cz, { sx: seg * 0.98, sy: r.h, sz: depth });
            [0.02, 0.36, 0.69].forEach(f => {
              for (let b = 0; b < 3; b++) if (rnd() > 0.15) {
                const s = 0.42 + rnd() * 0.12;
                place(models.cardboard_box_01, cx + (b - 1) * seg * 0.3, cz + (rnd() - 0.5) * 0.2, { sy: s, uniform: true, y: f * r.h + 0.04, rotY: (rnd() - 0.5) * 0.5 });
              }
            });
          }
        } else {
          // zone B: pallets ready to ship
          for (let x = r.x0 + 0.6; x < r.x1 - 0.3; x += 1.3) {
            const pal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1.0), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }));
            pal.position.set(x, 0.075, cz); pal.castShadow = pal.receiveShadow = true; scene.add(pal);
            for (let lv = 0; lv < 2 + Math.floor(rnd() * 2); lv++) for (let q = 0; q < 2; q++)
              place(models.cardboard_box_01, x + (q - 0.5) * 0.55, cz, { sy: 0.5, uniform: true, y: 0.15 + lv * 0.5, rotY: (rnd() - 0.5) * 0.2 });
          }
        }
      });
      // zone C: workshop
      place(models.portable_welding_cart, 18.6, 3.8, { sy: 1.1, uniform: true, rotY: 0.6 });
      [[20.9, 8.9], [21.5, 8.9], [21.2, 9.45]].forEach(([x, z]) => place(models.Barrel_01, x, z, { sy: 0.9, uniform: true, rotY: rnd() * 3 }));
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

    /* ---------- VFX: fire, embers, smoke column, smoke layer, haze ---------- */
    const flames = new Particles(900, softTex, THREE.AdditiveBlending, scene);
    const embers = new Particles(160, softTex, THREE.AdditiveBlending, scene);
    const smoke = new Particles(700, puffTex, THREE.NormalBlending, scene);
    const layer = new Particles(520, puffTex, THREE.NormalBlending, scene);
    const haze = new Particles(500, puffTex, THREE.NormalBlending, scene);
    smoke.points.renderOrder = 2; layer.points.renderOrder = 3; flames.points.renderOrder = 4; embers.points.renderOrder = 5;
    const fireLight = new THREE.PointLight(0xff7a2a, 0, 20, 1.5); fireLight.castShadow = true; fireLight.shadow.mapSize.set(512, 512); scene.add(fireLight);
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex, color: 0xff6a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.y = 0.02; scene.add(floorGlow);
    const layerSheet = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 1, D - 0.2), new THREE.MeshBasicMaterial({ color: 0x0c0c0d, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    scene.add(layerSheet);

    let st = { nodes: {}, ssiZones: {}, smokeZ: null, fire: null, smokeHot: false, smolder: null };

    function updateVFX(dt, time) {
      const f = st.fire;
      // --- flames (Heskestad flame height) ---
      let Hf = 0, R = 0;
      if (f && f.q > 20) {
        R = Math.min(1.8, 0.35 + Math.sqrt(f.q / 1000) * 0.55);              // fire base radius (m)
        Hf = Math.max(0.6, Math.min(H - 0.5, 0.235 * Math.pow(f.q, 0.4) - 1.02 * 2 * R)); // flame height (m)
        const rate = 70 + Math.min(380, f.q / 12);
        flames.acc += rate * dt;
        while (flames.acc >= 1) { flames.acc--; const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * R, life = 0.45 + Math.random() * 0.5;
          flames.spawn(f.x + Math.cos(a) * r, 0.1, f.y + Math.sin(a) * r, (Math.random() - 0.5) * 0.3, Hf / life * (0.6 + Math.random() * 0.7), (Math.random() - 0.5) * 0.3, life, 0.55 + R * 0.6 + Math.random() * 0.5, r / R); }
        embers.acc += (12 + f.q / 250) * dt;
        while (embers.acc >= 1) { embers.acc--; embers.spawn(f.x + (Math.random() - 0.5) * R, Hf * 0.5, f.y + (Math.random() - 0.5) * R, (Math.random() - 0.5) * 1.2, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2, 1.6 + Math.random() * 1.4, 0.07, 0); }
        smoke.acc += (35 + f.q / 45) * dt;
        while (smoke.acc >= 1) { smoke.acc--; smoke.spawn(f.x + (Math.random() - 0.5) * R, Hf * 0.9, f.y + (Math.random() - 0.5) * R, (Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4, 7 + Math.random() * 4, 1.0 + R * 0.6, 0); }
      }
      // smouldering wisps (incipient real fire, before the simulated growth)
      if (st.smolder && !(f && f.q > 20)) {
        smoke.acc += (4 + st.smolder.i * 3) * dt;
        while (smoke.acc >= 1) { smoke.acc--; smoke.spawn(st.smolder.x + (Math.random() - 0.5) * 0.4, 0.4, st.smolder.y + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.15, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15, 9, 0.5, 1); }
      }
      const tf = (i) => flames.life[i] / flames.max[i];
      for (let i = 0; i < flames.n; i++) {
        if (flames.life[i] >= flames.max[i]) { flames.col[4 * i + 3] = 0; continue; }
        flames.life[i] += dt; const t = Math.min(1, tf(i)), p = 3 * i;
        const swirl = Math.sin(time * 7 + i) * 0.6;
        flames.vel[p] += (swirl - flames.vel[p]) * dt * 2 - (flames.pos[p] - (f ? f.x : 0)) * dt * 1.2;
        flames.vel[p + 2] += (Math.cos(time * 6 + i * 1.3) * 0.6 - flames.vel[p + 2]) * dt * 2 - (flames.pos[p + 2] - (f ? f.y : 0)) * dt * 1.2;
        flames.pos[p] += flames.vel[p] * dt; flames.pos[p + 1] += flames.vel[p + 1] * dt; flames.pos[p + 2] += flames.vel[p + 2] * dt;
        // colour ramp: white-yellow core -> orange -> deep red -> fade
        let r, g, b;
        if (t < 0.25) { r = 1; g = 0.92 - t * 0.9; b = 0.55 - t * 1.8; } else if (t < 0.6) { r = 1; g = 0.7 - (t - 0.25) * 1.2; b = 0.08; } else { r = 0.95 - (t - 0.6) * 1.2; g = 0.28 - (t - 0.6) * 0.5; b = 0.05; }
        const core = 1 - flames.k[i] * 0.4;
        flames.col.set([r, Math.max(0, g) * core * 0.85, Math.max(0, b) * 0.6, Math.pow(1 - t, 1.5) * 0.42], 4 * i);
        flames.size[i] = flames.s0[i] * (1.0 - t * 0.55); flames.rot[i] += flames.rs[i] * dt;
      }
      for (let i = 0; i < embers.n; i++) {
        if (embers.life[i] >= embers.max[i]) { embers.col[4 * i + 3] = 0; continue; }
        embers.life[i] += dt; const t = embers.life[i] / embers.max[i], p = 3 * i;
        embers.vel[p] += Math.sin(time * 3 + i) * dt * 1.5; embers.vel[p + 1] -= 0.6 * dt; embers.vel[p + 2] += Math.cos(time * 2.5 + i) * dt * 1.5;
        embers.pos[p] += embers.vel[p] * dt; embers.pos[p + 1] = Math.min(H - 0.3, embers.pos[p + 1] + embers.vel[p + 1] * dt); embers.pos[p + 2] += embers.vel[p + 2] * dt;
        embers.col.set([1, 0.55 + 0.3 * Math.sin(time * 20 + i), 0.15, (1 - t) * (0.6 + 0.4 * Math.sin(time * 30 + i))], 4 * i);
        embers.size[i] = 0.08;
      }
      // smoke column: rises, hits the layer / ceiling, spreads horizontally
      const ceilingY = st.smokeZ !== null ? Math.max(st.smokeZ, 0.8) : H - 0.4;
      const hot = st.smokeHot;
      for (let i = 0; i < smoke.n; i++) {
        if (smoke.life[i] >= smoke.max[i]) { smoke.col[4 * i + 3] = 0; continue; }
        smoke.life[i] += dt; const t = smoke.life[i] / smoke.max[i], p = 3 * i;
        const targetY = smoke.k[i] === 1 ? H - 0.5 : (ceilingY + H) / 2;
        if (smoke.pos[p + 1] > targetY - 0.3) {   // spread under the roof
          const dx = smoke.pos[p] - W / 2 || 0.01, dz = smoke.pos[p + 2] - D / 2 || 0.01, n = Math.hypot(dx, dz);
          smoke.vel[p] += (dx / n * 1.4 - smoke.vel[p]) * dt; smoke.vel[p + 2] += (dz / n * 1.0 - smoke.vel[p + 2]) * dt; smoke.vel[p + 1] *= 0.9;
        }
        smoke.pos[p] = Math.min(W - 0.3, Math.max(0.3, smoke.pos[p] + smoke.vel[p] * dt));
        smoke.pos[p + 1] = Math.min(H - 0.3, smoke.pos[p + 1] + smoke.vel[p + 1] * dt);
        smoke.pos[p + 2] = Math.min(D - 0.3, Math.max(0.3, smoke.pos[p + 2] + smoke.vel[p + 2] * dt));
        const shade = smoke.k[i] === 1 ? 0.55 : hot ? 0.09 : 0.16;
        smoke.col.set([shade + (hot ? 0.03 : 0), shade, shade, Math.min(1, t * 6) * (1 - t) * (smoke.k[i] === 1 ? 0.35 : 0.6)], 4 * i);
        smoke.size[i] = smoke.s0[i] * (1 + t * 3.5); smoke.rot[i] += smoke.rs[i] * dt * 0.3;
      }
      // accumulated smoke layer (zone-model interface)
      const want = st.smokeZ !== null && st.smokeZ < H - 0.1 ? Math.floor(layer.n * Math.min(1, (H - st.smokeZ) / (H - 0.5))) : 0;
      for (let i = 0; i < layer.n; i++) {
        const p = 3 * i, alive = i < want;
        if (alive && layer.life[i] >= layer.max[i]) {     // (re)seed a puff inside the layer volume
          layer.pos.set([0.6 + Math.random() * (W - 1.2), st.smokeZ + Math.random() * (H - st.smokeZ - 0.2), 0.6 + Math.random() * (D - 1.2)], p);
          layer.vel.set([(Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25], p);
          layer.life[i] = 0; layer.max[i] = 8 + Math.random() * 6; layer.s0[i] = 2.2 + Math.random() * 2.2; layer.rot[i] = Math.random() * 6.28;
        }
        if (!alive) { layer.col[4 * i + 3] = 0; layer.life[i] = layer.max[i]; continue; }
        layer.life[i] += dt; const t = layer.life[i] / layer.max[i];
        layer.pos[p] += layer.vel[p] * dt; layer.pos[p + 2] += layer.vel[p + 2] * dt;
        layer.pos[p + 1] = Math.max(st.smokeZ + 0.2, Math.min(H - 0.2, layer.pos[p + 1]));
        const sh = hot ? 0.06 : 0.11;
        layer.col.set([sh + (hot ? 0.04 : 0), sh, sh, Math.sin(Math.PI * t) * 0.42], 4 * i);
        layer.size[i] = layer.s0[i]; layer.rot[i] += 0.05 * dt;
      }
      if (want > 0) {
        const th = H - st.smokeZ; layerSheet.scale.y = th; layerSheet.position.set(W / 2, H - th / 2, D / 2);
        layerSheet.material.opacity = Math.min(0.72, 0.18 + 0.07 * th); layerSheet.material.color.setHex(hot ? 0x150b07 : 0x0c0c0d);
      } else layerSheet.material.opacity = 0;
      // measured particle haze around our nodes (aerosol, smoke from real recordings)
      let hz = 0;
      for (const id in nodes) {
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
      [flames, embers, smoke, layer, haze].forEach(s => s.commit());
      // fire light + floor glow (flicker)
      if (f && f.q > 20) {
        const fl = 0.85 + 0.15 * Math.sin(time * 23) * Math.sin(time * 7.3);
        fireLight.position.set(f.x, Math.min(H - 0.5, 0.6 + Hf * 0.4), f.y); fireLight.intensity = Math.min(4.5, 0.8 + f.q / 900) * fl; fireLight.distance = 10 + R * 8;
        floorGlow.position.set(f.x, 0.02, f.y); floorGlow.scale.setScalar(R * 7); floorGlow.material.opacity = 0.55 * fl;
      } else { fireLight.intensity = 0; floorGlow.material.opacity = 0; }
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

    /* ---------- camera, input, loop ---------- */
    function resize() {
      const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
      const cv = renderer.domElement;
      if (cv.width !== Math.floor(w * renderer.getPixelRatio()) || cv.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
      cv.style.width = w + "px"; cv.style.height = h + "px";
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const scale = (h * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      [flames, embers, smoke, layer, haze].forEach(s => { s.mat.uniforms.uScale.value = scale; });
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
      lampLights.forEach(l => { l.intensity = st.smokeZ !== null && st.smokeZ < H - 1.5 ? 0.25 : 0.55; });
      renderer.render(scene, camera);
    }
    loop();
    function update(s) { st = Object.assign({ smolder: null }, s); }
    return { update, resize, renderer, setView: (a, e, d) => { az = a; el = e; dist = d; } };
  }

  root.AFDT_Twin3D = Twin3D;
})(window);
