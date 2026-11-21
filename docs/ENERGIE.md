# Énergie et coupures de courant (STEG) — Aero-Fire DT

**Problème :** en été, la STEG pratique des délestages (annoncés jusqu'à **2 h par coupure**, parfois plusieurs par jour, ex. 13 h–17 h en août 2026), sans compter les pannes imprévues. Un système de sécurité qui s'éteint pendant une coupure ne sert à rien.

**Réponse :** Aero-Fire DT fonctionne **sans Internet** et **sur batterie de secours**. Le SSI certifié garde, lui, sa propre alimentation de secours réglementaire : les deux chaînes restent indépendantes.

## Consommation (valeurs typiques des fiches techniques — `python scripts/energy_budget.py`)

| Élément d'un boîtier capteur | Puissance |
|---|---|
| Capteur de particules SPS30 (ventilateur) | 275 mW — le plus gourmand |
| Capteur H₂ + COV SGP30 (élément chauffé) | 161 mW |
| Microcontrôleur ESP32-C3 + radio ESP-NOW | 66 mW |
| CO₂ + température + humidité SCD40 | 50 mW |
| CO électrochimique Winsen ZE07-CO | 25 mW |
| **Total par boîtier (pertes incluses)** | **≈ 0,68 W (16 Wh / jour)** |

Kit retenu (« option 1 ») et prix : voir [`MATERIEL.md`](MATERIEL.md).

Système complet pour le hall de démonstration : 9 boîtiers + passerelle + commutateur + tablette du gardien ≈ **21 W**.

## Deux architectures

| | A — Boîtiers câblés (PoE) + 1 batterie centrale **(recommandé)** | B — Boîtiers sans fil, batterie dans chaque boîtier |
|---|---|---|
| Batterie | 1 × LiFePO4 12,8 V 100 Ah (1 280 Wh) | 2 × piles Li-ion 18650 par boîtier |
| Autonomie | **≈ 55 h** (≈ 73 h écran éteint) | **≈ 27 h** |
| Coupures STEG de 2 h couvertes | ≈ 27 à la suite | ≈ 13 à la suite |
| Avantages | une seule batterie à surveiller, réseau aussi secouru, LiFePO4 supporte bien la chaleur | installation sans câbles |

**Option solaire :** un panneau d'environ **150 W** (≈ 5,5 h de plein soleil par jour en Tunisie) suffit à faire tourner le système **sans limite de durée**, même lors d'une longue panne.

**Chaleur estivale :** les halls peuvent dépasser 40 °C ; le LiFePO4 tolère mieux la chaleur que le Li-ion classique : batterie placée dans le local technique, à l'abri du soleil.

## Ce que voit l'opérateur
Bouton **⚡ COUPURE** dans le tableau de bord : le bandeau passe en orange « SECTEUR COUPÉ · SUR BATTERIE xx % · AUTONOMIE ≈ … h · DÉTECTION ACTIVE », et la détection continue normalement.

## Limites honnêtes
- Chiffres issus des fiches techniques (Sensirion SPS30, SGP30, SCD40 ; Winsen ZE07-CO) et d'estimations pour le microcontrôleur et la passerelle : **à mesurer sur le matériel réel** pendant le pilote.
- Un fonctionnement 100 % sur batterie pendant des années est irréaliste avec un capteur de particules à ventilateur et des capteurs chauffés : le système est conçu « secteur + batterie de secours », comme les systèmes d'alarme incendie.
