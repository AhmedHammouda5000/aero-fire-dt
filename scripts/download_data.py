"""Download the open datasets used by Aero-Fire DT and verify their integrity.

Datasets (CC BY 4.0, attribution required):
- "Indoor Fire Dataset with Distributed Multi-Sensor Nodes" (Industrial Hall), Mendeley Data,
  DOI 10.17632/yghykzm4km.1
- EN54 test-room counterpart, Mendeley Data, DOI 10.17632/npk2zcm85h

Usage:  python scripts/download_data.py
"""
from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DATASETS = [
    {
        "name": "Industrial Hall (Mendeley yghykzm4km)",
        "url": "https://data.mendeley.com/public-files/datasets/yghykzm4km/files/"
               "ac22049a-6c73-4276-8583-05b2cf735601/file_downloaded",
        "path": ROOT / "data_raw" / "industrial_hall" / "industrial_hall.csv",
        "sha256": "b431b611a44e4282510bd53158aaa71512554481433d8f3a90f9475c17134839",
    },
    {
        "name": "EN54 test room (Mendeley npk2zcm85h)",
        "url": "https://data.mendeley.com/public-files/datasets/npk2zcm85h/files/"
               "0c5ed6b5-d59a-4e09-ada2-6f58e34b7666/file_downloaded",
        "path": ROOT / "data_raw" / "en54" / "en54_room.csv",
        "sha256": "65a568cf84bf17c0e7d25fe89f3547c93a097a18c65b9f357eab3c7104c97c1a",
    },
]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ok = True
    for ds in DATASETS:
        path: Path = ds["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            print(f"Downloading {ds['name']} ...")
            urllib.request.urlretrieve(ds["url"], path)
        digest = sha256_of(path)
        expected = ds["sha256"]
        if expected is None:
            (path.parent / "SHA256").write_text(digest + "\n")
            print(f"[ok] {ds['name']}: {path.stat().st_size:,} bytes, sha256 {digest}")
        elif digest == expected:
            print(f"[ok] {ds['name']}: sha256 verified")
        else:
            print(f"[FAIL] {ds['name']}: sha256 {digest} != expected {expected}. "
                  f"Delete {path} and run again.")
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
