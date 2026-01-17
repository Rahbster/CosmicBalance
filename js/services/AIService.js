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

        const aiPlayers = this.engine.state.players.filter(p => p.isAI && !p.isDead);
        const techData = this.engine.techService.getTechData();

        for (const aiPlayer of aiPlayers) {
            if (aiPlayer.isDead) continue;

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
        // Include systems where we own a planet but not the system (Contested)
        const contestedSystems = this.engine.state.systems.filter(s => s.owner !== aiPlayer.id && s.planets.some(p => p.owner === aiPlayer.id));
        const myStations = myShips.filter(s => s.isStation);
        const allBuilders = [...mySystems, ...contestedSystems, ...myStations];
        
        // Helper to count ships including those in production
        const countShips = (type) => {
            const inSpace = myShips.filter(s => s.type === type && !s.isBuilding).length;
            let inQueue = 0;
            allBuilders.forEach(b => { if (b.buildQueue) inQueue += b.buildQueue.filter(q => q.shipType === type).length; });
            return inSpace + inQueue;
        };

        // Default state
        aiPlayer.aiGoal = 'Idle';

        if (mySystems.length === 0 && contestedSystems.length === 0 && myStations.length === 0) {
            aiPlayer.aiGoal = 'Survival (No Systems)';
            return;
        }

        const resources = aiPlayer.resources;

        // Helper to count ships including those in production
        const combatShipCount = countShips('Fighter') + countShips('Frigate') + countShips('Destroyer') + countShips('Cruiser');

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

            // Pick the builder: Prioritize Safe systems, then Shortest Queue
            capableBuilders.sort((a, b) => {
                const sysA = a.isStation ? this.engine.spatialService.getCurrentSystem(a) : a;
                const sysB = b.isStation ? this.engine.spatialService.getCurrentSystem(b) : b;
                
                const aSafe = sysA ? this._isSystemSafe(sysA, aiPlayer.id) : true;
                const bSafe = sysB ? this._isSystemSafe(sysB, aiPlayer.id) : true;

                if (aSafe && !bSafe) return -1;
                if (!aSafe && bSafe) return 1;

                return (a.buildQueue?.length || 0) - (b.buildQueue?.length || 0);
            });
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

        // Check for expansion opportunities (Safe, colonizable neighbors)
        const knownUnownedNeighbors = mySystems.flatMap(sys => 
            sys.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId))
        ).filter(n => 
            n && !n.owner && 
            (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted') &&
            this._isSystemSafe(n, aiPlayer.id)
        );
        
        const hasExpansionTarget = knownUnownedNeighbors.length > 0;
        const transportCount = countShips('TroopTransport');

        // Priority -1: Critical Survival (0 Combat Ships)
        // If we have absolutely no combat ships, we must prioritize building one above all else.
        if (combatShipCount === 0) {
             // EXCEPTION: If we have a safe expansion target and no transport, prioritize that over a lone fighter
             // This breaks the "Build Fighter -> Die -> Build Fighter" loop if we can expand to safety.
             if (hasExpansionTarget && transportCount === 0) {
                 if (this._canAfford(resources, 'TroopTransport')) {
                     if (buildShip('TroopTransport', 'Desperate Expansion')) return;
                 } else {
                     // Save for transport instead of fighter
                     aiPlayer.aiGoal = 'Saving for Expansion';
                     return;
                 }
             }

             if (this._canAfford(resources, 'Fighter')) {
                 if (buildShip('Fighter', 'Emergency Defense')) return;
             } else {
                 // We are defenseless and poor. Save every penny for a fighter.
                 aiPlayer.aiGoal = 'Saving for Defense';
                 return;
             }
        }

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
        
        // Priority 0.5: Economist Special - Prioritize Salvagers (Only if safe)
        if (profile.name === 'Economist') {
            const salvagerCount = countShips('Salvager');
            if (salvagerCount < profile.salvagerCap && this._canAfford(resources, 'Salvager')) {
                if (buildShip('Salvager', 'Building Economy (Salvager)')) return;
            }
        }

        // Priority 1: Targeted Expansion
        // If we have a safe target and no transport, prioritize it over scouts.
        if (hasExpansionTarget && transportCount === 0 && combatShipCount >= profile.minCombatForTransport) {
             if (this._canAfford(resources, 'TroopTransport')) {
                 if (buildShip('TroopTransport', 'Expanding Territory')) return;
             } else {
                 // Save for transport
                 aiPlayer.aiGoal = 'Saving for Expansion';
                 return;
             }
        }

        // Priority 2: Scout
        const scoutCount = countShips('Scout');
        if (scoutCount < profile.scoutCap && this._canAfford(resources, 'Scout')) {
            if (buildShip('Scout', 'Building Scout')) return;
        }

        // Priority 3: Salvagers
        const salvagerCount = countShips('Salvager');
        if (salvagerCount < profile.salvagerCap && this._canAfford(resources, 'Salvager')) {
            if (buildShip('Salvager', 'Building Salvager')) return;
        }

        // Priority 4: General Expansion (Troop Transport)
        
        // Ensure we have enough transports to support multiple fleets (approx 1 per 3 combat ships)
        // Cap at 15 to prevent excessive spam (e.g. 99 transports) in late game
        const maxTransports = 15;
        const desiredTransports = combatShipCount > 0 ? Math.min(maxTransports, Math.max(1, Math.ceil(combatShipCount / profile.transportRatio))) : 0;

        if (transportCount < desiredTransports) {
            if (this._canAfford(resources, 'TroopTransport')) {
                if (buildShip('TroopTransport', 'Building Transport')) return;
            } else if (combatShipCount >= profile.minCombatForTransport) {
                // If we have a basic defense (2+ ships) but need a transport, save resources for it.
                aiPlayer.aiGoal = 'Saving for Expansion';
                return;
            }
        }

        // Priority 5: Combat Fleet
        // Dynamic Cap based on profile (Swarm gets more)
        const baseCap = profile.name === 'Swarm' ? 120 : 80;
        const territoryBonus = mySystems.length * 8; // +8 ships per system controlled
        let shipCap = baseCap + territoryBonus;

        // Resource Overflow: Increase cap if we are floating massive resources
        if (resources.IO > 50000) shipCap += 50;
        if (resources.IO > 200000) shipCap += 100;
        if (resources.IO > 1000000) shipCap += 400;
        if (resources.IO > 5000000) shipCap += 1000;
        
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

    _isSystemSafe(system, aiPlayerId) {
        // Check for enemy combat ships (damage > 0)
        return !this.engine.state.ships.some(s => 
            s.owner !== aiPlayerId && 
            s.damage > 0 && 
            this.engine.spatialService.isShipInSystem(s, system)
        );
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
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0 && !s.isBuilding);
        
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

        // 1. Determine "need" for scrap. Factor is 1.0 when scrap is 0, and decreases as scrap increases.
        const scrapNeedFactor = Math.max(0.1, 1 - (aiPlayer.resources.scrap / 5000));

        // 2. Find all visible debris fields and calculate their value.
        const valuedDebris = allDebrisFields
            .map(debris => {
                const debrisSystem = this.engine.spatialService.getClosestSystem(debris);
                if (!debrisSystem) return null;

                const visibility = debrisSystem.visibility[aiPlayer.id];
                if (visibility !== 'explored' && visibility !== 'scouted') return null;

                // Check for threats in the system
                const enemies = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, debrisSystem));
                if (enemies.some(s => s.damage > 0)) return null; // Avoid systems with armed enemies

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

                const value = (debris.resources.scrap || 0) / (1 + travelTime);
                return { debris, value };
            })
            .filter(item => item !== null);

        if (valuedDebris.length === 0) return;

        // 3. Sort by best value.
        valuedDebris.sort((a, b) => b.value - a.value);
        const bestTarget = valuedDebris[0];

        // 4. Decide if the best target is "good enough" based on need.
        // Base threshold is 2. If need is high (factor=1), threshold is 2. If need is low (factor=0.1), threshold is 20.
        const valueThreshold = 2 / scrapNeedFactor;

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
            
            // --- Heat Trail Logic ---
            // If the current system is "hot" (recent activity) but we don't see enemies, they likely moved to a neighbor.
            const heat = currentSystem.heat || 0;
            const enemiesPresent = this.engine.state.ships.some(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, currentSystem));
            
            if (heat > 20 && !enemiesPresent) {
                // Prioritize neighbors that are unexplored to catch them
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
                // Filter out the system we just came from to prevent ping-ponging
                let validNeighbors = neighbors;
                if (scout.lastSystemId && neighbors.length > 1) {
                    validNeighbors = neighbors.filter(n => n.id !== scout.lastSystemId);
                }

                // Prefer safe neighbors if possible
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
        // Increased divisor and max size to encourage larger deathballs in late game
        const dynamicFleetSize = Math.max(profile.fleetSize, Math.min(Math.floor(myShips.length / 4), 40));

        // Check for expansion opportunities to allow single-transport fleets
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
            
            // Exception: If we have a Transport and expansion targets, allow smaller fleet (even size 1)
            const hasTransport = ships.some(s => s.type === 'TroopTransport');
            if (hasTransport && hasExpansionTarget) {
                requiredSize = 1;
            }

            // Exception: If system is unsafe, form fleet immediately (size 1) to allow retreat/combat logic
            const system = this.engine.state.systems.find(s => s.id === systemId);
            if (system && !this._isSystemSafe(system, aiPlayer.id)) {
                requiredSize = 1;
            }

            if (ships.length >= requiredSize) {
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
        
        // Trajectory Analysis: Pre-calculate incoming enemy strength per system
        const incomingThreats = {};
        this.engine.state.ships.forEach(s => {
            if (s.owner !== aiPlayer.id && s.targetId && s.hull > 0) {
                if (!incomingThreats[s.targetId]) incomingThreats[s.targetId] = { strength: 0, isMySystem: false };
                incomingThreats[s.targetId].strength += (s.hull + s.shield + s.damage * 10);
            }
        });
        // Mark owned systems in threat map
        mySystems.forEach(s => {
            if (incomingThreats[s.id]) incomingThreats[s.id].isMySystem = true;
        });

        const currentTargets = new Set(); // Track targets to coordinate attacks
        // Pre-populate currentTargets with targets of currently moving fleets to ensure coordination with active operations
        aiPlayer.fleets.forEach(f => {
             const fShips = this.engine.state.ships.filter(s => f.shipIds.includes(s.id));
             const movingShip = fShips.find(s => s.targetId && s.moveState === SHIP_STATE.MOVING);
             if (movingShip) currentTargets.add(movingShip.targetId);
        });

        const proposedMoves = []; // Store { fleet, target, currentSystem } for synchronization

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

            // 0. Interception Logic: Check if we should stay in current system due to incoming threat
            // If enemies are en route here, hold position to defend/ambush.
            const incomingHere = incomingThreats[currentSystem.id];
            if (incomingHere && incomingHere.strength > 0) {
                return; // Hold position to intercept
            }

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
                // Only stay if it is relatively safe (we aren't hopelessly outnumbered)
                const enemyShips = this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, currentSystem));
                const enemyStrength = this._calculateStrength(enemyShips);
                const myStrength = this._calculateStrength(fleetShips);
                
                const isSafe = enemyStrength === 0 || myStrength >= enemyStrength * 0.5;
                
                const hasUnownedPlanets = currentSystem.planets.some(p => p.owner !== aiPlayer.id);
                if (hasUnownedPlanets && hasTransport && isSafe) return;
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
                
                // Add incoming reinforcements to enemy strength for risk assessment
                const incoming = incomingThreats[n.id] ? incomingThreats[n.id].strength : 0;
                const totalEnemyStrength = enemyStrength + incoming;

                // Coordination: If we are already attacking this target, assume we have help (lower effective enemy strength)
                const coordinationBonus = currentTargets.has(n.id) ? 0.5 : 1.0;
                
                return fleetStrength >= (totalEnemyStrength * coordinationBonus) * effectiveThreshold;
            });

            // Sort enemies by Strategic Score (Value vs Strength)
            engageableEnemies.sort((a, b) => {
                const strA = this._calculateStrength(this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, a)));
                const strB = this._calculateStrength(this.engine.state.ships.filter(s => s.owner !== aiPlayer.id && this.engine.spatialService.isShipInSystem(s, b)));
                
                const valA = this._getSystemStrategicValue(a);
                const valB = this._getSystemStrategicValue(b);

                const distA = Math.hypot(a.x - currentSystem.x, a.y - currentSystem.y);
                const distB = Math.hypot(b.x - currentSystem.x, b.y - currentSystem.y);

                // Heuristic: High value systems are worth attacking even if slightly stronger
                // Distance penalty: -0.5 per pixel (e.g. 200px = -100 score) to prefer closer targets
                const scoreA = (valA * 20) - strA - (distA * 0.5);
                const scoreB = (valB * 20) - strB - (distB * 0.5);
                
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
                
                // Check if we are currently at a frontier (adjacent to known enemy)
                const currentIsFrontier = neighbors.some(n => n.owner && n.owner !== aiPlayer.id && (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted'));

                if (currentIsFrontier) {
                    // We are at the front line. Hold position to defend unless we decide to patrol.
                    if (Math.random() < 0.7) return; 
                }

                // If safe (not frontier), try to move towards the front line.
                if (!currentIsFrontier) {
                    const hop = this._findNearestFrontierHop(currentSystem, aiPlayer);
                    if (hop) target = hop;
                }

                // Fallback: Patrol / Move to Hubs if no target yet (or if we decided to move along frontier)
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

                        // Trajectory Prediction Bonus:
                        // Prioritize systems where enemies are moving to (Intercept/Defend)
                        const threatA = incomingThreats[a.id];
                        const threatB = incomingThreats[b.id];
                        // Higher priority if it's OUR system being attacked (150), vs just an enemy moving to neutral (75)
                        const interceptA = threatA ? (threatA.isMySystem ? 150 : 75) : 0;
                        const interceptB = threatB ? (threatB.isMySystem ? 150 : 75) : 0;

                    const distA = Math.hypot(a.x - currentSystem.x, a.y - currentSystem.y);
                    const distB = Math.hypot(b.x - currentSystem.x, b.y - currentSystem.y);

                    // Prefer closer systems for patrol/movement to avoid long travel times for simple repositioning
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

        // Execute Proposed Moves with Synchronization
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
            
            // Calculate ETAs for proposed moves
            moves.forEach(move => {
                move.travelTime = this._calculateFleetTravelTime(move.fleet, targetSystem);
            });

            // Check ETAs of fleets already en route to coordinate arrival
            let maxEta = 0;
            
            aiPlayer.fleets.forEach(f => {
                const fShips = this.engine.state.ships.filter(s => f.shipIds.includes(s.id));
                const movingShip = fShips.find(s => s.targetId === targetId && s.moveState === SHIP_STATE.MOVING);
                if (movingShip) {
                    const eta = this._calculateShipEta(movingShip, targetSystem);
                    if (eta > maxEta) maxEta = eta;
                }
            });

            // Also consider the proposed moves for max ETA (slowest fleet determines arrival time)
            moves.forEach(move => {
                if (move.travelTime > maxEta) maxEta = move.travelTime;
            });

            // Execute moves that are within the synchronization window
            const SYNC_WINDOW = 5; // seconds tolerance
            
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
        // Connectivity: Hubs (more links) are critical for movement and control
        value += system.links.length * 2;
        // Economic Potential: More planets = more resources
        if (system.planets) {
            system.planets.forEach(p => {
                value += 10; // Base value
                if (p.type === 'Industrial') value += 40;
                else if (p.type === 'Terran') value += 25;
                else if (p.type === 'Mining') value += 20;
                else if (p.type === 'Farming') value += 5;
            });
        }
        return value;
    }

    _calculateStrength(ships) {
        return ships.reduce((sum, s) => sum + (s.hull + s.shield) + (s.damage * 10), 0);
    }

    _calculateShipTravelTime(ship, startSystem, targetSystem) {
        if (!startSystem || !targetSystem) return Infinity;

        const speedMultiplier = (this.engine.state.settings?.shipSpeedRate || 1.0);
        // Use 1 as a fallback warp to avoid division by zero for non-warp ships
        const speed = (ship.warp || 1) * 75 * speedMultiplier;

        if (speed <= 0) return Infinity;

        const dx = targetSystem.x - startSystem.x;
        const dy = targetSystem.y - startSystem.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        return dist / speed; // Time in seconds
    }

    _calculateFleetTravelTime(fleet, targetSystem) {
        const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id));
        if (fleetShips.length === 0) return 0;

        const currentSystem = this.engine.state.systems.find(s => s.id === fleet.locationId);
        if (!currentSystem) return 0;

        const minWarp = Math.min(...fleetShips.map(s => s.warp || 0));
        const speedMultiplier = (this.engine.state.settings?.shipSpeedRate || 1.0);
        const speed = minWarp * 75 * speedMultiplier; // 75 is base WARP_SPEED_FACTOR

        if (speed <= 0) return Infinity;

        const dx = targetSystem.x - currentSystem.x;
        const dy = targetSystem.y - currentSystem.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        return dist / speed; // Time in seconds
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
        
        // Initialize with neighbors, sorted by distance to prefer shorter initial jumps
        const neighbors = startSystem.links
            .map(l => this.engine.state.systems.find(s => s.id === l.targetId))
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

            // 1. Is Enemy?
            if (system.owner && system.owner !== aiPlayer.id && isVisible) return firstHop;

            // 2. Is Frontier? (Has visible enemy neighbor)
            if (isVisible) {
                const neighbors = system.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
                const hasEnemyNeighbor = neighbors.some(n => {
                    const nVis = n.visibility[aiPlayer.id];
                    return n.owner && n.owner !== aiPlayer.id && (nVis === 'explored' || nVis === 'scouted');
                });
                if (hasEnemyNeighbor) return firstHop;
            }

            // Expand
            const neighbors = system.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor.id)) {
                    visited.add(neighbor.id);
                    queue.push({ system: neighbor, firstHop: firstHop });
                }
            }
        }
        return null;
    }
}
