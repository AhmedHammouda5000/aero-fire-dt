/* Aero-Fire DT — alarm verifier running in the browser (free-test bench).
 * Same model (exported HistGradientBoosting trees), same 19 causal features and same hall-level voting
 * logic as the Python code (ai/common/data.py, ai/alarm_verifier/verifier.py). */
(function (root) {
  "use strict";
  function predict(model, x) {
    let raw = model.baseline;
    for (const t of model.trees) {
      let n = 0;
      while (!t.leaf[n]) {
        const v = x[t.f[n]];
        n = (Number.isNaN(v) ? t.mleft[n] : v <= t.t[n]) ? t.l[n] : t.r[n];
      }
      raw += t.v[n];
    }
    return 1 / (1 + Math.exp(-raw));
  }

  /* features of one node from its 10 s history (arrays of raw sensor values, baseline = clean-air start) */
  function features(h, base) {
    const n = h.CO.length - 1, k = Math.max(0, n - 6);
    const d = key => h[key][n] - base[key];
    const sl = key => h[key][n] - h[key][k];
    const pos = v => Math.max(v, 0);
    const logPM = Math.log1p(pos(d("PMTOT"))), logPM05 = Math.log1p(pos(d("PM05")));
    const gas = pos(d("CO")) + 0.5 * pos(d("H2"));
    return [
      d("CO"), d("H2"), d("VOC"), d("CO2"), d("TEMP"), d("HUM"),
      logPM, logPM05, Math.log1p(pos(d("PM25"))), Math.log1p(pos(d("PM10"))) - logPM05, h.PMSIZE[n],
      sl("CO"), sl("H2"), sl("VOC"), sl("PMTOT"), sl("TEMP"), sl("CO2"),
      Math.log1p(gas) - 0.25 * logPM, Math.log1p(pos(d("VOC"))) - 0.25 * logPM,
    ];
  }

  /* hall-level fusion + verdict state machine (identical rules to verifier.hall_timeline) */
  class HallVoter {
    constructor(settings) { this.S = settings; this.ema = NaN; this.runF = 0; this.runN = 0; this.latched = false; }
    step(nodes) {   // nodes: [{p, logPM, dCO, dH2, dVOC, dTEMP}]
      const S = this.S;
      const ch = n => ({ A: n.logPM > S.CH_A_PM, B: n.dCO > S.CH_B_CO || n.dH2 > S.CH_B_H2 || n.dVOC > S.CH_B_VOC, C: n.dTEMP > S.CH_C_TEMP });
      const act = nodes.map(n => Object.assign({}, n, ch(n))).filter(n => n.A || n.B);
      const chA = nodes.some(n => n.logPM > S.CH_A_PM), chB = nodes.some(n => ch(n).B), chC = nodes.some(n => n.dTEMP > S.CH_C_TEMP);
      let p = null, verdict;
      if (!act.length) { this.ema = NaN; this.runF = this.runN = 0; verdict = this.latched ? "FIRE" : "NORMAL"; }
      else {
        act.forEach(n => { n.int = n.logPM + 2 * Math.log1p(Math.max(n.dCO, 0) + Math.max(n.dH2, 0)); });
        act.sort((a, b) => b.int - a.int);
        const top = act.slice(0, 3), praw = top.reduce((a, n) => a + n.p, 0) / top.length;
        this.ema = Number.isNaN(this.ema) ? praw : S.EMA * praw + (1 - S.EMA) * this.ema; p = this.ema;
        const dual = chA && (chB || chC);
        this.runF = p >= S.P_FIRE && dual ? this.runF + 1 : 0;
        this.runN = p <= S.P_NUIS ? this.runN + 1 : 0;
        if (this.runF >= S.CONFIRM_BINS) this.latched = true;
        verdict = this.latched ? "FIRE" : this.runN >= S.CONFIRM_BINS ? "NUISANCE" : "UNCERTAIN";
      }
      return { p, verdict, chA, chB, chC, active: act.length };
    }
  }

  const api = { predict, features, HallVoter };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AFDT_Verifier = api;
})(typeof window !== "undefined" ? window : globalThis);
