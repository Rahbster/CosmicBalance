import { SHIP_DATA, PLANET_TYPES } from './GalaxyService.js';
import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class EconomyService {
    constructor(engine) {
        this.engine = engine;
        this.broadcastTimer = 0;
        this.broadcastInterval = 1000; // Broadcast updates every 1 second
    }

    runResourceGeneration(dt) {
        const timeFactor = dt / 1000 / 60; // Convert yield-per-minute to yield-per-frame
        const resourceRate = this.engine.state.settings?.resourceRate || 1.0;

        // Calculate income for each player
        this.engine.state.players.forEach(player => {
            if (player.isDead) return;
            let hasIncome = false;
            const income = { IO: 0, minerals: 0, energy: 0, scrap: 0 };

            // Calculate total income from all owned planets
            this.engine.state.systems.forEach(system => {
                system.planets.forEach(planet => {
                    if (planet.owner === player.id) {
                        const typeData = PLANET_TYPES[planet.type];
                        if (typeData && typeData.yields) {
                            for (const [resource, amount] of Object.entries(typeData.yields)) {
                                income[resource] = (income[resource] || 0) + amount;
                            }
                        }
                    }
                });
            });

            // Apply tech modifiers
            let energyModifier = 1.0;
            const techData = this.engine.techService.getTechData();
            if (techData) {
                player.researchedTechs.forEach(techId => {
                    const tech = techData[player.techBase]?.[techId];
                    tech?.effects?.forEach(effect => {
                        if (effect.type === 'ENERGY_MODIFIER') {
                            energyModifier *= effect.value;
                        }
                    });
                });
            }
            income.energy *= energyModifier;

            // Apply global resource rate multiplier
            Object.keys(income).forEach(key => {
                income[key] *= resourceRate;
            });

            // Apply income to player resources
            if (income.IO > 0) { 
                const amount = income.IO * timeFactor;
                player.resources.IO += amount; 
                player.totalResources = player.totalResources || { IO: 0, minerals: 0, energy: 0, scrap: 0 };
                player.totalResources.IO += amount;
                hasIncome = true; 
            }
            if (income.minerals > 0) { 
                const amount = income.minerals * timeFactor;
                player.resources.minerals = (player.resources.minerals || 0) + amount; 
                player.totalResources = player.totalResources || { IO: 0, minerals: 0, energy: 0, scrap: 0 };
                player.totalResources.minerals += amount;
                hasIncome = true; 
            }
            if (income.energy > 0) { 
                const amount = income.energy * timeFactor;
                player.resources.energy = (player.resources.energy || 0) + amount; 
                player.totalResources = player.totalResources || { IO: 0, minerals: 0, energy: 0, scrap: 0 };
                player.totalResources.energy += amount;
                hasIncome = true; 
            }
            if (income.scrap > 0) { 
                const amount = income.scrap * timeFactor;
                player.resources.scrap += amount; 
                player.totalResources = player.totalResources || { IO: 0, minerals: 0, energy: 0, scrap: 0 };
                player.totalResources.scrap += amount;
                hasIncome = true; 
            }
            // Broadcasting is now handled periodically
        });

        // Apply infinite resources if debug mode is on
        if (this.engine.aiDebugMode) {
            this.engine.state.players.filter(p => p.isAI).forEach(p => {
                p.resources.IO = Math.max(p.resources.IO, 10000);
                p.resources.minerals = Math.max(p.resources.minerals, 10000);
                p.resources.energy = Math.max(p.resources.energy, 10000);
                p.resources.scrap = Math.max(p.resources.scrap, 10000);
            });
        }

        // Debris collection
        const collectedDebrisIds = [];
        this.engine.state.ships.filter(s => s.type === 'Salvager').forEach(ship => { // Only salvagers can collect
            this.engine.state.debrisFields.forEach(debris => {
                if (collectedDebrisIds.includes(debris.id)) return;

                const dx = debris.x - ship.x;
                const dy = debris.y - ship.y;
                if (dx * dx + dy * dy < 400) { // 20px collection radius
                    const player = this.engine.state.players.find(p => p.id === ship.owner);
                    if (player) {
                        player.resources.scrap += debris.resources.scrap;
                        player.totalResources = player.totalResources || { IO: 0, minerals: 0, energy: 0, scrap: 0 };
                        player.totalResources.scrap += debris.resources.scrap;
                        this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: player.id, resources: player.resources });
                        collectedDebrisIds.push(debris.id);
                    }
                }
            });
        });

        this.engine.state.debrisFields = this.engine.state.debrisFields.filter(d => !collectedDebrisIds.includes(d.id));
        if (collectedDebrisIds.length > 0) {
            this.engine.broadcast({ type: 'GAME_DEBRIS_REMOVED', debrisIds: collectedDebrisIds });
        }
    }

    runBuildQueues(dt) {
        const locations = [...this.engine.state.systems, ...this.engine.state.ships.filter(s => s.isStation)];
        locations.forEach(location => {
            if (location.buildQueue && location.buildQueue.length > 0) {
                const firstItem = location.buildQueue[0];
                const owner = this.engine.state.players.find(p => p.id === firstItem.ownerId);
                const shipData = SHIP_DATA[firstItem.shipType];
                const shipCost = shipData.cost;

                // 1. Start the build if not started
                if (firstItem.startTime === undefined) {
                    // Check for resources
                    if (owner && owner.resources.IO >= (shipCost.credits || 0) && owner.resources.scrap >= (shipCost.scrap || 0) && owner.resources.energy >= (shipCost.energy || 0)) {
                        // Deduct resources and start the timer
                        owner.resources.IO -= (shipCost.credits || 0);
                        owner.resources.scrap -= (shipCost.scrap || 0);
                        owner.resources.energy -= (shipCost.energy || 0);
                        firstItem.startTime = this.engine.lastTime;
                        
                        // Spawn the ship immediately in "Building" state
                        let spawnSystem = null;
                        if (location.isStation) {
                            spawnSystem = this.engine.spatialService.getCurrentSystem(location);
                        } else {
                            spawnSystem = location;
                        }
                        const ship = this.engine._spawnShip(owner, firstItem.shipType, { x: location.x, y: location.y }, spawnSystem, { isBuilding: true, hull: 1 });
                        firstItem.shipId = ship.id;

                        this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: owner.id, resources: owner.resources });
                        // Broadcast that the queue has changed (item started)
                        this.engine.broadcast({ type: 'GAME_BUILD_QUEUE_UPDATE', locationId: location.id, queue: location.buildQueue });
                    }
                }
                
                // 2. Process active build
                if (firstItem.startTime !== undefined) {
                    // Rush construction if rich (Money talks)
                    let speedMultiplier = 1;
                    if (owner.resources.IO > 1000000) speedMultiplier = 5;
                    else if (owner.resources.IO > 500000) speedMultiplier = 2;

                    // Damaged stations are less effective at building
                    if (location.isStation) {
                        const healthRatio = location.maxHull > 0 ? location.hull / location.maxHull : 0;
                        speedMultiplier *= Math.max(0.1, healthRatio);
                    }

                    firstItem.remainingTime -= (dt * speedMultiplier);

                    // Update visual progress of the building ship
                    const ship = this.engine.state.ships.find(s => s.id === firstItem.shipId);
                    if (ship) {
                        const totalTime = shipData.buildTime;
                        const progress = Math.max(0, 1 - (firstItem.remainingTime / totalTime));
                        ship.hull = Math.max(1, ship.maxHull * progress);
                    }

                    if (firstItem.remainingTime <= 0) {
                        // Build complete
                        if (ship) {
                            delete ship.isBuilding;
                            ship.hull = ship.maxHull;
                            ship.shield = ship.maxShield;
                            this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, isBuilding: false, hull: ship.hull, shield: ship.shield });
                        } else {
                            // Fallback if ship was destroyed or lost during build (unlikely)
                            let spawnSystem = location.isStation ? this.engine.spatialService.getCurrentSystem(location) : location;
                            this.engine._spawnShip(owner, firstItem.shipType, { x: location.x, y: location.y }, spawnSystem);
                        }
                        
                        location.buildQueue.shift();
                        // Broadcast that the queue has changed (item finished)
                        this.engine.broadcast({ type: 'GAME_BUILD_QUEUE_UPDATE', locationId: location.id, queue: location.buildQueue });
                    }
                }
            }
        });
    }

    runResearch(dt) {
        this.engine.state.players.forEach(player => {
            if (player.researchQueue.length > 0) {
                const researchItem = player.researchQueue[0];
                researchItem.remainingTime -= dt;

                if (researchItem.remainingTime <= 0) {
                    // Research complete
                    player.researchedTechs.push(researchItem.techId);
                    player.researchQueue.shift();

                    this.engine.broadcast({ type: 'GAME_TECH_RESEARCHED', playerId: player.id, techId: researchItem.techId });
                }
                // Broadcasting is now handled periodically
            }
        });
    }

    runPeriodicBroadcasts(dt) {
        this.broadcastTimer += dt;
        if (this.broadcastTimer >= this.broadcastInterval) {
            this.broadcastTimer = 0;

            this.engine.state.players.forEach(player => {
                // This single message updates both resources and research queue for the UI
                this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: player.id, resources: player.resources, researchQueue: player.researchQueue });
            });

            // Broadcast updates for ships that are repairing or building to show progress bars on clients
            const activeShips = this.engine.state.ships.filter(s => s.isRepairing || s.isBuilding);
            activeShips.forEach(s => {
                 this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: s.id, hull: s.hull });
            });
        }
    }

    runRepairJobs(dt) {
        // Group repairs by location to enforce sequential repair queue
        const repairsByLocation = {};
        
        this.engine.state.ships.forEach(ship => {
            if (ship.isRepairing) {
                if (ship.isBuilding) return; // Cannot repair while under construction

                const system = this.engine.spatialService.getCurrentSystem(ship);
                const locId = system ? system.id : 'deep_space';
                if (!repairsByLocation[locId]) repairsByLocation[locId] = [];
                repairsByLocation[locId].push(ship);
            }
        });

        Object.entries(repairsByLocation).forEach(([locId, ships]) => {
            // Only process the first ship in the queue for this location
            const ship = ships[0];
            
            if (ship.repairTimer > 0) {
                let efficiency = 1.0;
                
                // If repairing at a location with a station, use station's health for efficiency
                if (locId !== 'deep_space') {
                    const station = this.engine.state.ships.find(s => 
                        s.isStation && s.owner === ship.owner && s.currentSystemId === locId
                    );
                    if (station) {
                        const healthRatio = station.maxHull > 0 ? station.hull / station.maxHull : 0;
                        efficiency = Math.max(0.1, healthRatio);
                    }
                }

                ship.repairTimer -= (dt * efficiency);

                // Visual Progress: Incrementally repair hull
                if (ship.initialHull === undefined) ship.initialHull = ship.hull;
                const totalDuration = ship.totalRepairTime || 15000;
                const progress = 1 - (ship.repairTimer / totalDuration);
                const targetHull = ship.initialHull + (ship.maxHull - ship.initialHull) * progress;
                ship.hull = Math.min(ship.maxHull, targetHull);

                if (ship.repairTimer <= 0) {
                    const ownerPlayer = this.engine.state.players.find(p => p.id === ship.owner);
                    const baseData = { ...SHIP_DATA[ship.type] };
                    const modifiedData = this.engine.techService.applyTechToShipData(baseData, ownerPlayer);

                    // Apply the upgrade/repair completion
                    ship.maxHull = Math.round(modifiedData.maxHull);
                    ship.hull = ship.maxHull; // Ensure full repair
                    ship.maxShield = Math.round(modifiedData.maxShield);
                    ship.shield = ship.maxShield; // Restore shields
                    ship.damage = modifiedData.damage;
                    ship.sublight = modifiedData.sublight;
                    ship.warp = modifiedData.warp;
                    ship.vintageTechs = [...ownerPlayer.researchedTechs];
                    
                    delete ship.isRepairing;
                    delete ship.repairTimer;
                    delete ship.totalRepairTime;
                    delete ship.initialHull;

                    // Broadcast the full update
                    this.engine.broadcast({ 
                        type: 'GAME_SHIP_UPDATE', 
                        shipId: ship.id, 
                        hull: ship.hull,
                        maxHull: ship.maxHull,
                        shield: ship.shield,
                        maxShield: ship.maxShield,
                        damage: ship.damage,
                        sublight: ship.sublight,
                        warp: ship.warp,
                        vintageTechs: ship.vintageTechs,
                        isRepairing: false
                    });
                }
            }
        });
    }

    requestBuild(shipType, count = 1) {
        const selectedLocationId = this.engine.selectionManager.selectedLocationId;
        if (!selectedLocationId) {
            console.warn("No location selected to build from.");
            return;
        }
        
        const player = this.engine.getLocalPlayer();
        let location = this.engine.state.systems.find(sys => sys.id === selectedLocationId);
        let builder = location;

        if (!location) {
            location = this.engine.state.ships.find(s => s.id === selectedLocationId && s.isStation);
            builder = location;
        }

        if (location && !location.isStation) { // It's a system
            const myStationInSystem = this.engine.state.ships.find(s => 
                s.owner === player.id && 
                s.isStation &&
                this.engine.spatialService.isShipInSystem(s, location)
            );
            if (myStationInSystem) {
                builder = myStationInSystem;
            }
        }

        if (!builder || !player || builder.owner !== player.id) {
            console.warn("You do not own this location or it cannot build.");
            return;
        }

        const buildRequest = {
            type: 'GAME_REQUEST_BUILD',
            shipType: shipType,
            locationId: builder.id, // Use the builder's ID
            senderId: this.engine.getIdentity().guid,
            count: count,
        };

        if (this.engine.isHost) {
            this.handleBuildRequest(buildRequest);
        } else {
            this.engine.broadcast(buildRequest);
        }
    }

    handleBuildRequest({ senderId, shipType, locationId, count }) {
        if (!this.engine.isHost) return;

        const player = this.engine.state.players.find(p => p.id === senderId);
        let location = this.engine.state.systems.find(sys => sys.id === locationId);
        let locationType = 'Planet';
        if (!location) {
            location = this.engine.state.ships.find(s => s.id === locationId && s.isStation);
            locationType = 'SpaceStation';
        }

        const shipData = SHIP_DATA[shipType];

        // Check if the ship type requires a tech unlock
        if (shipData.requiresTech && !player.researchedTechs.includes(shipData.requiresTech)) {
            this.engine.loggingService.log(LOG_CATEGORIES.ECONOMY, LOG_LEVELS.WARNING, `Player ${senderId} cannot build ${shipType}, requires tech: ${shipData.requiresTech}`);
            this.engine.broadcast({
                type: 'GAME_TOAST',
                playerId: senderId,
                message: `Cannot build ${shipType}. Requires tech: ${shipData.requiresTech}`,
                toastType: 'error'
            });
            return;
        }

        // Check ownership or access
        let hasAccess = false;
        if (location) {
            if (location.owner === player.id) {
                hasAccess = true;
            } else if (locationType === 'Planet' && location.planets) {
                // Allow if player owns any planet in the system
                hasAccess = location.planets.some(p => p.owner === player.id);
            }
        }

        if (player && location && shipData && hasAccess) {
            const canBeBuilt = locationType === 'Planet' ? shipData.builtBy.includes('Planet')
                               : (SHIP_DATA[location.type]?.buildCapabilities?.includes(shipType));

            if (!canBeBuilt) {
                this.engine.loggingService.log(LOG_CATEGORIES.ECONOMY, LOG_LEVELS.WARNING, `${location.name || location.type} cannot build ${shipType}.`);
                this.engine.broadcast({
                    type: 'GAME_TOAST',
                    playerId: senderId,
                    message: `${location.name || location.type} cannot build ${shipType}.`,
                    toastType: 'error'
                });
                return;
            }

            for (let i = 0; i < count; i++) {
                location.buildQueue.push({
                    id: `build-${crypto.randomUUID()}`,
                    shipType: shipType,
                    remainingTime: shipData.buildTime,
                    ownerId: player.id
                });
            }
            this.engine.broadcast({ type: 'GAME_BUILD_QUEUE_UPDATE', locationId: location.id, queue: location.buildQueue });
            this.engine.broadcast({
                type: 'GAME_TOAST',
                playerId: senderId,
                message: `Queued ${count}x ${shipType}.`,
                toastType: 'success'
            });
        }
    }

    requestCancelBuild(locationId, itemId) {
        const request = {
            type: 'GAME_REQUEST_CANCEL_BUILD',
            senderId: this.engine.getIdentity().guid,
            locationId,
            itemId
        };
        if (this.engine.isHost) {
            this.handleCancelBuildRequest(request);
        } else {
            this.engine.broadcast(request);
        }
    }

    handleCancelBuildRequest({ senderId, locationId, itemId }) {
        if (!this.engine.isHost) return;

        let location = this.engine.state.systems.find(sys => sys.id === locationId);
        if (!location) {
            location = this.engine.state.ships.find(s => s.id === locationId && s.isStation);
        }

        if (!location || !location.buildQueue || location.owner !== senderId) {
            return;
        }

        const itemIndex = location.buildQueue.findIndex(item => item.id === itemId);
        if (itemIndex > -1) {
            const item = location.buildQueue[itemIndex];
            
            // If the item had started (resources were spent), refund them.
            if (item.startTime !== undefined) {
                const player = this.engine.state.players.find(p => p.id === item.ownerId);
                const shipCost = SHIP_DATA[item.shipType].cost;
                if (player && shipCost) {
                    player.resources.IO += (shipCost.credits || 0);
                    player.resources.scrap += (shipCost.scrap || 0);
                    player.resources.energy += (shipCost.energy || 0);
                    this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: player.id, resources: player.resources });
                }
            }

            location.buildQueue.splice(itemIndex, 1);
            this.engine.broadcast({ type: 'GAME_BUILD_QUEUE_UPDATE', locationId: location.id, queue: location.buildQueue });
        }
    }

    async requestResearch(techId) {
        const researchRequest = {
            type: 'GAME_REQUEST_RESEARCH',
            techId: techId,
            senderId: this.engine.getIdentity().guid
        };

        if (this.engine.isHost) this.handleResearchRequest(researchRequest);
        else this.engine.broadcast(researchRequest);
    }

    handleResearchRequest({ senderId, techId }) {
        if (!this.engine.isHost) return;

        const player = this.engine.state.players.find(p => p.id === senderId);
        if (!player) return;

        const techData = this.engine.techService.getTechData()?.[player.techBase];
        const tech = techData ? techData[techId] : null;

        if (tech) {
            // Check cost
            if (player.resources.IO >= (tech.cost.IO || 0) && player.resources.minerals >= (tech.cost.minerals || 0)) {
                player.resources.IO -= (tech.cost.IO || 0);
                player.resources.minerals -= (tech.cost.minerals || 0);
                
                player.researchQueue.push({
                    techId: techId,
                    totalTime: tech.researchTime,
                    remainingTime: tech.researchTime
                });

                this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: player.id, resources: player.resources, researchQueue: player.researchQueue });
            }
        }
    }

    requestRepairShip(shipId) {
        const request = {
            type: 'GAME_REQUEST_REPAIR_SHIP',
            senderId: this.engine.getIdentity().guid,
            shipId: shipId
        };
        if (this.engine.isHost) this.handleRepairShipRequest(request);
        else this.engine.broadcast(request);
    }

    handleRepairShipRequest({ senderId, shipId }) {
        if (!this.engine.isHost) return;

        const player = this.engine.state.players.find(p => p.id === senderId);
        const ship = this.engine.state.ships.find(s => s.id === shipId);

        if (!player || !ship || ship.owner !== senderId || ship.isRepairing) {
            this.engine.loggingService.log(LOG_CATEGORIES.ECONOMY, LOG_LEVELS.WARNING, `[Repair] Invalid request for ship ${shipId}. Owner: ${ship?.owner}, IsRepairing: ${ship?.isRepairing}`);
            return;
        }

        if (ship.isBuilding) {
            this.engine.loggingService.log(LOG_CATEGORIES.ECONOMY, LOG_LEVELS.WARNING, `[Repair] Cannot repair ship ${shipId} while it is under construction.`);
            return;
        }

        const needsRepair = ship.hull < ship.maxHull;
        const canUpgrade = player.researchedTechs.length > (ship.vintageTechs?.length || 0);

        const repairCost = needsRepair ? (ship.maxHull - ship.hull) * 0.5 : 0; // Scrap
        const upgradeCost = canUpgrade ? 100 : 0; // IO

        if (player.resources.scrap >= repairCost && player.resources.IO >= upgradeCost) {
            player.resources.scrap -= repairCost;
            player.resources.IO -= upgradeCost;
            
            ship.isRepairing = true;
            ship.repairTimer = 15000; // 15 seconds for any service
            ship.totalRepairTime = 15000;
            ship.initialHull = ship.hull; // Store initial hull for progress calculation
            
            this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: player.id, resources: player.resources });
            this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, isRepairing: true, repairTimer: 15000, totalRepairTime: 15000 });
        } else {
            this.engine.loggingService.log(LOG_CATEGORIES.ECONOMY, LOG_LEVELS.WARNING, `[Repair] Insufficient resources for ${shipId}. Scrap: ${player.resources.scrap}/${repairCost}, IO: ${player.resources.IO}/${upgradeCost}`);
            this.engine.broadcast({
                type: 'GAME_TOAST',
                playerId: senderId,
                message: `Insufficient resources. Need ${Math.ceil(repairCost)} Scrap, ${upgradeCost} IO.`,
                toastType: 'error'
            });
        }
    }
}
