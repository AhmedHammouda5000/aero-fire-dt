# Test indépendant : NIST FR 4019 (alarmes de nuisance, maison préfabriquée)

Date : 21 nov. 2026. Code : `ai/external_test/nist_fr4019.py`. Résultats complets : `docs/results/nist_fr4019.json`.

## En bref
- **Les données NIST servent uniquement au test.** Aucun entraînement, aucun seuil et aucun choix de variables n'a été réglé sur ces données.
- Feux confirmés : **7/8** (IC 95 % : 53–98 %).
- Nuisances rejetées : **6/33** seulement (IC 95 % : 9–34 %). La plupart des essais de cuisson sont classés FEU.
- **Résultat mauvais pour les nuisances, et c'est utile à savoir.** Sans les capteurs H2 et COV, et avec un autre compteur de particules, le modèle ne distingue pas la cuisson d'un feu couvant.
- Le résultat ne remet pas en cause le vérificateur complet (19 variables). Il montre ses limites quand on lui retire ses meilleures variables et qu'on change de capteurs.

## Données
- Essais NIST MHN06 à MHN47 (Cleary 2003, TN 1455 chap. 6), soit 42 fichiers .xls téléchargés depuis https://www.nist.gov/node/437741. MHN01 à 05 et 48 à 50 n'existent pas (erreur 404).
- Le sha256 de chaque fichier est dans `data_raw/nist_fr4019/manifest.json` et dans le JSON de résultats.
- Les étiquettes viennent du tableau de la page NIST.
  - MHN06 à 39 : 34 nuisances (toasts, bacon, pizza, spaghetti, beurre/margarine, steaks hachés, cigarettes, tortillas, bagels, frites, bougies).
  - MHN40 à 47 : 8 feux naissants (mousse PU couvante ×4, blocs de bois sur plaque ×2, mèches de coton ×2).
- MHN30 n'a pas de compteur de particules (CPC). Il n'est donc pas évaluable dans la variante principale, ce qui laisse 33 nuisances.

## Méthode (simple)
1. **Variables réduites.** On garde seulement les 7 variables qu'on peut calculer sur NIST : `d_CO`, `d_TEMP`, `d_HUM`, `log_dPM`, `slope_CO`, `slope_TEMP` et `gas_per_smoke_co`. Cette dernière est notre ratio gaz/fumée sans le terme H2.
   - Les variables supprimées ne sont **pas remplacées** par des valeurs inventées : H2, COV, CO2, tailles PM0.5/PM2.5, coarse_ratio, PMSIZE, voc_per_smoke et slope_PMTOT.
2. **Modèle.** Même modèle qu'avant (HistGradientBoosting, mêmes réglages et mêmes poids par essai), entraîné **seulement sur le hall industriel Mendeley**.
3. **Coût de la réduction, mesuré d'abord sur le hall** (validation leave-one-episode-out) :

   | Hall industriel | Feux confirmés | Fausses alarmes nuisance | Délai médian FEU | Précision équilibrée (lignes) |
   |---|---|---|---|---|
   | Vérificateur complet (19 var.) | 17/17 | 4/15 | 420 s | 0,92 |
   | Vérificateur réduit (7 var.) | 17/17 | 5/15 | 580 s | 0,80 |

4. **Application figée au NIST.** On garde les mêmes règles qu'avant : vote à deux canaux, moyenne lissée EMA 0,4, 3 pas de 10 s pour confirmer, seuils P_FEU 0,7 et P_NUIS 0,3.
   - Canal A, particules : `log_dPM > 5`.
   - Canal B, gaz : CO seul (`d_CO > 0,8 ppm`).
   - Canal C, chaleur : `d_TEMP > 1,5 °C`.
5. **Adaptation au NIST.**
   - Chaque position A à G est un « nœud » avec sa propre cellule CO. Le thermocouple plafond, la sonde d'humidité et le compteur de particules sont uniques, placés dans la cuisine, et partagés par tous les nœuds.
   - Signaux ramenés à un pas de 10 s, valeurs aberrantes retirées, médiane glissante sur 5 points.
   - Ligne de base = médiane des données avant l'essai (seulement 20 s à 4 min de données).
   - Fenêtre d'évaluation : de t = 0 à la fin de la source décrite dans TN 1455.
6. **Détecteurs de comparaison sur les mêmes essais.**
   - Seuil particules classique (`log_dPM > 6,9`, même règle que sur le hall).
   - Capteurs NIST photoélectriques et ioniques aux 7 positions, sensibilité moyenne (0,083 et 0,033 m⁻¹, TN 1455 tableau 22), maintenue 20 s.

## Résultats NIST (variante principale : compteur CPC)

| | Feux détectés (n = 8) | Nuisances rejetées (n = 33) |
|---|---|---|
| **IA, vérificateur réduit** | **7/8** (53–98 %) | **6/33** (9–34 %) |
| Seuil particules classique | 8/8 (68–100 %) | 0/33 (0–10 %) |
| Capteurs photo NIST | 3/8 (14–69 %) | 15/33 (30–62 %) |
| Capteurs ioniques NIST | 5/8 (31–86 %) | 15/33 (30–62 %) |

- Entre parenthèses : intervalles de Wilson à 95 %.
- Délai médian du verdict FEU après le début de la source : 390 s (180 à 850 s). MHN46 (mèches de coton, sans ventilateur) est manqué : verdict NUISANCE, score maximum 0,66.

### Par type de source (IA)

| Source | Étiquette | n | FEU | NUISANCE | INCERTAIN |
|---|---|---|---|---|---|
| Toast | nuisance | 4 | 3 | 0 | 1 |
| Bagels | nuisance | 2 | 1 | 1 | 0 |
| Bacon | nuisance | 4 | 4 | 0 | 0 |
| Pizza | nuisance | 3 | 3 | 0 | 0 |
| Spaghetti | nuisance | 4 | 3 | 1 | 0 |
| Beurre/margarine | nuisance | 5 (+1 non évaluable) | 4 | 1 | 0 |
| Steaks hachés | nuisance | 6 | 6 | 0 | 0 |
| Cigarettes | nuisance | 2 | 0 | 2 | 0 |
| Tortillas | nuisance | 1 | 1 | 0 | 0 |
| Frites | nuisance | 1 | 1 | 0 | 0 |
| Bougies | nuisance | 1 | 1 | 0 | 0 |
| Mousse PU couvante | feu | 4 | 4 | 0 | 0 |
| Blocs de bois (pyrolyse) | feu | 2 | 2 | 0 | 0 |
| Mèches de coton | feu | 2 | 1 | 1 | 0 |

### Variantes de sensibilité (pas de réglage, juste pour voir si le résultat tient)
- **Particules mesurées par le Dustrak** (masse, plus proche d'un capteur optique) au lieu du CPC : feux 6/8, nuisances rejetées 11/34.
- **Fichier complet** au lieu de la fenêtre nominale : mêmes résultats IA (7/8 et 6/33).

## Pourquoi c'est mauvais (explication honnête)
- **Les variables qui séparaient le mieux feu et nuisance sur le hall manquent.** Les plus importantes étaient COV et voc_per_smoke. Sans elles, le modèle s'appuie sur la chaleur, le CO et la quantité de particules. Or la cuisson produit aussi de la chaleur, du CO et beaucoup de particules.
- **Le compteur de particules n'est pas le même.** Le CPC NIST compte les particules dès 10 nm, notre capteur seulement à partir de 0,3 µm. Les hausses NIST atteignent log_dPM ≈ 14–15, alors que le maximum vu à l'entraînement est 10,4. Dans la médiane des essais de nuisance, 85 % des pas de 10 s sont au-dessus de tout ce que le modèle a vu. Le modèle extrapole donc vers « beaucoup de fumée = feu ». Avec le Dustrak, cet écart disparaît presque et le rejet des nuisances double (11/34), mais il reste faible.
- **Le canal chaleur est presque toujours actif en cuisine** (le plafond se réchauffe de 1 à 9 °C). La règle à deux canaux ne filtre donc pas la cuisson.
- **Le CO NIST est grossier.** La cellule a des paliers d'environ 4 à 5 ppm, alors que nos feux du hall montent à quelques ppm seulement. Un seul palier dépasse déjà le seuil du canal B (0,8 ppm).

## Limites
- Autre bâtiment (maison préfabriquée), autres capteurs, autre flux d'air, autre position des capteurs. Les particules, la température et l'humidité sont mesurées en un seul point, dans la cuisine, alors que les feux sont dans le salon.
- 7 variables sur 19, sans aucune donnée H2, COV, CO2 ni taille de particules. Le vérificateur réellement déployé n'est **pas** celui qui a été testé ici.
- Les unités de particules ne sont pas comparables. Seule la hausse en log est utilisée, sans recalage.
- Ligne de base courte (20 s à 4 min avant l'essai) au lieu d'une fenêtre glissante de 30 min.
- Fins d'essai lues dans le texte de TN 1455, donc approximatives.
- Les capteurs photo et ion NIST ont été retraités par nous (décalage du zéro, filtre). Les temps d'alarme publiés par NIST peuvent différer, et les capteurs photo F et G restent à zéro pendant les essais de feu.
- Petits effectifs : 8 feux. Les intervalles de confiance sont très larges.

## À retenir pour le projet
- Le vérificateur ne doit pas être présenté comme capable de rejeter les nuisances de cuisson **avec seulement particules + CO + température**. Les capteurs H2 et COV sont indispensables à sa valeur.
- Un test externe propre de la version complète demande un jeu de données avec H2 et COV et de vraies nuisances de cuisine. Nous n'en avons pas trouvé de public.
