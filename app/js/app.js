/* Aero-Fire DT — operator display logic (ECAM-inspired). Advisory only: nothing here can act
 * on the certified fire panel (SSI); the SSI shown is simulated and read-only. */
(function () {
  "use strict";
  const S = window.AFDT_SCENARIOS, HALL = window.AFDT_HALL, SUR = window.AFDT_SURROGATE,
    RES = window.AFDT_RESULTS, ZM = window.AFDT_ZoneModel, SG = window.AFDT_Surrogate, CH = window.AFDT_Charts;
  const $ = id => document.getElementById(id);
  const NODE = {}; HALL.nodes.forEach(n => { NODE[n.id] = n; });
  const ZONE_COL = { A: "#33d7ff", B: "#f2f2f2", C: "#e05cff" };
  const T = { CH_A: 5.0, CH_B_CO: 0.8, CH_B_H2: 2.0, CH_B_VOC: 2.0, CH_C: 1.5, OPT: 6.9, P_FIRE: 0.7, P_NUIS: 0.3 };
  const FC = RES.forecast;
  const FEAT_FR = { d_VOC: "hausse COV", voc_per_smoke: "COV / particules", d_CO: "hausse CO",
    log_dPM05: "particules fines 0,5 µm", d_TEMP: "hausse température", PMSIZE_v: "taille des particules",
    d_H2: "hausse H₂", slope_CO: "pente CO 60 s", d_HUM: "humidité", d_CO2: "hausse CO₂",
    coarse_ratio: "ratio grosses/fines", log_dPM25: "particules 2,5 µm", slope_VOC: "pente COV",
    gas_per_smoke: "gaz / particules", log_dPM: "particules totales" };

  const st = {
    k: 0, i: 0, playing: false, speed: 10, acc: 0, page: "zone", auto: true, manualUntil: 0,
    hot: false, sound: false, audio: null, mw: false, mc: false, seen: new Set(), crc: null,
    whatIf: null, sim: null, simKey: "", video: false, storyHidden: false,
    p: { alpha: "rapide", qmax: 5000, door: 0, vent: 0, tamb: 30, ref: false },
  };
  const scn = () => S[st.k];

  /* ---------- 3D twin ---------- */
  const twin = window.AFDT_Twin3D($("three"), HALL);

  /* ---------- scenario buttons ---------- */
  S.forEach((s, k) => {
    const b = document.createElement("button");
    b.textContent = s.id + " · " + s.title; b.title = s.title;
    if (s.limit_case) b.classList.add("limit");
    b.onclick = () => { stopVideo(); setScenario(k, true); };
    $("scn-buttons").appendChild(b);
  });

  function setScenario(k, showStory) {
    st.k = k; st.i = 0; st.seen = new Set(); st.whatIf = null; setMW(false); setMC(false);
    const s = scn();
    // start a little before the event for real runs
    const start = s.t.findIndex(v => v >= -60);
    st.i = Math.max(0, start);
    [...$("scn-buttons").children].forEach((b, j) => b.classList.toggle("active", j === k));
    $("scrub").max = s.t.length - 1;
    $("source").textContent = s.source;
    $("clock-scn").textContent = s.id + " · " + s.title;
    st.storyHidden = !showStory;
    renderStory();
    buildNodeLegend();
    render(true);
  }

  function renderStory() {
    const s = scn(), box = $("story");
    if (st.storyHidden || st.video) { box.style.display = "none"; return; }
    box.style.display = "block";
    box.innerHTML = `<span class="x" id="story-x">✕</span><div class="st">SCÉNARIO ${s.id}${s.limit_case ? " · CAS LIMITE" : ""}</div>
      <b>${s.title}</b><br>${s.story}`;
    $("story-x").onclick = () => { st.storyHidden = true; renderStory(); };
  }

  /* ---------- helpers ---------- */
  const mmss = CH.mmss;
  function activeAlerts(i) {
    const s = scn();
    return (s.alerts[i] || []).filter(a => !(st.hot && /ZONE C/.test(a.title) &&
      ["AI_PREALARM", "AI_ACTIVITY", "AI_NUISANCE"].includes(a.code)));
  }
  function maskedCount(i) { return (scn().alerts[i] || []).length - activeAlerts(i).length; }
  function driftActive(i) { return (scn().alerts[i] || []).some(a => a.code === "NODE_DRIFT"); }
  function nodeVals(i, key) {
    const s = scn(); const out = {};
    for (const id in s.nodes) out[id] = s.nodes[id][key][i];
    return out;
  }
  function maxOver(i, key, excludeDrift) {
    const s = scn(); let m = -Infinity;
    for (const id in s.nodes) {
      if (excludeDrift && driftActive(i) && id === "11") continue;
      m = Math.max(m, s.nodes[id][key][i]);
    }
    return m;
  }

  /* ---------- fire growth hypothesis (twin) ---------- */
  function growthStart() {
    const s = scn();
    if (st.whatIf !== null) return st.whatIf;
    if (s.kind === "fire" && s.key_times.ai_fire !== null) return s.key_times.ai_fire;
    return null;
  }
  function fireLocation() {
    const s = scn(); const t0 = growthStart();
    let idx = s.t.findIndex(v => v >= (t0 === null ? 0 : t0)); if (idx < 0) idx = st.i;
    let best = null, bi = -Infinity;
    for (const id in s.nodes) {
      const v = s.nodes[id].dPM[idx] + 2 * Math.log1p(Math.max(0, s.nodes[id].dCO[idx]));
      if (v > bi) { bi = v; best = id; }
    }
    const n = NODE[best] || NODE[9];
    return { x: n.x, y: n.y, zone: n.zone };
  }
  /* the fire starts in the stored goods: snap the origin to the nearest rack face (≤ 3 m) */
  function nearRack(p) {
    let best = null, bd = 3;
    HALL.racks.forEach(r => {
      const x = Math.min(Math.max(p.x, r.x0 + 0.3), r.x1 - 0.3);
      const y = p.y < r.y0 ? r.y0 - 0.4 : p.y > r.y1 ? r.y1 + 0.4 : p.y;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = { x, y, zone: p.zone }; }
    });
    return best || p;
  }
  function simParams() {
    return { floor_area: HALL.size.width * HALL.size.length, height: HALL.size.height,
      alpha: ZM.ALPHA[st.p.alpha], q_max: st.p.qmax, door_width: st.p.door, door_height: 4,
      roof_vent: st.p.vent, t_amb: st.p.tamb, duration: 1500 };
  }
  function getSim() {
    const key = JSON.stringify(st.p);
    if (key !== st.simKey) { st.sim = ZM.simulate(simParams()); st.simKey = key; }
    return st.sim;
  }
  function twinState(i) {
    const t0 = growthStart(); const s = scn();
    if (t0 === null) return null;
    const tg = Math.round(s.t[i] - t0);
    if (tg < 0) return { tg, active: false };
    const sim = getSim(); const j = Math.min(tg, sim.z.length - 61);
    const jm = Math.max(0, j - 10);
    return { tg, j, active: true, z: sim.z[j], T: sim.t_upper[j], q: sim.q[j],
      dz10: sim.z[j] - sim.z[jm], dT10: sim.t_upper[j] - sim.t_upper[jm], sim };
  }
  function forecastAt(tw) {
    const P = simParams();
    return SG.forecast(SUR, { area: P.floor_area, height: P.height, door_width: P.door_width,
      door_height: P.door_height, roof_vent: P.roof_vent, alpha: P.alpha, q_max: P.q_max,
      t_amb: P.t_amb, t_obs: tw.j, z_obs: tw.z, T_obs: tw.T, dz10: tw.dz10, dT10: tw.dT10 });
  }

  /* ---------- master warning / caution + sound ---------- */
  function setMW(on) {
    st.mw = on; $("btn-mw").classList.toggle("on", on);
    if (on && st.sound && !st.crc) { chime(true); st.crc = setInterval(() => chime(true), 950); }
    if (!on && st.crc) { clearInterval(st.crc); st.crc = null; }
  }
  function setMC(on) { st.mc = on; $("btn-mc").classList.toggle("on", on); }
  function chime(urgent) {
    if (!st.sound) return;
    if (!st.audio) st.audio = new (window.AudioContext || window.webkitAudioContext)();
    const a = st.audio, now = a.currentTime;
    const tones = urgent ? [[1040, 0], [780, 0.18]] : [[880, 0]];
    tones.forEach(([f, d]) => {
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = f; o.type = "sine"; g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.25, now + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.3);
      o.connect(g).connect(a.destination); o.start(now + d); o.stop(now + d + 0.32);
    });
  }
  $("btn-mw").onclick = () => setMW(false);
  $("btn-mc").onclick = () => setMC(false);
  $("btn-sound").onclick = () => {
    st.sound = !st.sound; $("btn-sound").textContent = st.sound ? "🔊 SON" : "🔇 SON";
    if (st.sound) { if (!st.audio) st.audio = new (window.AudioContext || window.webkitAudioContext)(); chime(false); if (st.mw) setMW(true); }
    else setMW(st.mw && false || st.mw);
  };

  function checkNewAlerts(i) {
    let newest = null;
    activeAlerts(i).forEach(a => {
      if (a.level < 2) return;
      const key = a.code + "|" + a.title.replace(/: \d+ ppm/, "");
      if (!st.seen.has(key)) {
        st.seen.add(key);
        if (a.level === 3) setMW(true); else { setMC(true); chime(false); }
        if (!newest || a.level > newest.level) newest = a;
      }
    });
    if (newest && st.auto && performance.now() > st.manualUntil) {
      const pg = { FIRE_CONFIRMED: "forecast", AI_PREALARM: "zone", SSI_NUISANCE: "why",
        SSI_UNCERTAIN: "why", CO_HEALTH: "sensors" }[newest.code];
      if (pg) showPage(pg, false);
    }
  }

  /* ---------- render ---------- */
  function render(force) {
    const s = scn(), i = st.i;
    $("scrub").value = i;
    $("clock-t").textContent = "T" + (s.t[i] >= 0 ? "+" : "") + mmss(s.t[i]);
    const drift = driftActive(i);
    $("heartbeat").classList.toggle("degraded", drift);
    $("hb-text").textContent = drift ? "SSI LINK OK (LECTURE SEULE) · 8/9 NŒUDS · MODE DÉGRADÉ · IA v1.0"
      : "SSI LINK OK (LECTURE SEULE) · 9/9 NŒUDS · IA v1.0";
    if (!force) checkNewAlerts(i);
    renderAlerts(i);
    renderTwin(i);
    if (st.page === "sensors") renderSensors(i);
    if (st.page === "forecast") renderForecast(i);
    if (st.page === "why") renderWhy(i);
    if (st.page === "ssi") renderSSI(i);
  }

  function renderAlerts(i) {
    const al = activeAlerts(i), s = scn();
    const box = $("alerts");
    if (!al.length) {
      box.innerHTML = `<div class="normal">● NORMAL</div><div class="nothing">— AUCUNE ALERTE —<br><br>cockpit sombre : rien à signaler</div>`;
    } else {
      box.innerHTML = al.map(a => `<div class="alert l${a.level}"><div class="title">${a.title}</div>
        <div class="detail">${a.detail}</div>${a.actions.map(x => `<div class="action">${x}</div>`).join("")}</div>`).join("");
    }
    const ssiZ = Object.keys(s.ssi.zones).filter(z => s.ssi.zones[z][i]);
    let memo = ssiZ.length ? `<span class="amber">SSI : ALARME ZONE ${ssiZ.join(", ")} — MAINTENUE, NON INHIBÉE</span>` : "SSI : VEILLE NORMALE";
    if (st.hot) memo += ` · <span class="amber">PERMIS DE FEU ZONE C : alertes IA niv. 1-2 masquées en zone C (${maskedCount(i)}) — alarmes SSI jamais masquées</span>`;
    $("memo").innerHTML = memo;
    const p = s.hall.p[i];
    const chA = s.hall.chA[i], chBC = s.hall.chB[i] || s.hall.chC[i];
    const ok = c => c ? '<span class="ok">✔</span>' : '<span class="ko">✖</span>';
    $("vote").innerHTML = `<b>VOTE ROUGE</b> = SSI ${ok(ssiZ.length > 0)} + IA ≥ 0,70 ${ok(p !== null && p >= T.P_FIRE)}
      + particules ${ok(chA)} + gaz/chaleur ${ok(chBC)} · score IA <b>${p === null ? "—" : p.toFixed(2)}</b>`;
  }

  function nodeLevel(id, i) {
    const n = scn().nodes[id];
    const a = n.chA[i], b = n.chB[i], c = n.chC[i];
    const dual = a && (b || c);
    if (dual && n.p[i] >= T.P_FIRE) return 2;
    if (a || b || c) return 1;
    return 0;
  }
  function renderTwin(i) {
    const s = scn(); const nodes = {};
    const drift = driftActive(i);
    for (const id in s.nodes) nodes[id] = { level: nodeLevel(id, i), dPM: s.nodes[id].dPM[i], excluded: drift && id === "11" };
    const ssiZones = {}; for (const z in s.ssi.zones) ssiZones[z] = s.ssi.zones[z][i];
    const tw = twinState(i);
    let smokeZ = null, fire = null, smokeHot = false, smolder = null;
    if (tw && tw.active) {
      smokeZ = tw.z; smokeHot = tw.T > 200;
      const loc = nearRack(fireLocation()); fire = { x: loc.x, y: loc.y, q: tw.q };
    } else if (s.kind === "fire" && s.hall.chA[i]) {
      // incipient real fire: smouldering wisps where the measured particles are highest
      const loc = nearRack(fireLocation()); smolder = { x: loc.x, y: loc.y, i: Math.max(0, maxOver(i, "dPM", true) - 5) };
    }
    twin.update({ nodes, ssiZones, smokeZ, fire, smokeHot, smolder });
    let note = "";
    if (tw && tw.active) note = `Jumeau : hypothèse de développement (${st.p.alpha}) — nappe de fumée simulée à ${tw.z.toFixed(1)} m, ${tw.T.toFixed(0)} °C`;
    else if (tw && !tw.active) note = "Feu naissant (mesures réelles) — la phase de croissance simulée démarre à la pré-alarme IA";
    else if (s.kind === "drift") note = "Nœud 11 : dérive simulée du capteur CO sur une période calme réelle";
    else note = "Mesures réelles rejouées · halo gris = hausse de particules mesurée";
    $("zone-note").textContent = note;
  }

  function buildNodeLegend() {
    const s = scn();
    $("node-legend").innerHTML = Object.keys(s.nodes).map(id =>
      `<span style="color:${ZONE_COL[NODE[id].zone]}">● nœud ${id} (zone ${NODE[id].zone})</span>`).join("");
  }
  function renderSensors(i) {
    const s = scn(), t = s.t;
    const mk = key => Object.keys(s.nodes).map(id => ({ data: s.nodes[id][key], color: ZONE_COL[NODE[id].zone], width: 1.2, upto: i }));
    CH.line($("ch-pm"), t, mk("dPM"), { title: "PARTICULES — hausse (log)", ymin: 0, ymax: 11, cursor: i,
      thresholds: [{ v: T.OPT, color: "#ff2a2a", label: "seuil détecteur optique (SSI)" }, { v: T.CH_A, color: "#ffb000", label: "canal A" }] });
    CH.line($("ch-co"), t, mk("dCO"), { title: "CO — hausse (ppm)", ymin: 0, cursor: i,
      thresholds: [{ v: T.CH_B_CO, color: "#ffb000", label: "canal B" }, { v: 30, color: "#ff2a2a", label: "seuil santé 30 ppm" }] });
    const maxSeries = key => t.map((_, j) => Math.max(...Object.keys(s.nodes).map(id => s.nodes[id][key][j])));
    CH.line($("ch-gas"), t, [
      { data: maxSeries("dH2"), color: "#33d7ff", upto: i, width: 1.6 },
      { data: maxSeries("dVOC"), color: "#e05cff", upto: i, width: 1.6 }],
      { title: "H₂ (cyan) et COV (magenta) — max des nœuds", ymin: 0, cursor: i, thresholds: [{ v: 2, color: "#ffb000", label: "canal B" }] });
    CH.line($("ch-temp"), t, mk("dTEMP"), { title: "TEMPÉRATURE — hausse (°C)", cursor: i,
      thresholds: [{ v: T.CH_C, color: "#ffb000", label: "canal C" }] });
    CH.line($("ch-ai"), t, [{ data: s.hall.p, color: "#f2f2f2", width: 2, upto: i }],
      { title: "SCORE IA FEU (hall) — rejeu d'un modèle qui n'a jamais vu cet essai", ymin: 0, ymax: 1, cursor: i,
        thresholds: [{ v: T.P_FIRE, color: "#ff2a2a", label: "feu 0,70" }, { v: T.P_NUIS, color: "#22d36b", label: "nuisance 0,30" }],
        vlines: [{ x: s.key_times.ssi_alarm, color: "#ff2a2a", label: "alarme SSI" },
                 { x: s.key_times.ai_fire, color: "#ffb000", label: "verdict IA feu" }] });
  }

  function renderForecast(i) {
    const s = scn(), tw = twinState(i), H = HALL.size.height;
    const status = $("fc-status"), cd = $("fc-countdown"), tbl = $("fc-table");
    if (!tw) {
      status.textContent = s.kind === "fire" ? "" : "Aucun feu confirmé — prévision inactive.";
      cd.innerHTML = '<span style="color:#6b7b86;font-size:16px">Utilisez « SIMULER UN DÉPART DE FEU MAINTENANT » pour tester le jumeau.</span>';
      tbl.innerHTML = ""; drawGauge(null); CH.line($("fc-chart"), [0, 600], [], { title: "HAUTEUR DE NAPPE (m)", ymin: 0, ymax: H });
      return;
    }
    if (!tw.active) {
      status.textContent = "Feu naissant en vérification (mesures réelles).";
      cd.innerHTML = `<span style="color:#ffb000;font-size:18px">Phase de croissance simulée dans ${mmss(-tw.tg)} (à la pré-alarme)</span>`;
      tbl.innerHTML = ""; drawGauge({ z: H, z60: H }); CH.line($("fc-chart"), [0, 600], [], { title: "HAUTEUR DE NAPPE (m)", ymin: 0, ymax: H });
      return;
    }
    const f = forecastAt(tw), sim = tw.sim;
    const untenNow = tw.z < 2 || tw.T > 60;
    const outDom = tw.T > 600;
    status.innerHTML = `Croissance « ${st.p.alpha} » depuis ${mmss(tw.tg)} · puissance ${(tw.q / 1000).toFixed(1)} MW` +
      (outDom ? ' · <span style="color:#ff2a2a">HORS DOMAINE (embrasement généralisé)</span>' : "");
    if (untenNow) cd.innerHTML = '<span style="color:#ff2a2a">CONDITIONS INTENABLES DANS LE HALL</span>';
    else {
      const prudent = Math.max(0, f.t_unt - FC.mae_time_to_untenable_s);
      const col = prudent < 120 ? "#ff2a2a" : "#ffb000";
      cd.innerHTML = f.t_unt >= SUR.t_unt_cap_s - 1 ? '<span style="color:#22d36b">Pas de conditions intenables prévues (15 min)</span>'
        : `<span style="color:${col}">CONDITIONS INTENABLES DANS ≈ ${mmss(prudent)}</span> <span style="font-size:13px;color:#6b7b86">(prudent : prévision − ${Math.round(FC.mae_time_to_untenable_s)} s)</span>`;
    }
    const j30 = Math.min(tw.j + 30, sim.z.length - 1), j60 = Math.min(tw.j + 60, sim.z.length - 1);
    const ref = st.p.ref;
    tbl.innerHTML = `<tr><th></th><th>maintenant</th><th>+30 s (IA)</th><th>+60 s (IA)</th>${ref ? "<th>+60 s (réf. physique)</th>" : ""}</tr>
      <tr><td>hauteur de nappe</td><td>${tw.z.toFixed(2)} m</td><td>${f.z30.toFixed(2)} m</td><td>${f.z60.toFixed(2)} m</td>${ref ? `<td>${sim.z[j60].toFixed(2)} m</td>` : ""}</tr>
      <tr><td>température nappe</td><td>${tw.T.toFixed(0)} °C</td><td>${f.T30.toFixed(0)} °C</td><td>${f.T60.toFixed(0)} °C</td>${ref ? `<td>${sim.t_upper[j60].toFixed(0)} °C</td>` : ""}</tr>
      <tr><td>incertitude (test)</td><td></td><td colspan="2">± ${FC.rmse_layer_height_t60_m.toFixed(2)} m · ± ${FC.rmse_temperature_t60_C.toFixed(0)} °C</td>${ref ? "<td></td>" : ""}</tr>`;
    drawGauge({ z: tw.z, z60: f.z60 });
    // chart in scenario time
    const t0 = growthStart(), span = 600;
    const tt = [], zz = [], zref = [];
    for (let k = 0; k <= span; k += 5) { tt.push(t0 + k); zz.push(k <= tw.tg ? sim.z[k] : null); zref.push(sim.z[k]); }
    const series = [{ data: zz, color: "#f2f2f2", width: 2 }];
    if (ref) series.push({ data: zref, color: "#6b7b86", width: 1, dash: [4, 4] });
    CH.line($("fc-chart"), tt, series, { title: "HAUTEUR DE NAPPE DE FUMÉE (m) — maintenant et prévision IA à +30 / +60 s", ymin: 0, ymax: H,
      thresholds: [{ v: 2, color: "#ff2a2a", label: "2 m : tête des personnes" }],
      points: [{ x: t0 + tw.tg + 30, y: f.z30, err: FC.rmse_layer_height_t60_m, color: "#33d7ff", label: "+30" },
               { x: t0 + tw.tg + 60, y: f.z60, err: FC.rmse_layer_height_t60_m, color: "#33d7ff", label: "+60" }] });
  }
  function drawGauge(g) {
    const { ctx, w, h } = CH.fit($("fc-gauge")); const H = HALL.size.height;
    ctx.fillStyle = "#070c10"; ctx.fillRect(0, 0, w, h);
    const top = 20, bot = h - 24, x0 = 26, x1 = w - 14;
    const Y = z => bot - (z / H) * (bot - top);
    ctx.strokeStyle = "#3a5463"; ctx.strokeRect(x0, top, x1 - x0, bot - top);
    if (g) {
      ctx.fillStyle = "rgba(110,115,120,0.75)"; ctx.fillRect(x0 + 1, top + 1, x1 - x0 - 2, Y(g.z) - top);
      ctx.strokeStyle = "#33d7ff"; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x0, Y(g.z60)); ctx.lineTo(x1, Y(g.z60)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#ff2a2a"; ctx.beginPath(); ctx.moveTo(x0, Y(2)); ctx.lineTo(x1, Y(2)); ctx.stroke();
    ctx.fillStyle = "#6b7b86"; ctx.font = "10px Consolas, monospace";
    for (let z = 0; z <= H; z += 2) ctx.fillText(z + "m", 2, Y(z) + 3);
    ctx.fillStyle = "#ff6060"; ctx.fillText("2 m", x1 - 22, Y(2) - 3);
    ctx.fillStyle = "#33d7ff"; ctx.fillText("+60 s", x0 + 3, g ? Y(g.z60) - 3 : top + 10);
    // person
    ctx.strokeStyle = "#f2f2f2"; const px = (x0 + x1) / 2, pb = bot; ctx.beginPath();
    ctx.arc(px, Y(1.7), 4, 0, 7); ctx.moveTo(px, Y(1.6)); ctx.lineTo(px, Y(0.9)); ctx.lineTo(px - 5, pb); ctx.moveTo(px, Y(0.9)); ctx.lineTo(px + 5, pb); ctx.stroke();
    ctx.fillStyle = "#6b7b86"; ctx.fillText("hall 8 m", x0, h - 8);
  }

  function renderWhy(i) {
    const s = scn(), drift = driftActive(i);
    const a = maxOver(i, "dPM", true), co = maxOver(i, "dCO", true), h2 = maxOver(i, "dH2", true),
      voc = maxOver(i, "dVOC", true), te = maxOver(i, "dTEMP", true);
    const gasRatio = Math.max(co / T.CH_B_CO, h2 / T.CH_B_H2, voc / T.CH_B_VOC);
    const rows = [
      ["A · PARTICULES (optique)", a / T.CH_A, s.hall.chA[i], `${a.toFixed(1)} log`],
      ["B · GAZ (CO, H₂, COV)", gasRatio, s.hall.chB[i], `CO ${co.toFixed(1)} · COV ${voc.toFixed(1)}`],
      ["C · CHALEUR", te / T.CH_C, s.hall.chC[i], `${te.toFixed(1)} °C`]];
    $("why-channels").innerHTML = rows.map(([n, r, on, v]) => `<div class="chan ${on ? "on" : ""}"><span>${n}</span>
      <span class="bar"><i style="width:${Math.min(100, Math.max(0, r) / 3 * 100)}%"></i><span class="thr"></span></span>
      <span class="st">${on ? "ACTIF" : "—"}</span></div><div style="padding:0 10px 4px 168px;color:#6b7b86;font-size:11px">${v}</div>`).join("") +
      (drift ? '<div style="padding:4px 10px;color:#ffb000;font-size:12px">Nœud 11 exclu du vote (dérive détectée)</div>' : "");
    CH.gauge($("why-gauge"), s.hall.p[i], { lo: T.P_NUIS, hi: T.P_FIRE });
    const top = (s.alerts[i] || []).find(x => /profil/.test(x.detail));
    $("why-profile").innerHTML = top ? "Profil reconnu : " + top.detail.split("profil : ")[1] : (s.hall.p[i] === null ? "Air normal : aucun canal actif." : "");
    const ssi = Object.values(s.ssi.zones).some(v => v[i]);
    const p = s.hall.p[i];
    const c = [["Alarme SSI (détecteur certifié)", ssi], ["Score IA ≥ 0,70", p !== null && p >= T.P_FIRE],
      ["Canal A particules", s.hall.chA[i]], ["Canal B gaz OU canal C chaleur", s.hall.chB[i] || s.hall.chC[i]]];
    const all = c.every(x => x[1]);
    const pre = !ssi && c.slice(1).every(x => x[1]);
    $("why-vote").innerHTML = c.map(([n, v]) => `<div class="${v ? "ok" : "ko"}">${v ? "✔" : "✖"} ${n}</div>`).join("") +
      `<div class="res" style="color:${all ? "#ff2a2a" : pre || ssi ? "#ffb000" : "#22d36b"}">→ ${all ? "ALERTE ROUGE : FEU CONFIRMÉ" : pre ? "AMBRE : PRÉ-ALARME IA" : ssi ? "AMBRE : LEVÉE DE DOUTE ASSISTÉE" : "PAS D'ALERTE ROUGE"}</div>
      <div style="color:#6b7b86;font-size:11px;line-height:1.4;margin-top:6px">L'IA ne peut jamais acquitter, réarmer, temporiser ni masquer une alarme SSI.</div>`;
    const imp = Object.entries(RES.verifier.feature_importance).map(([k, v]) => ({ label: FEAT_FR[k] || k, v: Math.max(v, 0), text: (v * 100).toFixed(1) + " pts" }));
    CH.hbars($("why-imp"), imp, {});
  }

  /* ---------- SSI page ---------- */
  function buildLinkSvg() {
    $("link-svg").innerHTML = `
      <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#22d36b"/></marker></defs>
      <rect x="6" y="40" width="120" height="70" fill="#160707" stroke="#ff2a2a"/><text x="66" y="68" fill="#f2f2f2" font-size="13" text-anchor="middle">ECS / SSI</text>
      <text x="66" y="86" fill="#6b7b86" font-size="10" text-anchor="middle">certifié EN 54</text>
      <line x1="126" y1="75" x2="196" y2="75" stroke="#22d36b" stroke-width="2" marker-end="url(#ar)"/>
      <text x="161" y="66" fill="#6b7b86" font-size="9" text-anchor="middle">relais libres</text>
      <rect x="198" y="48" width="104" height="54" fill="#0b1116" stroke="#33d7ff"/><text x="250" y="70" fill="#33d7ff" font-size="11" text-anchor="middle">optocoupleurs</text>
      <text x="250" y="86" fill="#6b7b86" font-size="9" text-anchor="middle">isolation 2,5-5 kV</text>
      <line x1="302" y1="75" x2="372" y2="75" stroke="#22d36b" stroke-width="2" marker-end="url(#ar)"/>
      <rect x="374" y="40" width="140" height="70" fill="#0b1116" stroke="#22d36b"/><text x="444" y="68" fill="#f2f2f2" font-size="12" text-anchor="middle">Aero-Fire DT</text>
      <text x="444" y="86" fill="#6b7b86" font-size="9" text-anchor="middle">passerelle edge (IA)</text>
      <path d="M444,112 C444,170 66,170 66,112" fill="none" stroke="#ff2a2a" stroke-dasharray="5,4"/>
      <text x="255" y="160" fill="#ff2a2a" font-size="13" text-anchor="middle">✖ AUCUNE VOIE DE RETOUR VERS LE SSI</text>
      <text x="255" y="182" fill="#6b7b86" font-size="10" text-anchor="middle">Modbus : lecture FC 01-04 seulement · écriture FC 05/06/15/16 désactivée</text>
      <text x="255" y="198" fill="#6b7b86" font-size="10" text-anchor="middle">raccordement par l'installateur agréé, consigné au dossier de sécurité</text>`;
  }
  function renderSSI(i) {
    const s = scn();
    const z = s.ssi.zones;
    const led = (cls, txt) => `<div class="led ${cls}"><i></i>${txt}</div>`;
    $("ecs-leds").innerHTML = led(z.A[i] ? "on" : "", "FEU ZONE A") + led(z.B[i] ? "on" : "", "FEU ZONE B") +
      led(z.C[i] ? "on" : "", "FEU ZONE C") + led(s.ssi.fire[i] ? "on" : "", "ALARME GÉNÉRALE") +
      led("amb", "DÉRANGEMENT : non") + led("ok", "SOUS TENSION") +
      `<div style="grid-column:1/3;color:#6b7b86;font-size:11px;margin-top:6px">SSI simulé : détecteur optique ponctuel par zone (seuil particules). Les alarmes restent verrouillées jusqu'au réarmement par l'exploitant.</div>`;
    const lines = ['<span class="blk">FC05/FC06/FC15/FC16 (ÉCRITURE) : DÉSACTIVÉES PAR CONCEPTION — AUCUNE VOIE DE RETOUR</span>'];
    const from = Math.max(0, i - 40);
    let prev = null;
    for (let k = from; k <= i; k++) {
      const v = `A=${z.A[k]} B=${z.B[k]} C=${z.C[k]} GEN=${s.ssi.fire[k]} DER=0`;
      lines.push(`T${s.t[k] >= 0 ? "+" : ""}${mmss(s.t[k]).padStart(6)}  FC03 READ 40001-40005 → ${v}`);
      if (prev !== null && prev !== v) lines.push(`         → ÉVÉNEMENT LU : changement d'état relais (${v})`);
      prev = v;
    }
    $("modbus-log").innerHTML = lines.join("\n");
    $("modbus-log").scrollTop = 1e9;
  }

  /* ---------- pages ---------- */
  function showPage(p, manual) {
    st.page = p;
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.page === p));
    document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === "page-" + p));
    if (manual) st.manualUntil = performance.now() + 30000;
    requestAnimationFrame(() => render(true));
  }
  document.querySelectorAll("#tabs button").forEach(b => { b.onclick = () => showPage(b.dataset.page, true); });
  $("auto-page").onclick = () => { st.auto = !st.auto; $("auto-page").classList.toggle("off", !st.auto); };

  /* ---------- controls ---------- */
  $("btn-play").onclick = () => { st.playing = !st.playing; $("btn-play").textContent = st.playing ? "❚❚" : "▶"; };
  $("speed").onchange = e => { st.speed = +e.target.value; };
  $("scrub").oninput = e => { st.i = +e.target.value; render(true); };
  $("btn-hotwork").onclick = () => {
    st.hot = !st.hot; $("btn-hotwork").classList.toggle("on", st.hot);
    $("btn-hotwork").textContent = "PERMIS DE FEU ZONE C : " + (st.hot ? "ON" : "OFF"); render(true);
  };
  const bindRange = (id, key, fmtv, out) => { $(id).oninput = e => { st.p[key] = +e.target.value; if (out) $(out).textContent = fmtv(st.p[key]); render(true); }; };
  $("p-alpha").onchange = e => { st.p.alpha = e.target.value; render(true); };
  bindRange("p-qmax", "qmax", v => (v / 1000).toFixed(1) + " MW", "v-qmax");
  bindRange("p-vent", "vent", v => v + " m²", "v-vent");
  bindRange("p-tamb", "tamb", v => v + " °C", "v-tamb");
  $("p-door").onchange = e => { st.p.door = +e.target.value; render(true); };
  $("p-ref").onchange = e => { st.p.ref = e.target.checked; render(true); };
  $("btn-whatif").onclick = () => { st.whatIf = scn().t[st.i]; showPage("forecast", true); };
  $("btn-results").onclick = () => { renderResults(); $("results-modal").classList.remove("hidden"); };
  $("btn-close-results").onclick = () => $("results-modal").classList.add("hidden");

  function renderResults() {
    const v = RES.verifier, f = RES.forecast, cs = v.cross_site;
    $("results-body").innerHTML = `
      <p class="note">Jeu de données public « Indoor Fire Dataset with Distributed Multi-Sensor Nodes » (hall industriel 10×22×8 m, Mendeley, CC BY 4.0).
      Validation « leave-one-episode-out » : chaque essai est jugé par un modèle qui ne l'a jamais vu.</p>
      <table><tr><th>Vérification d'alarme (hall industriel)</th><th>IA Aero-Fire DT</th><th>Détecteur optique classique</th></tr>
      <tr><td>Feux détectés</td><td class="good">${v.fires[0]}/${v.fires[1]}</td><td>${v.fires[1]}/${v.fires[1]}</td></tr>
      <tr><td>Essais de nuisance rejetés</td><td class="good">${v.nuisances_rejected[0]}/${v.nuisances_rejected[1]}</td><td>${v.optical_nuisances_rejected[0]}/${v.optical_nuisances_rejected[1]}</td></tr>
      <tr><td>Fausses alarmes du détecteur classique reconnues comme nuisance</td><td class="good">${v.panel_false_alarms_flagged}/${v.panel_false_alarms}</td><td>—</td></tr>
      <tr><td>Feux confirmés avant l'alarme du détecteur / dans les 60 s</td><td class="good">${v.fires_ai_before_panel}/${v.fires[1]} · ${v.fires_ai_within_60s}/${v.fires[1]}</td><td>—</td></tr>
      <tr><td>Fausses alertes sur ${v.background_hours} h d'activité normale</td><td>${v.background_ai_events}</td><td>${v.background_optical_events}</td></tr>
      <tr><td>Précision équilibrée par mesure</td><td>${(v.row_balanced_accuracy * 100).toFixed(1)} %</td><td></td></tr></table>
      <table><tr><th>Test sur un autre site (salle d'essai EN 54, jamais vue)</th><th>IA</th></tr>
      <tr><td>Feux confirmés</td><td>${cs.fires[0]}/${cs.fires[1]} (le feu non confirmé reste signalé par le SSI)</td></tr>
      <tr><td>Nuisances rejetées</td><td class="good">${cs.nuisances_rejected[0]}/${cs.nuisances_rejected[1]}</td></tr>
      <tr><td>Précision équilibrée par mesure</td><td>${(cs.row_balanced_accuracy * 100).toFixed(1)} %</td></tr></table>
      <table><tr><th>Prévision 30-60 s (5 000 feux simulés, scénarios jamais vus)</th><th>IA de substitution</th><th>Sans IA (« rien ne change »)</th></tr>
      <tr><td>Erreur hauteur de nappe à +60 s</td><td class="good">± ${f.rmse_layer_height_t60_m.toFixed(2)} m</td><td>± ${f.persistence_baseline_rmse_layer_height_t60_m.toFixed(2)} m</td></tr>
      <tr><td>Erreur température à +60 s</td><td class="good">± ${f.rmse_temperature_t60_C.toFixed(1)} °C</td><td>± ${f.persistence_baseline_rmse_temperature_t60_C.toFixed(1)} °C</td></tr>
      <tr><td>Erreur moyenne sur le temps avant conditions intenables</td><td>${f.mae_time_to_untenable_s.toFixed(0)} s</td><td></td></tr>
      <tr><td>Alerte « intenable dans 60 s » correcte</td><td>${(f.untenable_within_60s_accuracy * 100).toFixed(1)} %</td><td></td></tr>
      <tr><td>Temps de calcul</td><td>${f.surrogate_ms_per_forecast.toFixed(2)} ms</td><td>modèle physique : ${f.zone_model_ms_per_900s_run.toFixed(1)} ms</td></tr></table>
      <p class="note">Limites : 1 à 3 répétitions par type de nuisance (la soudure et la machine à fumée trompent encore l'IA) ;
      nœuds et SSI simulés ; feux d'essai naissants — le développement est une hypothèse du modèle de zones. Le gain réel sera mesuré pendant le pilote de 90 jours.</p>`;
  }

  /* ---------- playback loop ---------- */
  let last = performance.now();
  function tick(now) {
    const dt = (now - last) / 1000; last = now;
    if (st.playing && !st.video) {
      st.acc += dt * st.speed / 10;
      let moved = false;
      while (st.acc >= 1) { st.acc -= 1; if (st.i < scn().t.length - 1) { st.i++; moved = true; } else { st.playing = false; $("btn-play").textContent = "▶"; } }
      if (moved) render(false);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- video mode (≈ 60 s guided tour for the screen recording) ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let videoToken = 0;
  function caption(txt) { const c = $("caption"); if (!txt) { c.style.display = "none"; return; } c.textContent = txt; c.style.display = "block"; }
  async function playRange(k, fromT, toT, binsPerSec, token) {
    if (st.k !== k) setScenario(k, false);
    const s = scn();
    st.i = Math.max(0, s.t.findIndex(v => v >= fromT));
    render(true);
    const end = s.t.findIndex(v => v >= toT);
    while (st.i < (end < 0 ? s.t.length - 1 : end)) {
      if (token !== videoToken) return false;
      await sleep(1000 / binsPerSec);
      st.i++; render(false);
    }
    return token === videoToken;
  }
  async function runVideo() {
    const token = ++videoToken; st.video = true; document.body.classList.add("video");
    $("btn-video").classList.add("on"); $("btn-video").textContent = "ARRÊTER VIDÉO";
    $("results-modal").classList.add("hidden");
    const steps = [
      async () => { setScenario(0, false); showPage("zone", false); caption("Poste de sécurité d'une usine : écran sombre = tout va bien."); await sleep(3500); return token === videoToken; },
      async () => { caption("Un feu réel démarre (mesures réelles d'un hall industriel)."); return playRange(0, 250, 400, 4, token); },
      async () => { caption("L'IA croise particules + gaz : pré-alarme… avant le détecteur officiel."); return playRange(0, 400, 560, 4, token); },
      async () => { caption("Le SSI sonne : 2 principes physiques concordent → FEU CONFIRMÉ (logique double boucle, comme un moteur d'avion)."); return playRange(0, 560, 640, 3, token); },
      async () => { showPage("forecast", false); caption("Le jumeau prévoit la fumée à +60 s et le temps avant conditions intenables."); await sleep(5000); return token === videoToken; },
      async () => { caption("Autre cas : un aérosol déclenche le SSI… l'IA reconnaît une nuisance (essai jamais vu)."); showPage("why", false); return playRange(1, 40, 120, 2.5, token); },
      async () => { showPage("ssi", false); caption("L'alarme SSI reste maintenue : lecture seule, aucune voie de retour. L'opérateur décide."); await sleep(4500); return token === videoToken; },
      async () => { showPage("sensors", false); caption("Moteur thermique dans le hall : pas de feu, mais CO élevé → alerte santé."); return playRange(2, 10, 80, 2.5, token); },
      async () => { showPage("zone", false); caption("Un capteur dérive ? Détecté, exclu du vote : mode dégradé signalé."); return playRange(3, 600, 700, 4, token); },
      async () => { caption("Aero-Fire DT — lecture seule, jamais d'inhibition. Résultats mesurés sur données réelles :"); renderResults(); $("results-modal").classList.remove("hidden"); await sleep(6500); return token === videoToken; },
    ];
    for (const step of steps) { if (!(await step())) break; }
    stopVideo();
  }
  function stopVideo() {
    if (!st.video) return;
    videoToken++; st.video = false; document.body.classList.remove("video"); caption(null);
    $("btn-video").classList.remove("on"); $("btn-video").textContent = "MODE VIDÉO"; renderStory();
  }
  $("btn-video").onclick = () => { if (st.video) stopVideo(); else runVideo(); };

  /* ---------- start ---------- */
  buildLinkSvg();
  setScenario(0, true);
  requestAnimationFrame(tick);
  window.addEventListener("resize", () => render(true));
  window.AFDT_APP = { st, twin, setScenario, showPage, render, seekT: t => { st.i = Math.max(0, scn().t.findIndex(v => v >= t)); render(false); }, runVideo, stopVideo };
})();
