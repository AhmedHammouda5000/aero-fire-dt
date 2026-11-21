# Check-list de soumission — Aero-Fire DT Tunisie

*Correspondance entre les livrables obligatoires et les fichiers. Version v2.*

| Livrable exigé par le brief | Fichier produit | Statut |
|---|---|---|
| Business Model Canvas (25 pts) | `Adapted_BMC.md` + `Financial_Projections.csv` | Fichier prêt |
| Compte rendu par équipe (15 pts) | `Team_Report.md` | Fichier prêt |
| Carte d'empathie (10 pts) | `Empathy_Map.md` | Fichier prêt |
| Vidéo explicative 1 minute (20 pts) | `Explainer_Video_Script.md` | **Script prêt — MP4 à enregistrer** |
| Rapport du modèle IA | `AI_Model_Report.md` | **Prêt — résultats mesurés intégrés** |
| Lien repo GitHub public | `AI_Model_Report.md` §6 | **https://github.com/AhmedHammouda5000/aero-fire-dt** (à rendre public) |
| Présentation PDF | `Pitch_Deck_Outline.md` | **Plan prêt — export PDF à générer** |
| Étude du besoin / faisabilité | `Executive_Summary.md`, `Team_Report.md`, `Safety_Case.md` | Fichiers prêts |
| Dépôt Google Drive + présentation live | — | **Action équipe : dépôt visé 08:30 (limite 09:00, 22 nov.)** |

## Contrôles du dépôt GitHub
- [x] `LICENSE` présent — MIT (aucun code AGPL : YOLO non inclus dans le prototype).
- [ ] **Scripts de téléchargement** des jeux de données (avec vérification sha256), **pas de données brutes** dans le repo (D-Fire : script uniquement, licence non vérifiée).
- [ ] Attributions CC BY 4.0 (Industrial Hall, salle EN54) dans `README.md` / `docs/DATA.md`.
- [ ] Dossier `docs/safety/` (FHA, arbre de défaillances, CCA, vote, interface) — contenu de `Safety_Case.md`.
- [ ] Démo reproductible en une commande (`make demo`) testée sur l'ordinateur du pitch.
- [ ] `metrics.json` et matrice de confusion générés, chiffres reportés dans les documents.

## Contrôles de cohérence
- [ ] **Le PDF des slides correspond exactement au pitch oral** (−10 pts sinon).
- [ ] Aucun « −40 % / −50 % », aucune mention « certifié / conforme DO-178C / 25.858 », aucun « certificat SORA ».
- [ ] Mêmes prix partout (7 000 / 22 000 / 45 000 TND + 450 / 1 200 / 3 000 TND/mois) et même cours de change (3,0335 / 3,3639).
- [x] Résultats mesurés intégrés ; - [x] URL GitHub : https://github.com/AhmedHammouda5000/aero-fire-dt

## Rappels de pénalités
- −5 pts : même idée qu'une autre équipe (d'où la slide « Déjà fait / ce que nous ajoutons ») ; −5 pts : absence aux formations (2 membres minimum).
- −10 pts : différence entre présentation orale et PDF déposé ; −10 pts : modification après dépôt.
- Hors délai (09:00, 22 novembre) : livrable refusé.
- Départage : coût de réalisation le plus faible.
