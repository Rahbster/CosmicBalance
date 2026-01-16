# COSMIC BALANCE II: THE STRATEGIC GAME

*© 1982 by Strategic Simulations, Inc.*

## 1.0 INTRODUCTION

COSMIC BALANCE II is a simulation of strategic operations in an interstellar culture. You discover and colonize planets; establish commerce nets; allocate production to supplies, starship construction, and research; and order your starships to various missions.

Be warned: war is costly and economies are fragile.

## 2.0 GLOSSARY

*   **ACTIVE:** The status of a planet which is fully operational.
*   **ATTACK MISSION:** Any one of the following missions: Invasion, Commerce Raid, and Planetary Raid.
*   **CARGO CAPACITY:** The number of cargo holds a ship contains.
*   **CARGO HOLD:** A cargo hold is a space on a ship which can either transport 250 supply points or 1 resource point.
*   **CARGO SHIP:** Any ship with a cargo capacity greater than zero.
*   **COLONIAL:** The status of a planet which is populated, but which is not operational.
*   **COLONY:** A planet of colonial status.
*   **COLONY LEVEL:** The number of consecutive turns that a colony needs to be supplied, in order to attain active status.
*   **COMBAT GROUP:** A group of ship or ships that have a common mission in a common sector.
*   **COMMERCE:** A mission ships can perform which creates resource points from the cargo capacity of ships on that mission.
*   **COMMERCE NET:** A group of interdependent planets (7 farm, 2 mine, and 1 indy) that are connected by trade (18 resource points), which are able to produce industrial output points.
*   **COMMERCE RAID:** A mission ships can perform which allows the ships to search for and attack enemy ships on commerce or supply missions.
*   **DISCOVERED:** The status of a planet which a player knows about, but which has not yet been colonized, or which has been colonized but whose colony failed.
*   **ECOLAPSE:** The status of a planet which had been active, but has just lost its active status.
*   **FARM (FARMING WORLD):** A planet which is primarily agricultural in nature and which has little or no mineral resources.
*   **GARRISON:**
    1.  A mission ships may perform which allows them to protect the planets in their sector from invasion and planetary raid missions.
    2.  A group of ships on a garrison mission which have been assigned to a given planet. They are the planet's garrison.
*   **HYPER OUT:** The act of turning on a ship’s TLVD and leaving the scene of a battle (i.e. bugging out).
*   **INDY (INDUSTRIAL WORLD):** A world which has been paved over with factories, with little or no natural resources of its own to support such a state. Industrial worlds are never discovered; they are industrialized at the time of colonization.
*   **INVASION:** A mission ships may perform which allows the capture of enemy worlds. For an invasion to be successful the invading ships must defeat the planet's garrison, have at least three points of undamaged cargo capacity remaining, and eight siege gun equivalents in the invading combat group (representing troops).
*   **IO (INDUSTRIAL OUTPUT POINT):** An IO is a representation of potential goods and services which may be created. IOs may be used to construct ships, supplies, or be allocated to research efforts.
*   **MINE (MINING WORLD):** A planet which has large quantities of mineral resources, yet insufficient food resources to support its population.
*   **MISSION:** A mission is a task ships may perform. The following are possible missions: garrison, commerce, supply, patrol, invasion, commerce raid, planetary raid, and scout.
*   **PATROL:** A mission ships may perform which is designed to intercept enemy attack missions before they can reach their target.
*   **PLANETARY RAID:** A mission ships may perform, the intention of which is to bomb a planet, lowering the planet's status.
*   **RESOURCE POINT:** A measure of goods in the form of food, minerals, or manufactured items. Resource Points are needed to operate a commerce net.
*   **SCOUT:** A mission ships may perform in an attempt to discover new planets.
*   **SECTOR:** An area of space which contains approximately 40 usable planets.
*   **SECTOR SUPPLY POOL:** The pool of supply points available in a given sector to the owning player.
*   **SECTOR TRANSPORTED SUPPLY POOL:** The pool of supply points that were transported within the given sector and which are available to the owning player for supplying his planets.
*   **SIEGE PHASER EQUIVALENT:** A number of ship weapons equal in firepower to one siege phaser. The siege phaser is the standard space weapon for both players.
*   **SUPPLY:** A mission ships may perform which transfers supply points from the Sector Supply Pool to the Sector Transported Supply Pool.
*   **SUPPLY POINT (SUPPLIES):** A measure of goods and services produced by one IO. Supplies are used to maintain ships and planets.
*   **TECH LEVEL:** A measure of the technological sophistication of the player's people. The player’s tech level may be increased by research.
*   **TERR (TERRAN/TERRESTRIAL WORLD):** An Earthlike planet with enough food, minerals, and industry to be self sufficient.
*   **TLVD (TRANS-LIGHT VELOCITY DRIVE):** The mechanism by which a ship is able to travel faster than the speed of light.

## 3.0 SETTING UP THE GAME

*   **NEW, SAVED, OR CREATE A GAME:** Choose to start fresh, load a save, or create a custom scenario.
*   **COSMIC BALANCE I COMBAT OPTION:** Allows resolving battles using the tactical game *Cosmic Balance I*.
*   **TWO PLAYER OR SOLITAIRE:** Play against a human or the computer (levels 1-4).
*   **SCENARIOS:** Choose from 5 historical scenarios or a created one.

## 4.0 SEQUENCE OUTLINE

1.  **The Production Phase**
    *   **Ship Supply Segment:** Supply or scuttle ships. Buy supplies.
    *   **Construction Segment:** Spend IOs on ships or research. Unused IOs become supplies.
2.  **First Movement Phase**
    *   Assign missions (Garrison, Commerce, Supply, Patrol, Invasion, Commerce Raid, Planetary Raid, Scout).
3.  **Execution Phase**
    *   Computer resolves encounters and combat.
4.  **Colony Supply Phase**
    *   **Discovery Segment:** Computer determines new planet discoveries.
    *   **Colony Supply Segment:** Use transported supplies to colonize or maintain planets.
5.  **Second Movement Phase**
    *   Move Range 2 ships to adjacent sectors.

## 5.0 PLANETS AND PLANET STATUS

*   **Classes:** Industrial, Mining, Farming, Terran.
*   **Statuses:**
    *   **Active:** Fully operational. Required for commerce nets.
    *   **Ecolapse:** Recently suffered disaster. Needs supply to return to Active.
    *   **Colonial:** Populated but not operational. Has levels 1-10 (turns until Active).
    *   **Discovered:** Known but uncolonized (or failed colony).

## 6.0 SHIPS

### 6.3 Ship Characteristics Table

| SHIP | ID | SIZ | RAN | CARG | ATK | DEF | ARM | % MAX | SPD | FULL SHIP NAME |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| INTR | IN | 1 | 0 | 00 | 01 | 03 | 0 | 32 | INTERCEPTOR |
| FRIG | FG | 2 | 0 | 00 | 03 | 02 | 0 | 32 | FRIGATE |
| WTCH | WT | 3 | 0 | 00 | 05 | 08 | 8 | 24 | WATCHER |
| GRDN | GD | 4 | 0 | 00 | 10 | 22 | 11 | 24 | GUARDIAN |
| DFND | DF | 5 | 0 | 00 | 14 | 26 | 20 | 24 | DEFENDER |
| DEST | DE | 3 | 1 | 00 | 04 | 04 | 8 | 16 | DESTROYER ESCORT |
| ESCT | ES | 4 | 1 | 00 | 08 | 12 | 8 | 20 | ESCORT |
| ATTK | AT | 5 | 1 | 00 | 12 | 28 | 17 | 24 | ATTACK SHIP |
| LNCR | LN | 4 | 2 | 00 | 07 | 09 | 6 | 16 | LANCER |
| RAID | RD | 5 | 2 | 00 | 12 | 19 | 8 | 24 | RAIDER |
| TRDR | TD | 4 | 1 | 05 | 01 | 12 | 0 | 12 | FREE TRADER |
| MRCH | MR | 5 | 1 | 07 | 02 | 15 | 6 | 16 | MERCHANT |
| FRTR | FR | 5 | 1 | 11 | 01 | 25 | 0 | 2 | FREIGHTER |
| TRAN | TR | 5 | 2 | 04 | 08 | 34 | 6 | 8 | TRANSPORT |
| CLYS | CS | 5 | 2 | 10 | 01 | 25 | 0 | 2 | COLONY SHIP |
| PLANET | | 5 | 0 | 00 | 00 | 30 | 50 | | | |

## 7.0 COMMERCE NETS

A Commerce Net consists of:
*   1 Industrial planet
*   2 Mining planets
*   7 Farming planets
*   18 Resource points (moved by Commerce mission)

**Maximum resources per net (for IO bonus):**
*   1 Net: 10
*   2 Nets: 9
*   3 Nets: 8
*   4 Nets: 7

Each resource point over the minimum 18 produces 250 IOs, up to the maximum listed above.

## 8.0 THE MAP AND DISPLAYS

*   **Map:** 16 sectors (A-P). White = Player 1, Green = Player 2, Black = Neutral, Striped = Contested.
*   **General Display:** Sector status, supply pool, ship counts, planet counts.
*   **Ship Display:** Matrix of Ship Types vs Missions.
*   **Planet Display:** Matrix of Planet Types vs Status.

## 9.0 PRODUCTION

### 9.3 Ship Supply Segment
*   Scuttle ships to save maintenance (returns 1/8th cost).
*   Buy supplies (1 IO = 1 Supply Point).

### 9.4 Construction Segment
*   Spend IOs on ships or research.
*   Research: Every 400 IOs spent gives ~1% chance of Tech Level increase (Max Level 6).

### 9.4.3 Ship Cost and Maintenance Table

| SHIP TYPE | BUILD COST | MAINT COST | SCUTTLE BONUS | SHIP TYPE | BUILD COST | MAINT COST | SCUTTLE BONUS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| INTR | 50 | 5 | 6 | LNCR | 1500 | 50 | 187 |
| FRIG | 300 | 15 | 37 | RAID | 4000 | 110 | 500 |
| WTCH | 650 | 30 | 81 | TRDR | 800 | 35 | 100 |
| GRDN | 1500 | 50 | 187 | MRCH | 1600 | 55 | 200 |
| DFND | 4000 | 90 | 500 | FRTR | 1600 | 40 | 200 |
| DEST | 650 | 30 | 81 | TRAN | 3000 | 90 | 315 |
| ESCT | 1500 | 45 | 187 | CLYS | 1600 | 50 | 200 |
| ATTK | 4000 | 100 | 500 | | | | |

## 10.0 FIRST MOVEMENT PHASE

Assign missions to ships in the active sector.

*   **CM (Commerce):** Move resource points within the sector.
*   **SU (Supply):** Move supplies from Active Sector to Target Sector. (250 supplies per cargo hold).
*   **PA (Patrol):** Intercept enemy raiders.
*   **IN (Invasion):** Attack enemy planets with troops (cargo holds). Requires 3 cargo capacity + 8 siege gun equivalents to capture.
*   **CR (Commerce Raid):** Attack enemy Commerce/Supply missions.
*   **PR (Planetary Raid):** Bombard enemy planets. Success destroys 1/2 resources.
*   **SC (Scout):** Search for new planets. Range 1 or 2 ships only.
*   **Garrison:** Default mission. Defends planets.

**Moving:** Range 0 ships need Range 2 transports to move between sectors. Range 1 ships can move to adjacent friendly sectors. Range 2 ships can move anywhere adjacent.

## 11.0 EXECUTION

*   **Combat Groups:** Ships are grouped (Large = ~4 ships, Small = ~2 ships).
*   **Combat:**
    *   Patrols may intercept attackers (1/16 chance per patrol group).
    *   Commerce Raids have 50% chance to find targets.
    *   Planetary Raids/Invasions attack planets.
    *   Ships may "Hyper Out" (retreat) if losing.

## 12.0 COLONY SUPPLY PHASE

### 12.1 Discovery
Scouts have a chance to find planets (max 40 per sector).
*   Mining: ~22%
*   Farming: ~77%
*   Terran: ~1%
*   Industrial: Created from others.

### 12.2 Colony Supply
Use **Transported Supplies** (from SU missions) to colonize or maintain planets.
*   **Colonize:** Start a new colony on a Discovered planet. 87% success chance.
*   **Supply:** Move a planet up one status level (e.g., Colony 3 -> Colony 2).
*   **Failure to Supply:** Active -> Ecolapse; Ecolapse -> Colony 2; Colony -> -2 levels.

### 12.2.7 Planet Cost and Colonization Time Chart

| PLANET TYPE | COST | COL. TIME | PLANET TYPE | COST | COL. TIME |
| :--- | :--- | :--- | :--- | :--- | :--- |
| INDUSTRIAL | 700 | 8 TURNS | FARMING | 100 | 2 TURNS |
| MINING | 200 | 5 TURNS | TERRAN | 450 | 4 TURNS |

## 13.0 SECOND MOVEMENT

Move Range 2 ships (and their passengers) to adjacent sectors.
*   Ships ending this phase in a sector with no friendly occupied planets are **destroyed**.

## 14.0 SAVING THE GAME

Use the 'S' command during Production Phase to save.

## 15.0 THE COSMIC BALANCE COMBAT OPTION

Allows resolving battles using the *Cosmic Balance I* tactical game.
*   Save the battle state.
*   Load *Cosmic Balance I*.
*   Fight the battle.
*   Reload *Cosmic Balance II* and input results (ships destroyed, cargo lost, capture success).

## 16.0 CREATING A SCENARIO

Allows custom setup of Tech Level, Ships, Planets, Supplies, and Cargo for both players in all sectors.

## 17.0 THE SCENARIOS

1.  **Terran Expansion (4-60 H.E.):** Solitaire. Establish a commerce net by turn 15.
2.  **Colonial Wars (112-120 H.E.):** ICP vs Terra. Economic warfare.
3.  **First Contact (208-248 H.E.):** ICP vs Empire. Survival.
4.  **Rebellion (293-347 H.E.):** ICP vs Empire. Foment rebellion in Sector B.
5.  **The Final Conflict (403-present):** Total war. Player with most sectors wins.

## 19.0 PLAYER NOTES

*   **Commerce Raids:** Effective at reducing enemy production by destroying cargo ships.
*   **Nets:** Destroy nets via Invasion (best) or Planetary Raid (good, but enemy can rebuild).
*   **Destroyers:** Workhorses. Use massed Destroyers on Patrol for defense.
*   **Supply:** Ensure you have enough supplies before moving fleets into a sector.
*   **Terran Expansion Hint:** Don't colonize until necessary to save supplies.
```
