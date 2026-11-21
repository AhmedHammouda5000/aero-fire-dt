# Compte rendu d'équipe — Analyse de la problématique

*Livrable « compte rendu par équipe » exigé par le cahier des charges (15 pts en présélection). Version v2.*

## 1. Lecture du besoin

Le challenge demande de transposer des **méthodes** aéronautiques — et non des équipements certifiés « drop-in » — à la prévention, la détection et la gestion des incendies en Tunisie. Nous avons écarté deux pièges :

- **Piège technologique :** remplacer un détecteur EN 54 par un réseau de caméras IA. Défendable en laboratoire, irrecevable pour un audit incendie et pour un assureur.
- **Piège économique :** vendre un jumeau numérique coûteux là où le client tunisien n'a pas les moyens d'un sprinklage lourd. Les chiffres américains (ESFR 140-280 k$, crédit d'assurance 20-40 %) ne sont pas transposables.

Notre lecture : la valeur ajoutée est d'**éclairer l'opérateur pendant la levée de doute** sans toucher à la fonction de sécurité réglementaire. Aucune statistique tunisienne de fausses alarmes n'est publiée ; au Royaume-Uni, ≈ 39 % des interventions des pompiers sont des fausses alarmes incendie ([GOV.UK, 2025](https://www.gov.uk/government/statistics/fire-and-rescue-incident-statistics-year-ending-september-2025/fire-and-rescue-incident-statistics-year-ending-september-2025)).

## 2. Méthode d'analyse

1. Décomposition en sous-questions (détection, capteurs, vision, prévision, jumeau, interface SSI, réglementation, économie, facteurs humains).
2. Revue croisée des corpus de recherche, puis **vérification** des sources (jeux de données, licences, normes, prix).
3. Grille de notation (innovation / viabilité / faisabilité Tunisie) et sélection de l'architecture.
4. Contrôle de la couverture des contraintes C1-C6 (§4).

## 3. Résultat

Une architecture en **double chaîne** : le SSI certifié (EN 54 / NFPA 72) garde la fonction de sécurité ; Aero-Fire DT s'y raccorde **en lecture seule**, par relais via optocoupleurs ou passerelle constructeur (Modbus fonctions 1-4, BACnet lecture/COV), à travers une isolation galvanique, **sans voie de retour**. Le raccordement est fait par l'installateur agréé et consigné dans la matrice de mise en sécurité et le dossier de sécurité. Les temporisations restent dans l'ECS certifié.

Au-dessus : vérification multicritère (fusion capteurs, vision optionnelle), prévision t+30/t+60 s en local, tableau de bord inspiré de l'ECAM, et un **dossier de sécurité** (FHA, arbre de défaillances, modes communs, vote double boucle, matrice d'essais — `Safety_Case.md`). Modèle économique en 3 paliers TND.

## 4. Couverture des contraintes du brief

| Contrainte | Réponse apportée |
|---|---|
| C1 Réalisme / précision | Méthodes **transposées**, sans certification revendiquée : objectif de performance inspiré de **25.858** (alerte < 60 s, test de chaque voie, toutes configurations) ; **ARP4761A** (FHA / FTA / CCA, gravités qualitatives) ; **double boucle** des détecteurs moteurs ; **ECAM** ; **Concept Paper IA de l'EASA, niveau 1** pour l'IA (la DO-178C ne vaut que pour le logiciel classique) |
| C2 Interactivité | Tableau de bord ECAM (cockpit sombre, 3 niveaux, indicateur de vie permanent), page de prévision, panneau « pourquoi », banc d'essai virtuel « iron bird » rejouant des scénarios |
| C3 Données réelles | Industrial Hall et salle EN54 (Mendeley, CC BY 4.0) ; validation « essai jamais vu » et inter-sites ; données du site pilote ensuite |
| C4 Simulation physique | Modèle de zone Python (t², Alpert, deux couches, MQH, RTI) → 5 000 scénarios → IA de substitution (0,14 ms, ± 0,06 m à +60 s) ; CFAST et FDS comme références de validation futures |
| C5 BMC obligatoire | `Adapted_BMC.md` + `Financial_Projections.csv` (TND au cours BCT, droits et TVA, embauches, formules) |
| C6 Sécurité | SSI inchangé ; l'IA ne peut ni acquitter, ni réarmer, ni inhiber ; elle peut seulement escalader plus vite. Vie privée : INPDP, pas de son, traitement local |

## 5. Ce qui existe déjà / ce que nous ajoutons

Bosch AVIOTEC, Honeywell Distinguish (nov. 2026), Siemens ASA, Hikvision/iThermAI et Dahua (MENA) intègrent l'IA **dans leurs propres détecteurs** ; PolyU SureFire prévoit le champ de température à 60 s (~92 %) **via le cloud** ; de nombreux projets de hackathon font « capteurs + IA ». Nous ne revendiquons pas ces briques. Nous ajoutons : **une couche neutre multi-marques en lecture seule, incapable par construction d'inhiber le SSI**, **un dossier de sécurité de méthode aéronautique**, **un prix PME en TND** et **une prévision en local** qui fonctionne sans internet.

## 6. Base légale tunisienne

| Texte | Conséquence |
|---|---|
| Loi 2009-11 (code de sécurité incendie des bâtiments) | Raccordement consigné dans le dossier de sécurité examiné par l'ONPC |
| Décret 2006-2687 (établissements classés) | Étude de dangers et POI pour la 1re/2e classe : premiers clients |
| Arrêté du 14 août 2020 | Équipes de sécurité formées par l'ONPC : utilisateurs du tableau de bord |
| Loi 2004-63 art. 69-74 + Décret 2007-3004 | Autorisation INPDP préalable aux caméras, pas de son, signalisation |

## 7. Limites et suites

Pas de données d'incendie industriel tunisiennes ; marques de SSI dominantes en Tunisie inconnues ; coût de l'installateur pour le raccordement à chiffrer ; statut INPDP des caméras thermiques non tranché ; texte intégral de la Loi 2009-11 sur la détection non consulté. Résultats du prototype : 17/17 feux, 11/15 nuisances rejetées, mais la soudure et la machine à fumée (1-2 essais seulement) trompent encore l'IA ; le gain réel sera mesuré au pilote de 90 jours. Crédit d'assurance exclu. Drones : hors périmètre (phases 4-5, sous autorité de la Protection Civile).
