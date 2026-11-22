# Plan de pitch — Aero-Fire DT

**Support : `02_Presentation_Pitch_Aero-Fire-DT.pdf` — présenter ce fichier exact (−10 pts s'il change).** 5 minutes, puis questions.

| # | Slide | À l'écran | Temps |
|---|---|---|---|
| 0 | Titre | AERO-FIRE DT · « Le copilote incendie qui lit votre alarme sans jamais la toucher » | 0:15 |
| 1 | Le problème | spray / poussière / échappement → évacuation pour rien · 39 % · 47,9 MDT | 0:30 |
| 2 | L'idée vient de l'aviation | soutes d'avion : 200 fausses alarmes pour 1 feu · fumée + (gaz ou chaleur) = feu | 0:30 |
| 2b | Ce que nous prenons à l'aéronautique | double boucle moteur · CS/14 CFR 25.858 (alerte < 60 s) · FAA AC 25-9A (essais de fumée → banc d'essai) · ARP4761A (analyse de sécurité) · ECAM Airbus · EASA IA niveau 1 — méthodes « inspirées de », sans certification revendiquée | 0:30 |
| 3 | Notre solution | capteurs → IA + vote → écran du gardien · lecture seule, on ne coupe jamais l'alarme | 0:25 |
| 4 | Démo : vrai feu | capture du scénario A · 3:30 feu couvant · 6:30 pré-alarme · 10:10 alarme classique | 0:40 |
| 5 | Démo : spray + banc d'essai | on vérifie au lieu d'évacuer · on pose un feu, la physique 3D fait le reste | 0:35 |
| 6 | Résultats | 17/17 feux · 10 avant l'alarme classique · 7/7 dans une autre salle | 0:25 |
| 7 | Partout en Tunisie | 27 → 4 fausses alarmes après 90 jours · 55 h sur batterie · 0 Internet | 0:25 |
| 8 | Modèle économique | 7 000 / 22 000 / 45 000 TND + abonnement · 9 700 TND pour démarrer · rentable année 2 | 0:30 |
| 9 | Feuille de route 18 mois | frise M0→M18 + 6 phases : 0 Cadrage (Startup Act, INNORPI, accords) · 1 Banc « iron bird » (vrais boîtiers + vraie centrale, essais AC 25-9A, alerte ≤ 60 s) · 2 Pilote 90 jours (raccordement lecture seule, mesures, apprentissage, retour Protection Civile) · 3 Produit v1 (jumeau 3D + prévision, 3 sites payants) · 4 Échelle (10 sites, +2 embauches) · 5 Consolidation (20 sites, assureurs) | 0:35 |
| 10 | Avec la Protection Civile | plans numériques, formation, retours d'expérience · 1 usine pilote, 1 installateur agréé, un test avec la Protection Civile · « Un copilote, pas un pilote. » | 0:20 |

**Total ≈ 5:20** : raccourcir les slides 1 et 6 de 10 s chacune pour tenir 5:00. Pendant les slides 4–5, montrer l'application en direct si possible (scénario A, B, puis un feu dans le banc d'essai F).

## Phrases clés (à dire)

- Slide 2 : « Dans les avions, il y avait 200 fausses alarmes pour un vrai feu. L'aviation a mis deux boucles qui doivent être d'accord. Nous faisons pareil dans les usines. »
- Slide 2b : « Nous n'inventons pas la sécurité : nous reprenons des méthodes éprouvées de l'aviation, la double boucle, l'alerte en 60 secondes, les essais de fumée, l'analyse de sécurité et l'écran ECAM. »
- Slide 3 : « On lit l'alarme, on ne la touche jamais. Pendant une alarme, l'écran dit simplement : appliquer la procédure. »
- Slide 6 : « Testé sur de vrais feux que l'IA n'avait jamais vus : 17 sur 17. »
- Slide 7 : « Chaque usine est différente : en 90 jours, l'IA apprend la sienne. »

## Slides de réserve (pour les questions)

- **R1 — Le boîtier (kit option 1) :** SPS30, SGP30, SCD40, Winsen ZE07-CO, ESP32-C3 · ≈ 300–475 TND · 0,68 W · 55 h sur batterie.
- **R2 — Résultats détaillés :** 17/17 feux, 11/15 fausses alarmes rejetées (alarme fumée seule : 10/15), alerte précoce 17/17, autre salle 12/13 · 7/7, prévision ± 6 cm.
- **R3 — Un modèle par usine :** nouveau site (NIST) jour 1 → après apprentissage : 6/33 → 29/33.
- **R4 — Sécurité et cadre légal :** optocoupleurs, lecture seule, Loi 2009-11, Décret 2006-2687, EN 54-13 / NFPA 72.

## Rappels

- Dépôt sur le Drive avant **08:30** (limite 09:00). Aucune modification après.
- Lien GitHub : **https://github.com/AhmedHammouda5000/aero-fire-dt**
