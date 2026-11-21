/* Aero-Fire DT — real-time 3D fire & smoke physics (simplified CFD) + fire spread.
 *
 * Gas phase — staggered MAC grid (velocities on cell faces, scalars at cell centres, as in NIST FDS),
 * 0.5 m cells, semi-Lagrangian "stable fluids" scheme:
 *   - incompressible flow with Boussinesq buoyancy  dv/dt = g (T - T0) / T
 *   - pressure projection (red-black SOR, warm start) -> divergence-free velocity
 *     closed walls: zero normal velocity on the wall face; open door / roof vents: p = 0 outside
 *   - transport of temperature, soot, CO, VOC, H2; species and energy transport made conservative
 *     (interior mass after advection = mass before - measured outflow through openings)
 *   - heat losses to walls / ceiling (convective cooling term)
 * Combustion / sources (per fuel package, values indicative from the SFPE Handbook / Tewarson tables):
 *   - heat release rate Q(t) = min(alpha (t - t_ig)^2, HRRPUA * A), until the fuel load is consumed
 *   - convective part (1 - chi_r) Q injected in the flame volume (Heskestad flame height)
 *   - soot and CO produced with mass yields:  m_soot = y_s * Q / dHc ,  m_CO = y_CO * Q / dHc
 * Fire spread between packages:
 *   - radiation from each flame as a point source: q'' = chi_r Q / (4 pi R^2)
 *   - convection from the hot gas around the target: q'' = h (T_gas - T0), h = 25 W/m2K
 *   - ignition when the accumulated net energy  sum (q'' - CHF) dt  exceeds the material's E_ig
 * Tenability at head height (SFPE / ISO 13571 simplified):
 *   - visibility S = 3 / K with K = Km * rho_soot, Km = 8700 m2/kg (reflecting signs)
 *   - temperature and CO concentration
 * Limits: 0.5 m cells (much coarser than NIST FDS), no turbulence model, no oxygen depletion /
 * ventilation-limited burning, no radiation transport in the gas, no sprinklers.
 */
(function (root) {
  "use strict";
  const G = 9.81, CP = 1.005, RHO = 1.2, CHI_R = 0.30, KM = 8700, H_CONV = 0.025;

  const MATERIALS = {   // dHc MJ/kg, yields kg/kg, HRRPUA kW/m2, alpha kW/s2, CHF kW/m2, Eig kJ/m2, load MJ/m2
    "friperie": { label: "balles de textile (friperie)", dHc: 18, ys: 0.05, yco: 0.03, yvoc: 0.02, yh2: 0.004, ypmc: 0.003, yco2: 1.4, hrrpua: 450, alpha: 0.047, chf: 12, eig: 500, load: 1200 },
    "carton":   { label: "cartons sur palettes",          dHc: 13, ys: 0.015, yco: 0.006, yvoc: 0.01, yh2: 0.003, ypmc: 0.002, yco2: 1.2, hrrpua: 300, alpha: 0.047, chf: 10, eig: 400, load: 500 },
    "huile":    { label: "fûts d'huile",                  dHc: 40, ys: 0.06, yco: 0.02, yvoc: 0.03, yh2: 0.004, ypmc: 0.0, yco2: 2.6, hrrpua: 1500, alpha: 0.1876, chf: 20, eig: 2500, load: 2000 },
    // sandbox fuels (free-test phase)
    "bois":      { label: "bois",       dHc: 12.4, ys: 0.015, yco: 0.004, yvoc: 0.006, yh2: 0.004, ypmc: 0.002, yco2: 1.3, hrrpua: 1000, alpha: 0.047, chf: 12, eig: 600, load: 900 },
    "plastique": { label: "plastique",  dHc: 38, ys: 0.06, yco: 0.024, yvoc: 0.012, yh2: 0.005, ypmc: 0.001, yco2: 2.8, hrrpua: 1400, alpha: 0.1876, chf: 15, eig: 700, load: 1500 },
    "bougie":    { label: "bougie",     dHc: 43, ys: 0.004, yco: 0.003, yvoc: 0.002, yh2: 0.012, ypmc: 0.0, yco2: 3.0, hrrpua: 500, alpha: 1, chf: 99, eig: 1e9, load: 1e9 },
    "cigarette": { label: "cigarette",  dHc: 12, ys: 0.04, yco: 0.06, yvoc: 0.02, yh2: 0.006, ypmc: 0.002, yco2: 0.8, hrrpua: 50, alpha: 1, chf: 99, eig: 1e9, load: 1e9 },
  };
  const SPECIES = ["T", "soot", "co", "voc", "h2", "pmc", "co2"];   // pmc = coarse particles (aerosol, dust)

  class Sim {
    constructor(hall, opt) {
      opt = opt || {};
      this.dx = opt.dx || 0.5;
      this.W = hall.size.length; this.D = hall.size.width; this.H = hall.size.height;
      const NX = this.NX = Math.round(this.W / this.dx), NY = this.NY = Math.round(this.H / this.dx), NZ = this.NZ = Math.round(this.D / this.dx);
      this.N = NX * NY * NZ;
      this.NU = (NX + 1) * NY * NZ; this.NV = NX * (NY + 1) * NZ; this.NW = NX * NY * (NZ + 1);
      this.u = new Float32Array(this.NU); this.v = new Float32Array(this.NV); this.w = new Float32Array(this.NW);
      this.u0 = new Float32Array(this.NU); this.v0 = new Float32Array(this.NV); this.w0 = new Float32Array(this.NW);
      SPECIES.forEach(s => { this[s] = new Float32Array(this.N); });
      this.p = new Float32Array(this.N); this.div = new Float32Array(this.N); this.tmp = new Float32Array(this.N);
      this.cool = new Float32Array(this.N);
      this.bt = new Float32Array(3 * this.N); this.fresh = new Uint8Array(this.N);   // back-trace cache (shared by all species)
      this.hall = hall; this.T0 = 293.15 + (opt.tamb === undefined ? 30 : opt.tamb);
      this.time = 0; this.iters = opt.iters || 32; this.omega = 1.8;
      this.Dt = opt.Dt === undefined ? 0.04 : opt.Dt;   // turbulent diffusivity (m2/s): room-air mixing (draughts, people, machines)
      this.openZ0 = new Uint8Array(NX * NY); this.openZD = new Uint8Array(NX * NY); this.openTop = new Uint8Array(NX * NZ);
      this.fuel = buildFuel(hall);
      this.emitters = [];
      this.setOpenings(opt.doorOpen || 0, opt.roofVent || 0);
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const b = (i === 0 || i === NX - 1 || k === 0 || k === NZ - 1 || j === NY - 1) ? 1 : 0;
        this.cool[this.id(i, j, k)] = 0.003 + 0.022 * b;
      }
      this.prodSoot = 0; this.outSoot = 0;
    }
    id(i, j, k) { return i + this.NX * (j + this.NY * k); }
    iu(i, j, k) { return i + (this.NX + 1) * (j + this.NY * k); }
    iv(i, j, k) { return i + this.NX * (j + (this.NY + 1) * k); }
    iw(i, j, k) { return i + this.NX * (j + this.NY * k); }   // w index: k in [0, NZ]

    setOpenings(doorWidth, ventArea) {
      this.openZ0.fill(0); this.openZD.fill(0); this.openTop.fill(0);
      const dx = this.dx;
      this.hall.doors.forEach(d => {
        if (d.y !== 0 || !(doorWidth > 0)) return;                // the south sectional door is the controllable one
        const i0 = Math.max(0, Math.floor((d.x - d.width / 2) / dx)), i1 = Math.min(this.NX - 1, Math.ceil((d.x + d.width / 2) / dx) - 1);
        const j1 = Math.min(this.NY - 1, Math.ceil(d.height / dx) - 1);
        for (let i = i0; i <= i1; i++) for (let j = 0; j <= j1; j++) this.openZ0[i + this.NX * j] = 1;
      });
      if (ventArea > 0) {
        const cells = Math.max(1, Math.round(ventArea / (dx * dx))), kc = Math.floor(this.NZ / 2) - 1;
        for (let n = 0; n < cells; n++) this.openTop[Math.floor((n + 0.5) * this.NX / cells) + this.NX * (kc + (n % 3))] = 1;
      }
      this.doorWidth = doorWidth; this.ventArea = ventArea;
      // closed boundary faces carry zero normal velocity
      this.enforceWalls();
    }
    enforceWalls() {
      const { NX, NY, NZ } = this;
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { this.u[this.iu(0, j, k)] = 0; this.u[this.iu(NX, j, k)] = 0; }
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        this.v[this.iv(i, 0, k)] = 0;
        if (!this.openTop[i + NX * k]) this.v[this.iv(i, NY, k)] = 0;
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        if (!this.openZ0[i + NX * j]) this.w[i + NX * (j + NY * 0)] = 0;
        if (!this.openZD[i + NX * j]) this.w[i + NX * (j + NY * NZ)] = 0;
      }
    }

    /* ---------------- fire control ---------------- */
    ignite(x, z, alpha, qmax) {
      let best = null, bd = 1e9;
      this.fuel.forEach(p => { const d = boxDist(p, x, 1, z); if (d < bd) { bd = d; best = p; } });
      if (best && !best.burning && !best.burnt) {
        best.burning = true; best.tig = this.time; best.alpha = alpha || MATERIALS[best.mat].alpha;
        best.qmax = Math.min(qmax || 1e9, MATERIALS[best.mat].hrrpua * best.area); best.cause = "allumage";
      }
      return best;
    }
    /* test / sandbox fire: a free-standing source of fixed heat release (kW) */
    addFire(x, z, size, q, mat) {
      const p = pkg("feu-" + this.fuel.length, mat || "carton", x - size / 2, x + size / 2, z - size / 2, z + size / 2, 0, 0.3, size * size);
      p.burning = true; p.tig = this.time - 1e4; p.alpha = 1e9; p.qmax = q; p.eLoad = 1e9; p.cause = "test";
      this.fuel.push(p); return p;
    }
    totalHRR() { let q = 0; this.fuel.forEach(p => { q += p.q; }); return q; }

    updateFuel(dt) {
      const burning = this.fuel.filter(p => p.burning);
      for (const p of this.fuel) {
        const m = MATERIALS[p.mat];
        if (p.burning) {
          const t = this.time - p.tig;
          let q = Math.min((p.alpha || m.alpha) * t * t, p.qmax || m.hrrpua * p.area);
          if (p.eBurnt > 0.85 * p.eLoad) q *= Math.max(0, (p.eLoad - p.eBurnt) / (0.15 * p.eLoad));
          p.q = q; p.eBurnt += q * dt / 1000;
          if (p.eBurnt >= p.eLoad) { p.burning = false; p.burnt = true; p.q = 0; }
          continue;
        }
        if (p.burnt) continue;
        let qr = 0;
        for (const s of burning) {
          if (s === p || s.q <= 0) continue;
          const hf = flameHeight(s.q, s.dEq);
          const R = Math.max(0.35, boxDist(p, s.cx, Math.min(hf / 3, s.y1 + hf / 3), s.cz));
          qr += CHI_R * s.q / (4 * Math.PI * R * R);
          if (R < 0.8 && hf > p.y0 + 0.5) qr += 40;
        }
        const Tg = this.sampleT(p.cx, Math.min(p.y1 + 0.25, this.H - 0.3), p.cz);
        p.flux = qr + H_CONV * Tg;
        const net = p.flux - m.chf;
        p.eIg = net > 0 ? p.eIg + net * dt : Math.max(0, p.eIg - 2 * dt);
        if (p.eIg >= m.eig) { p.burning = true; p.tig = this.time; p.alpha = m.alpha; p.qmax = m.hrrpua * p.area; p.cause = "propagation"; }
      }
    }

    injectSources(dt) {
      const dx = this.dx, vol = dx * dx * dx;
      this.prodSoot = 0;
      for (const p of this.fuel) {
        if (!p.burning || p.q <= 0) continue;
        const m = MATERIALS[p.mat];
        const hf = Math.min(this.H - 0.5, p.y0 + flameHeight(p.q, p.dEq));
        const mdot = p.q / (m.dHc * 1000);
        const i0 = Math.max(0, Math.floor(p.x0 / dx)), i1 = Math.min(this.NX - 1, Math.floor((p.x1 - 1e-3) / dx));
        const k0 = Math.max(0, Math.floor(p.z0 / dx)), k1 = Math.min(this.NZ - 1, Math.floor((p.z1 - 1e-3) / dx));
        const j1 = Math.min(this.NY - 1, Math.max(0, Math.floor(hf / dx)));
        const cells = (i1 - i0 + 1) * (k1 - k0 + 1) * (j1 + 1);
        const dT = (1 - CHI_R) * p.q * dt / cells / (RHO * CP * vol);
        const f = mdot * dt / (cells * vol);
        for (let k = k0; k <= k1; k++) for (let j = 0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const c = this.id(i, j, k);
          this.T[c] = Math.min(1100, this.T[c] + dT);
          this.soot[c] += m.ys * f; this.co[c] += m.yco * f; this.voc[c] += m.yvoc * f; this.h2[c] += m.yh2 * f;
          this.pmc[c] += m.ypmc * f; this.co2[c] += m.yco2 * f;
        }
        this.prodSoot += m.ys * mdot * dt;
      }
      for (const e of this.emitters) {
        if (this.time < e.t0 || (e.dur && this.time > e.t0 + e.dur)) continue;
        const r = Math.max(1, Math.round(e.size / dx / 2));
        const ic = Math.min(this.NX - 1, Math.max(0, Math.floor(e.x / dx))), kc = Math.min(this.NZ - 1, Math.max(0, Math.floor(e.z / dx)));
        const jc = Math.min(this.NY - 1, Math.max(0, Math.floor(e.y / dx)));
        const cells = [];
        for (let k = kc - r + 1; k <= kc + r - 1; k++) for (let i = ic - r + 1; i <= ic + r - 1; i++) if (i >= 0 && k >= 0 && i < this.NX && k < this.NZ) cells.push(this.id(i, jc, k));
        const n = cells.length, f = dt / (n * vol), E = e.rates;
        for (const c of cells) {
          this.soot[c] += (E.soot || 0) * f; this.pmc[c] += (E.pmc || 0) * f; this.co[c] += (E.co || 0) * f;
          this.h2[c] += (E.h2 || 0) * f; this.voc[c] += (E.voc || 0) * f; this.co2[c] += (E.co2 || 0) * f;
          if (e.q) this.T[c] = Math.min(400, this.T[c] + e.q * dt / n / (RHO * CP * vol));
        }
      }
    }
    /* non-combustion source (sandbox): rates in kg/s, q = sensible heat (kW) */
    addEmitter(e) { e.t0 = e.t0 === undefined ? this.time : e.t0; this.emitters.push(e); return e; }

    /* ---------------- fluid solver (MAC grid) ---------------- */
    step(dt) {
      const { NX, NY, NZ } = this;
      this.updateFuel(dt);
      this.injectSources(dt);
      // buoyancy on vertical faces (temperature averaged from the two adjacent cells)
      for (let k = 0; k < NZ; k++) for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) {
        const Tf = 0.5 * (this.T[this.id(i, j - 1, k)] + this.T[this.id(i, j, k)]);
        if (Tf > 0.01) { const f = this.iv(i, j, k); this.v[f] = Math.min(9, this.v[f] + dt * G * Tf / (this.T0 + Tf)); }
      }
      this.u0.set(this.u); this.v0.set(this.v); this.w0.set(this.w);
      this.advectVelocity(dt);
      this.enforceWalls();
      this.project();
      this.computeBacktrace(dt);
      for (const s of SPECIES) { const out = this.advectConservative(this[s], dt); if (s === "soot") this.outSoot = out; this.diffuse(this[s], dt); }
      const T = this.T;
      for (let c = 0; c < this.N; c++) T[c] *= Math.exp(-this.cool[c] * dt);
      for (let f = 0; f < this.NU; f++) this.u[f] *= 0.997;
      for (let f = 0; f < this.NW; f++) this.w[f] *= 0.997;
      for (let f = 0; f < this.NV; f++) this.v[f] *= 0.997;
      this.time += dt;
    }

    /* trilinear sampling of the staggered velocity components (positions in grid units) */
    lerp3(a, nx, ny, nz, x, y, z) {
      x = x < 0 ? 0 : x > nx - 1 ? nx - 1 : x; y = y < 0 ? 0 : y > ny - 1 ? ny - 1 : y; z = z < 0 ? 0 : z > nz - 1 ? nz - 1 : z;
      const i0 = x | 0, j0 = y | 0, k0 = z | 0, i1 = i0 + 1 < nx ? i0 + 1 : i0, j1 = j0 + 1 < ny ? j0 + 1 : j0, k1 = k0 + 1 < nz ? k0 + 1 : k0;
      const fx = x - i0, fy = y - j0, fz = z - k0, A = nx, B = nx * ny;
      const c00 = a[i0 + A * j0 + B * k0] * (1 - fx) + a[i1 + A * j0 + B * k0] * fx;
      const c10 = a[i0 + A * j1 + B * k0] * (1 - fx) + a[i1 + A * j1 + B * k0] * fx;
      const c01 = a[i0 + A * j0 + B * k1] * (1 - fx) + a[i1 + A * j0 + B * k1] * fx;
      const c11 = a[i0 + A * j1 + B * k1] * (1 - fx) + a[i1 + A * j1 + B * k1] * fx;
      return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
    }
    velU(a, x, y, z) { return this.lerp3(a, this.NX + 1, this.NY, this.NZ, x, y - 0.5, z - 0.5); }
    velV(a, x, y, z) { return this.lerp3(a, this.NX, this.NY + 1, this.NZ, x - 0.5, y, z - 0.5); }
    velW(a, x, y, z) { return this.lerp3(a, this.NX, this.NY, this.NZ + 1, x - 0.5, y - 0.5, z); }

    advectVelocity(dt) {
      const { NX, NY, NZ } = this, s = dt / this.dx, U = this.u0, V = this.v0, Wv = this.w0;
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 1; i < NX; i++) {
        const x = i, y = j + 0.5, z = k + 0.5;
        const bx = x - this.velU(U, x, y, z) * s, by = y - this.velV(V, x, y, z) * s, bz = z - this.velW(Wv, x, y, z) * s;
        this.u[this.iu(i, j, k)] = this.velU(U, bx, by, bz);
      }
      for (let k = 0; k < NZ; k++) for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) {
        const x = i + 0.5, y = j, z = k + 0.5;
        const bx = x - this.velU(U, x, y, z) * s, by = y - this.velV(V, x, y, z) * s, bz = z - this.velW(Wv, x, y, z) * s;
        this.v[this.iv(i, j, k)] = this.velV(V, bx, by, bz);
      }
      for (let k = 1; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const x = i + 0.5, y = j + 0.5, z = k;
        const bx = x - this.velU(U, x, y, z) * s, by = y - this.velV(V, x, y, z) * s, bz = z - this.velW(Wv, x, y, z) * s;
        this.w[i + NX * (j + NY * k)] = this.velW(Wv, bx, by, bz);
      }
    }

    project() {
      const { NX, NY, NZ } = this, u = this.u, v = this.v, w = this.w, p = this.p, div = this.div;
      const NX1 = NX + 1;
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        div[i + NX * (j + NY * k)] =
          u[(i + 1) + NX1 * (j + NY * k)] - u[i + NX1 * (j + NY * k)] +
          v[i + NX * ((j + 1) + (NY + 1) * k)] - v[i + NX * (j + (NY + 1) * k)] +
          w[i + NX * (j + NY * (k + 1))] - w[i + NX * (j + NY * k)];
      }
      const om = this.omega;
      for (let it = 0; it < this.iters; it++) for (let color = 0; color < 2; color++) {
        for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = (j + k + color) & 1; i < NX; i += 2) {
          const c = i + NX * (j + NY * k);
          let sum = 0, n = 0;
          if (i > 0) { sum += p[c - 1]; n++; }
          if (i < NX - 1) { sum += p[c + 1]; n++; }
          if (j > 0) { sum += p[c - NX]; n++; }
          if (j < NY - 1) { sum += p[c + NX]; n++; } else if (this.openTop[i + NX * k]) n++;   // p = 0 outside
          if (k > 0) { sum += p[c - NX * NY]; n++; } else if (this.openZ0[i + NX * j]) n++;
          if (k < NZ - 1) { sum += p[c + NX * NY]; n++; } else if (this.openZD[i + NX * j]) n++;
          if (n) p[c] += om * ((sum - div[c]) / n - p[c]);
        }
      }
      // subtract the pressure gradient on interior and open faces
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 1; i < NX; i++) {
        const c = i + NX * (j + NY * k); u[i + NX1 * (j + NY * k)] -= p[c] - p[c - 1];
      }
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        for (let j = 1; j < NY; j++) { const c = i + NX * (j + NY * k); v[i + NX * (j + (NY + 1) * k)] -= p[c] - p[c - NX]; }
        if (this.openTop[i + NX * k]) { const c = i + NX * ((NY - 1) + NY * k); v[i + NX * (NY + (NY + 1) * k)] -= 0 - p[c]; }
      }
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        for (let k = 1; k < NZ; k++) { const c = i + NX * (j + NY * k); w[i + NX * (j + NY * k)] -= p[c] - p[c - NX * NY]; }
        if (this.openZ0[i + NX * j]) w[i + NX * j] -= p[i + NX * j] - 0;
        if (this.openZD[i + NX * j]) { const c = i + NX * (j + NY * (NZ - 1)); w[i + NX * (j + NY * NZ)] -= 0 - p[c]; }
      }
    }

    /* explicit isotropic turbulent diffusion (conservative, zero-flux walls); stable for Dt*dt/dx^2 < 1/6 */
    diffuse(f, dt) {
      if (!this.Dt) return;
      const { NX, NY, NZ } = this, k = this.Dt * dt / (this.dx * this.dx), src = this.tmp;
      src.set(f);
      for (let kk = 0; kk < NZ; kk++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const c = i + NX * (j + NY * kk), v = src[c];
        let lap = 0;
        if (i > 0) lap += src[c - 1] - v; if (i < NX - 1) lap += src[c + 1] - v;
        if (j > 0) lap += src[c - NX] - v; if (j < NY - 1) lap += src[c + NX] - v;
        if (kk > 0) lap += src[c - NX * NY] - v; if (kk < NZ - 1) lap += src[c + NX * NY] - v;
        f[c] = v + k * lap;
      }
    }
    /* departure points of all cell centres for this step (computed once, reused by every species) */
    computeBacktrace(dt) {
      const { NX, NY, NZ } = this, s = dt / this.dx, bt = this.bt, fr = this.fresh;
      for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const c = i + NX * (j + NY * k), x = i + 0.5, y = j + 0.5, z = k + 0.5;
        const bx = x - this.velU(this.u, x, y, z) * s, by = y - this.velV(this.v, x, y, z) * s, bz = z - this.velW(this.w, x, y, z) * s;
        bt[3 * c] = bx - 0.5; bt[3 * c + 1] = by - 0.5; bt[3 * c + 2] = bz - 0.5;
        fr[c] = ((bz < 0 && this.openZ0[i + NX * j]) || (bz > NZ && this.openZD[i + NX * j]) || (by > NY && this.openTop[i + NX * k])) ? 1 : 0;
      }
    }
    /* conservative semi-Lagrangian transport of a cell-centred quantity; returns outflow (kg) */
    advectConservative(f, dt) {
      const { NX, NY, NZ } = this, s = dt / this.dx, A = this.dx * this.dx, V = this.dx ** 3, src = this.tmp;
      let before = 0; for (let c = 0; c < this.N; c++) before += f[c];
      let out = 0;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        if (this.openZ0[i + NX * j]) out += Math.max(0, -this.w[i + NX * j]) * f[this.id(i, j, 0)];
        if (this.openZD[i + NX * j]) out += Math.max(0, this.w[i + NX * (j + NY * NZ)]) * f[this.id(i, j, NZ - 1)];
      }
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (this.openTop[i + NX * k]) out += Math.max(0, this.v[this.iv(i, NY, k)]) * f[this.id(i, NY - 1, k)];
      out *= A * dt;
      src.set(f);
      const bt = this.bt, fr = this.fresh;
      for (let c = 0; c < this.N; c++) f[c] = fr[c] ? 0 : this.lerp3(src, NX, NY, NZ, bt[3 * c], bt[3 * c + 1], bt[3 * c + 2]);   // fresh air enters through openings
      let after = 0; for (let c = 0; c < this.N; c++) after += f[c];
      const target = Math.max(0, before * V - out) / V;
      if (after > 1e-15) { const r = target / after; for (let c = 0; c < this.N; c++) f[c] *= r; }
      return out;
    }

    /* ---------------- probes & outputs ---------------- */
    sampleField(f, x, y, z) { return this.lerp3(f, this.NX, this.NY, this.NZ, x / this.dx - 0.5, y / this.dx - 0.5, z / this.dx - 0.5); }
    sampleT(x, y, z) { return this.sampleField(this.T, x, y, z); }
    velocityAt(x, y, z) {   // m/s at a point (world metres) — used to move visual smoke puffs
      const gx = x / this.dx, gy = y / this.dx, gz = z / this.dx;
      return [this.velU(this.u, gx, gy, gz), this.velV(this.v, gx, gy, gz), this.velW(this.w, gx, gy, gz)];
    }
    coPPM(rho) { return rho / RHO * (28.97 / 28.01) * 1e6; }
    visibility(rhoSoot) { const K = KM * rhoSoot; return K > 1e-6 ? Math.min(60, 3 / K) : 60; }
    probe(x, y, z) {
      const s = this.sampleField(this.soot, x, y, z);
      return { dT: this.sampleT(x, y, z), soot: s, coPPM: this.coPPM(this.sampleField(this.co, x, y, z)),
        visibility: this.visibility(s), voc: this.sampleField(this.voc, x, y, z), h2: this.sampleField(this.h2, x, y, z),
        pmc: this.sampleField(this.pmc, x, y, z), co2: this.sampleField(this.co2, x, y, z) };
    }
    tenability(height) {
      const { NX, NZ, dx } = this, j = Math.min(this.NY - 1, Math.floor((height || 1.8) / dx));
      const out = { level: new Uint8Array(NX * NZ), vis: new Float32Array(NX * NZ), T: new Float32Array(NX * NZ), co: new Float32Array(NX * NZ) };
      let bad = 0, warn = 0, minVis = 60, maxT = 0, maxCO = 0;
      const flames = this.fuel.filter(p => p.burning);
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
        const c = this.id(i, j, k), q = i + NX * k;
        const x = (i + 0.5) * dx, z = (k + 0.5) * dx;
        const inFlame = flames.some(p => x > p.x0 - 0.25 && x < p.x1 + 0.25 && z > p.z0 - 0.25 && z < p.z1 + 0.25);
        const vis = this.visibility(this.soot[c]), T = this.T[c], co = this.coPPM(this.co[c]);
        const lv = (vis < 5 || T > 60 || co > 1400) ? 2 : (vis < 10 || T > 30 || co > 200) ? 1 : 0;
        out.level[q] = lv; out.vis[q] = vis; out.T[q] = T; out.co[q] = co;
        if (lv === 2) bad++; else if (lv === 1) warn++;
        if (!inFlame) { minVis = Math.min(minVis, vis); maxT = Math.max(maxT, T); maxCO = Math.max(maxCO, co); }
      }
      out.fracBad = bad / (NX * NZ); out.fracWarn = warn / (NX * NZ); out.minVis = minVis; out.maxT = maxT; out.maxCO = maxCO;
      return out;
    }
    layerHeight() {
      const { NX, NY, NZ, dx } = this;
      for (let j = 0; j < NY; j++) {
        let s = 0; for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) s += this.soot[this.id(i, j, k)];
        if (this.visibility(s / (NX * NZ)) < 10) return j * dx;
      }
      return this.H;
    }
    totalSoot() { let s = 0; for (let c = 0; c < this.N; c++) s += this.soot[c]; return s * this.dx ** 3; }

    snapshot() {
      const s = { time: this.time, fields: {} };
      ["u", "v", "w", "p", ...SPECIES].forEach(k => { s.fields[k] = new Float32Array(this[k]); });
      s.fuel = this.fuel.map(q => Object.assign({}, q));
      s.emitters = this.emitters.map(q => Object.assign({}, q));
      return s;
    }
    restore(s) {
      this.time = s.time;
      for (const k in s.fields) this[k].set(s.fields[k]);
      this.fuel = s.fuel.map(q => Object.assign({}, q));
      if (s.emitters) this.emitters = s.emitters.map(q => Object.assign({}, q));
    }
    clone() {
      const c = Object.create(Sim.prototype);
      Object.assign(c, this);
      ["u", "v", "w", "u0", "v0", "w0", "p", "div", "tmp", "bt", ...SPECIES].forEach(k => { c[k] = new Float32Array(this[k]); });
      c.fresh = new Uint8Array(this.fresh);
      c.fuel = this.fuel.map(q => Object.assign({}, q));
      c.emitters = this.emitters.map(q => Object.assign({}, q));
      return c;
    }
  }

  function buildFuel(hall) {
    const out = [];
    hall.racks.forEach((r, ri) => {
      const len = r.x1 - r.x0;
      if (r.h >= 3) {
        const n = Math.max(1, Math.round(len / 1.7)), seg = len / n;
        for (let k = 0; k < n; k++) out.push(pkg(`A${ri + 1}.${k + 1}`, "friperie", r.x0 + seg * k, r.x0 + seg * (k + 1), r.y0, r.y1, 0, r.h, seg * r.h));
      } else {
        for (let x = r.x0 + 0.6; x < r.x1 - 0.3; x += 1.3) out.push(pkg(`B-pal.${out.length}`, "carton", x - 0.6, x + 0.6, (r.y0 + r.y1) / 2 - 0.5, (r.y0 + r.y1) / 2 + 0.5, 0, 1.3, 1.2 * 1.3 * 2));
      }
    });
    out.push(pkg("C-fûts", "huile", 20.6, 21.8, 8.6, 9.75, 0, 0.9, 1.5));
    return out;
  }
  function pkg(id, mat, x0, x1, z0, z1, y0, y1, area) {
    const m = MATERIALS[mat], footprint = (x1 - x0) * (z1 - z0);
    return { id, mat, x0, x1, z0, z1, y0, y1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, area,
      dEq: Math.sqrt(4 * footprint / Math.PI), eLoad: m.load * area, eBurnt: 0, eIg: 0, flux: 0,
      burning: false, burnt: false, q: 0, tig: null };
  }
  function boxDist(p, x, y, z) {
    const dx = Math.max(p.x0 - x, 0, x - p.x1), dy = Math.max(p.y0 - y, 0, y - p.y1), dz = Math.max(p.z0 - z, 0, z - p.z1);
    return Math.hypot(dx, dy, dz);
  }
  function flameHeight(q, D) { return q <= 0 ? 0 : Math.max(0.3, 0.235 * Math.pow(q, 0.4) - 1.02 * D); }

  const api = { Sim, MATERIALS, flameHeight };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AFDT_CFD = api;
})(typeof window !== "undefined" ? window : globalThis);
