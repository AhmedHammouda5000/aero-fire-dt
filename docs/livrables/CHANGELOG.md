# CHANGELOG — Aero-Fire DT Tunisie v2

Corrections appliquées à partir de la vérification (« Aero Fire DT implementation check », §10). Les fichiers d'origine ne sont pas modifiés.

## Transversal
- Suppression des « −40 % fausses alarmes / −50 % délai de levée de doute » (non sourcés) → métriques mesurables sur données ouvertes, placeholders `[X %]`, `[Y s]` « à compléter après exécution du prototype », gain réel mesuré au pilote de 90 jours.
- NASA FIRMS et FLAME retirés (feux de forêt, hors sujet) → Industrial Hall + salle EN54 (Mendeley, CC BY 4.0), Zenodo 5643075, NIST FCD.
- Aéronautique : « inspiré de / transposé », jamais « certifié / conforme ». Suppression de SORA, du « pont normatif DO-178C ↔ EN 54 », des drones dans le cœur du produit.
- Ajout systématique du raccordement en lecture seule, isolé, posé par l'installateur agréé.
- Change BCT du 12 nov. 2026 : 3,0335 TND/USD, 3,3639 TND/EUR.

## Executive_Summary.md
- 25.858 = objectif de performance (alerte < 60 s), plus de « rejet des faux positifs FAR 25.858 ».
- Ajout de l'interface lecture seule, du paragraphe « Déjà fait / ce que nous ajoutons », des preuves sourcées (GOV.UK, indemnités incendie 92 MDT / 47,9 MDT).
- Retrait de SORA, « franchise TVA/douane » (non confirmée), VR/drone/évacuation et « moins d'eau polluée » de la solution.
- Marché sourcé (4 519 industriels, ~115 zones AFI), premiers clients via Décret 2006-2687, bourse fondateur Startup Act.

## AI_Model_Report.md
- Vision optionnelle, YOLOv8n D-Fire en AGPL-3.0 (inférence seule) ; alternatives Apache-2.0 pour le produit.
- Substitution entraînée sur un modèle de zone Python (pas FDS) ; vérification CFAST ; sorties par zone à t+30/t+60.
- Nouveau tableau des jeux de données (URL, licence, sha256) ; découpage par répétition + inter-sites ; avertissement fuite des découpages aléatoires ; référence Vorwerk et al. 2024 (69-73 %).
- Sûreté : ARP4761A, Concept Paper IA EASA niveau 1, DO-178C limité au logiciel classique, ED-324 en veille.
- Structure du repo (`ai/alarm_verifier`, `ai/forecast_surrogate`, `app/`, `docs/safety`, `edge/panel_sim`) et https://github.com/AhmedHammouda5000/aero-fire-dt.
- Retrait : transformer spatio-temporel, RL évacuation, FDS+Evac/Pathfinder, « documenté pour l'inspection UAV ».

## Adapted_BMC.md
- Proposition de valeur sans −40/−50 ; verdict < 60 s dans la fenêtre de levée de doute.
- Mise en service relevée : A 4 500 → 7 000, B 12 000 → 22 000, C 35 000 → 45 000 TND (matériel rendu + pose).
- Segment B rattaché au Décret 2006-2687 ; ressources : INPDP + installateur agréé (au lieu de SORA) ; partenaires : passerelles constructeurs, Apave/bureaux de contrôle.
- Retrait de l'inspection drone, de la formation VR, de la franchise douanière, du démarrage NASA FIRMS.

## Financial_Projections.csv
- Ligne droits/TVA/fret (+40 %, plage 30-50 %) ; coûts de mise en service par palier ; coût variable 500 → 2 400 TND/site/an (support 7j/7).
- Opex croissant : +1 ingénieur et +1 technicien en A2, +1 technicien et +1 commercial en A3.
- Drone thermique et licence simulateur retirés du capex ; capex 67 600 → 46 762 TND.
- Bourse fondateur Startup Act en entrée (hypothèse 36 000 TND) ; « exonération douanière Startup Act » supprimée.
- Montée en charge (abonnement à 50 % l'année d'installation) ; seuil récurrent 16 / 23 / 31 sites ; résultat −55 600 / −30 400 / +66 800 TND ; formules dans la colonne Notes. Crédit d'assurance toujours exclu.

## Team_Report.md
- §3 : interface lecture seule + dossier de sécurité ; §4 C1/C3/C4 réécrits ; nouveaux §5 « Ce qui existe déjà / ce que nous ajoutons » et §6 base légale tunisienne ; limites mises à jour.

## Empathy_Map.md
- Gains corrigés (preuve que le SSI n'est pas modifié ; verdict < 60 s avec zone et procédure ; pré-plan IFC et prévision 30-60 s).
- Retrait de −40 %, −50 %, drone, VR. Ajout d'un 4e persona : installateur SSI agréé (acteur clé du raccordement).

## Explainer_Video_Script.md
- Lien isolé à sens unique (0:15), enregistrement réel du tableau de bord « soudure 91 % » (0:31), nappe prévue à +60 s (0:39), clôture « Lecture seule. Jamais d'inhibition. ».
- Retrait du drone, de SORA, de l'argument eau d'extinction.

## Pitch_Deck_Outline.md
- 10 slides / 4:40 ; slide 2 preuves (GOV.UK, NIST 200:1, absence de statistique tunisienne) ; nouvelle slide « Déjà fait / ce que nous ajoutons » ; slide schéma d'isolation ; slide FHA + double boucle + ECAM ; slide résultats honnêtes.
- Phrases du pitch en français ; réserves : angles morts, BOM, cadre légal. « Partenaires du challenge ».

## Implementation_Roadmap.md
- Phase 1 : banc « iron bird » hardware-in-the-loop + raccordement réel par l'installateur ; phase 2 : INPDP avant caméras ; phase 4 : drones uniquement sous autorité ONPC, SORA comme bonne pratique.
- KPI « mesuré au pilote » ; retrait du pont DO-178C ↔ EN 54 et de l'« obtention SORA ».

## Submission_Checklist.md
- Ajout : LICENSE (AGPL-3.0 si Ultralytics), scripts de téléchargement sans données brutes, attributions CC BY, `docs/safety/`, `make demo`, PDF = pitch oral, dépôt Drive visé 08:30, contrôles de cohérence.

## Nouveau : Safety_Case.md
- Positionnement, FHA, arbre de défaillances (mermaid), analyse des modes communs, spécification de vote double boucle et niveaux ECAM, interface lecture seule, matrice d'essais « iron bird » inspirée de l'AC 25-9A.

## Mise à jour finale (après exécution du prototype)

- Tous les placeholders `[X %]`, `[Y s]`, `[Z %]`, `[R]`, `[L ms]` remplacés par les résultats **mesurés** (reproductibles avec `python scripts/run_all.py`) : 17/17 feux, 11/15 nuisances rejetées (détecteur classique 10/15), 3/5 fausses alarmes SSI reconnues, confirmation ≤ 60 s après le SSI pour 15/17 feux ; autre site 7/7 nuisances, 12/13 feux ; prévision +60 s ± 0,06 m / ± 6,8 °C en 0,14 ms ; latence du vérificateur 2,3 ms par cycle.
- `AI_Model_Report.md` réécrit pour décrire **exactement** le prototype livré : Zenodo 5643075 et NIST FCD passent en « à ajouter » (non utilisés dans le prototype) ; vision (YOLO) non incluse ; IA de substitution = MLP 64×64 ; CFAST/FDS = validation future. Licence du code : MIT.
- Limites ajoutées partout où des résultats sont cités : soudure et machine à fumée (1-2 essais) trompent encore l'IA.
- Reste à compléter par l'équipe : https://github.com/AhmedHammouda5000/aero-fire-dt.
