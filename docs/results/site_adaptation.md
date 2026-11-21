# Modèle général + apprentissage local — preuve sur un site indépendant (NIST)

**Idée :** chaque usine a son « air normal » et ses propres fausses alarmes. Aero-Fire DT combine :
1. un **modèle général**, entraîné sur tous les sites déjà connus (aujourd'hui : le hall industriel Mendeley, 32 essais réels) ;
2. un **modèle local par usine** : les données générales + les enregistrements de l'usine pendant son pilote de 90 jours, réentraînés ensemble ;
3. le SSI certifié reste maître pendant tout l'apprentissage (l'IA ne fait que conseiller).

**Protocole honnête :** chaque essai NIST est toujours jugé par un modèle qui ne l'a **jamais vu** (un essai retiré à la fois). Mêmes seuils, même vote à deux canaux, 7 entrées disponibles sur NIST. Code : `ai/external_test/site_adaptation.py`, résultats : `site_adaptation.json`.

| Situation | Feux détectés (8) | Fausses alarmes de cuisine NON appelées feu (33) |
|---|---|---|
| **A. Modèle général seul** (jour 1, rien appris sur place) | 7 / 8 | **6 / 33** |
| **B. Général + pilote local complet** | **8 / 8** | **29 / 33** (IC 95 % : 73 – 95 %) |
| C. Général + pilote court (30 % des essais locaux, 20 tirages) | 74 % en moyenne (pire : 50 %) | 88 % en moyenne (65 – 100 %) |
| D. Local seul (sans données générales) | 8 / 8 | 29 / 33 |

Par source après apprentissage local : bacon 4/4, spaghetti 4/4, bagels 2/2, frites, tortillas, bougie reconnus ; restent appelés « feu » : 1 toast, 1 pizza, 1 beurre, 1 hamburger.

**L'usine d'origine n'est pas abîmée** (`site_forgetting.json`) : sur le hall industriel, entraîné avec ou sans les données NIST : feux 17/17 → 17/17, nuisances 10/15 → 9/15. → Architecture retenue : **un modèle général partagé + un modèle local par usine** (l'apprentissage d'un site ne perturbe pas les autres).

**Limites :** 41 essais NIST seulement ; un pilote court ne suffit pas pour les feux (peu d'exemples locaux de feu) → le pilote doit durer assez longtemps ; ici les capteurs NIST sont différents des nôtres, donc les données locales font presque tout le travail — avec notre kit standard identique partout, le modèle général sera plus utile dès le jour 1.
