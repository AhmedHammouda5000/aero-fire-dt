# Carte d'empathie — Aero-Fire DT Tunisie

*Livrable « carte d'empathie » exigé par le cahier des charges (10 pts en présélection). Version v2.*

## Persona 1 — Responsable HSE, site industriel classé (Sfax / Gabès / Sousse)

| | |
|---|---|
| **Dit** | « Encore une fausse alerte, on a arrêté la ligne pour rien. » / « Je dois prouver au bureau de contrôle que rien n'a été modifié sur le SSI. » |
| **Pense** | « Si l'IA se trompe, c'est ma responsabilité engagée. » / « Mon budget est déjà absorbé par la maintenance. » |
| **Fait** | Relève les rapports d'incidents, relance l'intégrateur, tient l'étude de dangers et le POI, négocie la prime d'assurance. |
| **Ressent** | Stress de la décision, lassitude des faux départs, pression du coût. |
| **Douleurs** | Faux positifs, absence de traçabilité, données éparpillées, assureur qui demande des preuves. |
| **Gains attendus** | Moins de faux départs (gain **mesuré** au pilote de 90 jours) ; **preuve exportable que le SSI n'a pas été modifié** (lecture seule, raccordement consigné) ; rapport d'événements horodaté ; prévision de fumée utilisable dans le POI. |

## Persona 2 — Opérateur du poste de sécurité (équipe de sécurité)

| | |
|---|---|
| **Dit** | « Je vois une alerte mais je ne sais pas où ni si c'est grave. » / « J'appelle le responsable, puis j'attends. » |
| **Pense** | « Si j'évacue à tort, on me le reproche ; si j'attends trop, c'est pire. » |
| **Fait** | Surveille la centrale et les écrans, téléphone, consigne les interventions. |
| **Ressent** | Surcharge cognitive, doute, fatigue de nuit. |
| **Douleurs** | Interfaces peu lisibles, pas de hiérarchie des alertes, levée de doute à l'aveugle. |
| **Gains attendus** | **Verdict IA en < 60 s, zone et procédure affichées** (ex. « Zone C : profil soudure 91 %, vérifier CAM 3 ») ; écran sombre quand tout va bien avec indicateur de vie permanent ; trois niveaux d'alerte clairs ; c'est toujours lui qui décide sur la centrale. |

## Persona 3 — Officier de la Protection Civile

| | |
|---|---|
| **Dit** | « On part souvent sur une fausse alerte. » / « Il me manque le plan et l'accès. » |
| **Pense** | « J'ai besoin d'une information fiable avant d'engager mes équipes. » |
| **Fait** | Pré-plans, exercices, interventions, retours d'expérience ; examine les dossiers de sécurité. |
| **Ressent** | Urgence, besoin de confiance dans l'information reçue. |
| **Douleurs** | Pré-plans papier, zones mal connues, peu de retours d'expérience exploitables. |
| **Gains attendus** | **Pré-plan numérique (IFC) et prévision de fumée à 30-60 s** par zone ; journal d'événements partagé pour le retour d'expérience ; escalade plus rapide quand deux principes physiques confirment un feu. |

## Persona 4 — Installateur SSI agréé

| | |
|---|---|
| **Dit** | « Je ne touche pas à une centrale que j'ai mise en service sans savoir qui répondra en cas de problème. » |
| **Pense** | « Si un tiers se branche mal, c'est ma garantie et le contrat de maintenance qui sautent. » |
| **Fait** | Programme les relais et passerelles, tient la matrice de mise en sécurité, assure la maintenance. |
| **Ressent** | Méfiance envers les « boîtiers IA », intérêt pour un service additionnel facturable. |
| **Douleurs** | Responsabilité sur la certification, interventions non planifiées après fausses alarmes. |
| **Gains attendus** | Raccordement **qu'il réalise lui-même**, sur relais libres ou passerelle constructeur, isolé et sans voie de retour ; spécification d'interface écrite ; prestation facturée ; diagnostic de dérive des capteurs pour planifier la maintenance. |

## Synthèse

Le fil commun est la **levée de doute** : le responsable HSE veut des preuves, l'opérateur de la clarté, la Protection Civile de la fiabilité, l'installateur la garantie que son SSI reste intact. Aero-Fire DT ne remplace aucun d'eux : il leur donne le même état de situation, en lecture seule, sans jamais pouvoir désactiver la protection réglementaire.
