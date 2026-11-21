# Comment ça marche — fiche pour l'équipe (à lire avant le pitch)

Objectif : que chacun des 3 membres puisse expliquer chaque partie du prototype et répondre au jury.

## 1. L'idée en 30 secondes
Les alarmes incendie des usines sonnent souvent pour rien. Quand un vrai feu démarre, l'agent ne sait pas si c'est grave.
**Aero-Fire DT est un copilote** : il **écoute** l'alarme officielle (le SSI) **sans jamais pouvoir la toucher**, **vérifie** avec ses propres capteurs comme un moteur d'avion (deux « boucles » doivent être d'accord), **prévoit** la fumée 60 s à l'avance et **affiche** tout sur un écran de type cockpit. L'IA propose, l'opérateur décide.

## 2. Les 5 briques (qui fait quoi)

### Brique 1 — Lecture seule du SSI
- L'installateur agréé du SSI programme des **relais libres** (feu zone A/B/C, dérangement). Notre boîtier les lit à travers des **optocoupleurs** (isolation électrique).
- Sur une liaison réseau : **Modbus en lecture seule** (codes 01 à 04). Les codes d'écriture (05, 06, 15, 16) sont **refusés dans notre code** avant tout envoi.
- Démo : `edge/panel_sim.py` (SSI simulé) + `edge/gateway.py` (passerelle). Le test `tests/test_readonly_gateway.py` montre qu'une tentative d'écriture est refusée.
- **Phrase clé :** « Le pire cas d'une panne de l'IA est une perte d'information, jamais une alarme manquée. »

### Brique 2 — Vérification « feu ou nuisance ? »
- **Données réelles** : un hall industriel de 10 × 22 × 8 m avec 9 nœuds de capteurs (jeu public Mendeley, CC BY 4.0). 17 vrais feux (bois, bougies, câble, mèches) et 15 nuisances (déodorant, échappement, machine à fumée, CO, éthanol, soudure, découpe, déchets verts).
- Pour chaque capteur, on regarde **de combien il monte au-dessus de l'air normal** (sur les 30 dernières minutes) et **à quelle vitesse** (pente sur 60 s). 19 variables au total.
- **Signatures physiques** : un feu donne des particules + un peu de CO et d'H₂ ; un aérosol donne beaucoup de COV ; un moteur donne beaucoup de CO sans particules ; la soudure donne des particules presque sans gaz.
- **Modèle** : *gradient boosting* (forêt d'arbres de décision améliorés, `HistGradientBoostingClassifier`). Pourquoi : bon sur les petits jeux de données, rapide (2,3 ms), explicable.

### Brique 3 — Le vote « double boucle »
- 3 canaux physiques indépendants : **A particules**, **B gaz** (CO, H₂, COV), **C chaleur**.
- **ROUGE (feu confirmé)** = alarme SSI **+** score IA ≥ 0,70 **+** particules **ET** (gaz **OU** chaleur), pendant 30 s.
- **AMBRE avec bip** : pré-alarme IA avant le SSI, ou alarme SSI que l'IA juge être une nuisance (levée de doute).
- **AMBRE silencieux** : un capteur dérive → il est exclu du vote (mode dégradé).
- Inspiration : un moteur d'avion a **2 boucles de détection**, l'alarme cockpit sonne seulement si les deux sont d'accord.

### Brique 4 — La prévision 30-60 s (jumeau numérique)
- **Modèle physique « à deux zones »** : le feu grandit (en t²), la fumée chaude monte et forme une couche sous le toit, la couche descend, la température monte. Même famille que le logiciel CFAST du NIST. Vérifié par 5 tests physiques et une formule de manuel.
- **5 000 feux simulés** (petits et grands halls, feux lents à très rapides, portes, exutoires, 15-42 °C).
- **IA de substitution** (petit réseau de neurones 64×64) entraînée sur ces 5 000 feux : elle donne en **0,14 ms** la hauteur de fumée et la température à +30 s et +60 s, et le temps avant **conditions intenables** (fumée sous 2 m ou > 60 °C).
- Elle tourne **dans le navigateur** : quand on bouge les curseurs (type de stock, porte, exutoires, température extérieure), la prévision se recalcule.

### Brique 5 — L'écran du poste de sécurité (inspiré de l'ECAM)
- **Cockpit sombre** : rien à l'écran quand tout va bien, mais un **voyant vert permanent** prouve que le système vit.
- Alertes **rouges** (agir), **ambre** (attention), procédures en **cyan** (« ÉVACUATION ZONE A …… DÉCLENCHER »), boutons **MASTER WARN / MASTER CAUT** (ils acquittent l'alerte de l'IA, **jamais** le SSI).
- 5 pages : ZONE (3D), CAPTEURS, PRÉVISION, POURQUOI (explication), SSI (preuve de la lecture seule).
- **Permis de feu zone C** : pendant une soudure autorisée, les alertes IA de niveau 1-2 de la zone C sont masquées ; **les alarmes SSI ne sont jamais masquées**.

## 3. Les résultats à connaître par cœur
| | IA | Détecteur classique |
|---|---|---|
| Feux détectés | **17/17** | 17/17 |
| Nuisances rejetées | **11/15** | 10/15 |
| Fausses alarmes du détecteur classique reconnues | **3/5** (les 3 aérosols) | — |
| Feu confirmé ≤ 60 s après le SSI | **15/17** (avant le SSI : 9/17) | — |
| Autre site jamais vu | **7/7 nuisances, 12/13 feux** | 6/7, 13/13 |
| Prévision à +60 s | **± 0,06 m, ± 6,8 °C, 0,14 ms** | sans IA : ± 0,41 m, ± 34 °C |
| Fausses alertes sur 49,9 h d'activité normale | **0** | 1 |
| Alerte précoce « feu couvant possible » | **17/17 feux**, avant un seuil optique standard dans 10 cas, 2/15 nuisances | — |
| Type de scénario jamais vu (test sévère) | **15/17 feux, 10/15 nuisances** | — |

**Méthode** (à savoir expliquer) : chaque essai est jugé par un modèle qui **ne l'a jamais vu** (« leave-one-episode-out »). Mélanger les lignes au hasard donnerait 99 % de réussite… mais ce serait de la triche (lignes voisines presque identiques).

## 4. Les scénarios de la démo
- **A — Feu réel (bois)** : alerte précoce **FEU COUVANT POSSIBLE** à 3 min 30 (gaz de combustion en hausse, presque pas de fumée), pré-alarme IA à 6 min 30, puis **FEU CONFIRMÉ ZONE A** à 10 min 10 quand le SSI sonne. Le détecteur classique, lui, ne voit rien avant 10 min 10. Page PRÉVISION : fumée prévue à +60 s.
- **B — Aérosol** : le SSI sonne à 1 min 20 pour rien, l'écran dit **APPLIQUER LA PROCÉDURE** et l'IA ajoute « indices compatibles avec une nuisance » (sans score), l'alarme SSI reste maintenue.
- **C — Échappement** : pas de feu, mais **CO ÉLEVÉ (137 ppm)** → aérer, arrêter le moteur.
- **D — Capteur en dérive** (défaut simulé) : détecté en ~8 min, exclu du vote.
- **E — Soudure** : cas limite honnête, l'IA se trompe (1 seul essai disponible pour apprendre).
- **F — Banc d'essai libre** : VOUS placez le feu ou la fausse alarme. Choisir une source à droite (ex. « Grand feu de bois » ou « Aérosol »), cliquer sur le sol du hall. La vraie physique 3D (CFD) pousse la fumée, le CO et la chaleur ; la ligne pointillée montre la distance au capteur le plus proche ; la même IA décide. À tester : feu de bois près d'une étagère (le feu se propage à l'étagère), aérosol dans l'atelier (NUISANCE), chariot qui tourne (CO élevé), feu + chariot en même temps. Bougies et cigarette loin des capteurs = pas détectées (normal : trop peu de fumée à 3 m). Capteurs « synthétiques » : c'est un test qualitatif, à dire au jury.

**Si le jury demande « c'est de la vraie physique ? »** : oui, un solveur de mécanique des fluides 3D (14 080 cellules de 50 cm) qui tourne dans le navigateur, vérifié contre deux formules d'ingénierie incendie reconnues (Heskestad pour le panache, Alpert pour le jet sous plafond). Ce n'est pas FDS (trop lent pour le temps réel), c'est sa version simplifiée temps réel.

**Test NIST (données américaines jamais vues)** : 7/8 feux, mais seulement 6/33 nuisances de cuisine rejetées, car NIST n'a pas nos capteurs COV/H₂. Si le jury demande : « on l'a testé honnêtement, ça nous a appris que les capteurs COV et H₂ sont obligatoires et qu'une cuisine demande un apprentissage sur site ».

**Chaque usine est différente ?** Oui : modèle général + apprentissage local pendant le pilote. Preuve NIST : 6/33 → 29/33 fausses alarmes écartées après apprentissage local.

**Et les coupures de courant ?** Pas besoin d'Internet, batterie LiFePO4 ≈ 55 h, solaire 150 W en option. Démo : bouton ⚡ COUPURE.

## 5. Questions probables du jury et réponses
| Question | Réponse |
|---|---|
| « Bosch, Honeywell, Hikvision font déjà ça. » | « Oui, mais ils mettent l'IA *dans leurs* détecteurs : il faut racheter leur matériel. Nous sommes une couche neutre, en lecture seule, sur le SSI déjà installé, quelle que soit la marque, à un prix PME. » |
| « Votre IA peut-elle bloquer une alarme ? » | « Non, par construction : aucune liaison ne va vers le SSI, et notre passerelle refuse toute écriture Modbus. Le pire cas est une perte d'information, jamais une alarme manquée. » |
| « D'où viennent vos chiffres ? » | « D'un jeu public de vrais feux dans un hall industriel, chaque essai jugé par un modèle qui ne l'a jamais vu, puis testé sur un autre site. Tout est reproductible avec une commande. » |
| « Vous ratez la soudure. » | « Oui, et nous le montrons : un seul essai de soudure existe, impossible à apprendre. C'est exactement pourquoi le pilote de 90 jours collecte les nuisances propres à chaque usine. Et l'alarme SSI reste toujours prioritaire. » |
| « Votre confirmation est parfois plus lente que le détecteur. » | « C'est un choix de sécurité : on exige deux principes physiques d'accord avant le rouge. Dans 15 cas sur 17, la confirmation arrive au plus 60 s après le SSI, et dans 9 cas avant lui. » |
| « FDS en temps réel, c'est impossible. » | « D'accord : FDS demande des centaines d'heures de calcul. Nous utilisons un modèle de zones pour simuler 5 000 feux, puis une IA qui répond en 0,14 ms. CFAST et FDS serviront à valider. » |
| « Pourquoi l'aéronautique ? » | « Nous reprenons des méthodes, pas des certificats : l'objectif d'alerte en moins d'une minute des soutes (25.858), la double boucle des moteurs, l'analyse de sécurité ARP4761A et la philosophie ECAM. En soute, il y avait environ 200 fausses alarmes pour une vraie : l'aviation a dû résoudre notre problème. » |
| « DO-178C pour une IA ? » | « Non : la DO-178C ne couvre pas l'apprentissage automatique. Nous suivons le Concept Paper IA de l'EASA, niveau 1 : l'IA assiste, l'humain décide. » |
| « La vie privée des ouvriers ? » | « Le prototype n'utilise pas de caméra. Sur site : autorisation préalable de l'INPDP (loi 2004-63), traitement local, pas de son, seules des alertes sortent. » |
| « Qu'avez-vous fait vous-mêmes ? » | « Les données et les formules physiques sont publiques et citées. Notre travail : l'architecture lecture seule, la logique double boucle, l'entraînement et la validation honnête des modèles, le simulateur et la prévision, le tableau de bord, et l'adaptation au contexte tunisien. Nous avons utilisé des outils d'IA pour accélérer le développement ; les choix de conception et la validation sont les nôtres. » |
| « Combien ça coûte ? » | « Pas de remplacement du SSI. PME : 7 000 TND d'installation et 450 TND/mois (voir BMC). » |

## 6. Mots à ne jamais dire
« certifié DO-178C », « conforme FAR 25.858 », « 10⁻⁹ », « certificat SORA », « −40 % de fausses alarmes » (non mesuré), « l'IA décide ».
