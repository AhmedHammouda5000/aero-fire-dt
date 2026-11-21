# Énergie et coupures de courant (STEG) — Aero-Fire DT

**Problème :** en été, la STEG pratique des délestages (annoncés jusqu'à **2 h par coupure**, parfois plusieurs par jour, ex. 13 h–17 h en août 2026), sans compter les pannes imprévues. Un système de sécurité qui s'éteint pendant une coupure ne sert à rien.

**Réponse :** Aero-Fire DT fonctionne **sans Internet** et **sur batterie de secours**. Le SSI certifié garde, lui, sa propre alimentation de secours réglementaire : les deux chaînes restent indépendantes.

## Consommation (valeurs typiques des fiches techniques — `python scripts/energy_budget.py`)

| Élément d'un boîtier capteur | Puissance |
|---|---|
| Capteur de particules (ventilateur) | 275 mW — le plus gourmand |
| Capteur H₂ (élément chauffé) | 161 mW |
| CO₂ | 50 mW |
| Microcontrôleur + radio basse consommation | 33 mW |
| COV | 10 mW |
| CO électrochimique, température/humidité | ≈ 3 mW |
| **Total par boîtier (pertes incluses)** | **≈ 0,63 W (15 Wh / jour)** |

Système complet pour le hall de démonstration : 9 boîtiers + passerelle + commutateur + tablette du gardien ≈ **20 W**.

## Deux architectures

| | A — Boîtiers câblés (PoE) + 1 batterie centrale **(recommandé)** | B — Boîtiers sans fil, batterie dans chaque boîtier |
|---|---|---|
| Batterie | 1 × LiFePO4 12,8 V 100 Ah (1 280 Wh) | 2 × piles Li-ion 18650 par boîtier |
| Autonomie | **≈ 57 h** (≈ 76 h écran éteint) | **≈ 29 h** |
| Coupures STEG de 2 h couvertes | ≈ 28 à la suite | ≈ 14 à la suite |
| Avantages | une seule batterie à surveiller, réseau aussi secouru, LiFePO4 supporte bien la chaleur | installation sans câbles |

**Option solaire :** un panneau d'environ **150 W** (≈ 5,5 h de plein soleil par jour en Tunisie) suffit à faire tourner le système **sans limite de durée**, même lors d'une longue panne.

**Chaleur estivale :** les halls peuvent dépasser 40 °C ; le LiFePO4 tolère mieux la chaleur que le Li-ion classique : batterie placée dans le local technique, à l'abri du soleil.

## Ce que voit l'opérateur
Bouton **⚡ COUPURE** dans le tableau de bord : le bandeau passe en orange « SECTEUR COUPÉ · SUR BATTERIE xx % · AUTONOMIE ≈ … h · DÉTECTION ACTIVE », et la détection continue normalement.

## Limites honnêtes
- Chiffres issus des fiches techniques (Sensirion SPS30, SGP30, SGP41, SCD41) et d'estimations pour le microcontrôleur et la passerelle : **à mesurer sur le matériel réel** pendant le pilote.
- Un fonctionnement 100 % sur batterie pendant des années est irréaliste avec un capteur de particules à ventilateur et des capteurs chauffés : le système est conçu « secteur + batterie de secours », comme les systèmes d'alarme incendie.
