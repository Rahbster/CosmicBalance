import { SHIP_DATA } from './GalaxyService.js';

export class AIService {
    constructor(gameEngine) {
        this.engine = gameEngine;
        console.log('[AIService] Initialized');
    }

    run(dt) {
        if (!this.engine.isHost || !this.engine.state.players || !this.engine._techData) return;

        const aiPlayers = this.engine.state.players.filter(p => p.isAI);
        const techData = this.engine._techData;

        for (const aiPlayer of aiPlayers) {
            aiPlayer.actionTimer = (aiPlayer.actionTimer || 0) + dt;

            // Run AI logic roughly every 3 seconds, staggered
            if (aiPlayer.actionTimer > 3000 + (Math.random() * 1000)) { 
                console.log(`[AIService] Running logic for player ${aiPlayer.id}`);
                aiPlayer.actionTimer = 0;
                
                this._manageProduction(aiPlayer);
                this._manageResearch(aiPlayer, techData);
                this._manageUnits(aiPlayer);
            }
        }
    }

    _manageProduction(aiPlayer) {
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        const mySystems = this.engine.state.systems.filter(s => s.owner === aiPlayer.id);
        
        // Simple AI: Build at the first owned system found.
        const buildSystem = mySystems[0]; 
        if (!buildSystem) return;

        const resources = aiPlayer.resources;
        
        // Priority 1: Scout (Maintain at least 2)
        const scoutCount = myShips.filter(s => s.type === 'Scout').length;
        if (scoutCount < 2 && this._canAfford(resources, 'Scout')) {
            this.engine.economyService.handleBuildRequest({ senderId: aiPlayer.id, shipType: 'Scout', locationId: buildSystem.id, count: 1 });
            return;
        }

        // Priority 1.5: Salvagers (Maintain at least 1 if debris exists or generally)
        const salvagerCount = myShips.filter(s => s.type === 'Salvager').length;
        if (salvagerCount < 1 && this._canAfford(resources, 'Salvager')) {
            this.engine.economyService.handleBuildRequest({ senderId: aiPlayer.id, shipType: 'Salvager', locationId: buildSystem.id, count: 1 });
            return;
        }

        // Priority 2: Expansion (Troop Transport)
        const transportCount = myShips.filter(s => s.type === 'TroopTransport').length;
        const combatShipCount = myShips.filter(s => ['Fighter', 'Frigate', 'Destroyer', 'Cruiser'].includes(s.type)).length;
        
        if (combatShipCount >= 3 && transportCount < 1 && this._canAfford(resources, 'TroopTransport')) {
             this.engine.economyService.handleBuildRequest({ senderId: aiPlayer.id, shipType: 'TroopTransport', locationId: buildSystem.id, count: 1 });
             return;
        }

        // Priority 3: Combat Fleet (Fighters)
        // Cap at 20 ships for now to prevent lag
        if (myShips.length < 20 && this._canAfford(resources, 'Fighter')) {
             this.engine.economyService.handleBuildRequest({ senderId: aiPlayer.id, shipType: 'Fighter', locationId: buildSystem.id, count: 1 });
        }
    }

    _canAfford(resources, shipType) {
        const cost = SHIP_DATA[shipType].cost;
        return resources.IO >= (cost.credits || 0) && 
               resources.scrap >= (cost.scrap || 0) && 
               resources.energy >= (cost.energy || 0);
    }

    _manageResearch(aiPlayer, techData) {
        if (aiPlayer.researchQueue.length > 0) return;

        const aiTechs = techData[aiPlayer.team];
        if (!aiTechs) return;

        const availableTechs = Object.keys(aiTechs).filter(techId => {
            const tech = aiTechs[techId];
            const isResearched = aiPlayer.researchedTechs.includes(techId);
            const dependenciesMet = tech.dependencies.every(dep => aiPlayer.researchedTechs.includes(dep));
            const canAfford = aiPlayer.resources.IO >= (tech.cost.IO || 0) && aiPlayer.resources.minerals >= (tech.cost.minerals || 0);
            return !isResearched && dependenciesMet && canAfford;
        });

        if (availableTechs.length > 0) {
            const techToResearch = availableTechs[Math.floor(Math.random() * availableTechs.length)];
            this.engine.economyService.handleResearchRequest({ senderId: aiPlayer.id, techId: techToResearch });
        }
    }

    _manageUnits(aiPlayer) {
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        
        // 1. Scouts
        const idleScouts = myShips.filter(s => s.type === 'Scout' && s.moveState === 'IDLE' && !s.scoutMission);
        idleScouts.forEach(scout => this._commandScout(aiPlayer, scout));

        // 2. Salvagers
        const idleSalvagers = myShips.filter(s => s.type === 'Salvager' && s.moveState === 'IDLE' && !s.salvageMission);
        idleSalvagers.forEach(salvager => this._commandSalvager(aiPlayer, salvager));

        // 3. Fleet Formation
        this._formFleets(aiPlayer, myShips);

        // 4. Fleet Movement / Attacks
        this._commandFleets(aiPlayer);
    }

    _commandSalvager(aiPlayer, salvager) {
        const currentSystem = this.engine.getCurrentSystem(salvager);

        if (!currentSystem) {
            // It's in deep space, recover it.
            console.warn(`[AIService] Salvager ${salvager.id} is idle in deep space at ${salvager.x},${salvager.y}`);
            const closestSystem = this.engine.getClosestSystem(salvager);
            if (closestSystem) {
                console.log(`[AIService] Recovering lost salvager ${salvager.id} to nearest system ${closestSystem.id}`);
                this.engine.moveShip(salvager.id, closestSystem.id);
            }
            return;
        }

        const allDebrisFields = this.engine.state.debrisFields;
        if (!allDebrisFields || allDebrisFields.length === 0) return;

        // Find systems AI has visibility of
        const visibleSystemIds = this.engine.state.systems
            .filter(s => s.visibility[aiPlayer.id] && s.visibility[aiPlayer.id] !== 'unexplored')
            .map(s => s.id);
        
        // Find debris in or near visible systems
        const reachableDebris = allDebrisFields.filter(debris => {
            return this.engine.state.systems.some(sys => {
                if (!visibleSystemIds.includes(sys.id)) return false;
                const dx = sys.x - debris.x;
                const dy = sys.y - debris.y;
                // A generous radius around the system to find nearby debris
                const searchRadius = this.engine.getSystemEffectiveRadius(sys) + 300; 
                return (dx * dx + dy * dy) < (searchRadius * searchRadius);
            });
        });

        if (reachableDebris.length === 0) return;

        let closestDebris = null;
        let minDist = Infinity;

        reachableDebris.forEach(debris => {
            const dx = debris.x - salvager.x;
            const dy = debris.y - salvager.y;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                closestDebris = debris;
            }
        });

        if (closestDebris) {
            console.log(`[AIService] Salvager ${salvager.id} targeting debris ${closestDebris.id}`);
            this.engine.movementService.handleSalvageMissionRequest({
                senderId: aiPlayer.id,
                shipId: salvager.id,
                targetDebrisId: closestDebris.id
            });
        }
    }

    _commandScout(aiPlayer, scout) {
        const currentSystem = this.engine.getCurrentSystem(scout);

        if (currentSystem) {
            const neighbors = currentSystem.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
            const unexplored = neighbors.filter(n => !n.visibility[aiPlayer.id] || n.visibility[aiPlayer.id] === 'unexplored');
            
            if (unexplored.length > 0) {
                const target = unexplored[Math.floor(Math.random() * unexplored.length)];
                console.log(`[AIService] Scout ${scout.id} exploring ${target.id}`);
                this.engine.movementService.handleScoutMissionRequest({ senderId: aiPlayer.id, shipId: scout.id, targetSystemId: target.id });
            } else {
                // Filter out the system we just came from to prevent ping-ponging
                let validNeighbors = neighbors;
                if (scout.lastSystemId && neighbors.length > 1) {
                    validNeighbors = neighbors.filter(n => n.id !== scout.lastSystemId);
                }
                const randomNeighbor = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
                if (randomNeighbor) {
                     console.log(`[AIService] Scout ${scout.id} moving to neighbor ${randomNeighbor.id}`);
                     this.engine.moveShip(scout.id, randomNeighbor.id);
                }
            }
        } else {
            console.warn(`[AIService] Scout ${scout.id} is idle in deep space at ${scout.x},${scout.y}`);
            const closestSystem = this.engine.getClosestSystem(scout);
            if (closestSystem) {
                console.log(`[AIService] Recovering lost scout ${scout.id} to nearest system ${closestSystem.id}`);
                this.engine.moveShip(scout.id, closestSystem.id);
            }
        }
    }

    _formFleets(aiPlayer, myShips) {
        const unassignedCombatShips = myShips.filter(s => !s.fleetId && ['Fighter', 'Frigate', 'Destroyer', 'Cruiser', 'TroopTransport'].includes(s.type) && s.moveState === 'IDLE');
        
        const shipsBySystem = {};
        unassignedCombatShips.forEach(ship => {
            const system = this.engine.getCurrentSystem(ship);
            if (system) {
                if (!shipsBySystem[system.id]) shipsBySystem[system.id] = [];
                shipsBySystem[system.id].push(ship);
            }
        });

        for (const [systemId, ships] of Object.entries(shipsBySystem)) {
            if (ships.length >= 3) {
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

    _commandFleets(aiPlayer) {
        if (!aiPlayer.fleets) return;

        aiPlayer.fleets.forEach(fleet => {
            // Ensure we only command ships that actually belong to this fleet (fix for ghost fleets)
            const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id) && s.fleetId === fleet.id);
            if (fleetShips.length === 0) return;
            
            const isIdle = fleetShips.every(s => s.moveState === 'IDLE');
            if (!isIdle) return;

            const currentSystemId = fleet.locationId;
            const currentSystem = this.engine.state.systems.find(s => s.id === currentSystemId);
            
            if (!currentSystem) {
                console.warn(`[AIService] Fleet ${fleet.id} has invalid locationId: ${currentSystemId}`);
                return;
            }

            // If in enemy system, stay (combat is automatic).
            if (currentSystem.owner && currentSystem.owner !== aiPlayer.id) return;

            // If there are planets to capture and we have a transport, stay.
            const hasTransport = fleetShips.some(s => s.type === 'TroopTransport');
            const hasUnownedPlanets = currentSystem.planets.some(p => p.owner !== aiPlayer.id);
            if (hasUnownedPlanets && hasTransport) return;

            const neighbors = currentSystem.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId));
            
            let target = null;

            // 1. Attack known enemy neighbors
            const enemyNeighbor = neighbors.find(n => n.owner && n.owner !== aiPlayer.id && n.visibility[aiPlayer.id] === 'explored');
            if (enemyNeighbor) {
                target = enemyNeighbor;
            } else {
                // 2. Expand to neutral neighbors if we have transport
                const neutralNeighbor = neighbors.find(n => !n.owner && n.visibility[aiPlayer.id] === 'explored');
                if (neutralNeighbor && hasTransport) {
                    target = neutralNeighbor;
                } else {
                    // 3. Patrol/Explore
                    // Filter out the system we just came from to prevent ping-ponging
                    let validNeighbors = neighbors;
                    const lastSystemId = fleetShips[0]?.lastSystemId;
                    if (lastSystemId && neighbors.length > 1) {
                        validNeighbors = neighbors.filter(n => n.id !== lastSystemId);
                    }
                    target = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
                }
            }

            if (target) {
                console.log(`[AIService] Fleet ${fleet.id} (at ${currentSystem.id}) moving to ${target.id}`);
                this.engine.fleetService.handleMoveFleetRequest({
                    senderId: aiPlayer.id,
                    fleetId: fleet.id,
                    targetSystemId: target.id
                });
            }
        });
    }
}