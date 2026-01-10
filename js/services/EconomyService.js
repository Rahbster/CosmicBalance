import { SHIP_DATA, PLANET_TYPES } from './GalaxyService.js';

export class EconomyService {
    constructor(engine) {
        this.engine = engine;
        this.broadcastTimer = 0;
        this.broadcastInterval = 1000; // Broadcast updates every 1 second
    }

    runResourceGeneration(dt) {
        const timeFactor = dt / 1000 / 60; // Convert yield-per-minute to yield-per-frame

        // Calculate income for each player
        this.engine.state.players.forEach(player => {
            let hasIncome = false;
            const income = { IO: 0, minerals: 0, food: 0, energy: 0, scrap: 0 };

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
            if (this.engine._techData) {
                player.researchedTechs.forEach(techId => {
                    const tech = this.engine._techData[player.team]?.[techId];
                    tech?.effects?.forEach(effect => {
                        if (effect.type === 'ENERGY_MODIFIER') {
                            energyModifier *= effect.value;
                        }
                    });
                });
            }
            income.energy *= energyModifier;

            // Apply income to player resources
            if (income.IO > 0) { player.resources.IO += income.IO * timeFactor; hasIncome = true; }
            if (income.minerals > 0) { player.resources.minerals = (player.resources.minerals || 0) + income.minerals * timeFactor; hasIncome = true; }
            if (income.food > 0) { player.resources.food += income.food * timeFactor; hasIncome = true; }
            if (income.energy > 0) { player.resources.energy = (player.resources.energy || 0) + income.energy * timeFactor; hasIncome = true; }
            if (income.scrap > 0) { player.resources.scrap += income.scrap * timeFactor; hasIncome = true; }
            // Broadcasting is now handled periodically
        });

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

                // Check if we have started this item's timer
                if (firstItem.startTime === undefined) {
                    // Check for resources
                    if (owner && owner.resources.IO >= (shipCost.credits || 0) && owner.resources.scrap >= (shipCost.scrap || 0) && owner.resources.energy >= (shipCost.energy || 0)) {
                        // Deduct resources and start the timer
                        owner.resources.IO -= (shipCost.credits || 0);
                        owner.resources.scrap -= (shipCost.scrap || 0);
                        owner.resources.energy -= (shipCost.energy || 0);
                        firstItem.startTime = this.engine.lastTime;
                        this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: owner.id, resources: owner.resources });
                        // Broadcast that the queue has changed (item started)
                        this.engine.broadcast({ type: 'GAME_BUILD_QUEUE_UPDATE', locationId: location.id, queue: location.buildQueue });
                    }
                }
                // If timer has started, process it
                if (firstItem.startTime !== undefined) {
                    firstItem.remainingTime -= dt;
                    if (firstItem.remainingTime <= 0) {
                        // Build complete
                        this.engine._spawnShip(owner, firstItem.shipType, { x: location.x, y: location.y });
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
        }
    }

    runRepairJobs(dt) {
        this.engine.state.ships.forEach(ship => {
            if (ship.isRepairing && ship.repairTimer > 0) {
                ship.repairTimer -= dt;

                if (ship.repairTimer <= 0) {
                    const ownerPlayer = this.engine.state.players.find(p => p.id === ship.owner);
                    const baseData = { ...SHIP_DATA[ship.type] };
                    const modifiedData = this.engine._applyTechToShipData(baseData, ownerPlayer);

                    // Apply the upgrade/repair
                    ship.maxHull = Math.round(modifiedData.maxHull);
                    ship.hull = ship.maxHull; // Full repair
                    ship.maxShield = Math.round(modifiedData.maxShield);
                    ship.shield = ship.maxShield; // Also restore shields
                    ship.damage = modifiedData.damage;
                    ship.sublight = modifiedData.sublight;
                    ship.warp = modifiedData.warp;
                    ship.vintageTechs = [...ownerPlayer.researchedTechs];
                    
                    delete ship.isRepairing;
                    delete ship.repairTimer;

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
                        isRepairing: false // Explicitly set to false to trigger deletion on client
                    });
                }
            }
        });
    }

    requestBuild(shipType, count = 1) {
        if (!this.engine.selectedLocationId) {
            console.warn("No location selected to build from.");
            return;
        }
        
        const player = this.engine.getLocalPlayer();
        let location = this.engine.state.systems.find(sys => sys.id === this.engine.selectedLocationId);
        let builder = location;

        if (!location) {
            location = this.engine.state.ships.find(s => s.id === this.engine.selectedLocationId && s.isStation);
            builder = location;
        }

        if (location && !location.isStation) { // It's a system
            const myStationInSystem = this.engine.state.ships.find(s => 
                s.owner === player.id && 
                s.isStation &&
                this.engine._isShipInSystem(s, location)
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
            console.log(`Player ${senderId} cannot build ${shipType}, requires tech: ${shipData.requiresTech}`);
            this.engine.broadcast({
                type: 'GAME_TOAST',
                playerId: senderId,
                message: `Cannot build ${shipType}. Requires tech: ${shipData.requiresTech}`,
                toastType: 'error'
            });
            return;
        }

        if (player && location && shipData && location.owner === player.id) {
            const canBeBuilt = locationType === 'Planet' ? shipData.builtBy.includes('Planet')
                               : (SHIP_DATA[location.type]?.buildCapabilities?.includes(shipType));

            if (!canBeBuilt) {
                console.log(`${location.name || location.type} cannot build ${shipType}.`);
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

        const techData = this.engine._techData[player.team];
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
            
            this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: player.id, resources: player.resources });
            this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, isRepairing: true });
        }
    }
}
