"""Convert Team_Report.md and AI_Model_Report.md into styled HTML pages (docs/livrables/pdf_src).
Then run: node tools/print_pdfs.js
"""
import re
from pathlib import Path
import markdown

ROOT = Path(__file__).resolve().parents[1]
LIV = ROOT / "docs" / "livrables"
SRC = LIV / "pdf_src"

PAGES = [
    # 05_compte_rendu: written by the team (05_compte_rendu.tpl.html), not generated
    ("AI_Model_Report.md", "06_rapport_ia.html", "RAPPORT DU MODÈLE IA", "Architecture, choix du modèle, données, résultats",
     "Vérificateur d'alarme (feu / nuisance), vote de sécurité à deux canaux, alerte précoce, prévision à 60 s, apprentissage local."),
]

COVER = """<div class="cover"><img class="cflame" src="img/flame.png" alt="">
<div class="tag">{tag} · AERO-FIRE DT</div><h1>{title}</h1><div class="slogan">PRÉDICTION · PRÉVENTION · PROTECTION</div><div class="sub">{sub}</div>
<div class="meta"><span>Challenge <b>Aero-Entrepreneur</b> · Tunisian Aeroday 2026</span><span>Partenaire du challenge : <b>Protection Civile</b></span>
<span><b>22 novembre 2026</b></span><span>Code : <b>github.com/AhmedHammouda5000/aero-fire-dt</b></span></div></div>"""

for md_name, html_name, tag, title, sub in PAGES:
    text = (LIV / md_name).read_text(encoding="utf-8")
    text = re.sub(r"^# .*\n", "", text, count=1)                    # title -> cover
    text = re.sub(r"^\*Livrable[^\n]*\*\n", "", text, flags=re.M)  # internal note line
    text = re.sub(r"^## \d+\.\s*Limites[^\n]*\n.*?(?=^## |\Z)", "", text, flags=re.M | re.S)  # no limits section in the PDF
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    body = re.sub(r"<h2>(\d+)\.\s*", r'<h2><span class="n">\1</span>', body)  # numbered headings
    html = (f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aero-Fire DT — {tag.title()}</title>'
            f'<link rel="stylesheet" href="brand.css"></head><body class="doc">'
            + COVER.format(tag=tag, title=title.upper() if len(title) < 30 else title, sub=sub) + body + "</body></html>")
    (SRC / html_name).write_text(html, encoding="utf-8")
    print("written", html_name, len(html) // 1024, "KB")
