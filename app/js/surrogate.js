/* Aero-Fire DT — forecast surrogate (small MLP) running live in the browser.
 * Model weights: app/data/surrogate_data.js (window.AFDT_SURROGATE), exported by
 * ai/forecast/train_surrogate.py. Plain script (no modules) so the page works from file://.
 */
(function (root) {
  function forward(model, x) {
    let h = x.map((v, i) => (v - model.x_mean[i]) / model.x_scale[i]);
    for (const layer of model.layers) {
      const out = new Array(layer.b.length);
      for (let o = 0; o < layer.b.length; o++) {
        let s = layer.b[o];
        const w = layer.W[o];
        for (let i = 0; i < h.length; i++) s += w[i] * h[i];
        out[o] = layer.activation === "relu" ? Math.max(0, s) : s;
      }
      h = out;
    }
    return h.map((v, i) => v * model.y_scale[i] + model.y_mean[i]);
  }

  /* Convenience wrapper: named inputs -> named, clipped outputs. */
  function forecast(model, s) {
    const x = [Math.log(s.area), s.height, s.door_width, s.door_height, s.roof_vent,
      Math.log(s.alpha), Math.log(s.q_max), s.t_amb, s.t_obs, s.z_obs, s.T_obs, s.dz10, s.dT10];
    const y = forward(model, x);
    const H = s.height;
    return {
      z30: Math.min(H, Math.max(0, y[0])), z60: Math.min(H, Math.max(0, y[1])),
      T30: Math.max(s.t_amb, y[2]), T60: Math.max(s.t_amb, y[3]),
      t_unt: Math.min(model.t_unt_cap_s, Math.max(0, y[4])),
    };
  }

  const api = { forward, forecast };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AFDT_Surrogate = api;
})(typeof window !== "undefined" ? window : globalThis);
