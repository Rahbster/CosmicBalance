# THE COSMIC BALANCE

*© 1982 by Strategic Simulations, Inc.*

## 1.0 INTRODUCTION

COSMIC BALANCE is a simulation of tactical combat in deep space. You design your ships, give them their orders, and then see how they perform in combat against enemy ships.

There is very little chance involved. The outcome will depend almost entirely upon your judgement as a designer and your skill as a commander.

The game is played in three phases:

*   **THE SETUP PHASE:** You choose one of six different tactical scenarios, and then design up to four different ships on each side to fight them.
*   **THE ORDERS PHASE:** Your map will show you the positions of your ships and the enemy ships. You give each ship its orders for a sixteen-second turn. Your ships may maneuver, change course, fire weapons, or try to beam a boarding party onto an enemy ship. Your opponent will then give his orders for the same turn.
*   **THE EXECUTION PHASE:** You will now watch the ships battle each other, each following the instructions given them during the orders phase. The scenario will end when all of your ships or all of the enemy ships have been destroyed, when one or both players have run away, or when one player has achieved the victory conditions given for that scenario.

## 2.0 BEGINNING THE GAME

*   **NEW GAME OR SAVED GAME:** Start a fresh scenario or recall a saved game.
*   **SOLITAIRE OR TWO PLAYER:** Play against the computer or a human opponent.
*   **SOLITAIRE LEVEL:** Choose difficulty from 1 to 4. Level 4 enemies have efficiency +3 and power +3 per engine.

## 3.0 VICTORY POINTS

Victory points are awarded based on ship survival, size, and tech level, minus critical damage.

### Victory Points for Undamaged Ships

| Tech Level | Size 1 (Corvette) | Size 2 (Frigate) | Size 3 (Destroyer) | Size 4 (Cruiser) | Size 5 (Dreadnought) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 4 | 12 | 25 | 58 | 105 |
| 2 | 5 | 14 | 31 | 72 | 130 |
| 3 | 6 | 17 | 38 | 86 | 155 |
| 4 | 7 | 21 | 49 | 105 | 180 |
| 5 | 8 | 25 | 60 | 125 | 210 |
| 6 | 9 | 29 | 71 | 150 | 250 |

*   **Damaged Ships:** VP is reduced by the percentage of critical hits suffered.
*   **Captured Ships:** Add the enemy ship's VP to yours.

### 3.1 THE SCENARIOS

1.  **DEEPSPACE ENCOUNTER:** Enterprise vs Reliant. Tech 5 Cruisers. Destroy or capture.
2.  **PLANETARY RAID:** Alliance Dreadnought vs Brotherhood Defense Squadron (3 Destroyers) + Planet Dirgos.
3.  **COMMERCE RAIDER:** Alliance Cruiser vs Brotherhood Transport Dreadnought (7 cargo holds).
4.  **INVASION:** Alliance Invasion Force (1 Dreadnought, 3 Cruisers, troops) vs Brotherhood Defense (1 Dreadnought, 3 Destroyers).
5.  **DOGFIGHT:** Squadron vs Squadron (up to 4 ships each).
6.  **SURPRISE ATTACK (Solitaire):** Alliance Squadron vs Robot Attackers (1-4 Tech 6 Dreadnoughts).

## 4.0 THE SETUP PHASE

Design your ships.

*   **4.1 Technological Level:** 1 (oldest) to 6 (newest).
*   **4.2 Size:** Corvette (1), Frigate (2), Destroyer (3), Cruiser (4), Dreadnought (5).
*   **4.5 Space Left:** `(9 + Tech Level) * 2^(Size - 1)`.
*   **4.10 Mass:** `2^(Size - 1)`. Determines critical hit survival.

### Systems and Space Requirements

| System | Space Required | Notes |
| :--- | :--- | :--- |
| **Range (Warp Drives)** | 1 Tech Sector | Needed for strategic movement/escape. |
| **Cargo** | 1 Tech Sector | For supplies/troops. |
| **Fighter Bay** | 2 Tech Sectors | Holds 30 fighters. |
| **Hull** | Variable | Crew quarters. Min based on size. Extra space increases Efficiency. |
| **Racks** | 2 Cubic Sectors | Launch platform for Seekers. |
| **Light Seeker** | 1 Rack Space | Guided weapon. |
| **Heavy Seeker** | 2 Rack Spaces | Slower, more powerful guided weapon. |
| **Engines** | 2 Cubic Sectors | Generates 8 Power each. |
| **Drives** | 4 Cubic Sectors | Propulsion/Maneuverability. |
| **Transporters** | 1 Cubic Sector | Beams 2 marine detachments. |
| **Tractors** | 4 Cubic Sectors | Towing ships. |
| **Armor** | 1 Cubic Sector | Deflects damage. Only Plasma Torpedoes destroy armor. |
| **Marines** | 1 Cubic Sector | Boarding/Defense. |
| **Belts** | 1 Cubic Sector | Anti-fighter/missile defense satellites. |

*Note: 1 Tech Sector = 9 cubic sectors + Tech Level.*

### 4.26 Weapons

Install up to 12 weapons. Arcs are numbered 1-8 clockwise (1 is forward).

| Weapon | Power Needed | Charge Time | Space (1st Arc) | Space (Add. Arc) | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Light Phaser** | 1 | 1 Turn | 1/2 | 3/16 | Beam weapon. |
| **Heavy Phaser** | 1 | 1 Turn | 1 | 3/8 | Wider beam. |
| **Siege Phaser** | 2 | 1 Turn | 2 | 3/4 | Double damage of Light Phaser. |
| **Photon Torpedo** | 5 | 1 Turn | 2 | 3/4 | Drains shields. |
| **Disruptor** | 2/turn | 2 Turns | 2 | 3/4 | Long range (100 lightmils). |
| **Plasma Torpedo** | 5/turn | 3 Turns | 15 | N/A | Huge damage (60), destroys armor. No arc limit. |

### 4.27 Shields

*   **Space:** 1/64 cubic sector per battery.
*   **Requirement:** 8 batteries per shield strength point.
*   **Max Strength:** 30 per arc.

## 5.0 THE ORDERS PHASE

Turn length: 16 seconds.

### 5.3 Identify
Get info on enemy ships: Speed, Course, Bearing, Mass, Range, Facing Shield.

### 5.4 Course and Speed
*   **Course:** 0-359 degrees. Turn rate depends on Max Acceleration.
*   **Speed:** Change speed within acceleration limits.
*   **Drag Chute:** Slow down 1 factor/turn without energy/drives (cannot turn).

### 5.5 Shields
*   **Charge:** Restore damaged shields using Power.
*   **Drain:** Convert shield batteries to Power (inefficient: 4 batteries = 1 power).
*   **Transfer:** Move power between shields (inefficient: 2 drained = 1 charged).

### 5.6 Weapons
*   **Charge:** Must charge weapons to fire. Losing charge if not fired.
*   **Fire:** Select Weapon, Target, and Mode.
    *   **Range:** Fire when target is within X range.
    *   **Time:** Fire at second X of the turn.
    *   **Last Instant:** Fire at best moment (closest range or before losing arc).
*   **Launch:** Fighters or Seekers (1 group/seeker per turn).

### 5.7 Electronic Warfare
*   **Belts:** Charge to defend against guided weapons.
*   **ECM (Jammers):** Reduces damage from guided weapons/hit chance. Max level = Tech Level.
*   **ECCM:** Cancels enemy ECM for phasers/photons/disruptors. Max level = Tech Level.

### 5.8 Transporters
*   **Transport:** Beam marines to friendly ships or board enemies.
*   **Boarding:** Requires enemy shield facing you to be down or breached (damage > shield strength + 5).
*   **Combat:** Marines vs Defenders (Marines + Crew).

### 5.10 Running Away
From turn 10 onwards.
*   **Enemy Territory:** Needs Range 2.
*   **Contested:** Needs Range 1.
*   **Towing:** Tractors can tow ships (even Range 0) to safety.

## 6.0 THE EXECUTION PHASE

Watch the turn play out.

## 7.0 DAMAGE

*   **Systems Damage:** Probability based on system size.
*   **Protected Systems:** 75% survival chance even if hit (Cargo, Tractors, Weapons, Fighter Bays, Drives). Warp Drives 90%.
*   **Shields:** Absorb damage up to strength. Excess hits systems. Photons/Seekers drain extra batteries.
*   **Armor:** Deflects damage. Only destroyed by Plasma Torpedoes.
*   **Extraordinary Damage:** Crew/Marine kills, Sensor/Jammer destruction. Increases Critical Hit chance.
*   **Critical Hits:** Destroy computers/structure. If Critical Hits > Mass, ship explodes.

## APPENDIX B: SUMMARY OF SPACE COSTS

| System | Cubic Sectors |
| :--- | :--- |
| Drives | 4 each |
| Engines | 2 each |
| Warp Drives | 1 tech sector each |
| Cargo Holds | 1 tech sector each |
| Fighter Bays | 2 tech sectors each |
| Tractor Beams | 4 each |
| Transporters | 1 each |
| Armor | 1 per layer |
| Hull Space | Min 0.5/crew section or 1/marine |
| Racks | 2 each |
| Belts | 1 each |
| Light Phasers | 0.5 (1st arc) + 3/16 (add.) |
| Heavy Phasers | 1 (1st arc) + 3/8 (add.) |
| Siege Phasers | 2 (1st arc) + 3/4 (add.) |
| Disruptors | 2 (1st arc) + 3/4 (add.) |
| Photon Torpedoes | 2 (1st arc) + 3/4 (add.) |
| Plasma Torpedoes | 15 each |
| Shields | 1/64 per battery (1/8 per strength) |

## WEAPON CHARACTERISTICS SUMMARY

| Weapon | Range | Speed | Max Damage | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Light Seeker | 32 | 16/turn | 12 | Drains shields |
| Heavy Seeker | 30 | 10/turn | 18 | Drains shields |
| Light Phaser | 15 | Instant | 10 | Less at long range |
| Heavy Phaser | 20 | Instant | 14 | Less at long range |
| Siege Phaser | 30 | Instant | 20 | Less at long range |
| Photon Torpedo | 20 | Instant | 14 | Drains shields |
| Fighters | Unlimited | - | 1/fighter | 30 per swarm |
| Disruptors | 100 | Instant | 12 + Tech | Affected by target speed |
| Plasma Torpedo | 29 | 16/turn | 60 | Wrecks armor |
```
