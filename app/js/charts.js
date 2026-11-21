/* Aero-Fire DT — tiny canvas chart helpers (no external library). */
(function (root) {
  const C = { green: "#22d36b", amber: "#ffb000", red: "#ff2a2a", cyan: "#33d7ff",
    magenta: "#e05cff", white: "#f2f2f2", dim: "#6b7b86", grid: "#16222b", bg: "#070c10" };

  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.floor(r.width)), h = Math.max(10, Math.floor(r.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  /* series: [{data:[...], color, width, dash}] aligned with t (seconds); cursor = index */
  function line(canvas, t, series, opt) {
    const { ctx, w, h } = fit(canvas);
    const m = { l: 46, r: 10, t: 22, b: 22 };
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const x0 = t[0], x1 = t[t.length - 1];
    let ymin = opt.ymin, ymax = opt.ymax;
    if (ymin === undefined || ymax === undefined) {
      let lo = Infinity, hi = -Infinity;
      series.forEach(s => s.data.forEach(v => { if (v !== null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (ymin === undefined) ymin = lo;
      if (ymax === undefined) ymax = hi === lo ? lo + 1 : hi + 0.08 * (hi - lo);
    }
    const X = v => m.l + (v - x0) / (x1 - x0 || 1) * (w - m.l - m.r);
    const Y = v => h - m.b - (v - ymin) / (ymax - ymin || 1) * (h - m.t - m.b);
    // grid
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.font = "10px Consolas, monospace"; ctx.fillStyle = C.dim;
    for (let k = 0; k <= 4; k++) {
      const v = ymin + (ymax - ymin) * k / 4, y = Y(v);
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillText(fmt(v), 4, y + 3);
    }
    const step = niceStep((x1 - x0) / 6);
    for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) {
      const x = X(v);
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
      ctx.fillText(mmss(v), x - 14, h - 6);
    }
    (opt.bands || []).forEach(b => { ctx.fillStyle = b.color; ctx.fillRect(X(b.x0), m.t, X(b.x1) - X(b.x0), h - m.t - m.b); });
    (opt.thresholds || []).forEach(th => {
      ctx.strokeStyle = th.color; ctx.setLineDash([5, 4]); ctx.beginPath();
      ctx.moveTo(m.l, Y(th.v)); ctx.lineTo(w - m.r, Y(th.v)); ctx.stroke(); ctx.setLineDash([]);
      if (th.label) { ctx.fillStyle = th.color; ctx.fillText(th.label, w - m.r - ctx.measureText(th.label).width - 2, Y(th.v) - 3); }
    });
    series.forEach(s => {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.4; ctx.setLineDash(s.dash || []);
      ctx.beginPath(); let pen = false;
      const n = Math.min(s.data.length, s.upto === undefined ? s.data.length : s.upto + 1);
      for (let i = 0; i < n; i++) {
        const v = s.data[i];
        if (v === null || !isFinite(v)) { pen = false; continue; }
        const x = X(t[i]), y = Y(Math.min(Math.max(v, ymin), ymax));
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    });
    (opt.points || []).forEach(p => {
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      const x = X(p.x), y = Y(p.y);
      if (p.err) { ctx.beginPath(); ctx.moveTo(x, Y(p.y - p.err)); ctx.lineTo(x, Y(p.y + p.err)); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      if (p.label) ctx.fillText(p.label, x + 6, y - 6);
    });
    if (opt.cursor !== undefined && opt.cursor !== null) {
      const x = X(t[opt.cursor]);
      ctx.strokeStyle = C.white; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke(); ctx.globalAlpha = 1;
    }
    (opt.vlines || []).forEach(vl => {
      if (vl.x === null || vl.x === undefined) return;
      const x = X(vl.x); ctx.strokeStyle = vl.color; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = vl.color; ctx.fillText(vl.label, x + 3, m.t + 10);
    });
    ctx.fillStyle = C.white; ctx.font = "12px Consolas, monospace";
    ctx.fillText(opt.title || "", m.l, 14);
  }

  function hbars(canvas, items, opt) {
    const { ctx, w, h } = fit(canvas);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const max = Math.max(...items.map(i => i.v), 1e-9);
    const rowH = Math.min(26, (h - 10) / items.length);
    ctx.font = "11px Consolas, monospace";
    items.forEach((it, k) => {
      const y = 6 + k * rowH;
      ctx.fillStyle = C.dim; ctx.fillText(it.label, 8, y + rowH * 0.65);
      const bx = 150, bw = (w - bx - 50) * it.v / max;
      ctx.fillStyle = it.color || C.cyan; ctx.fillRect(bx, y + 4, bw, rowH - 8);
      ctx.fillStyle = C.white; ctx.fillText(it.text || fmt(it.v), bx + bw + 4, y + rowH * 0.65);
    });
  }

  function gauge(canvas, value, opt) {
    const { ctx, w, h } = fit(canvas);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.78, r = Math.min(w * 0.42, h * 0.65);
    const a0 = Math.PI, a1 = 2 * Math.PI;
    const arc = (from, to, color, lw) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      ctx.arc(cx, cy, r, a0 + from * Math.PI, a0 + to * Math.PI); ctx.stroke(); };
    arc(0, opt.lo, "#1d4d33", 14); arc(opt.lo, opt.hi, "#4d401d", 14); arc(opt.hi, 1, "#4d1d1d", 14);
    if (opt.masked) {  // certified SSI in alarm: no confidence number shown to the operator
      ctx.fillStyle = C.amber; ctx.font = "bold 16px Consolas, monospace"; ctx.textAlign = "center";
      ctx.fillText("ALARME SSI EN COURS", cx, cy - r * 0.38);
      ctx.font = "12px Consolas, monospace"; ctx.fillStyle = C.dim;
      ctx.fillText("score masqué : appliquer la procédure", cx, cy - r * 0.38 + 20);
      ctx.textAlign = "left"; return;
    }
    if (value !== null && value !== undefined) {
      const a = a0 + Math.min(Math.max(value, 0), 1) * Math.PI;
      ctx.strokeStyle = C.white; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); ctx.stroke();
    }
    ctx.fillStyle = value === null || value === undefined ? C.dim : value >= opt.hi ? C.red : value <= opt.lo ? C.green : C.amber;
    ctx.font = "bold 22px Consolas, monospace"; ctx.textAlign = "center";
    ctx.fillText(value === null || value === undefined ? "—" : value.toFixed(2), cx, cy - r * 0.3);
    ctx.font = "11px Consolas, monospace"; ctx.fillStyle = C.dim;
    ctx.fillText("nuisance", cx - r, cy + 16); ctx.fillText("feu", cx + r, cy + 16);
    ctx.textAlign = "left";
  }

  function fmt(v) { const a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2); }
  function niceStep(raw) { const s = [30, 60, 120, 180, 300, 600, 900, 1800]; return s.find(x => x >= raw) || 3600; }
  function mmss(s) { const sg = s < 0 ? "-" : ""; s = Math.abs(Math.round(s)); return sg + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

  root.AFDT_Charts = { line, hbars, gauge, fit, mmss, C };
})(window);
