"""Download CC0 3D assets from Poly Haven, shrink textures, pack each model into one GLB and
embed everything as base64 in app/data/assets_data.js (the dashboard must work offline from
file://, where browsers block fetch/XHR and cross-origin textures).

All assets: Poly Haven (https://polyhaven.com), licence CC0 1.0 (public domain).
Usage: python tools/build_assets.py
"""
from __future__ import annotations

import base64
import io
import json
import struct
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data_raw" / "assets"          # gitignored download cache
OUT_JS = ROOT / "app" / "data" / "assets_data.js"
CREDITS = ROOT / "app" / "data" / "ASSETS_CREDITS.md"
API = "https://api.polyhaven.com/files/"
UA = {"User-Agent": "aero-fire-dt-asset-builder"}

MODELS = {  # id -> max texture size (px)
    "steel_frame_shelves_01": 512,
    "cardboard_box_01": 512,
    "portable_welding_cart": 512,
    "korean_fire_extinguisher_01": 256,
    "Barrel_01": 512,
    "hanging_industrial_lamp": 256,
}
GREYSCALE = {"box_profile_metal_sheet"}
TEXTURES = {  # id -> (maps, size)
    "concrete_floor_worn_001": (["diff", "nor_gl", "arm"], 1024),
    "box_profile_metal_sheet": (["diff", "nor_gl", "arm"], 1024),
}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def cached(url: str, name: str) -> bytes:
    p = CACHE / name
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(get(url))
    return p.read_bytes()


def shrink_jpg(data: bytes, size: int, quality: int = 82) -> bytes:
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if max(im.size) > size:
        im.thumbnail((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True)
    return buf.getvalue()


def pack_glb(gltf: dict, bin_data: bytes, images: dict[str, bytes]) -> bytes:
    """Move the external .bin and images into a single binary GLB buffer."""
    blob = bytearray(bin_data)
    views = gltf.setdefault("bufferViews", [])
    for img in gltf.get("images", []):
        uri = img.pop("uri")
        data = images[uri]
        while len(blob) % 4:
            blob += b"\0"
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data)})
        blob += data
        img["bufferView"] = len(views) - 1
        img["mimeType"] = "image/jpeg"
    while len(blob) % 4:
        blob += b"\0"
    gltf["buffers"] = [{"byteLength": len(blob)}]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))


def build_model(mid: str, size: int) -> bytes:
    files = json.loads(get(API + mid))
    g = files["gltf"]["1k"]["gltf"]
    gltf = json.loads(cached(g["url"], f"{mid}/{mid}.gltf"))
    inc = g["include"]
    bin_rel = next(k for k in inc if k.endswith(".bin"))
    bin_data = cached(inc[bin_rel]["url"], f"{mid}/{bin_rel}")
    images = {}
    for img in gltf.get("images", []):
        raw = cached(inc[img["uri"]]["url"], f"{mid}/{img['uri']}")
        images[img["uri"]] = shrink_jpg(raw, size)
    return pack_glb(gltf, bin_data, images)


def build_texture(tid: str, maps: list[str], size: int) -> dict[str, str]:
    files = json.loads(get(API + tid))
    out = {}
    for m in maps:
        key = m.replace("_gl", "")
        res = files[{"diff": "Diffuse", "nor_gl": "nor_gl", "arm": "arm"}[m]]["1k"]["jpg"]
        raw = cached(res["url"], f"{tid}/{m}_1k.jpg")
        data = shrink_jpg(raw, size)
        if tid in GREYSCALE and m == "diff":   # red cladding -> neutral steel grey
            im = Image.open(io.BytesIO(data)).convert("L")
            im = Image.merge("RGB", [im.point(lambda v: int(v * 0.92)), im.point(lambda v: int(v * 0.97)), im])
            buf = io.BytesIO(); im.save(buf, "JPEG", quality=82, optimize=True); data = buf.getvalue()
        out[key] = "data:image/jpeg;base64," + base64.b64encode(data).decode()
    return out


def main() -> None:
    assets = {"models": {}, "textures": {}}
    lines = ["# 3D asset credits", "", "All assets from **Poly Haven** (https://polyhaven.com), licence **CC0 1.0** "
             "(public domain, no attribution required — credited anyway).", ""]
    for mid, size in MODELS.items():
        glb = build_model(mid, size)
        assets["models"][mid] = base64.b64encode(glb).decode()
        lines.append(f"- Model `{mid}` — https://polyhaven.com/a/{mid} ({len(glb) / 1e6:.2f} MB packed, textures ≤ {size}px)")
        print(f"model {mid}: {len(glb) / 1e6:.2f} MB")
    for tid, (maps, size) in TEXTURES.items():
        assets["textures"][tid] = build_texture(tid, maps, size)
        lines.append(f"- Texture `{tid}` — https://polyhaven.com/a/{tid} (maps {', '.join(maps)}, ≤ {size}px)")
        print(f"texture {tid}: ok")
    OUT_JS.write_text("window.AFDT_ASSETS = " + json.dumps(assets) + ";\n", encoding="utf-8")
    CREDITS.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"written {OUT_JS} ({OUT_JS.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
