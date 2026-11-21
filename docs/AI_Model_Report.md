# Rapport du modèle IA — Aero-Fire DT

*Livrable « rapport du modèle (architecture, choix du modèle, dataset) » du cahier des charges. Version finale : décrit exactement le prototype livré dans le dépôt GitHub ; tous les chiffres sont mesurés et reproductibles (`python scripts/run_all.py`).*

## 1. Objectif et contrainte de sécurité

Deux fonctions d'**aide à la décision** pour l'opérateur du poste de sécurité :

1. **Vérification d'alarme** : distinguer un feu naissant d'une nuisance (aérosol, échappement, soudure…) et surveiller la cohérence des capteurs (dérive).
2. **Prévision à t+30 / t+60 s** dans le jumeau numérique : hauteur de la nappe de fumée, température, temps restant avant conditions intenables.

**Contrainte absolue :** le système est hors de la chaîne de sécurité certifiée. Il lit le SSI en lecture seule et ne peut ni acquitter, ni réarmer, ni temporiser, ni inhiber une alarme. Il peut seulement escalader plus vite. Positionnement : assistance à l'humain (niveau 1 du Concept Paper IA de l'EASA, Issue 2, transposé).

## 2. Architecture livrée

```
SSI certifié (simulé) ──relais──► optocoupleurs ──► passerelle (Modbus lecture FC03 seulement)
                                                        │   aucune voie de retour
9 nœuds multi-capteurs (particules, CO, H2, COV, CO2, T, HR) ─► caractéristiques causales
                                                        │
              ┌─────────────────────────────────────────┤
              ▼                                         ▼
  3 canaux physiques indépendants             Score IA feu / nuisance
  A particules · B gaz · C chaleur            (HistGradientBoosting, 19 variables)
              └──────────────► Vote « double boucle » ◄─┘
                               ROUGE = SSI + IA ≥ 0,70 + particules ET (gaz OU chaleur)
                                        │
  Modèle de zones (physique) ─► 5 000 feux simulés ─► IA de substitution (MLP 64×64)
                                        │                 └─► prévision t+30 / t+60, temps avant intenabilité
                                        ▼
              Jumeau IFC (IfcOpenShell) ─► Tableau de bord inspiré de l'ECAM (l'opérateur décide)
```

| Composant | Modèle retenu | Pourquoi ce choix |
|---|---|---|
| Vérification feu / nuisance | `HistGradientBoostingClassifier` (scikit-learn), 300 arbres max., 15 feuilles, régularisation L2 | Fonctionne bien sur des petits jeux tabulaires, rapide (2,3 ms par cycle de 9 nœuds sur un portable), sans dépendance lourde, facile à figer et versionner |
| Vote multicritère | Règles déterministes « double boucle » | Inspiré de la détection incendie moteur à double boucle (boucle A ET boucle B) : la décision rouge ne repose jamais sur l'IA seule |
| Surveillance de dérive | Règle de cohérence inter-nœuds (écart persistant 3 min sans signal corrélé) | Transposition du test intégré (BIT) des boucles de détection aéronautiques |
| Prévision | Modèle de zones Python (physique) + IA de substitution `MLPRegressor` 64×64 (ReLU) | Le modèle physique est explicable ; l'IA de substitution répond en 0,14 ms et tourne dans le navigateur (JavaScript, vérifié identique à Python) |
| Vision (caméra) | **Non incluse dans le prototype** (feuille de route) | Aucun jeu de données thermique de feux en bâtiment n'existe en libre accès ; YOLOv8 est sous licence AGPL-3.0. Produit : détecteur Apache-2.0 (YOLOX, RT-DETR, D-FINE) |

## 3. Données

| Jeu | Contenu | Licence | Usage |
|---|---|---|---|
| **Indoor Fire Dataset — Industrial Hall** (Mendeley, DOI 10.17632/yghykzm4km.1) | Hall industriel 10 × 22 × 8 m, 9 nœuds, 1 mesure / 10 s, 248 502 lignes. **17 essais de feu** (bois ×7, bougies ×4, câble ×3, mèches ×3) et **15 essais de nuisance** (déodorant ×3, échappement ×3, machine à fumée ×2, CO ×2, éthanol ×2, soudure, découpe abrasive, déchets verts) | CC BY 4.0 | Entraînement + validation |
| **Salle d'essai EN 54** (Mendeley, DOI 10.17632/npk2zcm85h) | 305 304 lignes, 13 feux, 7 nuisances (éthanol, déodorant, laque) | CC BY 4.0 | Test sur un autre site, jamais vu |
| Scénarios de feu simulés | 5 000 feux (modèle de zones), halls de 150 à 5 000 m², hauteur 4-14 m, croissance lente à ultra-rapide, portes / exutoires, 15-42 °C | produits par nous | Entraînement de l'IA de substitution |

Les données brutes ne sont pas redistribuées : `scripts/download_data.py` les télécharge et vérifie leur empreinte SHA-256.
Note : CO et éthanol sont étiquetés « ni feu ni nuisance » dans le fichier ; ce sont des rejets volontaires, nous les traitons comme des nuisances.

**Caractéristiques (19, toutes causales — calculables en temps réel sur la passerelle) :** hausse de chaque grandeur au-dessus d'une ligne de base « air propre » (quantile 10 % sur 30 min, par nœud), pentes sur 60 s, logarithme des hausses de particules (totales, 0,5 µm, 2,5 µm), ratio grosses/fines particules, taille typique, ratios gaz/particules et COV/particules.
Variables les plus utiles (importance par permutation) : hausse des COV, ratio COV/particules, hausse du CO, particules fines, hausse de température.

## 4. Protocole d'évaluation (sans fuite de données)

- **« Leave-one-episode-out »** : chacun des 32 essais est jugé par un modèle entraîné **sans aucune ligne de cet essai**. Un découpage aléatoire par lignes donnerait > 99 % par fuite (lignes voisines quasi identiques) ; nous ne l'utilisons pas.
- **Référence** : un détecteur optique classique mono-critère (seuil de particules), qui modélise le SSI.
- **Activité normale** : 56,6 h de périodes calmes (hors 15 min après chaque essai).
- **Autre site** : modèle entraîné sur le hall, testé sur la salle EN 54.

## 5. Résultats mesurés

| Indicateur | IA Aero-Fire DT | Détecteur optique classique |
|---|---|---|
| Feux détectés (hall, essais jamais vus) | **17 / 17** | 17 / 17 |
| Essais de nuisance rejetés | **11 / 15 (73 %)** | 10 / 15 (67 %) |
| Fausses alarmes du détecteur classique reconnues comme nuisance | **3 / 5** (les 3 aérosols) | — |
| Feux confirmés avant l'alarme du détecteur / au plus 60 s après | **9 / 17 · 15 / 17** (objectif ≤ 60 s inspiré de 25.858) | — |
| Fausses alertes « feu » sur 56,6 h d'activité normale | 1 | 1 |
| Précision équilibrée par mesure (hall) | 91,6 % | — |
| **Autre site (EN 54)** : feux confirmés / nuisances rejetées | **12 / 13 · 7 / 7** (le feu non confirmé reste signalé par le SSI) | 13 / 13 · 6 / 7 |
| Précision équilibrée par mesure (EN 54) | 92,3 % | — |

| Prévision (1 000 scénarios simulés jamais vus) | IA de substitution | Sans IA (« rien ne change ») |
|---|---|---|
| Erreur hauteur de nappe à +60 s (RMSE) | **0,06 m** | 0,41 m |
| Erreur température à +60 s (RMSE) | **6,8 °C** | 34,4 °C |
| Erreur moyenne sur le temps avant conditions intenables | 36 s | — |
| Alerte « intenable dans 60 s » correcte | 96,2 % | — |
| Temps de calcul | **0,14 ms** | modèle physique : 8,3 ms |

**Amélioration documentée (v1 → v2) :** la première version (un seul canal suffisait) rejetait 53 % des nuisances et produisait 26 fausses alertes pour 100 h ; l'application de la règle double boucle a porté le rejet à 73 % et les fausses alertes à 1,8 pour 100 h, au prix d'une confirmation plus tardive (médiane 420 s au lieu de 150 s après le début de l'essai). La v1 comptait aussi à tort des verdicts antérieurs au début de l'essai (erreur d'évaluation corrigée).

**Pour situer :** les auteurs du jeu de données obtiennent environ 69-73 % de classification lors d'un transfert d'une chambre de laboratoire vers la salle EN 54 (Vorwerk et al., *Sensors* 2024) — protocole différent, comparaison indicative seulement.

## 6. Modèle physique de la prévision

Modèle à deux zones (même famille que CFAST du NIST) : feu en t² (α de 0,003 à 0,19 kW/s²) plafonné, entraînement du panache de Heskestad, bilan de masse et d'énergie de la couche chaude, sorties de fumée par porte et exutoire, jet sous plafond d'Alpert, réponse de détecteur (RTI). Conditions intenables : nappe sous 2 m ou au-dessus de 60 °C (critère simplifié ; la méthode complète est la dose ISO 13571).
**Vérifications :** 5 tests physiques automatiques (descente monotone, feu rapide plus dangereux, exutoire bénéfique, grand volume plus lent) et comparaison à la formule analytique de remplissage d'une salle fermée (écart 16 %). Température plafonnée à 1 000 °C : au-delà de l'embrasement généralisé (~600 °C) le modèle est hors domaine, ce que le tableau de bord affiche.

## 7. Limites (dites honnêtement)

- **1 à 3 répétitions par type de nuisance** : la soudure (1 essai) et la machine à fumée (2 essais) trompent encore l'IA ; elles ne peuvent pas être apprises en validation croisée. Le pilote de 90 jours sert à collecter les nuisances propres à chaque usine.
- Les feux d'essai sont **naissants** : la croissance d'un grand feu est une **hypothèse** du modèle de zones (prolongation simulée, affichée comme telle).
- Les positions des nœuds dans le hall ne sont pas publiées (disposition plausible), le **SSI est simulé**.
- La prévision est validée contre le modèle physique, **pas encore contre des feux réels de grande taille** (prochaine étape : CFAST/FDS, essai contrôlé).
- La règle double boucle rend la confirmation plus prudente donc parfois plus lente : c'est un choix de sécurité assumé, l'alarme SSI restant toujours prioritaire.

## 8. Sûreté et cycle de vie

- Architecture à double chaîne : SSI certifié indépendant (aucune alimentation, aucun réseau, aucun capteur partagés) ; la pire défaillance de l'IA est une perte d'information consultative, jamais une alarme manquée (voir `Safety_Case.md`).
- Modèles figés et versionnés (`model.pkl`, `surrogate.json`), chaque inférence journalisable ; réentraînement hors fonction de sécurité, puis revalidation complète (`run_all.py`).
- Logiciel classique : démarche inspirée de la DO-178C ; composante IA : assurance de l'apprentissage et explicabilité selon le Concept Paper IA de l'EASA. ED-324 / ARP6983 en veille. Aucune certification revendiquée.

## 9. Dépôt public

Structure : `ai/alarm_verifier/` (vérification), `ai/forecast/` (physique + IA de substitution), `twin/` (IFC), `scenarios/` (rejeu de mesures réelles), `app/` (tableau de bord, fonctionne hors ligne), `edge/` (simulateur de SSI + passerelle lecture seule), `tests/`, `docs/`.
Reproduction complète : `pip install -r requirements.txt` puis `python scripts/run_all.py` (≈ 4 min sur un portable), puis ouvrir `app/index.html`.
Licence du code : MIT. Données : CC BY 4.0 (attribution aux auteurs du jeu Mendeley). Three.js : MIT.
**[URL GitHub à compléter par l'équipe]**
