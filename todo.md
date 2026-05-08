# Cosmic Balance - Development Roadmap

## Project Vision
A hybrid strategy game combining:
*   **Trade Wars 2002 (TW):** Exploration, Map topology, Trading mechanics.
*   **Cosmic Balance (CB1):** Tactical ship-to-ship combat, modular ship design.
*   **Cosmic Balance II (CB2):** Strategic planetary control, resource management, production pipelines.
*   **Theme:** Original space strategy factions (Solaris vs Syndicate).

## Game Loop & Progression (The "Three Tiers")
The game scales in scope as the player researches new propulsion technologies. As the game evolves, the "micro-management" layer shifts: what was once a primary focus (like planetary development) becomes an abstracted background mechanic.

### Tier 1: System Management (The "Police Action" Phase)
*   **Scope:** A single Star System (e.g., Epsilon Eridani).
*   **Gameplay:**
    *   Manage planets (Agri, Mining, Industrial).
    *   Build sub-light ships (Scouts).
    *   **Enemy:** **Pirates & Raiders.** Small, fast ships trying to steal resources from trade routes.
    *   **Goal:** Research *Slipspace Drive* (Solaris) or *Gravity Drive* (Syndicate).

### Tier 2: Galactic Exploration (The "Civil War" Phase)
*   **Scope:** A Galaxy of connected Star Systems.
*   **Gameplay:**
    *   Explore Warp Lanes and "Slides" (One-way warps).
    *   **Travel:** Point-to-point travel through a known web of connections.
    *   **Management:** **This is the primary tier for planetary management.** Players build up colonies, mines, and farms on individual planets.
    *   Tactical Ship Combat (CB1 style) when fleets meet.
    *   **Enemy:** **Insurrectionists (Solaris) / Heretics (Syndicate).** Breakaway factions with similar tech but different agendas.
    *   **Goal:** Research *Intergalactic Matrix* / *Path of the Ancients*.

### Tier 3: Universal Conquest (The "Total War" Phase)
*   **Scope:** Multiple Galaxies connected by rare, high-cost **Jump Gates**.
*   **Gameplay:**
    *   Macro-management of fleets.
    *   Strategic Auto-Battles (CB2 style).
    *   **Total Abstraction:** Upon entering this tier, **all planetary management ceases.** Star Systems across all galaxies (including the home galaxy) are now treated as single economic nodes, their output based on their previous development. The player's focus shifts entirely to controlling star systems and jump gates.
    *   **Enemy:** **The Main Opposition (Solaris vs Syndicate).** Full-scale galactic war.
    *   **Goal:** Domination of the universe.

### Tier 4: The Scourge (The "Survival" Phase)
*   **Scope:** The entire map.
*   **Gameplay:**
    *   **Enemy:** **The Scourge.** An existential threat that consumes ships and planets, turning them against you.
    *   **Mechanic:** "Infection" spreads through warp lanes.
    *   **Goal:** Form an Alliance (Solaris + Syndicate) to fire the ancient array or sterilize infected systems.

## Open Design Questions (Resolving Hybrid Conflicts)
*   **Time Progression:**
    *   *Approach:* **Tick-Based Macro / Real-Time Micro.** The universe moves on ticks (production/travel), but combat/interaction is real-time.
    *   *Scourge Progression:* The Scourge spreads on a "Tick" basis (e.g., every 100 ticks, infected neighbor systems roll for infection).
*   **Combat Control:**
    *   *Approach:* **Hybrid Resolution.** Minor skirmishes (e.g., trader interception) can be "Auto-Resolved" by stats. Major fleet engagements offer an "Enter Tactical Mode" option (CB1 style).
*   **Starting Scenarios:**
    *   New Game menu allows starting at Phase 1 (clean slate), Phase 2 (established empire), or Phase 3 (galactic power).

## Roadmap

### Phase 1: The Hybrid Economy (Reconciliation)
*Goal: Bridge the gap between Trade Wars commodities and Cosmic Balance production.*
- [ ] **Unify Resource Models:**
    - Map TW `Fuel Ore` to CB `Minerals` (Mined from Volcanic/Barren planets; used for Hulls).
    - Map TW `Equipment` to CB `IO` (Industrial Output; used for Research/Components).
    - Map TW `Organics` to Colony Support (Farmed from Agri/Terran planets; consumes to boost IO).
- [ ] **Define Economy Loop:**
    - **Tier 1 Loop:** Extract Minerals -> Build Ships -> Research Warp.
    - Trading between sectors generates raw resources.
    - **Refine Tech Tree:** Ensure a clear research path exists for Tier 1, with prerequisites for Warp Drive.
    - **Ports are Planets:** Players trade by orbiting planets.
    - Controlled Planets consume `Organics` to maintain efficiency.
    - `IO` + `Minerals` are used for `tech-tree.json` unlocks and Ship Construction.

### Phase 2: Universe & Exploration (TW + CB2)
*Goal: A playable map that supports both trading and conquest.*
- [ ] **Galaxy Service (`js/services/GalaxyService.js`):**
    - **Tier 1: Star Systems:** Nodes containing Planets (Sublight travel).
    - **Tier 2: Galaxies:** Clusters of Star Systems connected by Warp Lanes (bidirectional & one-way).
    - **Big Bang / Small Bang:** Procedural generation using seeds. The level of detail (planets vs. abstracted stats) generated depends on the **current game tier**, not the specific galaxy.
    - **New Game Screen:** Create UI for players to select a starting Scenario (Tier 1, 2, or 3).
    - **Scenario Generator:** Logic to seed the universe differently based on selected Start Phase.
    - **Tier 3: The Universe:** Multiple Galaxies connected by rare "Jump Gates".
    - **Auto-Mapper:** Visited systems are rendered on a player map; unvisited are "Fog of War".
    - Store state in `GalaxyService`.
- [ ] **Interactive Map UI:**
    - Implement a 3-tier zoomable map:
        - **Universe View:** Shows galaxies as disks, connected by Jump Gate lines.
        - **Galaxy View:** Zooms into a galaxy to show star systems and warp lanes.
        - **System View:** Zooms into a system to show planets and ships.
    - Implement navigation controls that are context-aware based on zoom level.
- [ ] **Planetary Interface:**
    - Replace generic TW Port Classes with Planet Types (Volcanic, Terran, Oceanic).
    - Planets have `Alignment` (Solaris/Syndicate).
    - Planets have `Tech Level` (Limits what ships can be built, per CB2).

### Phase 3: Tactical Combat (CB1)
*Goal: Turn-based or real-time tactical battles when fleets meet.*
- [ ] **Ship Design System:**
    - Use `data/tech-tree.json` modifiers (e.g., `Titanium-A Plating`) to calculate derived stats.
    - Define Ship Classes (Scout, Frigate, Cruiser) based on CB1 stats (Range, Speed, Weapon Arcs).
- [ ] **Combat Engine:**
    - Triggered when opposing factions occupy the same Star System.
    - **Auto-Resolve:** Standard calculation for unequal forces or trading raids (saves time).
    - **Tactical Command:** Optional manual control for major battles.
    - **Positional Advantage:** Defenders at a warp exit get the first strike initiative.

### Phase 4: AI & Networking
*Goal: Robust single-player, multiplayer, and 'The Scourge' logic.*
- [ ] **P2P Implementation:**
    - Wire up `css/peer.css` UI to WebRTC logic.
    - Implement Game State Sync (Universe changes, Fleets).
- [ ] **AI Opponents:**
    - **Trader Bot (TW Logic):** Moves between ports to optimize resource gain.
    - **Strategist Bot (CB2 Logic):** Decides when to expand/colonize.
    - **Tactician Bot (CB1 Logic):** Manages ship combat maneuvers.
    - **The Scourge AI:**
        - **Swarm Behavior:** Doesn't trade, only consumes.
        - **Reanimation:** Destroyed player ships in Scourge sectors have a % chance to respawn as Scourge ships.

### Phase 5: Diplomacy & Alliances (Endgame)
- [ ] **Alliance System:** Mechanics for Solaris/Syndicate players to cease fire and share vision/warp gates to fight The Scourge.