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
- **Activité normale** : 49,9 h de périodes calmes (hors 30 min après chaque essai et hors lignes marquées nuisance).
- **Autre site** : modèle entraîné sur le hall, testé sur la salle EN 54.

## 5. Résultats mesurés

| Indicateur | IA Aero-Fire DT | Détecteur optique classique |
|---|---|---|
| Feux détectés (hall, essais jamais vus) | **17 / 17** | 17 / 17 |
| Essais de nuisance rejetés | **11 / 15 (73 %)** | 10 / 15 (67 %) |
| Fausses alarmes du détecteur classique reconnues comme nuisance | **3 / 5** (les 3 aérosols) | — |
| Feux confirmés avant l'alarme du détecteur / au plus 60 s après | **9 / 17 · 15 / 17** (objectif ≤ 60 s inspiré de 25.858) | — |
| Fausses alertes « feu » sur 49,9 h d'activité normale | **0** | 1 |
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

**Alerte précoce « FEU COUVANT POSSIBLE »** (consultative, jamais une confirmation) : score IA ≥ 0,70 pendant 30 s + un signal (fumée, CO ou H₂) encore en hausse sur 60 s. Évaluée sur les mêmes essais jamais vus : **17 / 17 feux** signalés, **10 / 17 avant un seuil optique standard** (le détecteur classique du prototype est ce seuil simulé, pas une vraie centrale), en moyenne 29 s (jusqu'à 250 s) avant la confirmation ; déclenchée sur **2 / 15 nuisances** seulement (machine à fumée) → simple levée de doute. Détails : `docs/results/early_warning.json`.

**Apprentissage local (testé sur NIST, données jamais vues)** : modèle du hall seul 7/8 feux, **6/33** fausses alarmes de cuisine écartées → après apprentissage sur les données du site **8/8 feux, 29/33** (fausses alarmes 27 → 4). Les données du site seules donnent le même résultat : sur ce test, **ce sont les données locales qui font le travail**, le modèle général n'apporte pas de gain (capteurs NIST différents des nôtres). L'usine d'origine n'est pas abîmée (17/17 feux conservés). D'où un pilote de 90 jours sur chaque site, sous la centrale certifiée. Détails : `docs/results/site_adaptation.md`.

### 5 bis. Robustesse (audit des données, `docs/results/data_audit.md`)

- **Petits échantillons** : 11 / 15 nuisances rejetées = 73 %, intervalle de confiance à 95 % (Wilson) **≈ 48 – 89 %** ; 17 / 17 feux = intervalle ≈ 82 – 100 %. Les chiffres sont prometteurs, pas définitifs.
- **Test plus sévère « un type de scénario entier caché »** (le modèle n'a jamais vu ce type de feu ou de nuisance) : **15 / 17 feux** confirmés, **10 / 15 nuisances** rejetées. C'est le chiffre à citer si un jury demande « et sur un type jamais vu ? ».
- **Nettoyage appliqué** : 639 lignes « Background » marquées nuisance (13/07 14:02–14:15) exclues de l'activité normale ; fenêtre après essai portée de 15 à 30 min (la fumée d'extinction n'est pas de l'air normal). Résultat après ce nettoyage : 0 fausse alerte IA sur 49,9 h (détecteur optique : 1) ; avant le passage à 30 min, l'IA en avait 1 : chiffre à lire avec cette réserve.
- Les nuisances de la salle EN 54 sont plus faciles que celles du hall, et les seuils ont été réglés sur le hall : le 7 / 7 EN 54 est un indicateur de transfert, pas une preuve.

**Pour situer :** les auteurs du jeu de données obtiennent environ 69-73 % de classification lors d'un transfert d'une chambre de laboratoire vers la salle EN 54 (Vorwerk et al., *Sensors* 2024) — protocole différent, comparaison indicative seulement.

## 6. Modèle physique de la prévision

Modèle à deux zones (même famille que CFAST du NIST) : feu en t² (α de 0,003 à 0,19 kW/s²) plafonné, entraînement du panache de Heskestad, bilan de masse et d'énergie de la couche chaude, sorties de fumée par porte et exutoire, jet sous plafond d'Alpert, réponse de détecteur (RTI). Conditions intenables : nappe sous 2 m ou au-dessus de 60 °C (critère simplifié ; la méthode complète est la dose ISO 13571).
**Vérifications :** 5 tests physiques automatiques (descente monotone, feu rapide plus dangereux, exutoire bénéfique, grand volume plus lent) et comparaison à la formule analytique de remplissage d'une salle fermée (écart 16 %). Température plafonnée à 1 000 °C : au-delà de l'embrasement généralisé (~600 °C) le modèle est hors domaine, ce que le tableau de bord affiche.

## 6 bis. Physique 3D en temps réel (CFD) — « voir où va le feu »

En plus du modèle de zones, le tableau de bord embarque un **solveur de mécanique des fluides 3D** écrit pour le navigateur (`app/js/cfd.js`) :
- grille décalée (MAC) 44 × 16 × 20 cellules de 0,5 m (14 080 cellules) couvrant tout le hall ; advection semi-lagrangienne, flottabilité de Boussinesq, pression par SOR, murs étanches, porte et exutoire ouverts ;
- transport conservatif de la température, des suies (fumée), du CO, du CO₂, de l'H₂, des COV et des grosses particules, avec diffusion turbulente ;
- vrais objets combustibles (étagères de friperie, palettes de carton, fûts d'huile) : courbe t², puissance par m², rendements de fumée et de CO (valeurs SFPE / Tewarson indicatives) ; **propagation par rayonnement et convection** d'un objet à l'autre ;
- critères d'intenabilité à 1,8 m (visibilité, température, CO) → **carte de danger** au sol ; prévision **+60 s** calculée en arrière-plan par la même physique (« fantôme » cyan).

**Vérifications automatiques (`tests/test_cfd.js`, résultats `docs/results/cfd_validation.json`)** : panache comparé à Heskestad (rapports 0,5 – 0,9 selon la hauteur, la maille de 0,5 m étale le panache), jet sous plafond comparé à Alpert (rapports 1,0 – 1,2 dans son domaine de validité), conservation de la masse de fumée (1,00), évacuation par les ouvertures, propagation aux voisins avant les objets éloignés, hauteur de flamme, vitesse ≈ 15 – 25 ms par pas de 0,5 s (≈ 20 × plus rapide que le temps réel).
**Portée** : maille grossière (pas de détail sous 0,5 m), pas de modèle de combustion détaillé ni de rayonnement des fumées ; c'est un outil de visualisation et d'aide à la décision, pas un remplaçant de FDS pour une étude d'ingénierie.

## 6 ter. Banc d'essai libre (scénario F)

L'utilisateur place lui-même **des feux** (cigarette, bougies, petit / grand feu de bois, balle de textile, plastiques) et **des nuisances** (aérosol, soudure, échappement de chariot, poussière de découpe) n'importe où dans le hall, avec l'intensité de son choix. La CFD transporte fumée, gaz et chaleur jusqu'aux 9 nœuds ; les concentrations sont converties en **capteurs synthétiques** dans les mêmes unités que les capteurs réels ; puis **le même modèle IA (exporté en JavaScript, écart avec Python 1e-16)**, le même vote double boucle et un SSI optique simulé décident.

Matrice automatique (`tests/test_sandbox.js`, source à ~3,5 m d'un nœud, 200 – 300 s) :

| Source | Résultat |
|---|---|
| Petit / grand feu de bois, textile, plastiques | **FEU CONFIRMÉ** (IA après 90 – 120 s ; SSI à 60 – 90 s) |
| Aérosol, échappement | **NUISANCE** reconnue (alarme SSI maintenue, levée de doute demandée) |
| Soudure, poussière | **INCERTAIN** : jamais confirmé comme feu, levée de doute demandée (cas limites connus) |
| Cigarette, bougies à 4 m des capteurs | non détectées (trop peu de fumée à 3 m de hauteur) — limite réaliste |

**Honnêteté** : les capteurs synthétiques sont une approximation physique calibrée sur les ordres de grandeur du jeu de données ; l'IA a été entraînée sur de vrais capteurs. Le banc est un **test qualitatif** (« que se passe-t-il si… ? »), pas une validation.

## 7. Limites (dites honnêtement)

- **Test indépendant NIST (USA, données jamais vues, aucun réglage)** : avec seulement 7 des 19 entrées disponibles (pas de capteur COV ni H₂, compteur de particules différent), l'IA confirme **7 / 8 feux** mais ne rejette que **6 / 33 nuisances de cuisine** (cigarettes : 2 / 2 rejetées ; bacon, hamburgers, pizza : non). Conclusion : les capteurs **COV et H₂ sont indispensables** (ce sont les entrées les plus utiles du modèle) et une cuisine ou cantine demande un apprentissage sur site pendant le pilote. Détails : `docs/results/nist_fr4019.md`.

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

Structure : `ai/alarm_verifier/` (vérification, export JavaScript), `ai/data_audit/` (audit des données), `ai/forecast/` (physique + IA de substitution), `app/js/cfd.js` (CFD 3D), `app/js/sandbox.js` (banc d'essai libre), `twin/` (IFC), `scenarios/` (rejeu de mesures réelles), `app/` (tableau de bord, fonctionne hors ligne), `edge/` (simulateur de SSI + passerelle lecture seule), `tests/`, `docs/`.
Reproduction complète : `pip install -r requirements.txt` puis `python scripts/run_all.py` (≈ 4 min sur un portable), puis ouvrir `app/index.html`.
Licence du code : MIT. Données : CC BY 4.0 (attribution aux auteurs du jeu Mendeley). Three.js : MIT.
**https://github.com/AhmedHammouda5000/aero-fire-dt**
