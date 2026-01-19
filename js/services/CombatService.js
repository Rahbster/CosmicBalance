import { PLANET_NAMES, SHIP_DATA } from './GalaxyService.js';

export class CombatService {
    constructor(engine) {
        this.engine = engine;
    }

    runCombat(dt) {
        const shipsByPlanet = new Map();
        const systemMap = this.engine.spatialService.getSystemMap();

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
            }
        }

        // Process ship destruction
        const destroyedShips = this.engine.state.ships.filter(s => s.hull <= 0);
        if (destroyedShips.length > 0) {
            destroyedShips.forEach(ship => {
                // Create debris field
                const debris = {
                    id: `debris-${crypto.randomUUID()}`,
                    x: ship.x,
                    y: ship.y,
                    resources: { scrap: 50 }
                };
                this.engine.state.debrisFields.push(debris);
                this.engine.broadcast({ type: 'GAME_DEBRIS_CREATED', debris });

                // Find the system name for the toast message
                const system = this.engine.spatialService.getClosestSystem(ship);
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

    runCaptureLogic(dt) {
        const CAPTURE_POINTS_PER_SECOND = 10;
        const DECAY_POINTS_PER_SECOND = 5;

        this.engine.state.systems.forEach(system => {
            const effectiveRadius = this.engine.spatialService.getSystemEffectiveRadius(system);
            const orbitingTransports = this.engine.state.ships.filter(ship => {
                if (ship.type !== 'TroopTransport') return false;
                if (ship.currentSystemId !== system.id) return false; // Must be logically in the system
                const dx = system.x - ship.x;
                const dy = system.y - ship.y;
                return (dx*dx + dy*dy) <= (effectiveRadius * effectiveRadius);
            });

            const ownersPresent = [...new Set(orbitingTransports.map(s => s.owner))];
            let activeTarget = null;

            if (ownersPresent.length === 1) {
                const capturingOwnerId = ownersPresent[0];
                const capturingPlayer = this.engine.state.players.find(p => p.id === capturingOwnerId);

                // Check if there are ANY enemy ships in orbit (not just transports).
                // You cannot capture a planet if the orbit is contested.
                const enemiesInOrbit = this.engine.state.ships.some(s => {
                    if (s.currentSystemId !== system.id) return false;
                    // Check if within effective radius
                    const dx = system.x - s.x;
                    const dy = system.y - s.y;
                    if ((dx*dx + dy*dy) > (effectiveRadius * effectiveRadius)) return false;

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
                activeTarget = system.planets.find(p => p.owner && p.owner !== capturingOwnerId && this.engine.state.players.find(pl => pl.id === p.owner)?.team !== capturingPlayer.team);
                
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
