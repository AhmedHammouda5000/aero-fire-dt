# Aero-Fire DT Tunisie — Note de concept (1 page)

**Challenge :** Tunisian Aeroday / Hackathon Entrepreneur — technologies aéronautiques & IA pour la sécurité incendie.
**Partenaire du challenge :** Protection Civile. **Date :** 21 novembre 2026. **Version :** v2 (corrigée, voir `CHANGELOG.md`).

## Le problème

Dans les usines, entrepôts et sites à risque tunisiens (Sfax, Sousse, Gabès, Radès), le SSI certifié protège les personnes mais n'explique pas *ce qui se passe*, *où*, ni *ce qui va se passer dans la minute*. Deux coûts sont payés en silence : les **fausses alarmes** (évacuation, arrêt de ligne, perte de confiance, déplacement des secours) et le **délai de levée de doute**.

- Aucune statistique tunisienne de fausses alarmes n'est publiée. Au Royaume-Uni, **≈ 39 % des interventions des services d'incendie sont des fausses alarmes incendie**, dont **169 717 dues aux équipements** (année close en septembre 2025, [GOV.UK](https://www.gov.uk/government/statistics/fire-and-rescue-incident-statistics-year-ending-september-2025/fire-and-rescue-incident-statistics-year-ending-september-2025)).
- En Tunisie, les indemnités d'assurance incendie ont atteint **92 MDT en 2025** ([allAfrica](https://fr.allafrica.com/stories/202603110402.html)) et **47,9 MDT au seul 1er semestre 2026 (+32,6 %)** ([Tunisie Numérique](https://www.tunisienumerique.com/tunisie-le-chiffre-daffaires-du-secteur-des-assurances-grimpe-de-13-au-premier-semestre-2026/)).

## La solution

Aero-Fire DT est une **surcouche d'aide à la décision**, pas un substitut du SSI :

1. **Raccordement en lecture seule, isolé galvaniquement, réalisé par l'installateur agréé du SSI** (relais via optocoupleurs ou passerelle constructeur, Modbus fonctions 1-4 / BACnet lecture uniquement). Aucune voie de retour : l'IA ne peut ni acquitter, ni réarmer, ni inhiber. Le raccordement est consigné dans la matrice de mise en sécurité et le dossier de sécurité.
2. **Vérification multicritère** — nœuds capteurs (particules, CO, H₂, COV, CO₂, température) + caméra thermique optionnelle ; fusion par gradient boosting. **Objectif de performance inspiré de CS/14 CFR 25.858 : alerte opérateur < 60 s**, test de chaque voie, efficacité dans toutes les configurations. Le verdict arrive *dans la fenêtre de levée de doute déjà paramétrée dans l'ECS certifié*.
3. **Double chaîne et dossier de sécurité aéronautique** — FHA et arbres de défaillances transposés de l'ARP4761A, logique de vote « double boucle » (deux principes physiques indépendants pour l'alerte rouge), tableau de bord inspiré de l'ECAM (cockpit sombre, 3 niveaux, indicateur de bon fonctionnement permanent). IA positionnée au niveau 1 du Concept Paper IA de l'EASA (assistance à l'humain). Voir `Safety_Case.md`.
4. **Jumeau numérique en local (edge)** — modèle IFC généré avec IfcOpenShell, modèle de zone Python (t², Alpert, deux couches, MQH, RTI) → ~5 000 scénarios → modèle de substitution. Prévision par zone à t+30 / t+60 s : hauteur de nappe, température, délai avant le prochain détecteur, délai de conditions intenables, avec incertitude. Fonctionne sans internet.

## Déjà fait / ce que nous ajoutons

Bosch AVIOTEC, Honeywell Distinguish (nov. 2026), Siemens ASA, Hikvision/iThermAI et Dahua (MENA) mettent l'IA **dans leurs propres détecteurs** ; PolyU SureFire prévoit le feu à 60 s (~92 %) **dans le cloud**. Nous ajoutons : une **couche neutre multi-marques en lecture seule, incapable d'inhiber**, un **dossier de sécurité de méthode aéronautique**, un **prix PME en TND** et une **prévision en local**.

## Données et résultats (honnêtes)

Entraînement et validation sur données ouvertes industrielles réelles : **Industrial Hall** (hall 10 × 22 × 8 m, 17 feux et 15 nuisances) et **salle EN54** (Mendeley, CC BY 4.0). Validation « essai jamais vu » (leave-one-episode-out) puis test sur un autre site. Résultats mesurés du prototype : **17/17 feux détectés, 11/15 nuisances rejetées (73 %, contre 67 % pour un détecteur optique classique), 3 des 5 fausses alarmes du détecteur classique reconnues comme nuisance, feu confirmé au plus 60 s après l'alarme SSI dans 15 cas sur 17 (avant elle dans 9 cas) ; sur l'autre site : 7/7 nuisances rejetées, 12/13 feux confirmés (le 13ᵉ reste signalé par le SSI)**. Prévision à +60 s : ± 0,06 m sur la hauteur de nappe, ± 6,8 °C, en 0,14 ms. Le gain réel sur site sera **mesuré** pendant un pilote de 90 jours.

## Le marché tunisien ciblé

- **4 519 entreprises industrielles de 10 salariés et plus** ([Business News / APII](https://businessnews.com.tn/2026/09/14/600-usines-en-moins-en-cinq-ans-lindustrie-tunisienne-se-meurt/1418333/)) et **~115 zones industrielles AFI** ([Managers](https://managers.tn/2025/11/26/57-hectares-de-terrains-inexploites-recuperes-par-lagence-fonciere-industrielle/)).
- **Premiers clients :** établissements classés de 1re/2e classe (Décret 2006-2687 : étude de dangers, POI), où la prévision de fumée alimente le POI.
- **Canal :** intégrateurs / installateurs SSI agréés ; prescripteurs : bureaux de contrôle, assureurs.
- **Modèle :** mise en service 7 000 TND (palier A) + abonnement dès 450 TND/site/mois. Crédit d'assurance exclu du scénario de base.
- **Leviers :** cluster aéronautique tunisien, ingénieurs locaux, label Startup Act (bourse fondateur 1 000-5 000 DT/mois pendant un an, [startup.gov.tn](https://startup.gov.tn/en/startup_act/benefits_to_Startups)).
- **Cadre :** Loi 2009-11 (dossier de sécurité), Loi 2004-63 + Décret 2007-3004 (autorisation INPDP avant toute caméra, pas de son, signalisation).

**Demande :** un site pilote avec données capteurs, un installateur SSI agréé partenaire, et un cadre de test avec la Protection Civile pour **mesurer** la réduction des fausses alarmes sur 90 jours.

*Drones, formation VR et simulation d'évacuation : hors périmètre du produit, voir la feuille de route (phases 4-5).*
