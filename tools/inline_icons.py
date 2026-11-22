"""Expand [[icon:NAME:COLOR:SIZE]] in docs/livrables/pdf_src/*.tpl.html into inline Lucide SVGs (ISC licence).
Writes the matching .html next to each template. Run before tools/print_pdfs.js.
"""
import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "docs" / "livrables" / "pdf_src"
ICONS = SRC / "icons"


def icon(m):
    name, color, size = m.group(1), m.group(2) or "currentColor", m.group(3) or "48"
    svg = (ICONS / f"{name}.svg").read_text(encoding="utf-8")
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S).strip()
    svg = re.sub(r'width="\d+"', f'width="{size}"', svg, count=1)
    svg = re.sub(r'height="\d+"', f'height="{size}"', svg, count=1)
    svg = svg.replace('stroke="currentColor"', f'stroke="{color}"').replace('class="lucide', 'class="ico lucide')
    return re.sub(r"\s+", " ", svg)


for tpl in SRC.glob("*.tpl.html"):
    out = re.sub(r"\[\[icon:([\w-]+):?([#\w]*):?(\d*)\]\]", icon, tpl.read_text(encoding="utf-8"))
    (SRC / tpl.name.replace(".tpl.html", ".html")).write_text(out, encoding="utf-8")
    print("built", tpl.name.replace(".tpl.html", ".html"))
