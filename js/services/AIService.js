import { SHIP_DATA } from './GalaxyService.js';
import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export const AI_PROFILES = {
    BALANCED: { name: 'Balanced', scoutCap: 2, salvagerCap: 1, transportRatio: 3, minCombatForTransport: 2, fleetSize: 3, aggressiveness: 0.5, retreatThreshold: 0.5, engageThreshold: 1.1, expansionBias: 0.5, researchPriority: 0.5, shipPreference: ['Cruiser', 'Destroyer', 'Frigate', 'Fighter'] },
    AGGRESSIVE: { name: 'Aggressive', scoutCap: 1, salvagerCap: 0, transportRatio: 5, minCombatForTransport: 2, fleetSize: 4, aggressiveness: 0.9, retreatThreshold: 0.3, engageThreshold: 0.8, expansionBias: 0.35, researchPriority: 0.3, shipPreference: ['Cruiser', 'Destroyer', 'Fighter'] },
    DEFENSIVE: { name: 'Defensive', scoutCap: 2, salvagerCap: 1, transportRatio: 4, minCombatForTransport: 3, fleetSize: 5, aggressiveness: 0.2, retreatThreshold: 0.7, engageThreshold: 1.5, expansionBias: 0.4, researchPriority: 0.6, shipPreference: ['Cruiser', 'Frigate', 'Destroyer', 'Fighter'] },
    EXPANDER: { name: 'Expander', scoutCap: 3, salvagerCap: 1, transportRatio: 2, minCombatForTransport: 1, fleetSize: 2, aggressiveness: 0.4, retreatThreshold: 0.5, engageThreshold: 1.2, expansionBias: 0.8, researchPriority: 0.4, shipPreference: ['Destroyer', 'Fighter', 'TroopTransport'] },
    TECHNOLOGIST: { name: 'Technologist', scoutCap: 2, salvagerCap: 1, transportRatio: 3, minCombatForTransport: 1, fleetSize: 3, aggressiveness: 0.3, retreatThreshold: 0.6, engageThreshold: 1.2, expansionBias: 0.5, researchPriority: 0.9, shipPreference: ['Cruiser', 'Destroyer', 'Frigate'] },
    ECONOMIST: { name: 'Economist', scoutCap: 2, salvagerCap: 2, transportRatio: 3, minCombatForTransport: 1, fleetSize: 3, aggressiveness: 0.4, retreatThreshold: 0.6, engageThreshold: 1.3, expansionBias: 0.6, researchPriority: 0.5, shipPreference: ['Destroyer', 'Fighter', 'Salvager'] },
    SWARM: { name: 'Swarm', scoutCap: 3, salvagerCap: 2, transportRatio: 4, minCombatForTransport: 3, fleetSize: 6, aggressiveness: 0.8, retreatThreshold: 0.2, engageThreshold: 0.6, expansionBias: 0.3, researchPriority: 0.2, shipPreference: ['Cruiser', 'Fighter'] },
    CAPITALIST: { name: 'Capitalist', scoutCap: 1, salvagerCap: 1, transportRatio: 3, minCombatForTransport: 1, fleetSize: 2, aggressiveness: 0.6, retreatThreshold: 0.6, engageThreshold: 1.2, expansionBias: 0.5, researchPriority: 0.6, shipPreference: ['Cruiser', 'Destroyer', 'Frigate'] }
};

export class AIService {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, 'AIService Initialized');
    }

    run(dt) {
        if (!this.engine.isHost || !this.engine.state.players || !this.engine.techService.getTechData()) return;

        const aiPlayers = this.engine.state.players.filter(p => p.isAI);
        const techData = this.engine.techService.getTechData();

        for (const aiPlayer of aiPlayers) {
            aiPlayer.actionTimer = (aiPlayer.actionTimer || 0) + dt;

            // Run AI logic roughly every 1 second, staggered
            if (aiPlayer.actionTimer > 1000 + (Math.random() * 500)) { 
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.DEBUG, `Running logic for player ${aiPlayer.id}`);
                aiPlayer.actionTimer = 0;
                
                this._manageProduction(aiPlayer, techData);
                this._manageResearch(aiPlayer, techData);
                this._manageUnits(aiPlayer);
            }
        }
    }

    _manageProduction(aiPlayer, techData) {
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        const mySystems = this.engine.state.systems.filter(s => s.owner === aiPlayer.id);
        const myStations = myShips.filter(s => s.isStation);
        const allBuilders = [...mySystems, ...myStations];
        
        // Helper to count ships including those in production
        const countShips = (type) => {
            const inSpace = myShips.filter(s => s.type === type).length;
            let inQueue = 0;
            allBuilders.forEach(b => { if (b.buildQueue) inQueue += b.buildQueue.filter(q => q.shipType === type).length; });
            return inSpace + inQueue;
        };

        // Default state
        aiPlayer.aiGoal = 'Idle';

        if (mySystems.length === 0 && myStations.length === 0) {
            aiPlayer.aiGoal = 'Survival (No Systems)';
            return;
        }

        const resources = aiPlayer.resources;

        // Helper to find the best builder for a specific ship type
        const buildShip = (shipType, goalMessage) => {
            const shipInfo = SHIP_DATA[shipType];
            if (!shipInfo) return false;

            // Filter builders capable of building this ship
            const capableBuilders = allBuilders.filter(b => {
                // Check if builder is busy (limit queue size to 5 to encourage parallel building)
                if (b.buildQueue && b.buildQueue.length >= 5) return false;

                if (b.isStation) {
                    // Stations can build if the ship type is in their capabilities
                    return SHIP_DATA[b.type]?.buildCapabilities?.includes(shipType);
                } else {
                    // Systems (Planets) can build if the ship type allows 'Planet'
                    return shipInfo.builtBy.includes('Planet');
                }
            });

            if (capableBuilders.length === 0) return false;

            // Pick the builder with the shortest queue
            capableBuilders.sort((a, b) => (a.buildQueue?.length || 0) - (b.buildQueue?.length || 0));
            const bestBuilder = capableBuilders[0];

            this.engine.economyService.handleBuildRequest({ 
                senderId: aiPlayer.id, 
                shipType: shipType, 
                locationId: bestBuilder.id, 
                count: 1 
            });
            aiPlayer.aiGoal = goalMessage;
            return true;
        };

        // Priority 0: Infrastructure (Space Stations)
        // Build stations if we have resources and systems without them to increase heavy ship production capacity
        if (resources.IO > 1200 && resources.scrap > 250) {
             const systemsWithoutStations = mySystems.filter(sys => 
                !myStations.some(station => this.engine.spatialService.isShipInSystem(station, sys)) &&
                (!sys.buildQueue || !sys.buildQueue.some(q => q.shipType === 'SpaceStation'))
            );
            
            if (systemsWithoutStations.length > 0) {
                // Build in the one with the most planets (best economy usually)
                const target = systemsWithoutStations.reduce((prev, curr) => (prev.planets.length > curr.planets.length) ? prev : curr);
                
                // Manually trigger build since buildShip helper is generic
                this.engine.economyService.handleBuildRequest({ senderId: aiPlayer.id, shipType: 'SpaceStation', locationId: target.id, count: 1 });
                aiPlayer.aiGoal = 'Expanding Infrastructure';
                return;
            }
        }
        
        // Priority 0: Economist Special - Prioritize Salvagers
        if (profile.name === 'Economist') {
            const salvagerCount = countShips('Salvager');
            if (salvagerCount < profile.salvagerCap && this._canAfford(resources, 'Salvager')) {
                if (buildShip('Salvager', 'Building Economy (Salvager)')) return;
            }
        }

        // Priority 1: Scout
        const scoutCount = countShips('Scout');
        if (scoutCount < profile.scoutCap && this._canAfford(resources, 'Scout')) {
            if (buildShip('Scout', 'Building Scout')) return;
        }

        // Priority 1.5: Salvagers
        const salvagerCount = countShips('Salvager');
        if (salvagerCount < profile.salvagerCap && this._canAfford(resources, 'Salvager')) {
            if (buildShip('Salvager', 'Building Salvager')) return;
        }

        // Priority 2: Expansion (Troop Transport)
        const transportCount = countShips('TroopTransport');
        const combatShipCount = countShips('Fighter') + countShips('Frigate') + countShips('Destroyer') + countShips('Cruiser');
        
        // Ensure we have enough transports to support multiple fleets (approx 1 per 3 combat ships)
        const desiredTransports = combatShipCount > 0 ? Math.max(1, Math.ceil(combatShipCount / profile.transportRatio)) : 0;

        if (transportCount < desiredTransports) {
            if (this._canAfford(resources, 'TroopTransport')) {
                if (buildShip('TroopTransport', 'Building Transport')) return;
            } else if (combatShipCount >= profile.minCombatForTransport) {
                // If we have a basic defense (2+ ships) but need a transport, save resources for it.
                aiPlayer.aiGoal = 'Saving for Expansion';
                return;
            }
        }

        // Priority 3: Combat Fleet
        // Dynamic Cap based on profile (Swarm gets more)
        const baseCap = profile.name === 'Swarm' ? 120 : 80;
        const territoryBonus = mySystems.length * 8; // +8 ships per system controlled
        const shipCap = baseCap + territoryBonus;
        
        let totalQueued = 0;
        allBuilders.forEach(b => { if (b.buildQueue) totalQueued += b.buildQueue.length; });

        if (myShips.length + totalQueued < shipCap) {
                let wantedHeavyButBusy = false;

                // Try preferred ships first
                for (const type of profile.shipPreference) {
                    const isHeavy = ['Frigate', 'Destroyer', 'Cruiser'].includes(type);
                    if (this._canAfford(resources, type) && this._hasTech(aiPlayer, type)) {
                        if (buildShip(type, `Building Fleet`)) return;
                        // If we failed to build a heavy ship (likely due to queue full), mark it
                        if (isHeavy) wantedHeavyButBusy = true;
                    }
                }

                // Fallback logic: Only build Fighters if we aren't waiting for a heavy ship slot, OR if we are desperate
                // OR if we have plenty of capacity (below 80% cap) to avoid idling planets while waiting for stations
                const isRich = resources.IO > 3000;
                const shouldKeepBuilding = myShips.length < (shipCap * 0.8);
                
                if (!wantedHeavyButBusy || !isRich || shouldKeepBuilding) {
                    if (this._canAfford(resources, 'Fighter')) buildShip('Fighter', 'Building Fleet (Fighter)');
                } else {
                    aiPlayer.aiGoal = 'Waiting for Shipyards';
                }
        } else {
            aiPlayer.aiGoal = 'Fleet Cap Reached';

            // Scuttle logic: If rich and capped, scuttle light fighters to make room for heavy ships
            if (resources.IO > 5000 && resources.scrap > 1000) {
                const fighters = myShips.filter(s => s.type === 'Fighter' && s.moveState === SHIP_STATE.IDLE);
                // Only scuttle if we have a significant number of fighters
                if (fighters.length > 10) {
                    // Check if we actually want/can build something bigger
                    const heavyShips = ['Cruiser', 'Destroyer', 'Frigate'];
                    const canBuildHeavy = heavyShips.some(type => this._canAfford(resources, type) && this._hasTech(aiPlayer, type));
                    
                    if (canBuildHeavy) {
                        const sacrifice = fighters[0];
                        this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `AI ${aiPlayer.factionName} scuttling Fighter ${sacrifice.id} to make room for heavy ships.`);
                        // Use combatService directly to handle the destruction logic on host
                        this.engine.combatService.handleSelfDestructRequest({ senderId: aiPlayer.id, shipId: sacrifice.id });
                        aiPlayer.aiGoal = 'Modernizing Fleet';
                    }
                }
            }
        }
    }

    _canAfford(resources, shipType) {
        const cost = SHIP_DATA[shipType].cost;
        return resources.IO >= (cost.credits || 0) && 
               resources.scrap >= (cost.scrap || 0) && 
               resources.energy >= (cost.energy || 0);
    }

    _hasTech(aiPlayer, shipType) {
        const requiredTech = SHIP_DATA[shipType].requiresTech;
        return !requiredTech || aiPlayer.researchedTechs.includes(requiredTech);
    }

    _manageResearch(aiPlayer, techData) {
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;
        if (aiPlayer.researchQueue.length > 0) return;

        const aiTechs = techData[aiPlayer.techBase];
        if (!aiTechs) return;

        // Don't research if we have a critically small fleet (unless we are a Technologist)
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        if (myShips.length < 2 && profile.name !== 'Technologist') return;

        const availableTechs = Object.keys(aiTechs).filter(techId => {
            const tech = aiTechs[techId];
            const isResearched = aiPlayer.researchedTechs.includes(techId);
            const dependenciesMet = tech.dependencies.every(dep => aiPlayer.researchedTechs.includes(dep));
            const canAfford = aiPlayer.resources.IO >= (tech.cost.IO || 0) && aiPlayer.resources.minerals >= (tech.cost.minerals || 0);
            return !isResearched && dependenciesMet && canAfford;
        });

        if (availableTechs.length > 0 && Math.random() < profile.researchPriority) {
            const techToResearch = availableTechs[Math.floor(Math.random() * availableTechs.length)];
            this.engine.economyService.handleResearchRequest({ senderId: aiPlayer.id, techId: techToResearch });
        }
    }

    _manageUnits(aiPlayer) {
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        
        // 1. Scouts
        const idleScouts = myShips.filter(s => s.type === 'Scout' && s.moveState === SHIP_STATE.IDLE && !s.scoutMission);
        idleScouts.forEach(scout => this._commandScout(aiPlayer, scout));

        // 2. Salvagers
        const idleSalvagers = myShips.filter(s => s.type === 'Salvager' && s.moveState === SHIP_STATE.IDLE && !s.salvageMission);
        idleSalvagers.forEach(salvager => this._commandSalvager(aiPlayer, salvager));

        // 3. Fleet Formation
        this._formFleets(aiPlayer, myShips);

        // 4. Fleet Maintenance (Repair/Upgrade)
        this._manageFleetMaintenance(aiPlayer);

        // 5. Fleet Movement / Attacks
        this._commandFleets(aiPlayer);
    }

    _commandSalvager(aiPlayer, salvager) {
        const currentSystem = this.engine.spatialService.getCurrentSystem(salvager);

        if (!currentSystem) {
            // It's in deep space, recover it.
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

        let targetDebris = null;

        // 1. Prioritize debris in the current system
        const sysRadius = this.engine.spatialService.getSystemEffectiveRadius(currentSystem) + 200; // Buffer
        const localDebris = allDebrisFields.filter(d => {
            const dx = d.x - currentSystem.x;
            const dy = d.y - currentSystem.y;
            return (dx * dx + dy * dy) <= (sysRadius * sysRadius);
        });

        if (localDebris.length > 0) {
            targetDebris = this._findClosest(salvager, localDebris);
        }

        // 2. If no local debris, look for debris in neighbor systems
        if (!targetDebris) {
            const neighborSystemIds = currentSystem.links.map(l => l.targetId);
            // Filter debris that belongs to neighbor systems
            const neighborDebris = allDebrisFields.filter(d => {
                const dSys = this.engine.spatialService.getClosestSystem(d);
                // Check if the debris's closest system is one of our neighbors AND we have explored it
                return dSys && neighborSystemIds.includes(dSys.id) && 
                       dSys.visibility[aiPlayer.id] && dSys.visibility[aiPlayer.id] !== 'unexplored';
            });

            if (neighborDebris.length > 0) {
                targetDebris = this._findClosest(salvager, neighborDebris);
            }
        }

        if (targetDebris) {
            this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Salvager ${salvager.id} targeting debris ${targetDebris.id}`);
            this.engine.movementService.handleSalvageMissionRequest({
                senderId: aiPlayer.id,
                shipId: salvager.id,
                targetDebrisId: targetDebris.id
            });
        }
    }

    _findClosest(entity, items) {
        let closest = null;
        let minDist = Infinity;
        items.forEach(item => {
            const dx = item.x - entity.x;
            const dy = item.y - entity.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                closest = item;
            }
        });
        return closest;
    }

    _commandScout(aiPlayer, scout) {
        const currentSystem = this.engine.spatialService.getCurrentSystem(scout);

        if (currentSystem) {
            const neighbors = currentSystem.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
            const unexplored = neighbors.filter(n => !n.visibility[aiPlayer.id] || n.visibility[aiPlayer.id] === 'unexplored');
            
            if (unexplored.length > 0) {
                const target = unexplored[Math.floor(Math.random() * unexplored.length)];
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Scout ${scout.id} exploring ${target.id}`);
                this.engine.movementService.handleScoutMissionRequest({ senderId: aiPlayer.id, shipId: scout.id, targetSystemId: target.id });
            } else {
                // Filter out the system we just came from to prevent ping-ponging
                let validNeighbors = neighbors;
                if (scout.lastSystemId && neighbors.length > 1) {
                    validNeighbors = neighbors.filter(n => n.id !== scout.lastSystemId);
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

    _formFleets(aiPlayer, myShips) {
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;
        
        // 1. Reinforce existing fleets
        if (aiPlayer.fleets) {
            aiPlayer.fleets.forEach(fleet => {
                // Only reinforce idle fleets
                const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id));
                // If the fleet is moving, we can't easily reinforce it (ships would have to catch up)
                if (fleetShips.some(s => s.moveState !== SHIP_STATE.IDLE)) return;

                const fleetSystemId = fleet.locationId;
                if (!fleetSystemId) return;
                
                const fleetSystem = this.engine.state.systems.find(s => s.id === fleetSystemId);
                if (!fleetSystem) return;

                // Find unassigned idle ships in the same system
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
                    
                    // Broadcast update
                    this.engine.broadcast({ 
                        type: 'GAME_FLEET_UPDATE', 
                        playerId: aiPlayer.id, 
                        fleets: aiPlayer.fleets, 
                        updatedShips: newShipIds.map(id => ({ id, fleetId: fleet.id })) 
                    });
                }
            });
        }

        // 2. Form new fleets from remaining unassigned ships
        const unassignedCombatShips = myShips.filter(s => !s.fleetId && ['Fighter', 'Frigate', 'Destroyer', 'Cruiser', 'TroopTransport'].includes(s.type) && s.moveState === SHIP_STATE.IDLE);
        
        const shipsBySystem = {};
        unassignedCombatShips.forEach(ship => {
            const system = this.engine.spatialService.getCurrentSystem(ship);
            if (system) {
                if (!shipsBySystem[system.id]) shipsBySystem[system.id] = [];
                shipsBySystem[system.id].push(ship);
            }
        });

        // Dynamic Fleet Size: Scale with total army size to create larger late-game fleets
        const dynamicFleetSize = Math.max(profile.fleetSize, Math.min(Math.floor(myShips.length / 5), 25));

        for (const [systemId, ships] of Object.entries(shipsBySystem)) {
            if (ships.length >= dynamicFleetSize) {
                const shipIds = ships.map(s => s.id);
                const fleetName = `${aiPlayer.factionName} Fleet ${aiPlayer.fleets.length + 1}`;
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
            // Ensure we only command ships that actually belong to this fleet
            const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id) && s.fleetId === fleet.id);
            if (fleetShips.length === 0) return;

            // Skip if already repairing
            if (fleetShips.some(s => s.isRepairing)) return;

            // Check health
            const totalHull = fleetShips.reduce((sum, s) => sum + s.hull, 0);
            const totalMaxHull = fleetShips.reduce((sum, s) => sum + s.maxHull, 0);
            const healthPct = totalMaxHull > 0 ? totalHull / totalMaxHull : 0;
            
            // Critical threshold is slightly lower than fleet retreat threshold to allow for some damage before abandoning a fight due to one ship
            const criticalThreshold = Math.max(0.1, profile.retreatThreshold - 0.2);
            const hasCriticallyDamagedShip = fleetShips.some(s => s.hull < s.maxHull * criticalThreshold);

            // Check upgrades (if we have researched more techs than the ship has)
            const needsUpgrade = fleetShips.some(s => (s.vintageTechs || []).length < aiPlayer.researchedTechs.length);

            // Decision logic: Retreat if damaged OR (sometimes) if upgrades available and idle
            // We add a random factor to upgrades so they don't all retreat at once for minor tech bumps
            const shouldRefit = (healthPct < profile.retreatThreshold || hasCriticallyDamagedShip) || (needsUpgrade && Math.random() < 0.05);

            if (shouldRefit) {
                const currentSystem = this.engine.state.systems.find(s => s.id === fleet.locationId);
                
                // Find systems with owned SpaceStation
                const stationSystems = this.engine.state.systems.filter(s => 
                    s.owner === aiPlayer.id && 
                    this.engine.state.ships.some(ship => ship.isStation && this.engine.spatialService.isShipInSystem(ship, s))
                );

                if (stationSystems.length === 0) return;

                // Check if we are at a station
                const atStation = stationSystems.some(s => s.id === fleet.locationId);

                if (atStation) {
                    // At station: Issue repair/upgrade requests
                    let requestSent = false;
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
                    // Not at station: Move to nearest
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
                        // Only move if we aren't already moving there
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
        
        // Dynamic Aggression: Be more aggressive if rich or near cap
        let aggressionMod = 1.0;
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        const mySystems = this.engine.state.systems.filter(s => s.owner === aiPlayer.id);
        const shipCap = (profile.name === 'Swarm' ? 120 : 80) + (mySystems.length * 8);
        if (myShips.length > shipCap * 0.85) aggressionMod *= 0.7; // Lower threshold if near cap
        if (aiPlayer.resources.IO > 25000) aggressionMod *= 0.8; // Lower threshold if rich
        const effectiveThreshold = profile.engageThreshold * aggressionMod;
        
        const currentTargets = new Set(); // Track targets to coordinate attacks

        aiPlayer.fleets.forEach(fleet => {
            // Ensure we only command ships that actually belong to this fleet (fix for ghost fleets)
            const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id) && s.fleetId === fleet.id);
            if (fleetShips.length === 0) return;
            
            // Skip if repairing
            if (fleetShips.some(s => s.isRepairing)) return;

            const isIdle = fleetShips.every(s => s.moveState === SHIP_STATE.IDLE);
            if (!isIdle) return;

            const currentSystemId = fleet.locationId;
            const currentSystem = this.engine.state.systems.find(s => s.id === currentSystemId);
            
            if (!currentSystem) {
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.WARNING, `Fleet ${fleet.id} has invalid locationId: `);
                return;
            }

            const hasTransport = fleetShips.some(s => s.type === 'TroopTransport');

            // If in enemy system
            if (currentSystem.owner && currentSystem.owner !== aiPlayer.id) {
                // Check if we should stay:
                // 1. Enemies present?
                const enemiesPresent = this.engine.state.ships.some(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, currentSystem));
                if (enemiesPresent) return; // Stay and Fight

                // 2. Can capture?
                const hasUnownedPlanets = currentSystem.planets.some(p => p.owner !== aiPlayer.id);
                if (hasTransport && hasUnownedPlanets) return; // Stay and Capture

                // If no enemies and (no transport OR no planets to capture), we should move on.
            } else {
                // Friendly or Neutral system
                // If neutral/friendly system with unowned planets and have transport, stay to capture/colonize.
                const hasUnownedPlanets = currentSystem.planets.some(p => p.owner !== aiPlayer.id);
                if (hasUnownedPlanets && hasTransport) return;
            }

            const neighbors = currentSystem.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
            
            let target = null;

            // Calculate own fleet strength
            const fleetStrength = this._calculateStrength(fleetShips);

            // Identify potential targets
            const enemyNeighbors = neighbors.filter(n => n.owner && n.owner !== aiPlayer.id && (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted'));
            const neutralNeighbors = neighbors.filter(n => !n.owner && (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted'));

            // Filter enemies by effectiveThreshold (Risk Assessment)
            const engageableEnemies = enemyNeighbors.filter(n => {
                const enemyShips = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, n));
                const enemyStrength = this._calculateStrength(enemyShips);
                
                // Coordination: If we are already attacking this target, assume we have help (lower effective enemy strength)
                const coordinationBonus = currentTargets.has(n.id) ? 0.5 : 1.0;
                
                // If no enemies, strength is 0, so we can always attack (0 * threshold = 0)
                return fleetStrength >= (enemyStrength * coordinationBonus) * effectiveThreshold;
            });

            // Sort enemies by Strategic Score (Value vs Strength)
            engageableEnemies.sort((a, b) => {
                const strA = this._calculateStrength(this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, a)));
                const strB = this._calculateStrength(this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, b)));
                
                const valA = this._getSystemStrategicValue(a);
                const valB = this._getSystemStrategicValue(b);

                // Heuristic: High value systems are worth attacking even if slightly stronger
                const scoreA = (valA * 20) - strA;
                const scoreB = (valB * 20) - strB;
                
                return scoreB - scoreA; // Descending score
            });

            // Decision: Expand or Attack? (Based on expansionBias)
            const prioritizeExpansion = hasTransport && neutralNeighbors.length > 0 && Math.random() < profile.expansionBias;

            if (prioritizeExpansion) {
                target = neutralNeighbors[Math.floor(Math.random() * neutralNeighbors.length)];
            } else if (engageableEnemies.length > 0) {
                // Prioritize targets we are already attacking, otherwise pick the weakest (which is now at index 0 due to sort)
                const coordinatedTarget = engageableEnemies.find(e => currentTargets.has(e.id));
                target = coordinatedTarget || engageableEnemies[0];
            } else if (hasTransport && neutralNeighbors.length > 0) {
                // Fallback to expansion if no enemies are engageable
                target = neutralNeighbors[Math.floor(Math.random() * neutralNeighbors.length)];
            } else {
                // 3. Patrol/Defend/Explore
                // Prioritize moving to "Frontier" systems (neighbors with enemy connections) or Hubs
                let validNeighbors = neighbors;
                const lastSystemId = fleetShips[0] ? fleetShips[0].lastSystemId : null;
                if (lastSystemId && neighbors.length > 1) {
                    validNeighbors = neighbors.filter(n => n.id !== lastSystemId);
                }

                // Sort neighbors by strategic value to patrol important choke points/hubs
                validNeighbors.sort((a, b) => {
                    // Bonus if the neighbor borders an enemy (Frontier defense)
                    const aIsFrontier = a.links.some(l => {
                        const s = this.engine.state.systems.find(sys => sys.id === l.targetId);
                        return s && s.owner && s.owner !== aiPlayer.id;
                    }) ? 50 : 0;
                    const bIsFrontier = b.links.some(l => {
                        const s = this.engine.state.systems.find(sys => sys.id === l.targetId);
                        return s && s.owner && s.owner !== aiPlayer.id;
                    }) ? 50 : 0;

                    return (this._getSystemStrategicValue(b) + bIsFrontier) - (this._getSystemStrategicValue(a) + aIsFrontier);
                });

                // Pick the best one, or random if they are all similar
                if (validNeighbors.length > 0) {
                    // Add some randomness to avoid all fleets clumping at the same hub
                    const topCount = Math.min(3, validNeighbors.length);
                    target = validNeighbors[Math.floor(Math.random() * topCount)];
                }
            }

            if (target) {
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Fleet ${fleet.id} (at ${currentSystem.id}) moving to ${target.id}`);
                currentTargets.add(target.id);
                
                if (target.owner && target.owner !== aiPlayer.id) {
                    aiPlayer.aiGoal = `Attacking ${target.name}`;
                } else if (!target.owner && hasTransport) {
                    aiPlayer.aiGoal = `Colonizing ${target.name}`;
                } else {
                    aiPlayer.aiGoal = `Moving to ${target.name}`;
                }

                this.engine.fleetService.handleMoveFleetRequest({
                    senderId: aiPlayer.id,
                    fleetId: fleet.id,
                    targetSystemId: target.id
                });
            }
        });
    }

    _getSystemStrategicValue(system) {
        let value = 0;
        // Connectivity: Hubs (more links) are critical for movement and control
        value += system.links.length * 5;
        // Economic Potential: More planets = more resources
        value += (system.planets ? system.planets.length : 0) * 3;
        return value;
    }

    _calculateStrength(ships) {
        return ships.reduce((sum, s) => sum + (s.hull + s.shield) + (s.damage * 10), 0);
    }
}
