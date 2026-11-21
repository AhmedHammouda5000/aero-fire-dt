# Audit des données d'entraînement — vérificateur d'alarme Aero-Fire DT

*Date : 21/11/2026. Scripts reproductibles : `python -I ai/data_audit/audit.py` (~10 s) et
`python -I ai/data_audit/experiments.py` (~3–4 min, lecture seule, le modèle de production n'est ni ré-entraîné ni écrasé).*

## 1. Verdict

**Oui, les données sont adaptées à un prototype de hackathon**, à condition de présenter les résultats
honnêtement : les deux jeux Mendeley (OVGU Magdeburg, CC BY 4.0) sont propres (aucune valeur manquante
sur les capteurs, aucun doublon d'horodatage, pas de saturation visible), bien étiquetés par essai, et ont
les mêmes capteurs, ce qui permet un vrai test inter-site. **Mais l'échantillon est petit** (33 essais dans
le hall, 20 dans la salle EN54, 1 seul essai pour soudure, découpe abrasive et déchets verts) : les taux
« 17/17 » et « 11/15 » ont des intervalles de confiance très larges, et les nuisances de la salle EN54
(éthanol, déodorant, laque) sont **faciles** pour notre architecture (presque pas de particules, donc le
canal double particules+gaz ne peut presque jamais déclencher). Ce ne sont pas des preuves de
performance terrain ; ce sont des preuves de faisabilité.

Chiffres clés de l'audit : en **leave-one-scenario-out** (type de feu/nuisance jamais vu) on tombe à
**15/17 feux et 10/15 nuisances** (contre 17/17 et 11/15 en LOEO) ; l'unique fausse alarme IA en
Background est de la **fumée d'extinction de bougies** étiquetée « Background » ; la normalisation par
nœud n'apporte rien.

## 2. Jeux de données audités

| | Industrial Hall | Salle EN54 |
|---|---|---|
| Fichier | `data_raw/industrial_hall/industrial_hall.csv` | `data_raw/en54/en54_room.csv` |
| DOI / licence | [10.17632/yghykzm4km.1](https://data.mendeley.com/datasets/yghykzm4km/1) — CC BY 4.0 | [10.17632/npk2zcm85h](https://data.mendeley.com/datasets/npk2zcm85h) — CC BY 4.0 |
| Lignes / nœuds | 248 502 / 9 (nœuds 6–13, 15) | 305 304 / 9 (nœuds 8–16) |
| Période | 10–13 juil. 2023 (3,2 jours) | 4–8 juil. 2022 (3,9 jours) |
| Échantillonnage | 10,0 s exact | ~10 s avec gigue (p01–p99 : 8,2–11,8 s) |
| Essais (≥ 50 lignes) | 17 feux + 15 nuisances (+1 essai fantôme `Cable#0`, 1 ligne) | 13 feux + 7 nuisances |
| Part de « Background » | 83,7 % | 83,0 % |
| Colonnes en plus | `fire`, `nuisance`, `anomaly_label`, `anomaly_scenario`, `progress_label`, `Valid_Experiment` | `UV_Room`, `ternary_label`, `anomaly_label` |

Répétitions par scénario (hall) : Bois 7, Bougies 4, Câble 3 (+1 ligne isolée), Mèches 3, Déodorant 3,
Échappement 3, Machine à fumée 2, CO 2, Éthanol 2, **Soudure 1, Découpe abrasive 1, Déchets verts 1**.
EN54 : Câble 4, Éthanol 4, Bougies 3, Mèches 3, Bois 3, Déodorant 2, Laque 1.

## 3. Qualité des données (tâche 1)

| Contrôle | Industrial Hall | EN54 | Impact |
|---|---|---|---|
| NaN capteurs | 0 | 0 | aucun |
| NaN méta | `progress_label` : 1 790 lignes (toutes Background) ; `anomaly_scenario` vide hors essais (normal) | 0 | aucun |
| Doublons (nœud, horodatage) | 0 | 0 | aucun |
| Trous > 5 min | 2 trous communs à tous les nœuds : 10 min 50 s (10/07 13:10) et 16 min 30 s (11/07 11:50) — 0,46 h perdues | 1 trou de 6 min (nœud 12) | faible ; la pente sur 6 pas enjambe le trou (voir §4) |
| Synchronisation | 99,9 % des pas de 10 s ont les 9 nœuds | 95,9 % | faible |
| Valeurs négatives | aucune (CO, H₂, VOC bornés à 0 → **écrêtage à zéro** : CO = 0 sur 38,6 % des lignes, H₂ 19,5 %, VOC 12,1 %) | CO < 0 sur **36,9 %** des lignes (min −1,30 ppm), H₂ 19,8 %, VOC 6,3 % ; nœuds 8, 9, 14 ont CO < 0 dans 65–82 % du temps | les deux sites ont des **conventions de zéro différentes** (un écrête, l'autre non) ; nos features en « montée au-dessus de la ligne de base » l'absorbent en grande partie |
| CO₂ impossible (< 350 ppm) | 16 353 lignes (6,6 %), dont 11 à 0 ppm ; surtout nœud 6 et 11 le 10/07 (dérive d'auto-calibration NDIR) | 4 783 lignes (1,6 %), min 97 ppm | `d_CO2` peu fiable ; importance faible dans le modèle (0,006) |
| Saturation / écrêtage haut | non : chaque max n'apparaît qu'une fois, plus long plateau ≤ 5 échantillons (sauf CO₂ : 168, plateau de capteur lent) | non | aucun |
| Cohérence PM | PM_Total ≥ PM05 toujours ; somme des classes / total : médiane 0,98 (classes disjointes, type Sensirion SPS30) | idem (0,99) | OK ; `PM40`, `PM100` quasi toujours nuls (≥ 97,6 % de zéros) → inutiles |
| Lignes « tout à zéro » | 1 ligne (coupure capteur) | 0 | négligeable |

**Offsets de calibration par nœud** (médiane du Background) : l'écart entre nœuds est grand devant le bruit
à court terme — CO : 0,48 ppm d'écart (hall) / 1,13 ppm (EN54) pour un bruit ~0,01–0,04 ppm ; CO₂ : 348 / 300 ppm
pour un bruit ~13 ppm ; humidité 4,3 / 3,1 %HR. Les particules, elles, sont homogènes (écart 3–5 particules).
→ Toute feature en **valeur absolue** de gaz serait un piège ; nos features sont des **différences** avec la
ligne de base glissante du même nœud, ce qui neutralise ces offsets. C'est le bon choix.

**Dérive jour par jour** (médiane du Background) : pas de dérive monotone nette, mais de fortes
variations d'un jour à l'autre : H₂ hall ×3–6 le 11/07 (0,3–0,9 → 2,1–3,7), PM hall 20 → 34 le 11/07,
VOC EN54 2,1 → 0,9 sur 4 jours, PM EN54 22 → 5. Ce sont des changements d'ambiance (essais
précédents, ventilation), absorbés par la ligne de base de 30 min.

**Cohérence des étiquettes (hall)**
- `scenario_label` ↔ `fire`/`nuisance` : parfaitement cohérent pour les 4 feux et 7 nuisances.
- **CO et Éthanol : `fire=0` ET `nuisance=0`** — confirmé : 1 363 lignes / 2 essais (CO) et 2 661 lignes /
  2 essais (Éthanol), mais `anomaly_label=1`. Nous les traitons comme nuisances (choix raisonnable : ce sont
  des rejets volontaires sans combustion), à documenter.
- **639 lignes `Background` marquées `nuisance=1`** (71 par nœud, 13/07 14:02–14:15 heure locale,
  ~20 min après la découpe abrasive) : un **événement de nuisance non annoncé** (particules jusqu'à 494)
  étiqueté Background par `scenario_label`. Notre évaluation « fausses alarmes en Background » l'inclut.
- `anomaly_scenario` est un identifiant d'essai (1–32) ; **l'id 21 couvre `Ethanol#2` ET `Green_Waste#1`**,
  enchaînés sans pause (0 min) : les déchets verts démarrent dans le panache d'éthanol.
- `Cable#0` : 1 ligne isolée (nœud 13) avec `experiment_number=0` juste avant `Cable#3` — artefact, déjà
  ignorée (seuil 50 lignes).
- `progress_label` est rempli aussi dans le Background (Outgasing, Smoldering…) → sans signification hors essai.
- `Valid_Experiment` vaut **1 partout** → aucune information.
- `anomaly_label` = (scénario ≠ Background) sauf les 639 lignes ci-dessus → redondant.

**EN54** : `ternary_label` et `anomaly_label` parfaitement cohérents avec `scenario_label`. Pas de numéro
de répétition (nous numérotons les blocs contigus — vérifié : 20 blocs, aucun chevauchement).

**Chevauchements / enchaînements** : aucun essai ne se chevauche. Mais la fenêtre de ligne de base de
30 min contient une partie de l'essai précédent pour **9/33 essais (hall)** et **8/20 (EN54)** ; deux
essais du hall démarrent < 1 min après le précédent (`Cable#3`, `Green_Waste#1`).

**Fumée résiduelle après les essais** (référence = niveau de chaque nœud dans les 10 min avant l'essai ;
seuils identiques aux canaux du vérificateur) :

| Fenêtre après la fin d'essai | Hall : part de lignes canal A (particules) | Hall : canal B (gaz) | EN54 : canal A | EN54 : canal B |
|---|---|---|---|---|
| 0–5 min | 3,2 % | 19,8 % | 3,1 % | 11,1 % |
| 5–15 min | 3,2 % | 12,9 % | 3,2 % | 4,0 % |
| 15–30 min | 3,6 % | 5,1 % | 0,1 % | 2,7 % |
| 30–60 min | 4,0 % | 2,8 % | 0,0 % | 1,0 % |

- Le résidu est surtout **gazeux** et vient des nuisances : CO#1/CO#2, Échappement#1, Déodorant#1,
  Câble#2, Soudure, Machine à fumée#2 (récupération 11 à > 60 min).
- Cas particulier important : **Bougies#3** — l'étiquette se termine au moment où les bougies sont
  éteintes ; la **fumée d'extinction** (PM médian 1 039 contre 57 avant) est étiquetée Background pendant
  ~20 min. Idem `Mèches#3` en EN54 (canal A actif 55–59 % du temps dans les 15 min suivantes).
- **8/32 essais (hall) et 5/19 (EN54)** ne sont pas revenus à l'état propre 15 min après la fin, donc
  au-delà de la fenêtre d'exclusion `POST = 15 min` de `train_eval.py`.

**Biais du Background** : sur les 56,7 h utilisées pour le taux de fausses alarmes, **63,6 % sont la nuit**
(hall vide, 19 h–7 h). Le taux « 1,77 alarme / 100 h » est donc mesuré surtout sur de l'air calme.

## 4. Choix de modélisation vs données (tâche 2)

| Question | Constat | Gravité |
|---|---|---|
| Features causales ? | **Oui.** Ligne de base = quantile 10 % sur 30 min `closed="left"` par nœud ; pentes = `x(t) − x(t−6 pas)` ; ratios instantanés. Rien ne regarde le futur. Petite réserve : `shift(6)` compte des lignes, pas des secondes → autour des 2 trous de 11–16 min la « pente 60 s » est en fait une pente sur ~17 min (2 × 9 points, négligeable). | aucune |
| Normalisation ajustée sur tout le jeu ? | **Non** : aucun scaler (arbres de gradient). Seuils des canaux fixés à la main. | aucune |
| Fuite LOEO par la ligne de base ? | Les features de l'essai suivant (dans le train) sont calculées avec une ligne de base qui contient les données brutes de l'essai testé (9 paires, ex. Éthanol#2 → Déchets verts). C'est une contamination faible (quantile 10 %), pas une fuite d'étiquette. | faible |
| Fuite par sélection d'hyper-paramètres | Les seuils (P_FIRE, CONFIRM_BINS, DUAL_CHANNEL, v1 → v2) ont été choisis **en regardant les résultats LOEO** du hall. Le LOEO est donc optimiste ; EN54 est le seul test vraiment externe (et il a aussi été consulté). | **moyenne** — à dire dans le pitch |
| LOEO ≠ généralisation à un nouveau type de nuisance | En LOEO, les autres répétitions du même scénario (même jour, même combustible) restent dans le train. Voir expérience E2 (leave-one-scenario-out). | **moyenne** |
| Étiquette d'essai entier | Tout l'essai « feu » est étiqueté feu, y compris la phase d'avant allumage (`Outgasing`). Atténué car on n'entraîne que sur les lignes « actives » (canal A ou B). | faible |
| `Valid_Experiment` | Constante (1) → inutile. | — |
| `anomaly_label` | Redondant avec le scénario, sauf 639 lignes (événement non annoncé) → à utiliser **uniquement pour exclure** ces lignes du Background. | utile (exclusion) |
| `anomaly_scenario` | Identifiant d'essai fiable → utile pour regrouper (montre qu'Éthanol#2 et Déchets verts forment un seul bloc). | utile |
| `progress_label` | Phases (Outgasing / Smoldering / Flaming…) : utile pour des métriques par phase ou pour pondérer, pas comme feature (non disponible en temps réel). | optionnel |
| `UV_Room` (EN54 seulement) | Flamme nue : UV max ≈ 403–406 sur les 3 essais Bougies, 356 sur Bois#1, 250 sur Câble#3 ; ≤ 2 sur toutes les nuisances. **Mais** UV aussi > 0 dans 2,5 % du Background (max 381) et 0 pour les feux couvants. Absent du hall → **impossible à entraîner** ; utilisable seulement comme 4ᵉ canal physique « flamme » à règle fixe, à valider. | idée, non prioritaire |
| `PM40`, `PM100` | ≥ 97,6 % de zéros → inutiles. | — |

## 5. Expériences rapides (lecture seule, `ai/data_audit/experiments.py`)

| Exp. | Question | Résultat |
|---|---|---|
| **E1** | D'où vient l'unique fausse alarme IA en Background (1,77 / 100 h) ? | **11/07 16:59:30** = la **fumée d'extinction de Bougies#3** (essai fini à 16:38, donc 21 min après, juste au-delà de `POST = 15 min`). Avec `POST = 30 min` : **0 fausse alarme IA en 49,9 h** (le détecteur optique classique : toujours 1). Exclure l'événement non annoncé du 13/07 ne change rien (le modèle ne déclenche pas dessus). |
| **E2** | Leave-one-**scenario**-out (toutes les répétitions du scénario testé retirées du train) | Feux **15/17** (ratés : **Câble#2 et Câble#3** — sans autre câble en train, le feu de câble n'est plus reconnu ; Câble#4 reste détecté), nuisances rejetées **10/15** (Déodorant 2/3 — Déodorant#3 devient fausse alarme —, Machine à fumée 0/2, Soudure 0/1, Découpe 0/1 ; CO, Éthanol, Échappement, Déchets verts tous rejetés), délai médian 500 s. → **le modèle généralise mal à un type de feu ou de fumée jamais vu** ; le LOEO (17/17, 11/15) est optimiste de 2 feux et 1 nuisance. |
| **E3** | Normalisation par nœud (montées divisées par le bruit propre de chaque nœud, estimé de façon causale sur les 90 premières minutes) | LOEO **17/17, 11/15** (identique), délai médian 490 s (contre 420 s) ; EN54 **12/13, 7/7** (identique). → **aucun gain** : les features en différence absorbent déjà les offsets. Ne pas l'adopter. |

Intervalles de confiance à 95 % (Wilson) : 17/17 → 82–100 % ; 11/15 → 48–89 % ; LOSO 10/15 → 42–85 % ;
EN54 12/13 → 67–99 % ; 7/7 → 65–100 %.

## 6. Faiblesses principales

1. **Petit nombre d'essais** : 15 nuisances (hall) dont 3 types à un seul essai ; un seul échec de plus
   ou de moins change le taux de rejet de 7 points. IC à 95 % (Wilson) pour 11/15 : environ 48–89 %.
2. **Nuisances EN54 trop faciles** : éthanol, déodorant, laque produisent peu de particules ; seul 1/7 fait
   déclencher le détecteur optique. Le « 7/7 » mesure surtout la règle double canal, pas le modèle.
3. **Les nuisances qui posent problème sont exactement les moins représentées** : machine à fumée (2),
   soudure (1), découpe abrasive (1) — ce sont nos 4 fausses alarmes en LOEO.
4. **Pas de nuisance « vie réelle »** : aucune cigarette, cuisson, poussière de chantier, vapeur, ni
   chariot diesel en continu. Aucun jeu public trouvé qui les combine avec nos capteurs (voir §7).
5. **Background majoritairement nocturne** et contenant un événement non annoncé + de la fumée
   d'extinction étiquetée Background.
6. **Seuils réglés sur les données d'évaluation** (optimisme du LOEO).

## 7. Jeux de données alternatifs (tâche 3)

| Jeu | Lien / licence (vérifié le 21/11/2026) | Capteurs → correspondance avec nos features | Nuisances | Effort | Valeur |
|---|---|---|---|---|---|
| **Petite chambre OVGU** (même équipe) | [10.17632/m85f9h6g9j.1](https://data.mendeley.com/datasets/m85f9h6g9j/1) — CC BY 4.0 | Mêmes nœuds : CO₂, CO, H₂, humidité, PM multi-tailles, T, VOC, UV → **correspondance directe** | **aucune** (4 feux : bois, bougies, câble, mèches ; 4–6 répétitions) ; chambre 2 × 0,8 × 0,6 m³ non ventilée ; **seulement 2 900 lignes** (données agrégées avec tendance Kendall-Tau — non vérifié dans le fichier) | faible (½ j) | **faible** : ajoute des feux, pas de nuisances ; échelle physique très différente (concentrations de chambre fermée) |
| **Smoldering fires** (Solórzano et al., Minimax) | [zenodo.org/records/5643075](https://zenodo.org/records/5643075) — CC BY 4.0 ; article : [10.1016/j.snb.2021.130961](https://doi.org/10.1016/j.snb.2021.130961) | Réseau de capteurs de gaz au plafond d'une salle de feu de 240 m³ ; détail des capteurs non lisible sur la page (selon le brief : diffusion optique 259/446 nm, CO, CO₂, PID — **non vérifié**). Correspondance probable : CO → `d_CO`, CO₂ → `d_CO2`, PID ≈ `d_VOC` (unités différentes), optique ≠ comptage PM → pas de `log_dPM`, `coarse_ratio`, `PMSIZE` | nettoyants, désodorisants (selon la page) ; feux couvants EN54 + PVC/câbles ; campagne petite échelle | moyen-élevé (2–3 j : ré-échantillonnage, mapping, nouveau modèle gaz seul) | **moyenne** comme test inter-site du **canal chimique** seul ; ne peut pas entraîner le modèle complet |
| **Kaggle « Smoke Detection Dataset »** (S. Blattmann) | [kaggle.com/datasets/deepcontractor/smoke-detection-dataset](https://www.kaggle.com/datasets/deepcontractor/smoke-detection-dataset) — licence « Other (specified in description) », **floue** | 1 Hz ; T, HR, TVOC, eCO₂, H₂ brut, éthanol brut, PM1/PM2.5, NC0.5/1.0/2.5 (SPS30) → PM ≈ `log_dPM05`, H₂ ≈ `d_H2` (unités brutes), **pas de CO** ; eCO₂ estimé (pas NDIR) | intérieur/extérieur normal, feux de bois/gaz, barbecues, humidité… mais **pas d'essais identifiés** (étiquette binaire par ligne) | moyen | **faible** : pas de découpage par essai (fuite garantie en validation aléatoire), licence incertaine, pas de CO → à éviter pour un livrable |
| **NIST Fire Calorimetry Database** | [nist.gov/el/fcd](https://www.nist.gov/el/fcd) — DOI 10.18434/mds2-2314 (licence NIST, non lue en détail) | Débit calorifique, produits de combustion 50 kW–20 MW ; **pas de capteurs de détection** | non | — | **nulle** pour le vérificateur ; utile seulement pour la courbe HRR du jumeau / modèle de zone |
| **NIST TN 1947** « Data on Smoke Alarm Performance » | [doi.org/10.18434/T4530X](https://doi.org/10.18434/T4530X) — licence ouverte NIST | Obscuration, courant de chambre d'ionisation, espèces gazeuses, T, HR | boîte à fumée et pièce ; nuisances non précisées sur la page | élevé | faible–moyenne (autres capteurs) |
| **NIST nuisances cuisson** (TN 2305, 2024 ; Cleary 2004 « nuisance sources ») | [NIST TN 2305](https://nvlpubs.nist.gov/nistpubs/TechnicalNotes/NIST.TN.2305.pdf) | Aérosols (concentration, diamètre), détecteurs photo/ionisation, CO (2004) | **cuisson** (2024), nuisances résidentielles (2004) | élevé ; fichiers de données **non trouvés** en ligne | potentiellement la seule source publique de **cuisson** — à creuser après le hackathon |

**Recherche ciblée cigarette / soudure / cuisson / poussière pour réseau multi-gaz** : aucun jeu public
trouvé qui combine ces nuisances avec un réseau CO/H₂/VOC/PM comparable au nôtre. Le hall OVGU reste la
seule source avec **soudure** et **découpe abrasive** (1 essai chacun) et **machine à fumée** (2 essais).
Cigarette et poussière : rien trouvé (**non exhaustif**, 4 requêtes web).

## 8. Corrections recommandées (les moins chères d'abord)

1. **Rendre l'évaluation plus honnête, sans toucher au modèle** (≈ 1 h) :
   porter `POST` de 15 à 30 min (E1 : l'unique fausse alarme IA en Background était de la fumée
   d'extinction de bougies) et exclure par principe les 639 lignes `nuisance=1` ;
   publier le **leave-one-scenario-out** à côté du LOEO ; afficher les IC de Wilson ; signaler dans le pitch
   que les nuisances EN54 sont « faciles » et que les seuils ont été réglés sur le hall.
2. **Compter la fumée d'extinction comme une nuisance distincte** (≈ 1 h) : les ~20 min après Bougies#3
   (et Mèches#3 en EN54) sont un cas réel « bougies soufflées » — à exclure du Background ou à
   étiqueter « post-feu » plutôt que « air propre ».
3. **Normalisation par nœud : inutile** (E3 : résultats identiques, délai un peu plus long) — nos
   features en différence absorbent déjà les offsets. Ne pas y passer de temps.
4. **Ajouter des données** : la petite chambre OVGU n'apporte que des feux (faible valeur) ; la vraie
   lacune (cigarette, cuisson, poussière, diesel) n'est comblable que par **nos propres essais** sur le
   matériel cible — c'est l'argument pour un pilote sur site, à mettre dans la feuille de route.
5. Retirer `PM40`/`PM100`, ignorer `Valid_Experiment`, documenter le choix CO/Éthanol = nuisance.
