# Aero-Fire DT — copilote incendie pour les usines

> **Un copilote qui lit votre système de sécurité incendie (SSI) sans jamais pouvoir le toucher.**
> Prototype du challenge *Aero-Entrepreneur* — Tunisian Aeroday 2026, en partenariat avec la Protection Civile.

![Poste de sécurité — feu confirmé](docs/screenshots/VFX3_smoke_layer.png)

## Le problème
Les alarmes incendie des usines sonnent souvent pour rien (aérosols, poussières, échappement…) : arrêts de production, évacuations inutiles, déplacements des secours. Et quand un vrai feu démarre, l'agent de sécurité voit seulement « ALARME ZONE B », sans savoir si c'est grave ni ce qui va se passer.
En Angleterre, **39 % des interventions des pompiers concernent de fausses alarmes** (année se terminant en septembre 2025) ; dans les soutes d'avions, on comptait **environ 200 fausses alarmes pour 1 feu réel** (NIST SP 965).

## La solution
Une **couche consultative** ajoutée au SSI existant, inspirée des méthodes de l'aéronautique :

| Brique | Ce qu'elle fait | Inspiration aéronautique |
|---|---|---|
| Raccordement **lecture seule** | lit les relais du SSI via optocoupleurs ; aucune voie de retour, l'IA ne peut jamais acquitter, temporiser ni inhiber une alarme | architecture à double chaîne, analyse de sécurité (ARP4761A, transposée) |
| **Vérification d'alarme** | 9 nœuds multi-capteurs (particules, CO, H₂, COV, CO₂, température) + IA « feu ou nuisance ? » | détection multicritère des soutes cargo (recherche FAA) |
| **Vote double boucle** | alerte rouge seulement si SSI + IA + **2 principes physiques indépendants** concordent | détection incendie moteur à double boucle (boucle A ET boucle B) |
| **Prévision 30-60 s** | jumeau numérique (IFC) + modèle de zones + IA de substitution : hauteur de fumée, température, temps avant conditions intenables | — |
| **Écran du poste de sécurité** | cockpit sombre, alertes rouge/ambre, procédures en cyan, MASTER WARN/CAUT, indicateur de vie permanent | philosophie ECAM (Airbus) |
| **Banc d'essai virtuel** | rejoue des scénarios réels de feu et de nuisance dans toute la chaîne logicielle | « iron bird », méthode d'essai AC 25-9A, objectif d'alerte ≤ 60 s inspiré de 14 CFR 25.858 |

**Aucune certification aéronautique n'est revendiquée** : ce sont des méthodes transposées, pas des certificats.

## Résultats mesurés (données réelles, essais jamais vus)
Jeu public *Indoor Fire Dataset with Distributed Multi-Sensor Nodes* — hall industriel 10 × 22 × 8 m (Mendeley, CC BY 4.0). Chaque essai est jugé par un modèle entraîné **sans** cet essai (leave-one-episode-out).

| | IA Aero-Fire DT | Détecteur optique classique |
|---|---|---|
| Feux détectés | **17 / 17** | 17 / 17 |
| Essais de nuisance rejetés | **11 / 15** | 10 / 15 |
| Fausses alarmes du détecteur classique reconnues comme nuisance | **3 / 5** | — |
| Feu confirmé ≤ 60 s après l'alarme SSI | **15 / 17** (avant le SSI : 9 / 17) | — |
| Fausses alertes sur 49,9 h d'activité normale | **0** | 1 |
| **Autre site jamais vu (salle EN 54)** : nuisances rejetées · feux confirmés | **7 / 7 · 12 / 13** | 6 / 7 · 13 / 13 |

Prévision (1 000 feux simulés jamais vus) : **± 0,06 m** sur la hauteur de nappe et **± 6,8 °C** à +60 s (sans IA : ± 0,41 m / ± 34 °C), alerte « intenable dans 60 s » correcte à **96 %**, calcul en **0,14 ms**.

**Alerte précoce « FEU COUVANT POSSIBLE »** (consultative, jamais une confirmation) : score IA ≥ 0,70 pendant 30 s + un signal (fumée, CO ou H₂) encore en hausse sur 60 s. Évaluée sur les mêmes essais jamais vus : **17 / 17 feux** signalés, **10 / 17 avant le détecteur classique**, en moyenne 29 s (jusqu'à 250 s) avant la confirmation ; déclenchée sur **2 / 15 nuisances** seulement (machine à fumée) → simple levée de doute. Détails : `docs/results/early_warning.json`.

Test plus sévère (type de scénario entier jamais vu) : **15 / 17 feux, 10 / 15 nuisances** ; intervalles de confiance et audit des données : [`docs/results/data_audit.md`](docs/results/data_audit.md).

**Physique réelle :** solveur CFD 3D temps réel (14 080 cellules, fumée, CO, chaleur, propagation entre objets) vérifié contre Heskestad et Alpert (`tests/test_cfd.js`) — on voit où va la fumée et la carte de danger à 1,8 m.

**Test indépendant NIST (USA, données jamais vues, aucun réglage)** : avec seulement 7 des 19 entrées disponibles (pas de capteur COV ni H₂, compteur de particules différent), l'IA confirme **7 / 8 feux** mais ne rejette que **6 / 33 nuisances de cuisine** (cigarettes : 2 / 2 rejetées ; bacon, hamburgers, pizza : non). Conclusion : les capteurs **COV et H₂ sont indispensables** (ce sont les entrées les plus utiles du modèle) et une cuisine ou cantine demande un apprentissage sur site pendant le pilote. Détails : `docs/results/nist_fr4019.md`.

**Modèle général + apprentissage local (prouvé sur NIST, données jamais vues)** : modèle général seul 7/8 feux, **6/33** fausses alarmes de cuisine écartées → après apprentissage local **8/8 feux, 29/33** ; l'usine d'origine n'est pas abîmée (17/17 feux conservés). Un modèle général partagé + un modèle local par usine pendant le pilote de 90 jours. Détails : `docs/results/site_adaptation.md`.

**Coupures de courant STEG** : fonctionne sans Internet ; ≈ 20 W pour tout le système → batterie LiFePO4 100 Ah ≈ **57 h** d'autonomie (≈ 28 coupures de 2 h), panneau solaire 150 W en option pour une autonomie illimitée. Détails : `docs/ENERGIE.md` (bouton ⚡ COUPURE dans le tableau de bord).

**Limites :** soudure et machine à fumée (1-2 essais seulement) trompent encore l'IA ; positions des nœuds et SSI simulés ; les feux d'essai sont naissants, leur croissance est une hypothèse du modèle de zones. Le gain réel sera mesuré pendant un pilote de 90 jours.

## Démarrer
```bash
pip install -r requirements.txt
python scripts/run_all.py        # télécharge les données, entraîne, évalue, construit, teste (~4 min)
```
Puis ouvrir **`app/index.html`** (double-clic, fonctionne hors ligne dans Chrome / Edge / Firefox).
- Scénarios : **A** feu réel · **B** aérosol (fausse alarme SSI) · **C** échappement (CO) · **D** capteur en dérive · **E** cas limite soudure.
- **F · Banc d'essai libre** : choisissez un feu (cigarette, bougies, bois, textile, plastiques) ou une nuisance (aérosol, soudure, échappement, poussière), cliquez sur le sol du hall : la physique transporte fumée et gaz jusqu'aux capteurs et la même IA décide (capteurs synthétiques, test qualitatif).
- Bouton **MODE VIDÉO** : visite guidée de 55 s avec sous-titres (pour l'enregistrement de la vidéo).
- Bouton **RÉSULTATS** : tous les chiffres mesurés.

Démonstration du raccordement lecture seule (Modbus) :
```bash
python edge/panel_sim.py          # SSI simulé (rejoue le feu réel)
python edge/gateway.py            # passerelle : lit en FC03 uniquement, toute écriture est refusée
```

## Structure
```
ai/common/          chargement des données, caractéristiques causales
ai/alarm_verifier/  vérification feu/nuisance, vote double boucle, évaluation honnête
ai/forecast/        modèle de zones (physique), 5 000 scénarios, IA de substitution
twin/               jumeau IFC du hall (IfcOpenShell) → JSON
scenarios/          scénarios du tableau de bord à partir des mesures réelles
app/                tableau de bord ECAM (HTML/JS, Three.js en local), CFD 3D (js/cfd.js), banc d'essai (js/sandbox.js)
edge/               SSI simulé + passerelle Modbus lecture seule
tests/              tests physiques et CFD, JS = Python (prévision + 300 arbres IA), banc d'essai, passerelle lecture seule
tools/              vérification du tableau de bord dans Chrome sans écran + captures
docs/               résultats, captures, dossier de sécurité, explications pour l'équipe
```
Documents : [rapport du modèle](docs/AI_Model_Report.md) · [dossier de sécurité](docs/safety/Safety_Case.md) · [comment ça marche](docs/COMMENT_CA_MARCHE.md).

## Données et licences
- Code : licence MIT (voir `LICENSE`). Three.js r147 + GLTFLoader : MIT.
- Modèles et textures 3D réels : **Poly Haven**, licence **CC0** (étagères, cartons, chariot de soudure, extincteurs, fûts, lampes industrielles, sol béton, bardage acier) — liste dans `app/data/ASSETS_CREDITS.md`, reconstruits par `python tools/build_assets.py`.
- Effets visuels : flammes, braises et fumée en particules, pilotés par la physique (hauteur de flamme de Heskestad à partir de la puissance du modèle de zones, hauteur de nappe du modèle).
- Données (non redistribuées, téléchargées par `scripts/download_data.py` avec contrôle SHA-256), **CC BY 4.0** :
  *Indoor Fire Dataset with Distributed Multi-Sensor Nodes — Industrial Hall*, Mendeley Data, DOI [10.17632/yghykzm4km.1](https://data.mendeley.com/datasets/yghykzm4km/1) ;
  salle d'essai EN 54, Mendeley Data, DOI [10.17632/npk2zcm85h](https://data.mendeley.com/datasets/npk2zcm85h/1).
- Ce prototype n'est **pas** un système de détection certifié. Le SSI certifié (EN 54 / NFPA 72) reste la barrière de sécurité.

---
### English summary
Aero-Fire DT is an advisory, read-only layer on top of a factory's certified fire alarm panel. It verifies alarms with multi-sensor fusion and a dual-loop voting rule borrowed from aircraft engine fire detection, forecasts smoke conditions 30-60 s ahead with a physics-trained surrogate and a real-time 3D CFD solver (with a free-test bench where users place fires and nuisance sources), and presents everything on an ECAM-inspired operator display. Evaluated on a public real-fire dataset with leave-one-episode-out validation: 17/17 fires detected, 11/15 nuisance runs rejected (classic optical detector: 10/15), 7/7 nuisances rejected on an unseen second site. Run `python scripts/run_all.py`, then open `app/index.html`.
