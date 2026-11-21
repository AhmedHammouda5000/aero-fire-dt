# Script de la vidéo explicative — 1 minute

*Livrable « vidéo explicative (1 min) ». La vidéo se fait par **enregistrement d'écran** du prototype : bouton **MODE VIDÉO** du tableau de bord (`app/index.html`), visite guidée automatique de ~55 s avec sous-titres français intégrés.*

## Comment l'enregistrer (10 minutes)
1. Ouvrir `aero-fire-dt/app/index.html` dans Chrome ou Edge, plein écran (F11), cliquer sur **🔇 SON** pour activer les bips.
2. Lancer l'enregistreur : **Win + Alt + R** (Xbox Game Bar) ou OBS.
3. Cliquer sur **MODE VIDÉO** et ne plus toucher la souris jusqu'à la fin (tableau des résultats).
4. Arrêter l'enregistrement, couper le début et la fin, ajouter la voix off ci-dessous (ou garder seulement les sous-titres) et le carton de fin. Exporter en MP4, 1 min maximum.

## Déroulé (les sous-titres s'affichent automatiquement)
| Temps | Ce que montre l'écran | Voix off (à lire) |
|---|---|---|
| 0:00-0:04 | Cockpit sombre, voyant vert « SSI LINK OK (LECTURE SEULE) » | « Poste de sécurité d'une usine : écran sombre, tout va bien. » |
| 0:04-0:08 | Scénario A : mesures réelles d'un feu dans un hall industriel | « Un vrai départ de feu, enregistré dans un hall industriel. » |
| 0:08-0:13 | Pré-alarme ambre « FEU PROBABLE ZONE A », avant le détecteur officiel | « Notre IA croise particules et gaz : elle donne l'alerte avant le détecteur. » |
| 0:13-0:17 | Alerte rouge « FEU CONFIRMÉ ZONE A », MASTER WARN, procédure en cyan | « Le SSI sonne : deux principes physiques concordent, comme la double boucle d'un moteur d'avion. Feu confirmé. » |
| 0:17-0:22 | Page PRÉVISION : nappe de fumée à +60 s, compte à rebours | « Le jumeau numérique prévoit la fumée à soixante secondes. » |
| 0:22-0:30 | Scénario B : le SSI sonne pour un aérosol, procédure appliquée, l'IA signale des indices de nuisance | « Ici, un aérosol déclenche l'alarme. La procédure est appliquée ; l'IA indique des indices de nuisance, l'agent vérifie la zone… » |
| 0:30-0:35 | Page SSI : schéma « aucune voie de retour », journal Modbus lecture seule | « … mais l'alarme reste maintenue : lecture seule, jamais d'inhibition. L'opérateur décide. » |
| 0:35-0:42 | Scénario C : CO élevé (échappement) | « Pas de feu, mais du CO : alerte santé. » |
| 0:42-0:47 | Scénario D : capteur en dérive, mode dégradé | « Un capteur dérive ? Il est détecté et exclu du vote. » |
| 0:47-0:55 | Tableau des résultats mesurés | « Sur données réelles : 17 feux sur 17, et des fausses alarmes reconnues. » |
| 0:55-1:00 | Carton : **« Aero-Fire DT — Lecture seule. Jamais d'inhibition. »** + URL GitHub | « Aero-Fire DT, le copilote incendie des usines tunisiennes. » |

**Règles :** 1 minute maximum ; aucun chiffre non mesuré ; montrer le cas où l'alarme SSI est **maintenue** (pas masquée) ; ne pas parler de drone ni de « certification ».
