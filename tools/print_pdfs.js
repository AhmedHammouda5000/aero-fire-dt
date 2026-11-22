// Print the deliverable HTML pages (docs/livrables/pdf_src) to PDF with headless Chrome.
// Run: node tools/print_pdfs.js [name ...]   (no name = all)
// Output: docs/livrables/pdf/ and ../Aero-Fire-DT-v2/PDF/ (folder uploaded to the team Drive).
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs");
const root = path.resolve(__dirname, "..");
const src = path.join(root, "docs", "livrables", "pdf_src");
const outs = [path.join(root, "docs", "livrables", "pdf"), path.resolve(root, "..", "Aero-Fire-DT-v2", "PDF")];
const DOCS = [
  { html: "01_recapitulatif.html", pdf: "01_Fichier_Recapitulatif_Aero-Fire-DT.pdf", a4: true },
  { html: "02_pitch.html", pdf: "02_Presentation_Pitch_Aero-Fire-DT.pdf", a4: false },
  { html: "03_bmc.html", pdf: "03_BMC_Aero-Fire-DT.pdf", a4: false, w: "1440px", h: "810px", single: true },
  { html: "04_empathie.html", pdf: "04_Carte_Empathie_Aero-Fire-DT.pdf", a4: false, w: "1440px", h: "1080px", single: true },
  { html: "05_compte_rendu.html", pdf: "05_Compte_Rendu_Equipe_Aero-Fire-DT.pdf", a4: true },
  { html: "06_rapport_ia.html", pdf: "06_Rapport_Modele_IA_Aero-Fire-DT.pdf", a4: true },
];
const footer = `<div style="width:100%;font-family:Consolas,monospace;font-size:7px;color:#6b7b88;padding:0 14mm;display:flex;justify-content:space-between">
  <span>AERO-FIRE DT · Challenge Aero-Entrepreneur · Tunisian Aeroday 2026</span>
  <span>github.com/AhmedHammouda5000/aero-fire-dt · <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;
(async () => {
  const only = process.argv.slice(2);
  outs.forEach(o => fs.mkdirSync(o, { recursive: true }));
  const b = await chromium.launch({ channel: "chrome", headless: true });
  for (const d of DOCS) {
    if (only.length && !only.some(n => d.html.includes(n))) continue;
    const file = path.join(src, d.html);
    if (!fs.existsSync(file)) { console.log("skip (missing)", d.html); continue; }
    const p = await b.newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("requestfailed", r => errs.push("failed: " + r.url()));
    await p.goto("file:///" + file.split(path.sep).join("/"), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    const opt = d.a4
      ? { format: "A4", landscape: !!d.landscape, printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: footer,
          margin: d.landscape ? { top: "9mm", bottom: "11mm", left: "9mm", right: "9mm" } : { top: "12mm", bottom: "14mm", left: "14mm", right: "14mm" } }
      : { width: d.w || "1280px", height: d.h || "720px", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, ...(d.single ? { pageRanges: "1" } : {}) };
    const buf = await p.pdf(opt);
    for (const o of outs) fs.writeFileSync(path.join(o, d.pdf), buf);
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`${d.pdf}  ${(buf.length / 1024).toFixed(0)} KB  ${pages} pages${errs.length ? "  ERR " + errs.join(" | ") : ""}`);
    await p.close();
  }
  await b.close();
})();
