import { PLANET_NAMES, SHIP_DATA } from './GalaxyService.js';

export class CombatService {
    constructor(engine) {
        this.engine = engine;
    }

    runCombat(dt) {
        const shipsByPlanet = new Map();
        const systemMap = this.engine.spatialService.getSystemMap();

        // Mine Logic
        if (this.engine.state.mines && this.engine.state.mines.length > 0) {
            const minesToRemove = [];
            this.engine.state.mines.forEach(mine => {
                this.engine.state.ships.forEach(ship => {
                    if (ship.owner !== mine.owner && ship.hull > 0) {
                        const dx = ship.x - mine.x;
                        const dy = ship.y - mine.y;
                        if ((dx*dx + dy*dy) < (mine.radius * mine.radius)) {
                            this._applyDamage(ship, mine.damage);
                            minesToRemove.push(mine.id);
                            const debris = {
                                id: `debris-${crypto.randomUUID()}`,
                                x: mine.x,
                                y: mine.y,
                                resources: { scrap: 10 }
                            };
                            this.engine.state.debrisFields.push(debris);
                            this.engine.broadcast({ type: 'GAME_DEBRIS_CREATED', debris });
                        }
                    }
                });
            });

            if (minesToRemove.length > 0) {
                this.engine.state.mines = this.engine.state.mines.filter(m => !minesToRemove.includes(m.id));
                this.engine.broadcast({ type: 'GAME_MINES_REMOVED', mineIds: minesToRemove });
            }
        }

        // Optimization: Iterate ships once instead of (Systems * Ships)
        // Use cached currentSystemId to quickly bucket ships
        this.engine.state.ships.forEach(ship => {
            if (ship.scoutMission || ship.isBuilding) return; // Skip non-combatants

            if (ship.currentSystemId) {
                const sys = systemMap.get(ship.currentSystemId);
                if (sys) {
                    const dx = sys.x - ship.x;
                    const dy = sys.y - ship.y;
                    // Verify ship is actually within effective radius (it might be leaving)
                    if ((dx * dx + dy * dy) <= (this.engine.spatialService.getSystemEffectiveRadius(sys) ** 2)) {
                        if (!shipsByPlanet.has(sys.id)) shipsByPlanet.set(sys.id, []);
                        shipsByPlanet.get(sys.id).push(ship);
                    }
                }
            }
        });

        // Process combat for each planet
        for (const [planetId, ships] of shipsByPlanet.entries()) {
            // planetId here corresponds to systemId in the map
            const system = systemMap.get(planetId);
            if (system && system.planets) {
                system.planets.forEach(planet => {
                    if (planet.owner && planet.citadelLevel > 0) {
                        this._processCitadelCombat(planet, ships, dt);
                    }
                });
            }

            const teamsPresent = [...new Set(ships.map(s => s.team))];
            if (teamsPresent.length > 1) { // If contested
                ships.forEach(attacker => {
                    // Optimization: Only attack if we have damage to deal
                    if (attacker.damage > 0) {
                        // Find enemies only when needed
                        // Optimization: Instead of filtering all ships, find one valid target first
                        // This avoids creating a new array every iteration if we just need one target
                        const enemyShips = ships.filter(s => s.team !== attacker.team);
                        
                        if (enemyShips.length > 0) {
                            const target = enemyShips[Math.floor(Math.random() * enemyShips.length)];
                            
                            // Decloak on fire
                            if (attacker.isCloaked) {
                                attacker.isCloaked = false;
                                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: attacker.id, isCloaked: false });
                            }

                            const damagePerFrame = attacker.damage * (dt / 1000);

                            if (target.shield > 0) {
                                target.shield = Math.max(0, target.shield - damagePerFrame);
                            } else {
                                target.hull = Math.max(0, target.hull - damagePerFrame);
                            }
                            // Broadcasting every frame for every ship is heavy. 
                            // We should throttle this or batch updates, but for now, let's keep logic simple.
                            // Ideally, we only broadcast if significant change or on interval.
                            // this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: target.id, hull: target.hull, shield: target.shield });
                        }
                    }
                });

                // Handle AI Retreat Logic if overwhelmed
                this._handleRetreatLogic(ships, planetId);
            }
        }

        // Process ship destruction
        const destroyedShips = this.engine.state.ships.filter(s => s.hull <= 0);
        if (destroyedShips.length > 0) {
            destroyedShips.forEach(ship => {
                // Find the system name for the toast message and debris association
                const system = this.engine.spatialService.getClosestSystem(ship);

                // Create debris field
                const debris = {
                    id: `debris-${crypto.randomUUID()}`,
                    x: ship.x,
                    y: ship.y,
                    systemId: system ? system.id : null,
                    resources: { scrap: 50 }
                };
                this.engine.state.debrisFields.push(debris);
                this.engine.broadcast({ type: 'GAME_DEBRIS_CREATED', debris });

                const owner = this.engine.state.players.find(p => p.id === ship.owner);
                if (owner && !owner.isAI) {
                    this.engine.broadcast({ 
                        type: 'GAME_TOAST', 
                        playerId: owner.id, 
                        message: `${ship.type} was destroyed in ${system?.name || 'deep space'}!`, 
                        toastType: 'error' 
                    });
                }
            });

            // Remove destroyed ships
            this.engine.state.ships = this.engine.state.ships.filter(s => s.hull > 0);
            const destroyedIds = destroyedShips.map(s => s.id);
            if (this.engine.selectedShipId && destroyedIds.includes(this.engine.selectedShipId)) {
                this.engine.selectedShipId = null;
                this.engine._renderSelectedUI(); // Immediately hide the panel
            }
            this.engine.broadcast({ type: 'GAME_SHIPS_DESTROYED', shipIds: destroyedIds });
        }
    }

    _processCitadelCombat(planet, shipsInSystem, dt) {
        const planetOwner = this.engine.state.players.find(p => p.id === planet.owner);
        if (!planetOwner) return;

        // Find valid enemies in the system
        const enemies = shipsInSystem.filter(s => {
            if (s.owner === planet.owner) return false;
            const shipOwner = this.engine.state.players.find(p => p.id === s.owner);
            return shipOwner && shipOwner.team !== planetOwner.team && s.hull > 0;
        });

        if (enemies.length === 0) return;

        // Level 2: Combat Control (Automated Fighter Defense)
        if (planet.citadelLevel >= 2) {
            const fighterDPS = 15; 
            const damage = fighterDPS * (dt / 1000);
            // Attack a random enemy
            const target = enemies[Math.floor(Math.random() * enemies.length)];
            this._applyDamage(target, damage);
        }

        // Level 3: Quasar Cannon
        if (planet.citadelLevel >= 3) {
            if (!planet.quasarCooldown) planet.quasarCooldown = 0;
            planet.quasarCooldown -= dt;

            if (planet.quasarCooldown <= 0) {
                // Target the strongest enemy
                const target = enemies.reduce((prev, curr) => 
                    (prev.hull + prev.shield > curr.hull + curr.shield) ? prev : curr
                );
                const damage = 150; // Heavy damage
                
                this._applyDamage(target, damage);
                planet.quasarCooldown = 5000; // 5 seconds cooldown

                // Visuals
                planet.quasarTargetId = target.id;
                planet.quasarTargetPos = { x: target.x, y: target.y }; // Store position in case target is destroyed
                planet.quasarFireTime = this.engine.state.gameTime;
            }
        }
    }

    _handleRetreatLogic(ships, currentSystemId) {
        // Group by team to calculate stats (HP and DPS) for outcome prediction
        const teamStats = {};
        ships.forEach(s => {
            if (s.hull <= 0) return;
            if (!teamStats[s.team]) teamStats[s.team] = { hp: 0, dps: 0 };
            teamStats[s.team].hp += (s.hull + s.shield);
            teamStats[s.team].dps += (s.damage || 0);
        });

        const teams = Object.keys(teamStats);
        if (teams.length < 2) return;

        teams.forEach(team => {
            let enemyHP = 0;
            let enemyDPS = 0;
            teams.forEach(t => {
                if (t !== team) {
                    enemyHP += teamStats[t].hp;
                    enemyDPS += teamStats[t].dps;
                }
            });

            if (enemyDPS > 0) {
                const myStats = teamStats[team];
                // Calculate Time To Live (TTL) for both sides to predict outcome
                const myTTL = myStats.hp / enemyDPS;
                const enemyTTL = myStats.dps > 0 ? enemyHP / myStats.dps : Infinity;

                // Retreat if the battle is futile (we die significantly faster than the enemy)
                // Threshold 0.5 means we retreat if we are projected to deal less than 50% of enemy HP before dying
                if (myTTL < enemyTTL * 0.5) {
                    const potentialRetreaters = ships.filter(s => 
                        s.team === team && !s.targetId && !s.isStation && s.hull > 0
                    );

                    if (potentialRetreaters.length > 0) {
                        // Group by owner to find appropriate retreat targets
                        const shipsByOwner = {};
                        potentialRetreaters.forEach(s => {
                            if (!shipsByOwner[s.owner]) shipsByOwner[s.owner] = [];
                            shipsByOwner[s.owner].push(s);
                        });

                        Object.keys(shipsByOwner).forEach(ownerId => {
                            const player = this.engine.state.players.find(p => p.id === ownerId);
                            if (player && player.isAI) {
                                const retreatSystem = this._findRetreatTarget(currentSystemId, ownerId);
                                if (retreatSystem) {
                                    shipsByOwner[ownerId].forEach(ship => {
                                        this.engine.moveShip(ship.id, retreatSystem.id);
                                    });
                                }
                            }
                        });
                    }
                }
            }
        });
    }

    _findRetreatTarget(currentSystemId, playerId) {
        const systems = this.engine.state.systems;
        const currentSystem = systems.find(s => s.id === currentSystemId);
        if (!currentSystem) return null;

        let bestSystem = null;
        let minDistSq = Infinity;

        for (const sys of systems) {
            if (sys.id === currentSystemId) continue;
            if (sys.owner === playerId) {
                const dx = sys.x - currentSystem.x;
                const dy = sys.y - currentSystem.y;
                const distSq = dx*dx + dy*dy;
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    bestSystem = sys;
                }
            }
        }
        return bestSystem;
    }

    runCaptureLogic(dt) {
        const CAPTURE_POINTS_PER_SECOND = 10;
        const DECAY_POINTS_PER_SECOND = 5;

        // Cache player teams for this frame to avoid O(N) lookups inside the loop
        const playerTeams = new Map();
        this.engine.state.players.forEach(p => playerTeams.set(p.id, p.team));

        // Optimization: Bucket ships by system to avoid O(N*M) lookups
        const shipsBySystem = new Map();
        this.engine.state.ships.forEach(s => {
            if (s.currentSystemId) {
                if (!shipsBySystem.has(s.currentSystemId)) shipsBySystem.set(s.currentSystemId, []);
                shipsBySystem.get(s.currentSystemId).push(s);
            }
        });

        this.engine.state.systems.forEach(system => {
            const effectiveRadius = this.engine.spatialService.getSystemEffectiveRadius(system);
            const effectiveRadiusSq = effectiveRadius * effectiveRadius;
            const systemShips = shipsBySystem.get(system.id) || [];

            const orbitingTransports = systemShips.filter(ship => {
                if (ship.type !== 'TroopTransport') return false;
                if (ship.isBuilding) return false;
                const dx = system.x - ship.x;
                const dy = system.y - ship.y;
                return (dx*dx + dy*dy) <= effectiveRadiusSq;
            });

            const ownersPresent = [...new Set(orbitingTransports.map(s => s.owner))];
            let activeTarget = null;

            if (ownersPresent.length === 1) {
                const capturingOwnerId = ownersPresent[0];
                const capturingPlayer = this.engine.state.players.find(p => p.id === capturingOwnerId);

                // Check if there are ANY enemy ships in orbit (not just transports).
                // You cannot capture a planet if the orbit is contested.
                const enemiesInOrbit = systemShips.some(s => {
                    // Check if within effective radius
                    const dx = system.x - s.x;
                    const dy = system.y - s.y;
                    if ((dx*dx + dy*dy) > effectiveRadiusSq) return false;

                    const shipOwner = this.engine.state.players.find(p => p.id === s.owner);
                    // It's an enemy if they are on a different team
                    return shipOwner && shipOwner.team !== capturingPlayer.team;
                });

                if (enemiesInOrbit) {
                    // Treat as contested: Decay progress for all planets being captured
                    system.planets.forEach(planet => {
                        if (planet.captureProgress > 0 && planet.captureProgress < 100) {
                            // Logic handled in the else block below for decay
                        }
                    });
                    // Fall through to decay logic at end of loop
                } else {

                // Prioritize targets:
                // 1. Enemy Planets (Neutralize)
                // 2. Neutral Planets (Capture)
                // 3. Own Planets (Reinforce/Heal)
                activeTarget = system.planets.find(p => p.owner && p.owner !== capturingOwnerId && playerTeams.get(p.owner) !== capturingPlayer.team);
                
                if (!activeTarget) {
                    activeTarget = system.planets.find(p => !p.owner);
                }
                
                if (!activeTarget) {
                    activeTarget = system.planets.find(p => p.owner === capturingOwnerId && p.captureProgress < 100);
                }
                
                if (activeTarget) {
                    const isEnemy = activeTarget.owner && activeTarget.owner !== capturingOwnerId;
                    const isNeutral = !activeTarget.owner;

                    // If switching teams (e.g. taking over a neutral capture), reset progress if it was neutral.
                    // If it was enemy owned, we start from their current progress (likely 100) and work down.
                    if (activeTarget.capturingTeam !== capturingOwnerId) {
                        if (isNeutral) activeTarget.captureProgress = 0;
                    }
                    activeTarget.capturingTeam = capturingOwnerId;
                    
                    const captureAmount = (CAPTURE_POINTS_PER_SECOND / 1000) * dt * orbitingTransports.length;

                    if (isEnemy) {
                        // Level 5: Planetary Shields prevent capture until shields are down
                        if (activeTarget.citadelLevel >= 5 && activeTarget.shield > 0) {
                            // Shields active, capture blocked
                            return;
                        }

                        // Neutralize: Reduce progress
                        activeTarget.captureProgress -= captureAmount;
                        if (activeTarget.captureProgress <= 0) {
                            // Planet becomes Neutral
                            activeTarget.owner = null;
                            activeTarget.captureProgress = 0;
                            activeTarget.capturingTeam = null;
                            
                            // Check if system ownership changes (lost majority)
                            this._checkSystemOwnership(system);

                            this.engine.broadcast({ type: 'GAME_PLANET_UPDATE', planetId: activeTarget.id, owner: null, captureProgress: 0, capturingTeam: null, systemOwner: system.owner, systemId: system.id });
                        } else {
                            this.engine.broadcast({ type: 'GAME_PLANET_UPDATE', planetId: activeTarget.id, captureProgress: activeTarget.captureProgress, capturingTeam: activeTarget.capturingTeam });
                        }
                    } else {
                        // Capture (Neutral) or Reinforce (Owned): Increase progress
                        activeTarget.captureProgress += captureAmount;

                        if (activeTarget.captureProgress >= 100) {
                            activeTarget.captureProgress = 100;
                            activeTarget.capturingTeam = null;

                            if (isNeutral) {
                                activeTarget.owner = capturingOwnerId;
                                this._checkSystemOwnership(system);
                            }
                            this.engine.broadcast({ type: 'GAME_PLANET_UPDATE', planetId: activeTarget.id, owner: activeTarget.owner, captureProgress: 100, capturingTeam: null, systemOwner: system.owner, systemId: system.id });
                        } else {
                            this.engine.broadcast({ type: 'GAME_PLANET_UPDATE', planetId: activeTarget.id, captureProgress: activeTarget.captureProgress, capturingTeam: activeTarget.capturingTeam });
                        }
                    }
                }
                }
            }

            // Apply Decay/Heal to non-targeted planets
            system.planets.forEach(planet => {
                if (planet === activeTarget) return;

                let changed = false;
                if (planet.owner) {
                    // Owned planets heal back to 100% if not under attack
                    if (planet.captureProgress < 100) {
                        planet.captureProgress += (DECAY_POINTS_PER_SECOND / 1000) * dt;
                        if (planet.captureProgress > 100) planet.captureProgress = 100;
                        planet.capturingTeam = null;
                        changed = true;
                    }
                } else {
                    // Neutral planets decay back to 0%
                    if (planet.captureProgress > 0) {
                        planet.captureProgress -= (DECAY_POINTS_PER_SECOND / 1000) * dt;
                        if (planet.captureProgress <= 0) {
                            planet.captureProgress = 0;
                            planet.capturingTeam = null;
                        }
                        changed = true;
                    }
                }

                if (changed) {
                    this.engine.broadcast({ type: 'GAME_PLANET_UPDATE', planetId: planet.id, captureProgress: planet.captureProgress, capturingTeam: planet.capturingTeam });
                }
            });
        });
    }

    _checkSystemOwnership(system) {
        // Recalculate system ownership based on planet control
        const planetOwners = system.planets.map(p => p.owner).filter(id => id);
        const ownerCounts = planetOwners.reduce((acc, id) => { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
        
        // Find the player with the most planets
        let topOwner = null;
        let maxCount = 0;
        for (const [ownerId, count] of Object.entries(ownerCounts)) {
            if (count > maxCount || (count === maxCount && ownerId === system.owner)) {
                maxCount = count;
                topOwner = ownerId;
            }
        }

        // If no planets are owned, system becomes neutral
        if (planetOwners.length === 0) {
            topOwner = null;
        }

        if (topOwner !== system.owner) {
            const previousOwner = system.owner;
            
            // Save naming history for the previous owner
            if (previousOwner) {
                if (!system.namingHistory) system.namingHistory = {};
                system.namingHistory[previousOwner] = system.name;
            }

            system.owner = topOwner;

            // Clear build queue if ownership changes to prevent ghost builds
            if (system.buildQueue && system.buildQueue.length > 0) {
                // Refund resources to the original owners of the queued items
                system.buildQueue.forEach(item => {
                    const itemOwner = this.engine.state.players.find(p => p.id === item.ownerId);
                    const cost = SHIP_DATA[item.shipType]?.cost;
                    if (itemOwner && cost && item.startTime !== undefined) {
                        itemOwner.resources.IO += (cost.credits || 0);
                        itemOwner.resources.scrap += (cost.scrap || 0);
                        itemOwner.resources.energy += (cost.energy || 0);
                    }
                });
                system.buildQueue = [];
                this.engine.broadcast({ type: 'GAME_BUILD_QUEUE_UPDATE', locationId: system.id, queue: [] });
            }

            if (topOwner) {
                const ownerPlayer = this.engine.state.players.find(p => p.id === topOwner);
                if (ownerPlayer) {
                    if (ownerPlayer.isAI) {
                        let newName = null;
                        // Try to restore name from history
                        if (system.namingHistory && system.namingHistory[topOwner]) {
                            newName = system.namingHistory[topOwner];
                        } else {
                            // Generate new name
                            newName = this.engine.galaxyService.generateSystemName(ownerPlayer.team);
                        }

                        if (newName && newName !== system.name) {
                            system.name = newName;
                            this.engine.broadcast({ type: 'GAME_SYSTEM_RENAMED', systemId: system.id, newName: system.name });
                        }
                    } else {
                        // Human Player
                        if (system.namingHistory && system.namingHistory[topOwner]) {
                            // Restore name from history automatically
                            const restoredName = system.namingHistory[topOwner];
                            if (restoredName !== system.name) {
                                system.name = restoredName;
                                this.engine.broadcast({ type: 'GAME_SYSTEM_RENAMED', systemId: system.id, newName: system.name });
                            }
                        } else if (!previousOwner) {
                            // Only prompt for rename if the system was previously unowned and no history exists
                            this.engine.broadcast({ type: 'GAME_PROMPT_RENAME', systemId: system.id, playerId: topOwner });
                        }
                    }
                }
            }
        }
    }

    runShieldRegen(dt) {
        const SHIELD_REGEN_RATE = 5; // points per second
        this.engine.state.ships.forEach(ship => {
            if (ship.shield < ship.maxShield) {
                // Simple check: is the ship near enemies? If so, no regen.
                const isContested = this.engine.state.ships.some(otherShip => {
                    if (otherShip.team === ship.team) return false;
                    const dx = ship.x - otherShip.x;
                    const dy = ship.y - otherShip.y;
                    return (dx * dx + dy * dy) < (300 * 300); // 300px combat radius
                });
                if (!isContested) ship.shield = Math.min(ship.maxShield, ship.shield + SHIELD_REGEN_RATE * (dt / 1000));
            }
        });

        // Planetary Shield Regen (Citadel Lvl 5)
        this.engine.state.systems.forEach(system => {
            system.planets.forEach(planet => {
                if (planet.citadelLevel >= 5 && planet.maxShield > 0) {
                    if (planet.shield < planet.maxShield) {
                        planet.shield = Math.min(planet.maxShield, planet.shield + SHIELD_REGEN_RATE * (dt / 1000));
                    }
                }
            });
        });
    }

    _applyDamage(target, damage) {
        if (target.shield > 0) {
            target.shield = Math.max(0, target.shield - damage);
        } else {
            target.hull = Math.max(0, target.hull - damage);
        }
    }

    requestSelfDestruct(shipId) {
        const request = {
            type: 'GAME_REQUEST_SELF_DESTRUCT',
            senderId: this.engine.getIdentity().guid,
            shipId: shipId
        };
        this.engine.broadcast(request);
    }

    handleSelfDestructRequest({ senderId, shipId }) {
        if (!this.engine.isHost) return;
        const ship = this.engine.state.ships.find(s => s.id === shipId);
        // Only the owner can self-destruct their ship
        if (ship && ship.owner === senderId) {
            ship.hull = 0; // Mark for destruction
            // The runCombat loop will handle the cleanup and broadcast
        }
    }
}
