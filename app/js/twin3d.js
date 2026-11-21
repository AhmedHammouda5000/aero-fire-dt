/* Aero-Fire DT — 3D digital twin of the hall (Three.js r149, vendored).
 * Physics drives the visuals: smoke-layer height = zone-model state; node haze = measured
 * particle rise; panel detectors = simulated SSI loop states. */
(function (root) {
  const COL = { green: 0x22d36b, amber: 0xffb000, red: 0xff2a2a, grey: 0x666666, white: 0xf2f2f2,
    cyan: 0x33d7ff, zone: [0x0e2a33, 0x1a1a2e, 0x2a1530] };

  function Twin3D(container, hall) {
    const W = hall.size.length, D = hall.size.width, H = hall.size.height;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x070c10);
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    const center = new THREE.Vector3(W / 2, 2.5, D / 2);
    let az = -0.75, el = 0.62, dist = 34;
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(10, 30, 20); scene.add(dl);

    // floor zones
    hall.zones.forEach((z, k) => {
      const g = new THREE.PlaneGeometry(z.x1 - z.x0, D);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: COL.zone[k % 3] }));
      m.rotation.x = -Math.PI / 2; m.position.set((z.x0 + z.x1) / 2, 0, D / 2); scene.add(m);
      scene.add(label(z.id, (z.x0 + z.x1) / 2, 0.05, D / 2, 3.2, "#5c7a88"));
      scene.add(label(z.name.replace(/^Zone [A-C] — /, ""), (z.x0 + z.x1) / 2, 0.05, D - 1.0, 0.8, "#5c7a88"));
    });
    // walls (wireframe box) + roof outline
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
      new THREE.LineBasicMaterial({ color: 0x3a5463 }));
    box.position.set(W / 2, H / 2, D / 2); scene.add(box);
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x0c151b, side: THREE.DoubleSide }));
    backWall.position.set(W / 2, H / 2, D); scene.add(backWall);
    // head-height plane outline (2 m, tenability limit)
    const hh = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, D)),
      new THREE.LineDashedMaterial({ color: 0xff2a2a, dashSize: 0.6, gapSize: 0.4 }));
    hh.rotation.x = -Math.PI / 2; hh.position.set(W / 2, 2.0, D / 2); hh.computeLineDistances(); scene.add(hh);
    scene.add(label("2 m : limite de tenabilité", W + 2.6, 2.0, 0.3, 0.6, "#ff6060"));
    // racks
    hall.racks.forEach(r => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, r.h, r.y1 - r.y0),
        new THREE.MeshLambertMaterial({ color: 0x3b3022 }));
      m.position.set((r.x0 + r.x1) / 2, r.h / 2, (r.y0 + r.y1) / 2); scene.add(m);
    });
    // doors
    hall.doors.forEach(d => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.width, d.height),
        new THREE.MeshBasicMaterial({ color: 0x2b6d3a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
      m.position.set(d.x, d.height / 2, d.y === 0 ? 0.01 : D - 0.01); scene.add(m);
    });
    // panel detectors
    const dets = {};
    hall.panel_detectors.forEach(p => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 16),
        new THREE.MeshBasicMaterial({ color: COL.white }));
      m.position.set(p.x, H - 0.1, p.y); scene.add(m); dets[p.id] = { mesh: m, zone: p.zone };
    });
    // sensor nodes + haze
    const nodes = {};
    hall.nodes.forEach(n => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: COL.green }));
      s.position.set(n.x, n.z, n.y); scene.add(s);
      const haze = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xbfc6cc, transparent: true, opacity: 0.0, depthWrite: false }));
      haze.position.copy(s.position); scene.add(haze);
      scene.add(label(String(n.id), n.x, n.z + 0.6, n.y, 0.7, "#9fb3bf"));
      nodes[n.id] = { mesh: s, haze };
    });
    // smoke layer (simulated) + fire
    const smoke = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 1, D - 0.1),
      new THREE.MeshLambertMaterial({ color: 0x55595d, transparent: true, opacity: 0.0, depthWrite: false }));
    smoke.position.set(W / 2, H, D / 2); scene.add(smoke);
    // clearly visible interface of the smoke layer (height = zone-model state)
    const iface = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, D - 0.1),
      new THREE.MeshBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    iface.rotation.x = -Math.PI / 2; scene.add(iface);
    const ifaceEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(W - 0.1, D - 0.1)),
      new THREE.LineBasicMaterial({ color: 0xd0d4d8 }));
    ifaceEdge.rotation.x = -Math.PI / 2; ifaceEdge.visible = false; scene.add(ifaceEdge);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 16),
      new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.9 }));
    fire.visible = false; scene.add(fire);
    const glow = new THREE.PointLight(0xff5500, 0, 12); scene.add(glow);

    function label(text, x, y, z, size, color) {
      const px = 48, c = document.createElement("canvas"), g0 = c.getContext("2d");
      g0.font = `bold ${px}px Consolas, monospace`;
      const tw = Math.ceil(g0.measureText(text).width) + 16;
      c.width = tw; c.height = Math.ceil(px * 1.4);
      const g = c.getContext("2d"); g.fillStyle = color; g.font = `bold ${px}px Consolas, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, tw / 2, c.height / 2);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, transparent: true }));
      sp.position.set(x, y + size * 0.15, z); sp.scale.set(size * tw / c.height, size, 1); return sp;
    }

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    function place() {
      camera.position.set(center.x + dist * Math.cos(el) * Math.cos(az), center.y + dist * Math.sin(el),
        center.z + dist * Math.cos(el) * Math.sin(az));
      camera.lookAt(center);
    }
    let drag = null;
    renderer.domElement.addEventListener("mousedown", e => { drag = [e.clientX, e.clientY]; });
    window.addEventListener("mouseup", () => { drag = null; });
    window.addEventListener("mousemove", e => {
      if (!drag) return;
      az += (e.clientX - drag[0]) * 0.006; el = Math.min(1.4, Math.max(0.1, el + (e.clientY - drag[1]) * 0.004));
      drag = [e.clientX, e.clientY];
    });
    renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); dist = Math.min(70, Math.max(14, dist + e.deltaY * 0.02)); }, { passive: false });

    /* state: {nodes:{id:{level, dPM, excluded}}, ssiZones:{A:0/1}, smokeZ (m or null), fire:{x,y,q} or null} */
    function update(st) {
      for (const id in nodes) {
        const s = st.nodes[id]; if (!s) continue;
        const col = s.excluded ? COL.grey : s.level === 2 ? COL.red : s.level === 1 ? COL.amber : COL.green;
        nodes[id].mesh.material.color.setHex(col);
        const rise = Math.max(0, s.dPM - 4.5);              // log particle rise above ~90 particles
        const r = 0.4 + rise * 0.9;
        nodes[id].haze.scale.set(r, r, r);
        nodes[id].haze.material.opacity = Math.min(0.32, rise * 0.09);
      }
      for (const id in dets) dets[id].mesh.material.color.setHex(st.ssiZones[dets[id].zone] ? COL.red : COL.white);
      if (st.smokeZ !== null && st.smokeZ < H - 0.05) {
        const th = H - st.smokeZ;
        smoke.scale.y = th; smoke.position.y = H - th / 2;
        smoke.material.opacity = Math.min(0.75, 0.25 + 0.06 * th);
        smoke.material.color.setHex(st.smokeHot ? 0x6b4a3a : 0x55595d);
        iface.position.set(W / 2, st.smokeZ, D / 2); iface.material.opacity = 0.45;
        ifaceEdge.position.copy(iface.position); ifaceEdge.visible = true;
      } else { smoke.material.opacity = 0; iface.material.opacity = 0; ifaceEdge.visible = false; }
      if (st.fire) {
        fire.visible = true; const s = 0.6 + Math.min(4, Math.sqrt(st.fire.q / 400));
        fire.scale.set(s, s, s); fire.position.set(st.fire.x, 0.8 * s, st.fire.y);
        glow.position.set(st.fire.x, 1.5, st.fire.y); glow.intensity = Math.min(3, st.fire.q / 1500 + 0.5);
      } else { fire.visible = false; glow.intensity = 0; }
    }
    let t0 = performance.now();
    function loop() {
      requestAnimationFrame(loop);
      if (!container.offsetParent) return;      // page hidden
      resize(); place();
      if (fire.visible) { const k = 1 + 0.08 * Math.sin((performance.now() - t0) / 90); fire.scale.y *= k; }
      renderer.render(scene, camera);
      if (fire.visible) fire.scale.y /= 1 + 0.08 * Math.sin((performance.now() - t0) / 90);
    }
    loop();
    return { update, resize, renderer };
  }

  root.AFDT_Twin3D = Twin3D;
})(window);
