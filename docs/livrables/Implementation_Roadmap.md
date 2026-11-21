# Feuille de route — Aero-Fire DT Tunisie (18 mois + jalon hackathon)

## Jalon immédiat : hackathon (21-22 novembre 2026)
- **Nuit J1 :** prototype logiciel (vérificateur IA, modèle de zone + substitution, tableau de bord ECAM, simulateur de flux SSI en lecture seule, dossier de sécurité) ; gel du code vers 03:00.
- **J2 :** vidéo enregistrée vers 05:00, PDF exporté vers 07:00, **dépôt Drive visé à 08:30** (limite 09:00 ; −10 pts pour tout changement après dépôt).
- **J2 :** pitch de 5 minutes + questions/réponses.

## Phase 0 — Cadrage et setup légal (M0 → M1)
- Dossier **label Startup Act** (bourse fondateur, exonération d'IS, charges sociales prises en charge) via un incubateur.
- Dépôt de la marque **Aero-Fire DT** à l'**INNORPI**.
- Lettres d'intention : 1 installateur SSI agréé, 1 site industriel classé pilote (Sfax/Sousse/Gabès).
- Identification de la centrale du site (marque, conventionnelle ou adressable) et de la voie de lecture possible.

## Phase 1 — Banc « iron bird » matériel et raccordement réel (M1 → M3)
- **Banc hardware-in-the-loop** : nœuds ESP32 réels, sorties relais d'une vraie centrale conventionnelle câblées sur entrées optocouplées, sources de fumée calibrées ; matrice d'essais inspirée de l'AC 25-9A (voir `Safety_Case.md`), objectif alerte opérateur ≤ 60 s.
- Données : Industrial Hall et salle EN54 (Mendeley, CC BY 4.0) déjà utilisées dans le prototype ; à ajouter : Zenodo 5643075 (feux couvants), NIST FCD (courbes de puissance) ; résultats publiés intra-site et inter-sites.
- **Raccordement en lecture seule réalisé par l'installateur agréé** sur la centrale du site pilote, consigné dans la matrice de mise en sécurité et le dossier de sécurité.
- Dépôt GitHub public tenu à jour ; revue du dossier de sécurité par un bureau de contrôle.

## Phase 2 — Pilote terrain de 90 jours (M3 → M6)
- **Autorisation INPDP obtenue avant toute installation de caméra** (Loi 2004-63, Décret 2007-3004) ; signalisation, pas de son. Démarrage possible sans caméra (palier A).
- Installation des nœuds capteurs ; le SSI certifié reste la barrière de sécurité (double chaîne).
- Mesures : fausses alarmes par cause, délai du verdict IA, exercice opérateur chronométré avec / sans tableau de bord, disponibilité.
- Retour d'expérience avec la **Protection Civile** : pré-plan numérique, intégration au POI.

## Phase 3 — Jumeau numérique et SaaS v1 (M6 → M9)
- Jumeau IFC du site + prévision t+30/t+60 en local ; vérification CFAST, FDS comme référence de validation.
- Contrat de performance et support 7j/7 ; commercialisation des paliers A/B/C ; objectif 3 sites payants.
- Option vision : détecteur sous licence Apache-2.0 (YOLOX / RT-DETR original / D-FINE) ou licence Ultralytics Enterprise.

## Phase 4 — Passage à l'échelle (M9 → M12)
- Objectif **10 sites** ; embauche d'un ingénieur et d'un technicien support (année 2).
- Drones éventuels : uniquement **opérés sous l'autorité de la Protection Civile** (cadre tunisien de 1995), méthode SORA à titre de bonne pratique, sans en faire une autorisation.
- Évacuation (FDS+Evac / Pathfinder), formation immersive : études exploratoires.

## Phase 5 — Consolidation (M12 → M18)
- 20 sites (fin A2), 40 visés en A3 ; partenariat assureurs pour la licence de scénarios (non garanti).
- Veille et alignement : EUROCAE ED-324 / SAE ARP6983, Concept Paper IA de l'EASA, EN 54-13, NFPA 72.
- Ré-entraînement hors chaîne de sécurité avec revalidation sur la matrice d'essais.

## Indicateurs de réussite
| Indicateur | Cible |
|---|---|
| Rejet des nuisances sans feu manqué (données ouvertes) | Prototype : 11/15 (73 %) avec 17/17 feux détectés ; autre site 7/7 — à mesurer sur site au pilote |
| Réduction des fausses alarmes sur site | **Mesurée au pilote** (90 jours) |
| Délai alerte opérateur | ≤ 60 s depuis l'allumage (banc) ; **mesuré au pilote** |
| Prévision t+30/t+60 | Prototype : RMSE 0,06 m / 6,8 °C à +60 s vs modèle de zone ; à valider vs mesures lors d'un essai contrôlé |
| Sites actifs | 10 (M12), 20 (fin A2), 40 (A3) |
| Disponibilité du service | ≥ 99 % (contrat de performance) |
