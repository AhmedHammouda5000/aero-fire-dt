# Plan de pitch — Aero-Fire DT Tunisie

**Contraintes du brief :** pitch de 5 minutes, support PDF, questions/réponses ensuite, présentation en live. **Règle d'or : ne pas ouvrir sur « IA + caméras + capteurs détectent le feu » ; ouvrir sur l'architecture de sécurité.** Pas de « drone » ni de « YOLO » dans la première minute.

| # | Titre | Contenu clé (1 idée / slide) | Temps |
|---|---|---|---|
| 1 | Aero-Fire DT | **Ouvrir sur l'histoire de la soute :** « Dans les soutes d'avion, on comptait environ 200 fausses alarmes pour 1 vrai feu (NIST SP 965). L'aviation a réglé ça avec deux boucles indépendantes qui doivent être d'accord, et une alerte équipage en moins de 60 s. Nous apportons cette règle dans les usines tunisiennes. » Partenaires du challenge : Protection Civile & INJAZ Tunisia | 0:25 |
| 2 | Le besoin et la cible | UK : ≈ 39 % des interventions = fausses alarmes (GOV.UK, sept. 2025) ; Tunisie : 47,9 MDT d'indemnités incendie au S1 2026 (+32,6 %). **Cible :** usines et entrepôts déjà équipés d'un SSI (4 519 industriels de 10+ salariés), d'abord les établissements classés 1re/2e classe | 0:25 |
| 3 | Notre réponse | Un copilote qui **lit** le SSI sans jamais pouvoir le toucher. L'alarme certifiée reste maître ; l'IA aide l'agent à vérifier vite et bien | 0:20 |
| 4 | Ce qui existe / ce que nous ajoutons | Les grands fabricants mettent l'IA *dans leurs* détecteurs. **Nous :** une couche neutre, toutes marques, branchée en lecture seule sur la centrale existante, incapable de couper une alarme, qui apprend chaque site pendant un pilote de 90 jours | 0:25 |
| 5 | Sécurité : la règle des deux boucles | Schéma simple : SSI → isolation → passerelle → écran. Aucune flèche retour. « Feu » seulement si 2 signaux physiques indépendants sont d'accord. **Pendant une alarme SSI, l'écran affiche « APPLIQUER LA PROCÉDURE », jamais un score** | 0:30 |
| 6 | **Démo live (60–75 s)** | Scénario A : feu réel → alerte « feu couvant possible » → pré-alarme → feu confirmé, fumée prévue à +60 s. Scénario B : un **aérosol** déclenche le SSI → procédure appliquée, l'IA signale des indices de nuisance → levée de doute ciblée. Puis le banc d'essai libre : on pose un feu en cliquant | 1:10 |
| 7 | Résultats honnêtes | Essais réels jamais vus : **17/17 feux**, 11/15 nuisances rejetées (détecteur classique : 10/15), 3/5 fausses alarmes du détecteur reconnues ; **alerte « feu couvant possible » sur 17/17 feux, avant un seuil optique standard dans 10 cas** ; autre salle : 12/13 feux, 7/7 nuisances. **Nouveau site (NIST) : ses propres données ont fait passer les fausses alarmes de cuisine de 27/33 à 4/33 → d'où le pilote de 90 jours sur chaque site** | 0:30 |
| 8 | Modèle économique | Mise en service 7 000 TND + 450 TND/mois (palier PME) ; pilote de 90 jours = calibration payante ; abonnement = réapprentissage local + support ; seuil ≈ 16 sites | 0:25 |
| 9 | Ressources, étapes et coût global | M0–M1 cadrage · M1–M3 banc matériel · M3–M6 pilote 90 jours · M6–M12 10 sites · M12–M18 consolidation. **Coût de démarrage ≈ 46 800 TND** (banc, kit de démo, dossier de sécurité) ; équipe de 3–4 ingénieurs ; 1 installateur SSI agréé | 0:20 |
| 10 | Déploiement avec la Protection Civile & demande | Pré-plans numériques des sites, formation des agents « l'IA conseille, la centrale décide », retours d'expérience partagés. **Demande :** 1 site pilote, 1 installateur agréé, un cadre de test avec la Protection Civile. Dépôt : **https://github.com/AhmedHammouda5000/aero-fire-dt** | 0:20 |

**Total : ≈ 4:50.** Règle : **aucun sigle technique à l'oral** (normes, protocoles, certifications) → tout est dans les slides de réserve.

## Phrases du pitch (à dire mot pour mot)

- Slide 1 : « Dans les soutes d'avion, on comptait environ 200 fausses alarmes pour 1 vrai feu. L'aviation a réglé ça avec deux boucles qui doivent être d'accord. Nous apportons cette règle dans les usines tunisiennes. »
- Slide 4 : « Ils vous vendent un nouveau détecteur de leur marque. Nous, on se branche en lecture seule sur la centrale que vous avez déjà, quelle que soit la marque. On ne peut pas la faire taire, et on apprend votre site en 90 jours. »
- Slide 7 : « Sur des essais réels jamais vus pendant l'entraînement, nous détectons les 17 feux et lançons une alerte "feu couvant possible" sur les 17, avant un seuil optique standard dans 10 cas. Sur un nouveau site, ses propres données ont réduit les fausses alarmes de cuisine de 27 sur 33 à 4 sur 33. C'est pour ça que chaque site commence par un pilote de 90 jours, sous la centrale certifiée. »
- Si on demande « quel gain sur le détecteur classique ? » : « Sur le hall, une nuisance de plus seulement : 11 contre 10. La vraie valeur, c'est la règle des deux boucles, l'alerte précoce et l'apprentissage du site, et le gain réel sera mesuré au pilote. »

## Slides de réserve (Q&R)

- **R1 — Angles morts assumés :** marques de SSI dominantes en Tunisie (inconnues) ; coût de l'installateur pour le raccordement (à chiffrer) ; INPDP et caméras thermiques (statut non tranché, autorisation demandée) ; gain réel (mesuré au pilote).
- **R2 — Nomenclature matériel (BOM) :** passerelle Jetson Orin Nano Super (~760-1 060 TND) ou Raspberry Pi 5 ; nœud ESP32 + SCD41 + SPS30 + BME688 + CO (~240-455 TND) ; PureThermal Mini Pro + Lepton 3.5 (~1 120 TND) ; modules DI optocouplés. Palier A ≈ 3 000 TND avant droits, 4 000-4 500 rendu. Change BCT 1 USD = 3,0335 TND.
- **R3 — Cadre légal :** Loi 2009-11, Décret 2006-2687, arrêté du 14 août 2020, Loi 2004-63 + Décret 2007-3004 ; EN 54-13 (« autre système »), NFPA 72 (équipement supplémentaire).
- **R4 — Équipe et répartition des rôles.**
- **R5 — Détails techniques (uniquement en Q&R) :** isolation galvanique (optocoupleurs), lecture Modbus FC 1-4 / BACnet en lecture seule ; FHA / arbre de défaillance ; niveaux d'alerte type ECAM ; IA = assistance niveau 1 (Concept Paper EASA, transposé) ; aucune certification aéronautique revendiquée.
- **R6 — Ce que nous savons ne pas encore faire :** soudure et machine à fumée trompent encore l'IA ; « avant le détecteur » est mesuré contre un seuil optique standard, pas une vraie centrale ; pas encore de test en usine tunisienne.

## Rappels de soumission

- PDF exporté **identique** au pitch oral (−10 pts sinon). Dépôt Drive visé **08:30**, limite 09:00 le 22 novembre ; aucune modification après dépôt.
- « Partenaires du challenge », jamais « nos partenaires ».
- Lien du repo GitHub public en slide 10 : **https://github.com/AhmedHammouda5000/aero-fire-dt**.
- En cas d'égalité, le jury privilégie le coût de réalisation le plus faible : la démo est 100 % logicielle, le produit ne remplace rien.
