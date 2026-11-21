"""Energy budget and backup sizing for Aero-Fire DT (designed for Tunisian summer power cuts).

Run: python scripts/energy_budget.py  -> docs/results/energy_budget.json (+ printed table)
All component figures are typical datasheet values (sources below) - to be confirmed on the real
hardware during the pilot (measure with a USB/DC power meter).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# --- one sensor node, continuous operation (10 s sampling, needed for fast detection) ---------
NODE = [  # name, volts, mA (typical), source
    ("Particules SPS30 (ventilateur)", 5.0, 55.0, "Sensirion SPS30 datasheet: 45-65 mA en mesure, 38 uA en veille"),
    ("H2 brut SGP30 (MOX chauffé)", 3.3, 48.8, "Sensirion SGP30 datasheet: 48.8 mA en mesure (1.8 V, régulé depuis 3.3 V)"),
    ("COV SGP41", 3.3, 3.0, "Sensirion SGP41: 3.0 mA en moyenne"),
    ("CO2 SCD41 (périodique)", 3.3, 15.0, "Sensirion SCD4x datasheet: 15 mA (3.2 mA en mode basse conso.)"),
    ("CO électrochimique + ampli", 3.3, 1.0, "cellule électrochimique (uA) + ampli potentiostat - estimation"),
    ("Temp./humidité SHT4x", 3.3, 0.01, "négligeable"),
    ("Microcontrôleur + radio basse conso.", 3.3, 10.0, "MCU basse conso. + radio maillée 2.4 GHz, moyenne estimée"),
]
CONVERTER_EFF = 0.85          # regulators / PoE splitter
N_NODES = 9                   # hall of the demo (22 x 10 m)
GATEWAY_W = 4.0               # Raspberry Pi 4/5-class edge computer, typical average
SWITCH_W = 5.0                # small PoE switch (or LoRa/mesh concentrator)
SCREEN_W = 5.0                # guard tablet average (has its own battery)
POE_EFF = 0.90

# --- batteries --------------------------------------------------------------------------------
LFP_WH = 12.8 * 100           # LiFePO4 12.8 V 100 Ah
LFP_USABLE = 0.90             # LiFePO4 depth of discharge
CELL_18650_WH = 3.6 * 3.0     # one Li-ion 18650 cell
NODE_CELLS = 2
LI_USABLE = 0.85
PEAK_SUN_H = 5.5              # Tunisia, typical yearly average peak-sun-hours
PV_SYSTEM_EFF = 0.75


def main():
    rows = [{"composant": n, "V": v, "mA": ma, "W": round(v * ma / 1000, 4), "source": s} for n, v, ma, s in NODE]
    node_w = sum(r["W"] for r in rows) / CONVERTER_EFF
    node_day_wh = node_w * 24
    # architecture A: wired PoE nodes + one central LiFePO4 battery (recommended)
    sys_w = N_NODES * node_w / POE_EFF + SWITCH_W + GATEWAY_W + SCREEN_W
    sys_w_noscreen = sys_w - SCREEN_W
    lfp_h = LFP_WH * LFP_USABLE / sys_w
    lfp_h_noscreen = LFP_WH * LFP_USABLE / sys_w_noscreen
    # architecture B: wireless nodes, each with its own 2 x 18650 pack
    node_pack_wh = CELL_18650_WH * NODE_CELLS * LI_USABLE
    node_pack_h = node_pack_wh / node_w
    # solar top-up to survive any outage length
    pv_w = sys_w * 24 / (PEAK_SUN_H * PV_SYSTEM_EFF)
    out = {
        "node_components": rows,
        "node_power_W": round(node_w, 3), "node_energy_per_day_Wh": round(node_day_wh, 1),
        "biggest_consumer": max(rows, key=lambda r: r["W"])["composant"],
        "A_wired_PoE_central_battery": {
            "nodes": N_NODES, "system_power_W": round(sys_w, 1), "system_power_without_screen_W": round(sys_w_noscreen, 1),
            "battery": "LiFePO4 12.8 V 100 Ah (1280 Wh)", "autonomy_h": round(lfp_h, 1), "autonomy_without_screen_h": round(lfp_h_noscreen, 1),
            "STEG_cuts_2h_covered": int(lfp_h // 2)},
        "B_wireless_node_battery": {"pack": f"{NODE_CELLS} x 18650 Li-ion ({CELL_18650_WH * NODE_CELLS:.1f} Wh)", "autonomy_h": round(node_pack_h, 1)},
        "solar_to_run_indefinitely_W": round(pv_w), "solar_recommended_panel_W": 150 if pv_w <= 150 else 200,
        "assumptions": {"converter_eff": CONVERTER_EFF, "poe_eff": POE_EFF, "gateway_W": GATEWAY_W, "switch_W": SWITCH_W, "screen_W": SCREEN_W,
                        "peak_sun_hours_tunisia": PEAK_SUN_H, "note": "valeurs typiques des fiches techniques, à mesurer sur le matériel réel"},
    }
    (ROOT / "docs" / "results" / "energy_budget.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    for r in rows:
        print(f"  {r['composant']:<40} {r['W']*1000:7.1f} mW")
    print(f"node: {node_w:.2f} W ({node_day_wh:.1f} Wh/day) | system A: {sys_w:.1f} W -> LiFePO4 100 Ah: {lfp_h:.0f} h "
          f"({lfp_h_noscreen:.0f} h without screen) | node pack B: {node_pack_h:.0f} h | solar: {pv_w:.0f} W")


if __name__ == "__main__":
    main()
