# Matériel — kit capteur retenu (« option 1 ») et prix

**Choix de l'équipe (21 nov. 2026) : option 1.** Même « langage » de capteurs que les données d'entraînement (particules de type Sensirion SPS30, gaz H₂/COV bruts), donc l'IA reste valable sans réapprentissage complet ; on économise sur les pièces qui ne changent pas ce que voit l'IA.

Chaque boîtier fournit les **11 mesures** utilisées par l'IA (PM0,5 · PM1,0 · PM2,5 · PM total · taille typique des particules · CO · H₂ · COV · CO₂ · température · humidité) avec **4 capteurs + 1 microcontrôleur**.

## Un boîtier

| Rôle | Pièce | Mesures | Prix relevé (USD) | Sources |
|---|---|---|---|---|
| Fumée / particules + taille | **Sensirion SPS30** | PM0,5, PM1,0, PM2,5, PM total, taille typique | **21 – 37** | [Future Electronics](https://futureelectronics.com/de/p/semiconductors--analog--sensors--air-quality/sps30-sensirion-9104459) · [DigiKey](https://www.digikey.com/en/products/detail/sensirion-ag/SPS30/9598990) |
| H₂ + COV | **Sensirion SGP30** (module) | H₂ brut, COV brut | **7 – 9** | [ElectroPeak](https://electropeak.com/sgp30-air-quality-voc-and-eco2-sensor-module) · [Elecrow](https://www.elecrow.com/gas-sensor-sgp30-air-quality-sensor-breakout-voc-and-eco2.html?r=cmVsYXRl) · [eBay](https://www.ebay.de/itm/364343306711) |
| CO₂ + température + humidité | **Sensirion SCD40** | CO₂, T, HR | **13 – 26** | [atomic14 (comparatif)](https://www.atomic14.com/esp32/sensors/co2-sensors/) · [Newegg](https://www.newegg.com/p/3C6-00SS-00BZ7) |
| CO | **Winsen ZE07-CO** (électrochimique) | CO | **17 – 21** | [Elecbee](https://www.elecbee.com/en-26175-ZE07-Carbon-Monoxide-CO-Sensor-Module-High-Precision-Gas-Sensor-Detecting-Carbon-Monoxide-Serial-Port-Output) |
| Calcul + radio | **ESP32-C3 SuperMini** (Wi-Fi / ESP-NOW intégrés, pas de module LoRa) | 19 indices + score IA | **3 – 4** | [atomic14](https://www.atomic14.com/esp32/boards/esp32-c3-supermini/) · [eBay](https://www.ebay.com/itm/ESP32-C3-SuperMini-WiFi-Bluetooth-Development-Board-32-bit-RISC-V-UART-I2C-SPI-/355157626980) |
| Boîtier, carte, alimentation | — | — | ≈ 10 – 15 (estimation) | — |
| **Total pièces** | | | **≈ 70 – 110 USD ≈ 215 – 340 TND** | 1 USD = 3,0335 TND (BCT) |

**Rendu en Tunisie** (port + droits + TVA, hypothèse +30 à 40 %) : **≈ 300 – 475 TND par boîtier**. Aucun revendeur tunisien affichant ces capteurs en dinars n'a été trouvé → import (DigiKey, Mouser, AliExpress). Pour comparaison, un PMS5003 est affiché à 1 000 Dhs au Maroc ([Jumia](https://www.jumia.ma/pieces-accessoires-capteurs/generic/)).

Ancienne estimation (SPS30 + SGP30 + SGP41 + SCD41 + SHT40 + CO) : ≈ 480 – 550 TND en pièces → **l'option 1 divise le coût par ≈ 2** pour les mêmes 11 mesures.

## Hall de démonstration (9 boîtiers)

| Élément | Qté | Ordre de grandeur |
|---|---|---|
| Boîtiers « option 1 » (rendus) | 9 | ≈ 2 700 – 4 300 TND |
| Passerelle (vote + écran ; l'IA tourne déjà dans les boîtiers → Raspberry Pi suffit) | 1 | prix non vérifié |
| Batterie LiFePO4 12,8 V 100 Ah | 1 | prix non vérifié |
| Tablette du gardien | 1 | prix non vérifié |

## Énergie du kit
≈ **0,68 W par boîtier** (SPS30 275 mW, SGP30 161 mW, ESP32-C3 66 mW, SCD40 50 mW, ZE07-CO 25 mW, pertes incluses) → système ≈ 21 W → LiFePO4 100 Ah ≈ **55 h**. Calcul : `python scripts/energy_budget.py`, détails : [`ENERGIE.md`](ENERGIE.md).

## Écartés et pourquoi
| Pièce | Pourquoi pas |
|---|---|
| Bosch BME688 | ne donne pas l'H₂ séparément ; or l'H₂ est un indice important du modèle |
| Plantower PMS5003 (13 – 20 USD, [Pi Hut](https://thepihut.com/products/pms5003-particulate-matter-sensor-with-cable)) | moins cher, mais autre marque de capteur de particules → l'IA devrait réapprendre plus longtemps ; gardé comme option de secours |
| Winsen MH-Z19C (11 – 14 USD) | nombreux clones qui lisent trop bas ([atomic14](https://www.atomic14.com/esp32/sensors/co2-sensors/)) |
| MQ-7 / MQ-8 (≈ 2 USD) | chauffés (consomment beaucoup pendant les coupures), dérivent, peu sélectifs : inadaptés à un produit de sécurité |

## Avertissement
Prix relevés le 21 nov. 2026 sur des pages de distributeurs et de revendeurs (date de mise à jour parfois inconnue), **aucune pièce encore achetée**. Les consommations du ZE07-CO et de l'ESP32-C3 sont des estimations : **à mesurer** sur le banc matériel (phase 1).
