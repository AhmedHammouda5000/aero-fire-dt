"""Build the dashboard scenarios (app/data/scenarios_data.js) from REAL sensor recordings.

For every scenario based on a real test run, the AI scores come from a model trained WITHOUT
that run (leave-one-episode-out) -> the replay shows exactly what the system would have done.
The certified panel (SSI) is simulated: a classic optical point detector per zone.
Advisory logic (ECAM-inspired levels) follows docs/Safety_Case.

Usage: python -m scenarios.build_scenarios
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from ai.alarm_verifier import verifier as V
from ai.alarm_verifier.train_eval import prepare
from ai.common.data import FEATURES, ROOT, SCENARIO_FR, add_features, load_hall

HALL = json.loads((ROOT / "twin" / "hall.json").read_text(encoding="utf-8"))
NODE_ZONE = {n["id"]: n["zone"] for n in HALL["nodes"]}
ZONE_NAME = {z["id"]: z["name"] for z in HALL["zones"]}
BIN = 10
SIGNALS = ["PMTOT", "CO", "H2", "VOC", "TEMP"]
CO_HEALTH_PPM = 30.0      # workplace CO short-term warning level used for the advisory

SCENARIOS = [
    {"id": "A", "episode": "Wood#2", "kind": "fire", "pre": 180, "post": 900,
     "title": "Départ de feu réel (bois)", "fire_zone": "A",
     "material": "textile / friperie",
     "story": "Feu couvant réel enregistré dans le hall. L'IA donne une pré-alarme bien avant "
              "le détecteur optique du SSI, puis confirme le feu quand le SSI déclenche."},
    {"id": "B", "episode": "Deodorant#2", "kind": "nuisance", "pre": 180, "post": 630,
     "title": "Aérosol dans l'atelier (fausse alarme SSI)",
     "story": "Pulvérisation d'aérosol (type peinture / désodorisant). Le détecteur optique du SSI "
              "déclenche ; l'IA reconnaît une nuisance et aide la levée de doute. L'alarme SSI "
              "n'est jamais masquée."},
    {"id": "C", "episode": "Exhaust#1", "kind": "nuisance", "pre": 180, "post": 900,
     "title": "Gaz d'échappement d'un chariot",
     "story": "Moteur thermique en marche dans le hall : pas de feu, pas d'alarme SSI, mais le CO "
              "monte. Aero-Fire DT signale un risque pour la santé des opérateurs."},
    {"id": "D", "episode": None, "kind": "drift", "pre": 0, "post": 1500,
     "title": "Capteur en dérive (défaut simulé)",
     "story": "Le capteur CO du nœud 11 dérive lentement (défaut simulé sur une période calme réelle). "
              "La surveillance de cohérence le détecte et passe en mode dégradé, comme le test "
              "intégré (BIT) des boucles de détection moteur en aéronautique."},
    {"id": "E", "episode": "Welding#1", "kind": "nuisance", "pre": 180, "post": 600,
     "title": "Cas limite : soudure (l'IA se trompe)", "limit_case": True,
     "story": "Cas honnête : la soudure produit fumée ET chaleur ; avec un seul essai disponible, "
              "l'IA ne peut pas l'apprendre et annonce un feu probable. L'opérateur garde la main ; "
              "le pilote de 90 jours sert à collecter ce type de nuisance sur site."},
]


def profile_text(chA, chB, chC, dco, dvoc, dh2) -> str:
    if chA and not chB and not chC:
        return "particules sans gaz de combustion (type poussière / brouillard / soudure)"
    if chB and not chA:
        if dco >= 10:
            return "gaz sans particules, CO élevé (type moteur thermique / combustion externe)"
        if dvoc > max(2.0, 2 * dco):
            return "gaz sans particules, COV élevés (type solvant / alcool)"
        return "gaz sans particules"
    if chA and chB:
        if dvoc > 8 and dco < 2:
            return "particules + COV élevés, peu de CO (type aérosol / spray)"
        return "particules + gaz de combustion (signature compatible avec un feu)"
    if chA and chC:
        return "particules + chaleur"
    return "air normal"


def node_bins(win: pd.DataFrame, p: np.ndarray, bins: pd.DatetimeIndex) -> dict:
    d = win.assign(_p=p, _bin=win["Date"].dt.floor(f"{BIN}s"))
    ch = V.channels(win)
    d[["chA", "chB", "chC"]] = ch.values
    out = {}
    for node, g in d.groupby("node"):
        g = g.groupby("_bin").last().reindex(bins).infer_objects().ffill().bfill()
        out[int(node)] = {
            **{s: np.round(g[s].values, 2).tolist() for s in SIGNALS},
            "dPM": np.round(g["log_dPM"].values, 2).tolist(),
            "dCO": np.round(g["d_CO"].values, 2).tolist(),
            "dH2": np.round(g["d_H2"].values, 2).tolist(),
            "dVOC": np.round(g["d_VOC"].values, 2).tolist(),
            "dTEMP": np.round(g["d_TEMP"].values, 2).tolist(),
            "p": np.round(g["_p"].values, 3).tolist(),
            "chA": g["chA"].astype(bool).tolist(), "chB": g["chB"].astype(bool).tolist(),
            "chC": g["chC"].astype(bool).tolist(),
        }
    return out


def simulate_ssi(nodes: dict, n: int) -> dict:
    """Conventional panel: one optical loop per zone, latched until reset."""
    zones = {z: [0] * n for z in ZONE_NAME}
    for nid, s in nodes.items():
        z = NODE_ZONE[nid]
        for i, v in enumerate(s["dPM"]):
            if v > V.OPTICAL_TRIP:
                zones[z][i] = 1
    for z in zones:  # latch
        zones[z] = np.maximum.accumulate(zones[z]).tolist()
    common = np.maximum.reduce([np.array(v) for v in zones.values()]).tolist()
    return {"zones": zones, "fire": common, "fault": [0] * n}


# early caution "FEU COUVANT POSSIBLE": evaluated on the leave-one-episode-out hall timelines
# (docs/results/early_warning.json): 17/17 fires, 11/17 before the optical detector, 3/15 nuisances
EARLY_RISE = {"pm": 0.5, "co": 0.3, "h2": 1.0}


def ecam(tl: pd.DataFrame, nodes: dict, ssi: dict, drift: list[str | None], sc: dict) -> list:
    """Active alerts per bin. Levels: 3 = WARNING (red, continuous chime),
    2 = CAUTION (amber, single chime), 1 = ADVISORY (amber, no sound)."""
    alerts = []
    zone_lock, quiet, lock_smoke = None, 0, False
    trip_order: list[str] = []
    early_run, early_on = 0, False   # consecutive bins with a high fire score but only one physical channel
    for i, r in enumerate(tl.itertuples()):
        a = []
        j = max(1, i - 6)   # 60 s ago (bin 0 can be partial): the signal must still be RISING (flat leftovers of a previous test do not count)
        rising = (tl["max_log_dPM"].iat[i] - tl["max_log_dPM"].iat[j] >= EARLY_RISE["pm"] or
                  tl["max_dCO"].iat[i] - tl["max_dCO"].iat[j] >= EARLY_RISE["co"] or
                  tl["max_dH2"].iat[i] - tl["max_dH2"].iat[j] >= EARLY_RISE["h2"])
        early_run = early_run + 1 if (not pd.isna(r.p) and r.p >= V.P_FIRE and (r.chA or r.chB) and rising) else 0
        # once raised, the caution is held while the AI stays fairly confident (no blinking)
        early_on = (early_run >= V.CONFIRM_BINS) or (early_on and not pd.isna(r.p) and r.p >= 0.5 and (r.chA or r.chB))
        for z, v in ssi["zones"].items():
            if v[i] and z not in trip_order:
                trip_order.append(z)
        ssi_zones = [z for z in trip_order if ssi["zones"][z][i]]   # first tripped first
        # dominant node: particle channel first (smoke locates the fire), then gas
        best, best_key = None, (-1, -1.0)
        for nid, s in nodes.items():
            if drift[i] is not None and nid == 11:
                continue
            if not (s["chA"][i] or s["chB"][i]):
                continue
            inten = s["dPM"][i] + 2 * np.log1p(max(s["dCO"][i], 0) + max(s["dH2"][i], 0))
            key = (1 if s["chA"][i] else 0, inten)
            if key > best_key:
                best, best_key = nid, key
        # The origin zone is locked when the smoke (particle channel) first appears, because smoke
        # then spreads through the whole hall; released after 2 minutes without activity.
        if best is not None:
            quiet = 0
            has_smoke = bool(nodes[best]["chA"][i])
            if zone_lock is None or (has_smoke and not lock_smoke):
                zone_lock, lock_smoke = NODE_ZONE[best], has_smoke   # gas lock, upgraded by smoke
        else:
            quiet += 1
            if quiet >= 12:
                zone_lock, lock_smoke = None, False
        zone = zone_lock or (NODE_ZONE[best] if best is not None else (ssi_zones[0] if ssi_zones else None))
        zname = f"ZONE {zone}" if zone else ""
        n_active = sum(1 for nid, s in nodes.items()
                       if (s["chA"][i] or s["chB"][i]) and not (drift[i] is not None and nid == 11))
        prof = profile_text(r.chA, r.chB, r.chC, r.max_dCO, r.max_dVOC, r.max_dH2)
        p = None if pd.isna(r.p) else round(float(r.p), 2)
        dual = bool(r.chA and (r.chB or r.chC))
        if ssi_zones and r.verdict == "FIRE" and dual:
            a.append({"level": 3, "code": "FIRE_CONFIRMED",
                      "title": f"FEU CONFIRMÉ {zname}",
                      "detail": f"SSI + IA (score {p}) + 2 canaux physiques indépendants",
                      "actions": [f"ÉVACUATION {zname} ........ DÉCLENCHER",
                                  "PROTECTION CIVILE 198 ........ APPELER",
                                  "DÉSENFUMAGE ........ VÉRIFIER",
                                  "ÉQUIPE DE SÉCURITÉ ........ ENGAGER"]})
        elif ssi_zones and r.verdict == "NUISANCE":
            a.append({"level": 2, "code": "SSI_NUISANCE",
                      "title": f"ALARME SSI ZONE {ssi_zones[0]} : APPLIQUER LA PROCÉDURE",
                      "detail": f"information IA (pas une décision) : indices compatibles avec une nuisance · profil : {prof}",
                      "actions": ["PROCÉDURE SSI ........ APPLIQUER",
                                  f"LEVÉE DE DOUTE ZONE {ssi_zones[0]} ........ ENVOYER AGENT",
                                  "ALARME SSI ........ MAINTENUE (NON INHIBÉE)",
                                  "DÉCISION ........ OPÉRATEUR"]})
        elif ssi_zones:
            a.append({"level": 2, "code": "SSI_UNCERTAIN",
                      "title": f"ALARME SSI ZONE {ssi_zones[0]} : APPLIQUER LA PROCÉDURE",
                      "detail": f"information IA : en analyse · profil : {prof}",
                      "actions": ["PROCÉDURE SSI ........ APPLIQUER",
                                  f"LEVÉE DE DOUTE ZONE {ssi_zones[0]} ........ ENVOYER AGENT",
                                  "ALARME SSI ........ MAINTENUE (NON INHIBÉE)"]})
        elif r.verdict == "FIRE" and dual:
            a.append({"level": 2, "code": "AI_PREALARM",
                      "title": f"PRÉ-ALARME IA : FEU PROBABLE {zname}",
                      "detail": f"score {p} · 2 canaux concordants · SSI pas encore déclenché",
                      "actions": [f"LEVÉE DE DOUTE {zname} ........ ENVOYER AGENT",
                                  "CHEF DE SÉCURITÉ ........ PRÉVENIR",
                                  "PROTECTION CIVILE ........ PRÉ-AVERTIR"]})
        elif early_on and r.verdict == "UNCERTAIN":
            # early caution: the AI is already confident but the 2nd physical channel is not there yet
            # (typical of a smouldering fire: combustion gas before dense smoke). Not a confirmation.
            a.append({"level": 2, "code": "AI_EARLY",
                      "title": f"FEU COUVANT POSSIBLE {zname}",
                      "detail": f"score feu {p} · profil : {prof} · signal en hausse, 2e canal pas encore présent",
                      "actions": [f"LEVÉE DE DOUTE {zname} ........ ENVOYER AGENT",
                                  "CHEF DE SÉCURITÉ ........ PRÉVENIR"]})
        elif n_active >= 2 and r.verdict in ("UNCERTAIN", "FIRE"):
            a.append({"level": 1, "code": "AI_ACTIVITY",
                      "title": f"ACTIVITÉ CAPTEURS {zname}",
                      "detail": f"score feu {p} · profil : {prof}", "actions": []})
        elif n_active >= 2 and r.verdict == "NUISANCE":
            a.append({"level": 1, "code": "AI_NUISANCE",
                      "title": f"NUISANCE DÉTECTÉE {zname}",
                      "detail": f"score feu {p} · profil : {prof}", "actions": []})
        if r.max_dCO >= CO_HEALTH_PPM:
            a.append({"level": 2, "code": "CO_HEALTH",
                      "title": f"CO ÉLEVÉ {zname} : {r.max_dCO:.0f} ppm",
                      "detail": "risque pour la santé des opérateurs (pas de feu détecté)",
                      "actions": [f"AÉRATION {zname} ........ OUVRIR",
                                  "MOTEUR THERMIQUE ........ ARRÊTER",
                                  "PERSONNEL ........ ÉLOIGNER"]})
        if drift[i] is not None:
            a.append({"level": 1, "code": "NODE_DRIFT", "title": drift[i],
                      "detail": "écart persistant avec les nœuds voisins, sans signal corrélé",
                      "actions": ["NŒUD 11 ........ EXCLU DU VOTE (MODE DÉGRADÉ)",
                                  "MAINTENANCE ........ PROGRAMMER"]})
        a.sort(key=lambda x: -x["level"])
        alerts.append(a)
    return alerts


def drift_rows(f: pd.DataFrame) -> tuple[pd.DataFrame, pd.Timestamp]:
    """Take a calm real period (night) and add a slow CO drift to node 11."""
    bg = f[f["scenario"] == "Background"]
    night = bg[(bg["Date"].dt.hour >= 1) & (bg["Date"].dt.hour < 5)]
    t0 = night["Date"].min().ceil("10min") + pd.Timedelta("40min")
    raw = load_hall()
    raw = raw[(raw["Date"] >= t0 - pd.Timedelta("40min")) & (raw["Date"] <= t0 + pd.Timedelta("25min"))].copy()
    m = (raw["node"] == 11) & (raw["Date"] >= t0 + pd.Timedelta("3min"))
    minutes = (raw.loc[m, "Date"] - (t0 + pd.Timedelta("3min"))).dt.total_seconds() / 60
    raw.loc[m, "CO"] += 0.5 * minutes           # +0.5 ppm per minute
    return add_features(raw), t0


def drift_flags(nodes: dict, n: int) -> list[str | None]:
    flags = [None] * n
    others = [k for k in nodes if k != 11]
    run = 0
    for i in range(n):
        med = np.median([nodes[k]["dCO"][i] for k in others])
        spread = np.median([abs(nodes[k]["dCO"][i] - med) for k in others]) + 0.2
        resid = nodes[11]["dCO"][i] - med
        run = run + 1 if resid > 1.5 + 3 * spread else 0
        if run >= 18:  # 3 minutes of persistent, uncorrelated deviation
            flags[i] = "NŒUD 11 : DÉRIVE CAPTEUR CO — MODE DÉGRADÉ"
    return flags


def main() -> None:
    cache = ROOT / "data_raw" / "hall_features.pkl"
    if not cache.exists():
        add_features(load_hall()).to_pickle(cache)
    f = prepare(pd.read_pickle(cache))
    train_rows = f[(f["episode"] != "") & f["active"]]
    full_model = V.fit(train_rows)
    out = []
    for sc in SCENARIOS:
        if sc["kind"] == "drift":
            win, t0 = drift_rows(f)
            win = prepare(win)
            win = win[(win["Date"] >= t0) & (win["Date"] <= t0 + pd.Timedelta(seconds=sc["post"]))]
            model = full_model
            src = "Période calme réelle (nuit) + dérive simulée du capteur CO du nœud 11"
        else:
            s, x = sc["episode"].split("#")
            ep = f[(f["scenario"] == s) & (f["exp"] == int(x))]
            t0 = ep["Date"].min()
            win = f[(f["Date"] >= t0 - pd.Timedelta(seconds=sc["pre"]))
                    & (f["Date"] <= t0 + pd.Timedelta(seconds=sc["post"]))]
            model = V.fit(train_rows[train_rows["episode"] != sc["episode"]])  # never saw this run
            src = (f"Mesures réelles — Industrial Hall, essai « {SCENARIO_FR[s]} #{x} » "
                   f"(Mendeley, CC BY 4.0) · IA entraînée sans cet essai")
        p = model.predict_proba(win[FEATURES].values)[:, 1]
        tl = V.hall_timeline(win, p, BIN)
        bins = pd.DatetimeIndex(tl["t"])
        nodes = node_bins(win, p, bins)
        n = len(tl)
        ssi = simulate_ssi(nodes, n)
        drift = drift_flags(nodes, n) if sc["kind"] == "drift" else [None] * n
        alerts = ecam(tl, nodes, ssi, drift, sc)
        t_rel = ((bins - t0.floor(f"{BIN}s")).total_seconds()).astype(int).tolist()
        first = lambda cond: next((t_rel[i] for i in range(n) if cond(i)), None)
        out.append({
            "id": sc["id"], "title": sc["title"], "kind": sc["kind"], "story": sc["story"],
            "source": src, "limit_case": sc.get("limit_case", False),
            "fire_zone": sc.get("fire_zone"), "material": sc.get("material"),
            "dt": BIN, "t": t_rel,
            "hall": {"p": [None if pd.isna(v) else round(float(v), 3) for v in tl["p"]],
                     "verdict": tl["verdict"].tolist(),
                     "chA": tl["chA"].tolist(), "chB": tl["chB"].tolist(), "chC": tl["chC"].tolist(),
                     "active_nodes": tl["active_nodes"].tolist()},
            "nodes": {str(k): v for k, v in nodes.items()},
            "ssi": ssi, "alerts": alerts,
            "key_times": {
                "ssi_alarm": first(lambda i: ssi["fire"][i] == 1),
                "ai_fire": first(lambda i: tl["verdict"].iloc[i] == "FIRE"),
                "first_activity": first(lambda i: tl["active_nodes"].iloc[i] > 0 and t_rel[i] >= 0),
                "drift_flag": first(lambda i: drift[i] is not None),
            },
        })
        kt = out[-1]["key_times"]
        print(f"{sc['id']} {sc['title'][:40]:40s} bins={n} SSI={kt['ssi_alarm']} AI_fire={kt['ai_fire']} "
              f"drift={kt['drift_flag']} levels={sorted({a['level'] for al in alerts for a in al})}")
    js = "window.AFDT_SCENARIOS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "app" / "data" / "scenarios_data.js").write_text(js, encoding="utf-8")
    print(f"written app/data/scenarios_data.js ({len(js)//1024} KB)")


if __name__ == "__main__":
    main()
