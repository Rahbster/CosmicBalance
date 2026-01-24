# Cosmic Balance - Feature Roadmap & Todo

This document outlines planned features derived from *Cosmic Balance I*, *Cosmic Balance II*, and *Trade Wars 2002*, adapted for the current Real-Time Strategy architecture.

## 1. Economy & Logistics (Source: Cosmic Balance II & Trade Wars 2002)

- [ ] **Commerce Nets (CB2):**
    - Implement logic to detect "Nets" (e.g., 1 Industrial + 2 Mining + 7 Farming planets connected by trade).
    - Add bonus IO/Resource generation for active nets.
    - Visual indicators for established trade routes.
- [ ] **Supply System (CB2):**
    - Implement "Supply Points" as a resource.
    - **Colony Maintenance:** Planets require periodic supply to remain "Active". Failure leads to "Ecolapse" (reduced production).
    - **Ship Supply:** Ships consume supply over time or per jump.
- [ ] **Trading Ports (TW2002):**
    - Add `Station` types that act as Trade Ports.
    - Allow buying/selling of specific resources (Fuel Ore, Organics, Equipment) at dynamic prices.
- [ ] **Cargo Missions (CB2):**
    - Automate `Freighter` units to move resources between sectors/planets to fulfill Commerce Net requirements.

## 2. Planetary Development (Source: Trade Wars 2002)

- [ ] **Citadels (TW2002):**
    - [x] **Logic:** Implemented Combat Control (Lvl 2), Quasar Cannon (Lvl 3), and Shields (Lvl 5) in CombatService.
    - [x] **UI:** Planets are selectable and the "Upgrade Citadel" button is now functional.
    - [ ] **Visuals:** Add effects for Quasar Cannon fire and Shield hits.
    - [x] **AI:** Implement cost/benefit analysis for AI to build and upgrade Citadels.
- [ ] **Genesis Torpedoes (TW2002):**
    - High-tier tech/weapon to generate a random planet in an empty sector.

## 3. Combat & Ship Design (Source: Cosmic Balance I)

- [ ] **Electronic Warfare (CB1):**
    - Add `ECM` (Electronic Counter Measures) component: Reduces incoming hit chance.
    - Add `ECCM` (Electronic Counter-Counter Measures) component: Counters enemy ECM.
- [ ] **Boarding & Capture (CB1):**
    - Implement `Marines` as a cargo/component.
    - Allow boarding actions against disabled (low hull) ships to capture them.
- [ ] **Weapon Specialization (CB1):**
    - **Phasers:** Instant hit, shield effective.
    - **Photon Torpedoes:** High damage, energy intensive.
    - **Plasma Torpedoes:** Devastating damage, destroys armor, slow reload.
    - **Seekers/Missiles:** Tracking weapons, can be shot down by Point Defense (Belts).
- [ ] **Ship Systems:**
    - **Tractor Beams:** Ability to tow ships (friendly or disabled enemy).
    - **Transporters:** Range-based troop transfer without docking.

## 4. Strategic Map Features (Source: Trade Wars 2002 & CB2)

- [ ] **Space Mines (TW2002):**
    - [x] **Logic:** Implemented deployment and collision logic.
    - [x] **Visuals:** Added rendering for mines.
    - [ ] **Mine Sweeper:** Specific role/component to clear mines safely.
- [ ] **Cloaking Device (TW2002):**
    - [x] **Logic:** Implemented toggle and visibility checks. Decloaks on fire.
- [ ] **Navigational Hazards:**
    - [x] **Visuals:** Added rendering support for Nebulas and Black Holes.
    - [ ] **Generation:** Need to update GalaxyService to generate hazards.

## 5. AI & NPC Factions (Source: Trade Wars 2002)

- [ ] **Neutral Factions:**
    - [x] **Ferrengi/Raiders:** Hostile NPCs that attack trade routes. Implemented as 'pirates' faction.
    - **Federation/Police:** Neutral NPCs that attack aggressors in "Protected" sectors.
- [ ] **StarDock (TW2002):**
    - A unique neutral station in the galaxy center.
    - Functions: Bank (store credits), Tavern (info), Shipyard (buy unique hulls).

## 6. UI & Meta

- [ ] **Alignment System (TW2002):**
    - Track player actions (attacking neutrals vs pirates).
    - Unlock specific tech/ships based on Alignment (Good/Evil).