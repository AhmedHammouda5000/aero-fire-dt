/* Aero-Fire DT — free-test bench ("banc d'essai libre").
 * The user places real fires or nuisance sources anywhere in the hall. The CFD carries heat, smoke,
 * coarse particles, CO, CO2, H2 and VOC to the 9 sensor nodes; the readings are converted to the same
 * units as the real dataset sensors (synthetic sensors, calibrated on typical magnitudes of the
 * Mendeley Industrial Hall recordings); the SAME exported AI model + voting logic + simulated SSI then
 * decide, exactly as in the replayed real scenarios.
 * Honest limit: synthetic sensors are a physics-based approximation — the AI was trained on real
 * sensors, so results here are a qualitative stress test, not a validation. */
(function (root) {
  "use strict";
  const CFD = (typeof module !== "undefined" && module.exports) ? require("./cfd.js") : root.AFDT_CFD;
  const VER = (typeof module !== "undefined" && module.exports) ? require("./verifier.js") : root.AFDT_Verifier;

  /* source catalogue — fires are combustion packages in the CFD (with fire spread), nuisances are
     non-combustion emitters. Rates in kg/s, q in kW. */
  const SOURCES = {
    cigarette:  { label: "Cigarette", icon: "🚬", kind: "fire", mat: "cigarette", q: 0.03, size: 0.1, alpha: 1 },
    bougies:    { label: "Bougies (×4)", icon: "🕯️", kind: "fire", mat: "bougie", q: 0.3, size: 0.3, alpha: 1 },
    bois_petit: { label: "Petit feu de bois", icon: "🔥", kind: "fire", mat: "bois", q: 30, size: 0.5, alpha: 0.012 },
    bois_grand: { label: "Grand feu de bois", icon: "🔥", kind: "fire", mat: "bois", q: 450, size: 1.0, alpha: 0.047 },
    textile:    { label: "Balle de textile", icon: "👕", kind: "fire", mat: "friperie", q: 350, size: 1.0, alpha: 0.047 },
    plastique:  { label: "Plastiques", icon: "🧴", kind: "fire", mat: "plastique", q: 700, size: 1.0, alpha: 0.1876 },
    aerosol:    { label: "Aérosol (spray)", icon: "💨", kind: "nuisance", y: 1.3, size: 0.5, dur: 45, q: 0, rates: { voc: 1.2e-4, pmc: 3e-5, soot: 4e-7 } },
    soudure:    { label: "Soudure", icon: "⚡", kind: "nuisance", y: 1.0, size: 0.5, dur: 300, q: 3, rates: { soot: 5e-6, pmc: 5e-7, co: 3e-7, co2: 2e-5 } },
    echappement:{ label: "Échappement chariot", icon: "🚜", kind: "nuisance", y: 0.6, size: 0.5, dur: 300, q: 15, rates: { co: 2e-4, h2: 2.5e-6, soot: 1.5e-6, co2: 6e-3 } },
    poussiere:  { label: "Poussière (découpe)", icon: "🌫️", kind: "nuisance", y: 1.0, size: 0.5, dur: 150, q: 0.5, rates: { pmc: 6e-5, soot: 1.5e-6 } },
  };
  // synthetic sensor conversion (CFD concentrations -> dataset sensor units), calibration constants
  const CAL = { fine: 4e9, coarse: 1.2e9, h2u: 3.0, vocu: 6.0, bgPM: 20 };
  const SENSOR_Y = 3.0;                          // nodes are mounted at 3 m
  const BASE = { CO: 0.2, H2: 0.8, VOC: 0.9, CO2: 640, TEMP: 28.5, HUM: 42.7, PM05: 18, PM10: 2, PM25: 0, PMTOT: 21, PMSIZE: 0.47 };
  const RHO = 1.2;

  function profileText(chA, chB, chC, dco, dvoc) {
    if (chA && !chB && !chC) return "particules sans gaz de combustion (type poussière / brouillard / soudure)";
    if (chB && !chA) return dco >= 10 ? "gaz sans particules, CO élevé (type moteur thermique)" : dvoc > Math.max(2, 2 * dco) ? "gaz sans particules, COV élevés (type solvant / alcool)" : "gaz sans particules";
    if (chA && chB) return dvoc > 8 && dco < 2 ? "particules + COV élevés, peu de CO (type aérosol / spray)" : "particules + gaz de combustion (signature compatible avec un feu)";
    if (chA && chC) return "particules + chaleur";
    return "air normal";
  }

  class Sandbox {
    constructor(hall, model, opt) {
      opt = opt || {};
      this.hall = hall; this.model = model; this.S = model.settings;
      this.sim = new CFD.Sim(hall, { tamb: opt.tamb === undefined ? 28 : opt.tamb, doorOpen: opt.door || 0, roofVent: opt.vent || 0 });
      this.sources = []; this.nextId = 1;
      this.zoneOf = {}; hall.nodes.forEach(n => { this.zoneOf[n.id] = n.zone; });
      this.hist = {}; hall.nodes.forEach(n => { this.hist[n.id] = Object.fromEntries(Object.keys(BASE).map(k => [k, []])); });
      this.voter = new VER.HallVoter(this.S);
      this.ssiLatched = { A: 0, B: 0, C: 0 };
      this.tripOrder = []; this.zoneLock = null; this.nextSample = 0;
      this.scn = { id: "F", title: "Banc d'essai libre", kind: "sandbox", sandbox: true, dt: 10,
        story: "Placez des feux ou des nuisances n'importe où dans le hall : la physique (CFD) transporte la fumée, les gaz et la chaleur jusqu'aux capteurs, puis la même IA et le même SSI simulé décident.",
        source: "Capteurs synthétiques calculés par la physique CFD (calibrés sur les ordres de grandeur du jeu Industrial Hall) · même modèle IA · test qualitatif",
        t: [], nodes: {}, hall: { p: [], verdict: [], chA: [], chB: [], chC: [], active_nodes: [] },
        ssi: { zones: { A: [], B: [], C: [] }, fire: [], fault: [] }, alerts: [], key_times: { ssi_alarm: null, ai_fire: null, first_activity: null, drift_flag: null } };
      hall.nodes.forEach(n => { this.scn.nodes[n.id] = { PMTOT: [], CO: [], H2: [], VOC: [], TEMP: [], dPM: [], dCO: [], dH2: [], dVOC: [], dTEMP: [], p: [], chA: [], chB: [], chC: [] }; });
      this.sample();       // t = 0: clean air
    }
    distances(x, z, y) {
      let dn = 1e9, nn = null, dd = 1e9, nd = null;
      this.hall.nodes.forEach(n => { const d = Math.hypot(n.x - x, (n.z || SENSOR_Y) - (y || 0.5), n.y - z); if (d < dn) { dn = d; nn = n.id; } });
      this.hall.panel_detectors.forEach(p => { const d = Math.hypot(p.x - x, this.hall.size.height - (y || 0.5), p.y - z); if (d < dd) { dd = d; nd = p.id; } });
      return { node: nn, dNode: dn, det: nd, dDet: dd };
    }
    place(type, x, z, scale) {
      const def = SOURCES[type]; if (!def) return null;
      scale = scale || 1;
      const rec = { id: this.nextId++, type, label: def.label, icon: def.icon, kind: def.kind, x, z, scale, t0: this.sim.time };
      if (def.kind === "fire") {
        const p = this.sim.addFire(x, z, def.size, def.q * scale, def.mat);
        p.tig = this.sim.time; p.alpha = def.alpha; p.id = "src-" + rec.id; rec.pkg = p;
      } else {
        const r = {}; for (const k in def.rates) r[k] = def.rates[k] * scale;
        rec.em = this.sim.addEmitter({ x, z, y: def.y, size: def.size, dur: def.dur, q: def.q * scale, rates: r });
      }
      Object.assign(rec, this.distances(x, z, def.kind === "fire" ? 0.5 : def.y));
      this.sources.push(rec);
      return rec;
    }
    remove(id) {
      const r = this.sources.find(s => s.id === id); if (!r) return;
      if (r.pkg) { const p = this.sim.fuel.find(q => q.id === r.pkg.id); if (p) { p.burning = false; p.q = 0; p.burnt = true; } }
      if (r.em) { const e = this.sim.emitters.find(q => q.t0 === r.em.t0 && q.x === r.em.x); if (e) e.dur = Math.max(0, this.sim.time - e.t0); }
      this.sources = this.sources.filter(s => s.id !== id);
    }
    step(dt) {
      this.sim.step(dt);
      while (this.sim.time >= this.nextSample - 1e-6) this.sample();
    }
    /* synthetic sensor reading of one node (dataset units) */
    read(n) {
      const pr = this.sim.probe(n.x, n.z || SENSOR_Y, n.y);
      const fine = Math.max(0, pr.soot) * CAL.fine, coarse = Math.max(0, pr.pmc) * CAL.coarse;
      const co = pr.coPPM, h2 = Math.max(0, pr.h2) / RHO * (28.97 / 2.016) * 1e6 * CAL.h2u;
      const voc = Math.max(0, pr.voc) / RHO * (28.97 / 46.07) * 1e6 * CAL.vocu, co2 = Math.max(0, pr.co2) / RHO * (28.97 / 44.01) * 1e6;
      const tot = CAL.bgPM + fine + coarse, sat = (v, m) => Math.min(v, m);   // sensor saturation (dataset maxima)
      const r = { CO: BASE.CO + co, H2: BASE.H2 + h2, VOC: BASE.VOC + voc, CO2: BASE.CO2 + co2, TEMP: BASE.TEMP + pr.dT, HUM: BASE.HUM,
        PM05: BASE.PM05 + 0.88 * fine + 0.35 * coarse, PM10: BASE.PM10 + 0.11 * fine + 0.35 * coarse, PM25: BASE.PM25 + 0.01 * fine + 0.25 * coarse,
        PMTOT: BASE.PMTOT + fine + coarse, PMSIZE: (0.47 * CAL.bgPM + 0.40 * fine + 1.0 * coarse) / tot };
      r.CO = sat(r.CO, 500); r.H2 = sat(r.H2, 60); r.VOC = sat(r.VOC, 60); r.CO2 = sat(r.CO2, 5000);
      const k = Math.min(1, 40000 / r.PMTOT); r.PM05 *= k; r.PM10 *= k; r.PM25 *= k; r.PMTOT *= k;   // optical counter saturation
      return r;
    }
    sample() {
      const S = this.S, scn = this.scn, t = this.sim.time;
      const nodes = [];
      this.hall.nodes.forEach(n => {
        const h = this.hist[n.id], r = this.read(n);
        for (const k in BASE) h[k].push(r[k]);
        const x = VER.features(h, BASE);
        const p = VER.predict(this.model, x);
        const o = { id: n.id, p, logPM: x[6], dCO: x[0], dH2: x[1], dVOC: x[2], dTEMP: x[4] };
        nodes.push(o);
        const s = scn.nodes[n.id];
        s.PMTOT.push(+r.PMTOT.toFixed(1)); s.CO.push(+r.CO.toFixed(2)); s.H2.push(+r.H2.toFixed(2)); s.VOC.push(+r.VOC.toFixed(2)); s.TEMP.push(+r.TEMP.toFixed(2));
        s.dPM.push(+o.logPM.toFixed(2)); s.dCO.push(+o.dCO.toFixed(2)); s.dH2.push(+o.dH2.toFixed(2)); s.dVOC.push(+o.dVOC.toFixed(2)); s.dTEMP.push(+o.dTEMP.toFixed(2));
        s.p.push(+p.toFixed(3));
        s.chA.push(o.logPM > S.CH_A_PM); s.chB.push(o.dCO > S.CH_B_CO || o.dH2 > S.CH_B_H2 || o.dVOC > S.CH_B_VOC); s.chC.push(o.dTEMP > S.CH_C_TEMP);
        if (o.logPM > S.OPTICAL_TRIP) this.ssiLatched[this.zoneOf[n.id]] = 1;          // simulated optical SSI detector
      });
      const hv = this.voter.step(nodes);
      if (hv.p !== null) this.pMax = Math.max(this.pMax || 0, hv.p);
      const mxN = k => Math.max(...nodes.map(n => n[k]));
      (this.mxH = this.mxH || []).push({ pm: mxN("logPM"), co: mxN("dCO"), h2: mxN("dH2") });
      const h0 = this.mxH[Math.max(0, this.mxH.length - 7)], h1 = this.mxH[this.mxH.length - 1];
      const rising = h1.pm - h0.pm >= 0.5 || h1.co - h0.co >= 0.3 || h1.h2 - h0.h2 >= 1.0;   // same rule as the real scenarios
      this.earlyRun = (hv.p !== null && hv.p >= this.S.P_FIRE && (hv.chA || hv.chB) && rising) ? (this.earlyRun || 0) + 1 : 0;
      this.earlyOn = this.earlyRun >= this.S.CONFIRM_BINS || (this.earlyOn && hv.p !== null && hv.p >= 0.5 && (hv.chA || hv.chB));
      scn.t.push(Math.round(t));
      scn.hall.p.push(hv.p === null ? null : +hv.p.toFixed(3)); scn.hall.verdict.push(hv.verdict);
      scn.hall.chA.push(hv.chA); scn.hall.chB.push(hv.chB); scn.hall.chC.push(hv.chC); scn.hall.active_nodes.push(hv.active);
      for (const z of ["A", "B", "C"]) { scn.ssi.zones[z].push(this.ssiLatched[z]); if (this.ssiLatched[z] && !this.tripOrder.includes(z)) this.tripOrder.push(z); }
      const anySSI = this.ssiLatched.A || this.ssiLatched.B || this.ssiLatched.C;
      scn.ssi.fire.push(anySSI ? 1 : 0); scn.ssi.fault.push(0);
      if (anySSI && scn.key_times.ssi_alarm === null) scn.key_times.ssi_alarm = Math.round(t);
      if (hv.verdict === "FIRE" && scn.key_times.ai_fire === null) scn.key_times.ai_fire = Math.round(t);
      if (hv.active && scn.key_times.first_activity === null) scn.key_times.first_activity = Math.round(t);
      scn.alerts.push(this.alerts(nodes, hv));
      this.nextSample = t + 10;
    }
    alerts(nodes, hv) {
      const S = this.S, a = [];
      const ssiZ = this.tripOrder.filter(z => this.ssiLatched[z]);
      let best = null, bk = [-1, -1];
      nodes.forEach(n => {
        const A = n.logPM > S.CH_A_PM, B = n.dCO > S.CH_B_CO || n.dH2 > S.CH_B_H2 || n.dVOC > S.CH_B_VOC;
        if (!(A || B)) return;
        const k = [A ? 1 : 0, n.logPM + 2 * Math.log1p(Math.max(n.dCO, 0) + Math.max(n.dH2, 0))];
        if (k[0] > bk[0] || (k[0] === bk[0] && k[1] > bk[1])) { bk = k; best = n; }
      });
      if (best && (!this.zoneLock || (bk[0] && !this.lockSmoke))) { this.zoneLock = this.zoneOf[best.id]; this.lockSmoke = !!bk[0]; }
      if (!best && hv.active === 0) { this.zoneLock = null; this.lockSmoke = false; }
      const zone = this.zoneLock || (ssiZ[0] || null), zn = zone ? "ZONE " + zone : "";
      const mx = k => Math.max(...nodes.map(n => n[k]));
      const prof = profileText(hv.chA, hv.chB, hv.chC, mx("dCO"), mx("dVOC"));
      const p = hv.p === null ? null : +hv.p.toFixed(2), dual = hv.chA && (hv.chB || hv.chC);
      const nAct = hv.active;
      if (ssiZ.length && hv.verdict === "FIRE" && dual) a.push({ level: 3, code: "FIRE_CONFIRMED", title: "FEU CONFIRMÉ " + zn, detail: "SSI + IA (score max " + (this.pMax || 0).toFixed(2) + ") + 2 canaux physiques indépendants",
        actions: ["ÉVACUATION " + zn + " ........ DÉCLENCHER", "PROTECTION CIVILE 198 ........ APPELER", "DÉSENFUMAGE ........ VÉRIFIER", "ÉQUIPE DE SÉCURITÉ ........ ENGAGER"] });
      else if (ssiZ.length && hv.verdict === "NUISANCE") a.push({ level: 2, code: "SSI_NUISANCE", title: "ALARME SSI ZONE " + ssiZ[0] + " : APPLIQUER LA PROCÉDURE", detail: "information IA (pas une décision) : indices compatibles avec une nuisance · profil : " + prof,
        actions: ["PROCÉDURE SSI ........ APPLIQUER", "LEVÉE DE DOUTE ZONE " + ssiZ[0] + " ........ ENVOYER AGENT", "ALARME SSI ........ MAINTENUE (NON INHIBÉE)", "DÉCISION ........ OPÉRATEUR"] });
      else if (ssiZ.length) a.push({ level: 2, code: "SSI_UNCERTAIN", title: "ALARME SSI ZONE " + ssiZ[0] + " : APPLIQUER LA PROCÉDURE", detail: "information IA : en analyse · profil : " + prof,
        actions: ["PROCÉDURE SSI ........ APPLIQUER", "LEVÉE DE DOUTE ZONE " + ssiZ[0] + " ........ ENVOYER AGENT", "ALARME SSI ........ MAINTENUE (NON INHIBÉE)"] });
      else if (hv.verdict === "FIRE" && dual) a.push({ level: 2, code: "AI_PREALARM", title: "PRÉ-ALARME IA : FEU PROBABLE " + zn, detail: "score max " + (this.pMax || 0).toFixed(2) + " · 2 canaux concordants · SSI pas encore déclenché",
        actions: ["LEVÉE DE DOUTE " + zn + " ........ ENVOYER AGENT", "CHEF DE SÉCURITÉ ........ PRÉVENIR", "PROTECTION CIVILE ........ PRÉ-AVERTIR"] });
      else if (this.earlyOn && hv.verdict === "UNCERTAIN") a.push({ level: 2, code: "AI_EARLY", title: "FEU COUVANT POSSIBLE " + zn,
        detail: "score feu " + p + " · profil : " + prof + " · signal en hausse, 2e canal pas encore présent",
        actions: ["LEVÉE DE DOUTE " + zn + " ........ ENVOYER AGENT", "CHEF DE SÉCURITÉ ........ PRÉVENIR"] });
      else if (nAct >= 2 && (hv.verdict === "UNCERTAIN" || hv.verdict === "FIRE")) a.push({ level: 1, code: "AI_ACTIVITY", title: "ACTIVITÉ CAPTEURS " + zn, detail: "score feu " + p + " · profil : " + prof, actions: [] });
      else if (nAct >= 2 && hv.verdict === "NUISANCE") a.push({ level: 1, code: "AI_NUISANCE", title: "NUISANCE DÉTECTÉE " + zn, detail: "score feu " + p + " · profil : " + prof, actions: [] });
      const coMax = mx("dCO");
      if (coMax >= 30) a.push({ level: 2, code: "CO_HEALTH", title: "CO ÉLEVÉ " + zn + " : " + coMax.toFixed(0) + " ppm", detail: "risque pour la santé des opérateurs",
        actions: ["AÉRATION " + zn + " ........ OUVRIR", "MOTEUR THERMIQUE ........ ARRÊTER", "PERSONNEL ........ ÉLOIGNER"] });
      return a.sort((x, y) => y.level - x.level);
    }
  }

  const api = { Sandbox, SOURCES, CAL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AFDT_Sandbox = api;
})(typeof window !== "undefined" ? window : globalThis);
