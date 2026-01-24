import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS } from '../../cb_constants.js';
import { AI_PROFILES } from './AIProfiles.js';

export class AIFleetManager {
    constructor(engine) {
        this.engine = engine;
    }

    update(aiPlayer) {
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0 && !s.isBuilding);
        
        // 1. Scouts
        const idleScouts = myShips.filter(s => s.type === 'Scout' && s.moveState === SHIP_STATE.IDLE && !s.scoutMission);
        idleScouts.forEach(scout => this._commandScout(aiPlayer, scout));

        // 2. Salvagers
        const idleSalvagers = myShips.filter(s => s.type === 'Salvager' && s.moveState === SHIP_STATE.IDLE && !s.salvageMission);
        idleSalvagers.forEach(salvager => this._commandSalvager(aiPlayer, salvager));

        // 2.5 Consolidate Fleets (Merge small idle fleets in same system)
        this._consolidateFleets(aiPlayer);

        // 3. Fleet Formation
        this._formFleets(aiPlayer, myShips);

        // 4. Fleet Maintenance (Repair/Upgrade)
        this._manageFleetMaintenance(aiPlayer);

        // 5. Fleet Movement / Attacks
        this._commandFleets(aiPlayer);

        // 6. Tactical Abilities (Mines, Cloak)
        this._manageTacticalAbilities(aiPlayer);
    }

    _commandSalvager(aiPlayer, salvager) {
        const currentSystem = this.engine.spatialService.getCurrentSystem(salvager);
        if (!currentSystem) {
            this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.WARNING, `Salvager ${salvager.id} is idle in deep space at ${salvager.x},${salvager.y}`);
            const closestSystem = this.engine.spatialService.getClosestSystem(salvager);
            if (closestSystem) {
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Recovering lost salvager ${salvager.id} to nearest system ${closestSystem.id}`);
                this.engine.moveShip(salvager.id, closestSystem.id);
            }
            return;
        }

        const allDebrisFields = this.engine.state.debrisFields;
        if (!allDebrisFields || allDebrisFields.length === 0) return;

        const scrapNeedFactor = Math.max(0.1, 1 - (aiPlayer.resources.scrap / 5000));

        const valuedDebris = allDebrisFields
            .map(debris => {
                const debrisSystem = this.engine.spatialService.getClosestSystem(debris);
                if (!debrisSystem) return null;

                const visibility = debrisSystem.visibility[aiPlayer.id];
                if (visibility !== 'explored' && visibility !== 'scouted') return null;

                const enemies = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, debrisSystem));
                if (enemies.some(s => s.damage > 0)) return null;

                let travelTime = Infinity;
                if (debrisSystem.id === currentSystem.id) {
                    const speed = (salvager.sublight || 1) * 5 * (this.engine.state.settings?.shipSpeedRate || 1.0);
                    const dist = Math.hypot(debris.x - salvager.x, debris.y - salvager.y);
                    travelTime = dist / (speed > 0 ? speed : 1);
                } else {
                    const path = this.engine.movementService.findPath(currentSystem.id, debrisSystem.id);
                    if (path) {
                        travelTime = 0;
                        let lastSystem = currentSystem;
                        for (const systemId of path) {
                            const nextSystem = this.engine.state.systems.find(s => s.id === systemId);
                            if (nextSystem) {
                                travelTime += this._calculateShipTravelTime(salvager, lastSystem, nextSystem);
                                lastSystem = nextSystem;
                            }
                        }
                    }
                }

                if (travelTime === Infinity) return null;

                // Prioritize high-value debris fields by adding a base time cost (20s)
                // This reduces the bias for extremely close small debris fields.
                const value = (debris.resources.scrap || 0) / (20 + travelTime);
                return { debris, value };
            })
            .filter(item => item !== null);

        if (valuedDebris.length === 0) return;

        valuedDebris.sort((a, b) => b.value - a.value);
        const bestTarget = valuedDebris[0];

        // Adjusted threshold for new value formula
        const valueThreshold = 0.5 / scrapNeedFactor;

        if (bestTarget.value > valueThreshold) {
            this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Salvager ${salvager.id} targeting debris ${bestTarget.debris.id} with value ${bestTarget.value.toFixed(1)} (Threshold: ${valueThreshold.toFixed(1)})`);
            this.engine.movementService.handleSalvageMissionRequest({
                senderId: aiPlayer.id,
                shipId: salvager.id,
                targetDebrisId: bestTarget.debris.id
            });
        }
    }

    _commandScout(aiPlayer, scout) {
        const currentSystem = this.engine.spatialService.getCurrentSystem(scout);

        if (currentSystem) {
            const neighbors = currentSystem.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
            const unexplored = neighbors.filter(n => !n.visibility[aiPlayer.id] || n.visibility[aiPlayer.id] === 'unexplored');
            
            const heat = currentSystem.heat || 0;
            const enemiesPresent = this.engine.state.ships.some(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, currentSystem));
            
            if (heat > 20 && !enemiesPresent) {
                const chaseTargets = unexplored.length > 0 ? unexplored : neighbors;
                const target = chaseTargets[Math.floor(Math.random() * chaseTargets.length)];
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Scout ${scout.id} following heat trail (${heat.toFixed(0)}) from ${currentSystem.name} to ${target.name}`);
                this.engine.movementService.handleScoutMissionRequest({ senderId: aiPlayer.id, shipId: scout.id, targetSystemId: target.id });
                return;
            }

            if (unexplored.length > 0) {
                const target = unexplored[Math.floor(Math.random() * unexplored.length)];
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Scout ${scout.id} exploring ${target.id}`);
                this.engine.movementService.handleScoutMissionRequest({ senderId: aiPlayer.id, shipId: scout.id, targetSystemId: target.id });
            } else {
                let validNeighbors = neighbors;
                if (scout.lastSystemId && neighbors.length > 1) {
                    validNeighbors = neighbors.filter(n => n.id !== scout.lastSystemId);
                }

                const safeNeighbors = validNeighbors.filter(n => this._isSystemSafe(n, aiPlayer.id));
                if (safeNeighbors.length > 0) {
                    validNeighbors = safeNeighbors;
                }

                const randomNeighbor = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
                if (randomNeighbor) {
                     this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Scout ${scout.id} moving to neighbor ${randomNeighbor.id}`);
                     this.engine.moveShip(scout.id, randomNeighbor.id);
                }
            }
        } else {
            this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.WARNING, `Scout ${scout.id} is idle in deep space at ${scout.x},${scout.y}`);
            const closestSystem = this.engine.spatialService.getClosestSystem(scout);
            if (closestSystem) {
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Recovering lost scout ${scout.id} to nearest system ${closestSystem.id}`);
                this.engine.moveShip(scout.id, closestSystem.id);
            }
        }
    }

    _consolidateFleets(aiPlayer) {
        if (!aiPlayer.fleets || aiPlayer.fleets.length < 2) return;

        const fleetsBySystem = {};
        aiPlayer.fleets.forEach(f => {
            if (f.locationId) {
                if (!fleetsBySystem[f.locationId]) fleetsBySystem[f.locationId] = [];
                fleetsBySystem[f.locationId].push(f);
            }
        });

        Object.entries(fleetsBySystem).forEach(([sysId, fleets]) => {
            if (fleets.length < 2) return;

            const idleFleets = fleets.filter(f => {
                const ships = this.engine.state.ships.filter(s => f.shipIds.includes(s.id));
                return ships.length > 0 && ships.every(s => s.moveState === SHIP_STATE.IDLE);
            });

            if (idleFleets.length < 2) return;

            idleFleets.sort((a, b) => b.shipIds.length - a.shipIds.length);

            const targetFleet = idleFleets[0];
            const fleetsToMerge = idleFleets.slice(1);

            fleetsToMerge.forEach(sourceFleet => {
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `AI ${aiPlayer.factionName} consolidating ${sourceFleet.name} into ${targetFleet.name}`);
                this.engine.fleetService.handleUpdateFleetShipsRequest({ senderId: aiPlayer.id, fleetId: targetFleet.id, shipIdsToAdd: sourceFleet.shipIds, shipIdsToRemove: [] });
                this.engine.fleetService.handleDisbandFleetRequest({ senderId: aiPlayer.id, fleetId: sourceFleet.id });
            });
        });
    }

    _formFleets(aiPlayer, myShips) {
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;
        
        if (aiPlayer.fleets) {
            aiPlayer.fleets.forEach(fleet => {
                const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id));
                if (fleetShips.some(s => s.moveState !== SHIP_STATE.IDLE)) return;

                const fleetSystemId = fleet.locationId;
                if (!fleetSystemId) return;
                
                const fleetSystem = this.engine.state.systems.find(s => s.id === fleetSystemId);
                if (!fleetSystem) return;

                const reinforcements = myShips.filter(s => 
                    !s.fleetId && 
                    ['Fighter', 'Frigate', 'Destroyer', 'Cruiser', 'TroopTransport'].includes(s.type) && 
                    s.moveState === SHIP_STATE.IDLE &&
                    this.engine.spatialService.isShipInSystem(s, fleetSystem)
                );

                if (reinforcements.length > 0) {
                    const newShipIds = reinforcements.map(s => s.id);
                    fleet.shipIds.push(...newShipIds);
                    newShipIds.forEach(id => {
                        const ship = this.engine.state.ships.find(s => s.id === id);
                        if (ship) ship.fleetId = fleet.id;
                    });
                    this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.DEBUG, `AI ${aiPlayer.factionName} reinforced Fleet ${fleet.id} with ${newShipIds.length} ships.`);
                    
                    this.engine.broadcast({ 
                        type: 'GAME_FLEET_UPDATE', 
                        playerId: aiPlayer.id, 
                        fleets: aiPlayer.fleets, 
                        updatedShips: newShipIds.map(id => ({ id, fleetId: fleet.id })) 
                    });
                }
            });
        }

        const unassignedCombatShips = myShips.filter(s => !s.fleetId && ['Fighter', 'Frigate', 'Destroyer', 'Cruiser', 'TroopTransport'].includes(s.type) && s.moveState === SHIP_STATE.IDLE);
        
        const shipsBySystem = {};
        unassignedCombatShips.forEach(ship => {
            const system = this.engine.spatialService.getCurrentSystem(ship);
            if (system) {
                if (!shipsBySystem[system.id]) shipsBySystem[system.id] = [];
                shipsBySystem[system.id].push(ship);
            }
        });

        const dynamicFleetSize = Math.max(profile.fleetSize, Math.min(Math.floor(myShips.length / 4), 40));

        const mySystems = this.engine.state.systems.filter(s => s.owner === aiPlayer.id);
        const knownUnownedNeighbors = mySystems.flatMap(sys => 
            sys.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId))
        ).filter(n => 
            n && !n.owner && 
            (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted') &&
            this._isSystemSafe(n, aiPlayer.id)
        );
        const hasExpansionTarget = knownUnownedNeighbors.length > 0;

        for (const [systemId, ships] of Object.entries(shipsBySystem)) {
            let requiredSize = dynamicFleetSize;
            
            const hasTransport = ships.some(s => s.type === 'TroopTransport');
            if (hasTransport && hasExpansionTarget) {
                requiredSize = 1;
            }

            const system = this.engine.state.systems.find(s => s.id === systemId);
            if (system && !this._isSystemSafe(system, aiPlayer.id)) {
                requiredSize = 1;
            }

            if (system && requiredSize > 1) {
                const neighbors = system.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
                const myStrength = this._calculateStrength(ships);

                if (hasTransport) {
                    const canInvade = neighbors.some(n => {
                        if (!n || !n.owner || n.owner === aiPlayer.id) return false;
                        const visibility = n.visibility[aiPlayer.id];
                        if (visibility !== 'explored' && visibility !== 'scouted') return false;
                        
                        const enemyShips = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, n));
                        const enemyStrength = this._calculateStrength(enemyShips);
                        return myStrength > enemyStrength * 1.5;
                    });
                    if (canInvade) requiredSize = 1;
                }

                if (requiredSize > 1) {
                    const canHunt = neighbors.some(n => {
                        const enemyShips = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, n));
                        if (enemyShips.length === 0) return false;
                        const enemyStrength = this._calculateStrength(enemyShips);
                        return myStrength > enemyStrength * 1.2;
                    });
                    if (canHunt) requiredSize = 1;
                }
            }

            if (ships.length >= requiredSize) {
                const shipIds = ships.map(s => s.id);
                
                const system = this.engine.state.systems.find(s => s.id === systemId);
                let fleetName = system ? `${system.name} Fleet` : `${aiPlayer.factionName} Fleet`;
                
                const existingNames = new Set(aiPlayer.fleets.map(f => f.name));
                if (existingNames.has(fleetName)) {
                    let i = 2;
                    while (existingNames.has(`${fleetName} ${i}`)) i++;
                    fleetName = `${fleetName} ${i}`;
                }

                this.engine.fleetService.handleCreateFleetRequest({
                    senderId: aiPlayer.id,
                    name: fleetName,
                    shipIds: shipIds
                });
            }
        }
    }

    _manageFleetMaintenance(aiPlayer) {
        if (!aiPlayer.fleets) return;
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;

        aiPlayer.fleets.forEach(fleet => {
            const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id) && s.fleetId === fleet.id);
            if (fleetShips.length === 0) return;

            const currentSystem = this.engine.state.systems.find(s => s.id === fleet.locationId);
            if (currentSystem) {
                const enemiesPresent = this.engine.state.ships.some(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, currentSystem));
                if (enemiesPresent) {
                    fleetShips.forEach(s => {
                        if (s.isRepairing) {
                            this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `AI ${aiPlayer.factionName} cancelling repair on ${s.id} due to attack!`);
                            delete s.isRepairing; delete s.repairTimer; delete s.totalRepairTime;
                        }
                    });
                    return;
                }
            }

            if (fleetShips.some(s => s.isRepairing)) return;

            const totalHull = fleetShips.reduce((sum, s) => sum + s.hull, 0);
            const totalMaxHull = fleetShips.reduce((sum, s) => sum + s.maxHull, 0);
            const healthPct = totalMaxHull > 0 ? totalHull / totalMaxHull : 0;
            
            const criticalThreshold = Math.max(0.1, profile.retreatThreshold - 0.2);
            const hasCriticallyDamagedShip = fleetShips.some(s => s.hull < s.maxHull * criticalThreshold);

            const needsUpgrade = fleetShips.some(s => (s.vintageTechs || []).length < aiPlayer.researchedTechs.length);

            const shouldRefit = (healthPct < profile.retreatThreshold || hasCriticallyDamagedShip) || (needsUpgrade && Math.random() < 0.05);

            if (shouldRefit) {
                const stationSystems = this.engine.state.systems.filter(s => 
                    s.owner === aiPlayer.id && 
                    this.engine.state.ships.some(ship => ship.isStation && this.engine.spatialService.isShipInSystem(ship, s))
                );

                if (stationSystems.length === 0) return;

                const atStation = stationSystems.some(s => s.id === fleet.locationId);

                if (atStation) {
                    let requestSent = false;
                    
                    fleetShips.sort((a, b) => {
                        const strategy = profile.repairStrategy || 'VALUE';
                        if (strategy === 'VALUE') {
                            const valA = this._getShipValue(a.type);
                            const valB = this._getShipValue(b.type);
                            if (valA !== valB) return valB - valA;
                        } else if (strategy === 'CRITICAL') {
                            const pctA = a.hull / a.maxHull;
                            const pctB = b.hull / b.maxHull;
                            if (pctA !== pctB) return pctA - pctB;
                        } else if (strategy === 'SPEED') {
                            const pctA = a.hull / a.maxHull;
                            const pctB = b.hull / b.maxHull;
                            if (pctA !== pctB) return pctB - pctA;
                        }
                        return 0;
                    });

                    fleetShips.forEach(s => {
                        const needsRep = s.hull < s.maxHull;
                        const needsUp = (s.vintageTechs || []).length < aiPlayer.researchedTechs.length;
                        if (needsRep || needsUp) {
                             this.engine.economyService.handleRepairShipRequest({ senderId: aiPlayer.id, shipId: s.id });
                             requestSent = true;
                        }
                    });
                    if (requestSent) aiPlayer.aiGoal = 'Refitting Fleet';
                } else {
                    let nearest = null;
                    let minDist = Infinity;
                    
                    if (currentSystem) {
                        stationSystems.forEach(s => {
                            const dx = s.x - currentSystem.x;
                            const dy = s.y - currentSystem.y;
                            const d = dx*dx + dy*dy;
                            if (d < minDist) { minDist = d; nearest = s; }
                        });
                    } else {
                        nearest = stationSystems[0];
                    }

                    if (nearest) {
                        const isMoving = fleetShips.some(s => s.moveState === SHIP_STATE.MOVING);
                        if (!isMoving) {
                            this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `AI ${aiPlayer.factionName} retreating fleet ${fleet.name} to ${nearest.name}`);
                            this.engine.fleetService.handleMoveFleetRequest({
                                senderId: aiPlayer.id,
                                fleetId: fleet.id,
                                targetSystemId: nearest.id
                            });
                            aiPlayer.aiGoal = 'Retreating for Repairs';
                        }
                    }
                }
            }
        });
    }

    _commandFleets(aiPlayer) {
        if (!aiPlayer.fleets) return;
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;
        
        let aggressionMod = 1.0;
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        const mySystems = this.engine.state.systems.filter(s => s.owner === aiPlayer.id);
        const shipCap = (profile.name === 'Swarm' ? 120 : 80) + (mySystems.length * 8);
        if (myShips.length > shipCap * 0.85) aggressionMod *= 0.7;
        if (aiPlayer.resources.IO > 25000) aggressionMod *= 0.8;
        const effectiveThreshold = profile.engageThreshold * aggressionMod;
        
        const incomingThreats = {};
        this.engine.state.ships.forEach(s => {
            if (s.owner !== aiPlayer.id && s.targetId && s.hull > 0) {
                if (!incomingThreats[s.targetId]) incomingThreats[s.targetId] = { strength: 0, isMySystem: false };
                incomingThreats[s.targetId].strength += (s.hull + s.shield + s.damage * 10);
            }
        });
        mySystems.forEach(s => {
            if (incomingThreats[s.id]) incomingThreats[s.id].isMySystem = true;
        });

        const currentTargets = new Set();
        aiPlayer.fleets.forEach(f => {
             const fShips = this.engine.state.ships.filter(s => f.shipIds.includes(s.id));
             const movingShip = fShips.find(s => s.targetId && s.moveState === SHIP_STATE.MOVING);
             if (movingShip) currentTargets.add(movingShip.targetId);
        });

        const proposedMoves = [];

        aiPlayer.fleets.forEach(fleet => {
            const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id) && s.fleetId === fleet.id);
            if (fleetShips.length === 0) return;
            
            const currentSystemId = fleet.locationId;
            const currentSystem = this.engine.state.systems.find(s => s.id === currentSystemId);
            const enemiesPresent = currentSystem ? this.engine.state.ships.some(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, currentSystem)) : false;

            if (fleetShips.some(s => s.isRepairing) && !enemiesPresent) return;

            const isIdle = fleetShips.every(s => s.moveState === SHIP_STATE.IDLE);
            if (!isIdle) return;

            if (!currentSystem) {
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.WARNING, `Fleet ${fleet.id} has invalid locationId: `);
                return;
            }

            const hasTransport = fleetShips.some(s => s.type === 'TroopTransport');

            const incomingHere = incomingThreats[currentSystem.id];
            if (incomingHere && incomingHere.strength > 0) {
                return;
            }

            if (currentSystem.owner && currentSystem.owner !== aiPlayer.id) {
                if (enemiesPresent) return;

                const hasUnownedPlanets = currentSystem.planets.some(p => p.owner !== aiPlayer.id);
                if (hasTransport && hasUnownedPlanets) return;
            } else {
                const enemyShips = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, currentSystem));
                const enemyStrength = this._calculateStrength(enemyShips);
                const myStrength = this._calculateStrength(fleetShips);
                
                const isSafe = enemyStrength === 0 || myStrength >= enemyStrength * 0.5;
                
                if (enemyStrength > 0 && isSafe) return;

                const hasUnownedPlanets = currentSystem.planets.some(p => p.owner !== aiPlayer.id);
                if (hasUnownedPlanets && hasTransport && isSafe) return;
            }

            const neighbors = currentSystem.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
            
            let target = null;

            const fleetStrength = this._calculateStrength(fleetShips);

            const enemyNeighbors = neighbors.filter(n => n.owner && n.owner !== aiPlayer.id && (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted'));
            const neutralNeighbors = neighbors.filter(n => !n.owner && (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted'));

            const engageableEnemies = enemyNeighbors.filter(n => {
                const enemyShips = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, n));
                const enemyStrength = this._calculateStrength(enemyShips);
                
                const incoming = incomingThreats[n.id] ? incomingThreats[n.id].strength : 0;
                const totalEnemyStrength = enemyStrength + incoming;

                const coordinationBonus = currentTargets.has(n.id) ? 0.5 : 1.0;
                
                return fleetStrength >= (totalEnemyStrength * coordinationBonus) * effectiveThreshold;
            });

            engageableEnemies.sort((a, b) => {
                const strA = this._calculateStrength(this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, a)));
                const strB = this._calculateStrength(this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, b)));
                
                const valA = this._getSystemStrategicValue(a);
                const valB = this._getSystemStrategicValue(b);

                const distA = Math.hypot(a.x - currentSystem.x, a.y - currentSystem.y);
                const distB = Math.hypot(b.x - currentSystem.x, b.y - currentSystem.y);

                const scoreA = (valA * 20) - strA - (distA * 0.5);
                const scoreB = (valB * 20) - strB - (distB * 0.5);
                
                return scoreB - scoreA;
            });

            const totalSystems = this.engine.state.systems.length;
            const mySystemCount = this.engine.state.systems.filter(s => s.owner === aiPlayer.id).length;
            if (mySystemCount > totalSystems * 0.5 && engageableEnemies.length > 0) {
                engageableEnemies.sort((a, b) => this._getEnemySystemCount(a.owner) - this._getEnemySystemCount(b.owner));
            }

            const prioritizeExpansion = hasTransport && neutralNeighbors.length > 0 && Math.random() < profile.expansionBias;

            if (prioritizeExpansion) {
                target = neutralNeighbors[Math.floor(Math.random() * neutralNeighbors.length)];
            } else if (engageableEnemies.length > 0) {
                const coordinatedTarget = engageableEnemies.find(e => currentTargets.has(e.id));
                target = coordinatedTarget || engageableEnemies[0];
            } else if (hasTransport && neutralNeighbors.length > 0) {
                target = neutralNeighbors[Math.floor(Math.random() * neutralNeighbors.length)];
            } else {
                const currentIsFrontier = neighbors.some(n => n.owner && n.owner !== aiPlayer.id && (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted'));

                if (currentIsFrontier) {
                    if (Math.random() < 0.7) return; 
                }

                if (!currentIsFrontier) {
                    const hop = this._findNearestFrontierHop(currentSystem, aiPlayer);
                    if (hop) target = hop;
                    else {
                        const exploreHop = this._findNearestExplorationHop(currentSystem, aiPlayer);
                        if (exploreHop) target = exploreHop;
                    }
                }

                if (!target) {
                    let validNeighbors = neighbors;
                    const lastSystemId = fleetShips[0] ? fleetShips[0].lastSystemId : null;
                    if (lastSystemId && neighbors.length > 1) {
                        validNeighbors = neighbors.filter(n => n.id !== lastSystemId);
                    }

                    validNeighbors.sort((a, b) => {
                        const aIsFrontier = a.links.some(l => {
                            const s = this.engine.state.systems.find(sys => sys.id === l.targetId);
                            return s && s.owner && s.owner !== aiPlayer.id;
                        }) ? 50 : 0;
                        const bIsFrontier = b.links.some(l => {
                            const s = this.engine.state.systems.find(sys => sys.id === l.targetId);
                            return s && s.owner && s.owner !== aiPlayer.id;
                        }) ? 50 : 0;

                        const threatA = incomingThreats[a.id];
                        const threatB = incomingThreats[b.id];
                        const interceptA = threatA ? (threatA.isMySystem ? 150 : 75) : 0;
                        const interceptB = threatB ? (threatB.isMySystem ? 150 : 75) : 0;

                    const distA = Math.hypot(a.x - currentSystem.x, a.y - currentSystem.y);
                    const distB = Math.hypot(b.x - currentSystem.x, b.y - currentSystem.y);

                    return (this._getSystemStrategicValue(b) + bIsFrontier + interceptB - (distB * 0.2)) - (this._getSystemStrategicValue(a) + aIsFrontier + interceptA - (distA * 0.2));
                    });

                    if (validNeighbors.length > 0) {
                        const topCount = Math.min(3, validNeighbors.length);
                        target = validNeighbors[Math.floor(Math.random() * topCount)];
                    }
                }
            }

            if (target) {
                proposedMoves.push({ fleet, target, currentSystem });
                currentTargets.add(target.id);
            }
        });

        this._executeCoordinatedMoves(aiPlayer, proposedMoves);
    }

    _executeCoordinatedMoves(aiPlayer, proposedMoves) {
        const movesByTarget = {};
        proposedMoves.forEach(move => {
            if (!movesByTarget[move.target.id]) movesByTarget[move.target.id] = [];
            movesByTarget[move.target.id].push(move);
        });

        Object.keys(movesByTarget).forEach(targetId => {
            const moves = movesByTarget[targetId];
            const targetSystem = this.engine.state.systems.find(s => s.id === targetId);
            
            moves.forEach(move => {
                move.travelTime = this._calculateFleetTravelTime(move.fleet, targetSystem);
            });

            let maxEta = 0;
            
            aiPlayer.fleets.forEach(f => {
                const fShips = this.engine.state.ships.filter(s => f.shipIds.includes(s.id));
                const movingShip = fShips.find(s => s.targetId === targetId && s.moveState === SHIP_STATE.MOVING);
                if (movingShip) {
                    const eta = this._calculateShipEta(movingShip, targetSystem);
                    if (eta > maxEta) maxEta = eta;
                }
            });

            moves.forEach(move => {
                if (move.travelTime > maxEta) maxEta = move.travelTime;
            });

            const SYNC_WINDOW = 5;
            
            moves.forEach(move => {
                const waitTime = maxEta - move.travelTime;
                
                if (waitTime <= SYNC_WINDOW) {
                    this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Fleet ${move.fleet.id} moving to ${targetSystem.name} (ETA: ${move.travelTime.toFixed(1)}s). Sync delay: ${waitTime.toFixed(1)}s`);
                    
                    if (targetSystem.owner && targetSystem.owner !== aiPlayer.id) {
                        aiPlayer.aiGoal = `Attacking ${targetSystem.name}`;
                    } else if (!targetSystem.owner && move.fleet.shipIds.some(id => {
                        const s = this.engine.state.ships.find(ship => ship.id === id);
                        return s && s.type === 'TroopTransport';
                    })) {
                        aiPlayer.aiGoal = `Colonizing ${targetSystem.name}`;
                    } else {
                        aiPlayer.aiGoal = `Moving to ${targetSystem.name}`;
                    }

                    this.engine.fleetService.handleMoveFleetRequest({
                        senderId: aiPlayer.id,
                        fleetId: move.fleet.id,
                        targetSystemId: targetSystem.id
                    });
                } else {
                    this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.DEBUG, `Fleet ${move.fleet.id} waiting to sync attack on ${targetSystem.name}. Wait: ${waitTime.toFixed(1)}s`);
                    aiPlayer.aiGoal = `Coordinating Attack on ${targetSystem.name}`;
                }
            });
        });
    }

    _getSystemStrategicValue(system) {
        let value = 0;
        value += system.links.length * 2;
        if (system.planets) {
            system.planets.forEach(p => {
                value += 10;
                if (p.type === 'Industrial') value += 40;
                else if (p.type === 'Terran') value += 25;
                else if (p.type === 'Mining') value += 20;
                else if (p.type === 'Farming') value += 5;
            });
        }
        return value;
    }

    _getShipValue(shipType) {
        switch (shipType) {
            case 'Cruiser': return 100;
            case 'Destroyer': return 60;
            case 'Frigate': return 40;
            case 'TroopTransport': return 30;
            case 'Fighter': return 10;
            case 'Scout': return 5;
            case 'Salvager': return 5;
            case 'SpaceStation': return 500;
            default: return 1;
        }
    }

    _calculateStrength(ships) {
        return ships.reduce((sum, s) => sum + (s.hull + s.shield) + (s.damage * 10), 0);
    }

    _calculateShipTravelTime(ship, startSystem, targetSystem) {
        if (!startSystem || !targetSystem) return Infinity;

        const speedMultiplier = (this.engine.state.settings?.shipSpeedRate || 1.0);
        const speed = (ship.warp || 1) * 75 * speedMultiplier;

        if (speed <= 0) return Infinity;

        const dx = targetSystem.x - startSystem.x;
        const dy = targetSystem.y - startSystem.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        return dist / speed;
    }

    _calculateFleetTravelTime(fleet, targetSystem) {
        const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id));
        if (fleetShips.length === 0) return 0;

        const currentSystem = this.engine.state.systems.find(s => s.id === fleet.locationId);
        if (!currentSystem) return 0;

        const minWarp = Math.min(...fleetShips.map(s => s.warp || 0));
        const speedMultiplier = (this.engine.state.settings?.shipSpeedRate || 1.0);
        const speed = minWarp * 75 * speedMultiplier;

        if (speed <= 0) return Infinity;

        const dx = targetSystem.x - currentSystem.x;
        const dy = targetSystem.y - currentSystem.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        return dist / speed;
    }

    _calculateShipEta(ship, targetSystem) {
        const speedMultiplier = (this.engine.state.settings?.shipSpeedRate || 1.0);
        const speed = (ship.warp || 0) * 75 * speedMultiplier;
        
        if (speed <= 0) return Infinity;

        const dx = targetSystem.x - ship.x;
        const dy = targetSystem.y - ship.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        return dist / speed;
    }

    _findNearestFrontierHop(startSystem, aiPlayer) {
        const queue = [];
        const visited = new Set();
        const systemMap = this.engine.spatialService.getSystemMap();
        
        const neighbors = startSystem.links
            .map(l => systemMap.get(l.targetId))
            .filter(s => s);
            
        neighbors.sort((a, b) => Math.hypot(a.x - startSystem.x, a.y - startSystem.y) - Math.hypot(b.x - startSystem.x, b.y - startSystem.y));

        neighbors.forEach(neighbor => {
            queue.push({ system: neighbor, firstHop: neighbor });
            visited.add(neighbor.id);
        });
        visited.add(startSystem.id);

        while (queue.length > 0) {
            const { system, firstHop } = queue.shift();
            const visibility = system.visibility[aiPlayer.id];
            const isVisible = visibility === 'explored' || visibility === 'scouted';

            if (system.owner && system.owner !== aiPlayer.id && isVisible) return firstHop;

            if (isVisible) {
                const neighbors = system.links.map(l => systemMap.get(l.targetId));
                const hasEnemyNeighbor = neighbors.some(n => {
                    const nVis = n.visibility[aiPlayer.id];
                    return n.owner && n.owner !== aiPlayer.id && (nVis === 'explored' || nVis === 'scouted');
                });
                if (hasEnemyNeighbor) return firstHop;
            }

            const neighbors = system.links.map(l => systemMap.get(l.targetId));
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor.id)) {
                    visited.add(neighbor.id);
                    queue.push({ system: neighbor, firstHop: firstHop });
                }
            }
        }
        return null;
    }

    _findNearestExplorationHop(startSystem, aiPlayer) {
        const queue = [];
        const visited = new Set();
        const systemMap = this.engine.spatialService.getSystemMap();
        
        const neighbors = startSystem.links
            .map(l => systemMap.get(l.targetId))
            .filter(s => s);
            
        neighbors.sort((a, b) => Math.hypot(a.x - startSystem.x, a.y - startSystem.y) - Math.hypot(b.x - startSystem.x, b.y - startSystem.y));

        neighbors.forEach(neighbor => {
            queue.push({ system: neighbor, firstHop: neighbor });
            visited.add(neighbor.id);
        });
        visited.add(startSystem.id);

        while (queue.length > 0) {
            const { system, firstHop } = queue.shift();
            
            const hasUnexploredNeighbor = system.links.some(l => {
                const n = systemMap.get(l.targetId);
                return n && (!n.visibility[aiPlayer.id] || n.visibility[aiPlayer.id] === 'unexplored');
            });
            
            if (hasUnexploredNeighbor) return firstHop;

            const neighbors = system.links.map(l => systemMap.get(l.targetId));
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor.id)) {
                    visited.add(neighbor.id);
                    queue.push({ system: neighbor, firstHop: firstHop });
                }
            }
        }
        return null;
    }

    _getEnemySystemCount(playerId) {
        return this.engine.state.systems.filter(s => s.owner === playerId).length;
    }

    _isSystemSafe(system, aiPlayerId) {
        return !this.engine.state.ships.some(s => 
            s.owner !== aiPlayerId && 
            s.damage > 0 && 
            this.engine.spatialService.isShipInSystem(s, system)
        );
    }

    _manageTacticalAbilities(aiPlayer) {
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        
        myShips.forEach(ship => {
            // --- Cloaking Logic ---
            // Scouts and Cruisers cloak when in hostile territory
            if (ship.type === 'Scout' || ship.type === 'Cruiser') {
                const system = this.engine.spatialService.getCurrentSystem(ship);
                if (system) {
                    const isEnemy = system.owner && system.owner !== aiPlayer.id;
                    if (isEnemy && !ship.isCloaked) {
                         this.engine.economyService.handleToggleCloakRequest({ senderId: aiPlayer.id, shipId: ship.id });
                    } else if (!isEnemy && ship.isCloaked) {
                         // Decloak in friendly territory to save "energy" (roleplay/future mechanic)
                         this.engine.economyService.handleToggleCloakRequest({ senderId: aiPlayer.id, shipId: ship.id });
                    }
                }
            }

            // --- Mine Deployment Logic ---
            // Destroyers and Cruisers deploy mines in border systems
            if (ship.type === 'Destroyer' || ship.type === 'Cruiser') {
                const system = this.engine.spatialService.getCurrentSystem(ship);
                if (system && system.owner === aiPlayer.id) {
                    // Check if border system (connected to non-owned system)
                    const isBorder = system.links.some(l => {
                        const n = this.engine.state.systems.find(s => s.id === l.targetId);
                        return n && n.owner !== aiPlayer.id;
                    });

                    if (isBorder && aiPlayer.resources.scrap >= 50 && aiPlayer.resources.energy >= 20) {
                        const minesInSystem = this.engine.state.mines ? this.engine.state.mines.filter(m => {
                            const d = (m.x - system.x)**2 + (m.y - system.y)**2;
                            return d < 200*200; // Rough system check
                        }).length : 0;

                        // Maintain a small minefield (max 3 per system)
                        if (minesInSystem < 3 && Math.random() < 0.01) {
                             this.engine.economyService.handleDeployMineRequest({ senderId: aiPlayer.id, shipId: ship.id });
                        }
                    }
                }
            }
        });
    }
}
