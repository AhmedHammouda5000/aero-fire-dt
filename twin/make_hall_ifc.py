"""Generate the digital-twin geometry of the test hall as an IFC file (IfcOpenShell), then
export a light JSON zone graph for the dashboard.

The hall matches the Industrial Hall dataset (10 m x 22 m x 8 m). The positions of the 9 sensor
nodes were not published with the dataset: the layout below is plausible and stated as such.
Our own model -> no licence issue (IFC sample files online have no clear licence).

Usage: python twin/make_hall_ifc.py
"""
from __future__ import annotations

import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.api.root
import ifcopenshell.api.unit
import ifcopenshell.api.context
import ifcopenshell.api.project
import ifcopenshell.api.spatial
import ifcopenshell.api.geometry
import ifcopenshell.api.aggregate
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
W, L, H = 10.0, 22.0, 8.0   # m

ZONES = [  # name, x0, x1 (along the 22 m length)
    {"id": "A", "name": "Zone A — Stockage textile (balles)", "x0": 0.0, "x1": 7.0},
    {"id": "B", "name": "Zone B — Préparation / expédition", "x0": 7.0, "x1": 15.0},
    {"id": "C", "name": "Zone C — Atelier maintenance", "x0": 15.0, "x1": 22.0},
]
DOORS = [
    {"id": "P1", "name": "Porte sectionnelle", "x": 3.0, "y": 0.0, "width": 4.0, "height": 4.0},
    {"id": "P2", "name": "Issue de secours", "x": 20.0, "y": 10.0, "width": 1.0, "height": 2.2},
]
# 9 nodes at ~3 m height on columns / walls. The real positions were not published with the
# dataset: this plausible layout puts the nodes that react first to the wood fire (8, 12, 13) in
# the storage zone A and the nodes that react first to aerosol/welding (15, 7) in workshop zone C.
NODE_IDS = [6, 7, 8, 9, 10, 11, 12, 13, 15]
NODE_XY = [(8.5, 1.0), (17.5, 2.5), (3.5, 1.5), (11.0, 9.0), (13.5, 1.0),
           (11.0, 5.0), (5.5, 5.1), (3.5, 8.5), (20.0, 7.5)]
PANEL_DETECTORS = [  # certified SSI point detectors on the ceiling (one loop per zone)
    {"id": "DO-A1", "zone": "A", "x": 3.5, "y": 5.0},
    {"id": "DO-B1", "zone": "B", "x": 9.0, "y": 5.0},
    {"id": "DO-B2", "zone": "B", "x": 13.0, "y": 5.0},
    {"id": "DO-C1", "zone": "C", "x": 18.5, "y": 5.0},
]
RACKS = [{"x0": 1.0, "x1": 6.0, "y0": 3.0, "y1": 4.2, "h": 4.0},     # textile bales (zone A)
         {"x0": 1.0, "x1": 6.0, "y0": 6.0, "y1": 7.2, "h": 4.0},
         {"x0": 9.0, "x1": 13.0, "y0": 6.5, "y1": 7.5, "h": 1.5}]    # pallets to ship (zone B)


def zone_of(x: float) -> str:
    return next(z["id"] for z in ZONES if z["x0"] <= x <= z["x1"])


def build_ifc(path: Path) -> None:
    f = ifcopenshell.api.project.create_file(version="IFC4")
    project = ifcopenshell.api.root.create_entity(f, ifc_class="IfcProject", name="Aero-Fire DT")
    ifcopenshell.api.unit.assign_unit(f)
    ctx = ifcopenshell.api.context.add_context(f, context_type="Model")
    body = ifcopenshell.api.context.add_context(
        f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=ctx)
    site = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSite", name="Zone industrielle")
    bldg = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuilding", name="Hall d'essai 10x22x8")
    storey = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuildingStorey", name="RDC")
    ifcopenshell.api.aggregate.assign_object(f, relating_object=project, products=[site])
    ifcopenshell.api.aggregate.assign_object(f, relating_object=site, products=[bldg])
    ifcopenshell.api.aggregate.assign_object(f, relating_object=bldg, products=[storey])

    def wall(name, x, y, length, angle_deg):
        w = ifcopenshell.api.root.create_entity(f, ifc_class="IfcWall", name=name)
        rep = ifcopenshell.api.geometry.add_wall_representation(
            f, context=body, length=length, height=H, thickness=0.25)
        ifcopenshell.api.geometry.assign_representation(f, product=w, representation=rep)
        a = np.radians(angle_deg)
        m = np.eye(4)
        m[:3, :3] = [[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]]
        m[:3, 3] = [x, y, 0]
        ifcopenshell.api.geometry.edit_object_placement(f, product=w, matrix=m)
        ifcopenshell.api.spatial.assign_container(f, relating_structure=storey, products=[w])

    wall("Mur sud", 0, 0, L, 0)
    wall("Mur nord", 0, W, L, 0)
    wall("Mur ouest", 0, 0, W, 90)
    wall("Mur est", L, 0, W, 90)

    for z in ZONES:
        sp = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSpace", name=z["name"])
        ifcopenshell.api.aggregate.assign_object(f, relating_object=storey, products=[sp])
    for d in DOORS:
        door = ifcopenshell.api.root.create_entity(f, ifc_class="IfcDoor", name=d["name"])
        door.OverallWidth, door.OverallHeight = d["width"], d["height"]
        ifcopenshell.api.spatial.assign_container(f, relating_structure=storey, products=[door])
    for nid in NODE_IDS:
        s = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSensor", name=f"Nœud multi-capteurs {nid:02d}")
        ifcopenshell.api.spatial.assign_container(f, relating_structure=storey, products=[s])
    for det in PANEL_DETECTORS:
        a = ifcopenshell.api.root.create_entity(f, ifc_class="IfcAlarm", name=f"Détecteur SSI {det['id']}")
        ifcopenshell.api.spatial.assign_container(f, relating_structure=storey, products=[a])
    f.write(str(path))


def main() -> None:
    ifc_path = ROOT / "twin" / "hall.ifc"
    build_ifc(ifc_path)
    # read it back (proves the IFC is valid and is the source of truth for counts)
    f = ifcopenshell.open(str(ifc_path))
    counts = {c: len(f.by_type(c)) for c in ["IfcWall", "IfcSpace", "IfcDoor", "IfcSensor", "IfcAlarm"]}
    twin = {
        "name": "Hall d'essai (jumeau du jeu de données Industrial Hall)",
        "size": {"width": W, "length": L, "height": H},
        "zones": ZONES, "doors": DOORS, "racks": RACKS,
        "nodes": [{"id": nid, "x": x, "y": y, "z": 3.0, "zone": zone_of(x)}
                  for nid, (x, y) in zip(NODE_IDS, NODE_XY)],
        "panel_detectors": PANEL_DETECTORS,
        "ifc_counts": counts,
        "note": "Positions des nœuds plausibles (non publiées avec le jeu de données).",
    }
    (ROOT / "twin" / "hall.json").write_text(json.dumps(twin, indent=1, ensure_ascii=False), encoding="utf-8")
    (ROOT / "app" / "data" / "hall_data.js").write_text(
        "window.AFDT_HALL = " + json.dumps(twin, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("IFC written:", ifc_path, counts)


if __name__ == "__main__":
    main()
