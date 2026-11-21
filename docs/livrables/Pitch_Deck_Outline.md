# Plan de pitch — Aero-Fire DT Tunisie

**Contraintes du brief :** pitch de 5 minutes, support PDF, questions/réponses ensuite, présentation en live. **Règle d'or : ne pas ouvrir sur « IA + caméras + capteurs détectent le feu » ; ouvrir sur l'architecture de sécurité.** Pas de « drone » ni de « YOLO » dans la première minute.

| # | Titre | Contenu clé (1 idée / slide) | Temps |
|---|---|---|---|
| 1 | Aero-Fire DT Tunisie | « Un copilote qui lit votre SSI sans jamais pouvoir le toucher. » Partenaires du challenge : Protection Civile & INJAZ Tunisia | 0:15 |
| 2 | Le problème, les preuves | UK : ≈ 39 % des interventions = fausses alarmes incendie, 169 717 dues aux équipements (GOV.UK, sept. 2025) ; soutes d'avion : ≈ 200 fausses alarmes pour 1 réelle (NIST SP 965) ; Tunisie : 47,9 MDT d'indemnités incendie au S1 2026 (+32,6 %) ; **pas de statistique tunisienne de fausses alarmes publiée** | 0:30 |
| 3 | Notre réponse | Surcouche d'aide à la décision, jamais un substitut ; lecture seule ; l'IA éclaire la levée de doute dans la fenêtre déjà paramétrée dans l'ECS | 0:20 |
| 4 | **Déjà fait / ce que nous ajoutons** | Tableau : Bosch AVIOTEC, Honeywell Distinguish (nov. 2026), Siemens ASA, Hikvision/iThermAI, Dahua MENA → IA *dans* leurs détecteurs ; PolyU SureFire → prévision 60 s, cloud. **Nous :** couche neutre multi-marques en lecture seule, incapable d'inhiber ; dossier de sécurité aéronautique ; prix PME en TND ; prévision en local | 0:30 |
| 5 | Architecture et isolation | Schéma : SSI → relais/passerelle → **barrière d'isolation galvanique (optocoupleurs, Modbus FC 1-4, BACnet lecture, diode/pare-feu)** → passerelle edge → vérificateur + jumeau → tableau de bord. Aucune flèche retour. Posé par l'installateur agréé, consigné dans la matrice | 0:25 |
| 6 | Sécurité : FHA + double boucle + ECAM | FHA : non-détection = catastrophique (portée par le SSI) ; fausse alarme = majeure ; défaillance IA = perte d'information consultative. Vote double boucle : rouge = 2 principes physiques + SSI. Niveaux ECAM : rouge / ambre sonore / ambre silencieux + indicateur de vie. IA = Concept Paper EASA niveau 1 ; DO-178C pour le logiciel classique seulement | 0:35 |
| 7 | Démo | Rejeu réel : pré-alarme → IA « soudure 91 % » → opérateur décide ; puis feu réel → rouge, nappe prévue à +60 s ; puis dérive capteur → ambre silencieux | 0:45 |
| 8 | Résultats honnêtes | Industrial Hall (CC BY 4.0), essais jamais vus : **17/17 feux, 11/15 nuisances rejetées (détecteur classique : 10/15), 3/5 fausses alarmes SSI reconnues, confirmation ≤ 60 s après le SSI pour 15/17 feux** ; autre site : **7/7 nuisances rejetées, 12/13 feux** ; prévision +60 s : **± 0,06 m / ± 6,8 °C en 0,14 ms** | 0:25 |
| 9 | Modèle économique & Tunisie | Paliers 7 000 + 450 / 22 000 + 1 200 / 45 000 + 3 000 TND ; 4 519 industriels de 10+ salariés ; premiers clients : établissements classés (étude de dangers, POI) ; seuil récurrent ≈ 16 sites (A1), résultat positif en année 3 ; crédit d'assurance exclu | 0:35 |
| 10 | Feuille de route & demande | Banc « iron bird » matériel → pilote 90 jours où le gain est **mesuré** → 10 sites. Demande : 1 site pilote, 1 installateur SSI agréé, un cadre de test avec la Protection Civile | 0:20 |

**Total : 4:40** (20 s de marge).

## Phrases du pitch (à dire mot pour mot)

- Slide 4 : « Bosch, Honeywell et Hikvision mettent l'IA *dans* leurs détecteurs. PolyU prévoit le feu à 60 s, dans le cloud. Nous, nous ajoutons une couche neutre, branchée en lecture seule sur n'importe quel SSI existant, incapable par construction d'inhiber une alarme — et nous le prouvons avec les méthodes de sécurité de l'aéronautique. »
- Slide 3 ou 10 : « Les yeux existent. Ce qui manque à une PME tunisienne, c'est un copilote qui lit son SSI sans jamais pouvoir le toucher. »
- Slide 8 : « Sur le jeu de données public Industrial Hall (CC BY 4.0), validé par répétition et non par ligne, notre fusion détecte les 17 feux d'essai et rejette 11 nuisances sur 15, contre 10 pour un détecteur optique classique ; elle reconnaît 3 des 5 fausses alarmes de ce détecteur et confirme le feu au plus 60 s après l'alarme SSI dans 15 cas sur 17. Sur un autre site jamais vu : 7 nuisances rejetées sur 7. La réduction réelle sur site sera mesurée pendant le pilote de 90 jours. »
- Slide 6 : « Aero-Fire DT ne revendique aucune certification aéronautique. Nous transposons des méthodes éprouvées pour en hériter la rigueur. »

## Slides de réserve (Q&R)

- **R1 — Angles morts assumés :** marques de SSI dominantes en Tunisie (inconnues) ; coût de l'installateur pour le raccordement (à chiffrer) ; INPDP et caméras thermiques (statut non tranché, autorisation demandée) ; gain réel (mesuré au pilote).
- **R2 — Nomenclature matériel (BOM) :** passerelle Jetson Orin Nano Super (~760-1 060 TND) ou Raspberry Pi 5 ; nœud ESP32 + SCD41 + SPS30 + BME688 + CO (~240-455 TND) ; PureThermal Mini Pro + Lepton 3.5 (~1 120 TND) ; modules DI optocouplés. Palier A ≈ 3 000 TND avant droits, 4 000-4 500 rendu. Change BCT 1 USD = 3,0335 TND.
- **R3 — Cadre légal :** Loi 2009-11, Décret 2006-2687, arrêté du 14 août 2020, Loi 2004-63 + Décret 2007-3004 ; EN 54-13 (« autre système »), NFPA 72 (équipement supplémentaire).
- **R4 — Équipe et répartition des rôles.**

## Rappels de soumission

- PDF exporté **identique** au pitch oral (−10 pts sinon). Dépôt Drive visé **08:30**, limite 09:00 le 22 novembre ; aucune modification après dépôt.
- « Partenaires du challenge », jamais « nos partenaires ».
- Lien du repo GitHub public en slide 5 et slide 10 : **https://github.com/AhmedHammouda5000/aero-fire-dt**.
- En cas d'égalité, le jury privilégie le coût de réalisation le plus faible : la démo est 100 % logicielle, le produit ne remplace rien.
