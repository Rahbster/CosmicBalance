export class MovementService {
    constructor(engine) {
        this.engine = engine;
    }

    update(dt) {
        const WARP_SPEED_FACTOR = 150; // pixels per second for a warp=1 ship
        const SUBLIGHT_SPEED_FACTOR = 10; // pixels per second for a sublight=1 ship

        this.engine.state.ships.forEach(ship => {
            if (ship.targetId) {
                const system = this.engine.state.systems.find(sys => sys.id === ship.targetId);
                const debris = !system ? this.engine.state.debrisFields.find(d => d.id === ship.targetId) : null;
                const target = system || debris;

                if (target) {
                    const dx = target.x - ship.x;
                    const dy = target.y - ship.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    // Use effective radius for systems to match location detection logic
                    const arrivalRadius = system ? this.engine.getSystemEffectiveRadius(system) : 10;

                    if (ship.isDeparting) {
                        this.engine.log(`[Movement] Ship ${ship.id.substring(0,5)} [DEPARTING] Pos: (${ship.x.toFixed(1)}, ${ship.y.toFixed(1)}) Dist: ${dist.toFixed(1)} Radius: ${arrivalRadius.toFixed(1)}`);
                        const moveSpeed = ship.warp * WARP_SPEED_FACTOR; // pixels per second
                        const moveDistance = moveSpeed * (dt / 1000);
                        ship.x += (dx / dist) * moveDistance;
                        ship.y += (dy / dist) * moveDistance;
                        delete ship.isDeparting; // It has now departed.
                    } else if (dist > arrivalRadius) { // If ship is in transit
                        this.engine.log(`[Movement] Ship ${ship.id.substring(0,5)} [TRANSIT] Pos: (${ship.x.toFixed(1)}, ${ship.y.toFixed(1)}) Dist: ${dist.toFixed(1)} Radius: ${arrivalRadius.toFixed(1)}`);
                        const moveSpeed = ship.warp * WARP_SPEED_FACTOR; // pixels per second
                        const moveDistance = moveSpeed * (dt / 1000);
                        const travelDistance = Math.min(moveDistance, dist - arrivalRadius);

                        if (travelDistance > 0) ship.x += (dx / dist) * travelDistance;
                        if (travelDistance > 0) ship.y += (dy / dist) * travelDistance;

                    } else { // Ship has arrived
                        this.engine.log(`[Movement] Ship ${ship.id.substring(0,5)} [ARRIVED] Pos: (${ship.x.toFixed(1)}, ${ship.y.toFixed(1)}) Dist: ${dist.toFixed(1)} Radius: ${arrivalRadius.toFixed(1)}`);
                        const arrivedAtSystem = system; // Only defined if target was a system
                        ship.targetId = null; // Stop moving for now

                        if (this.engine.isHost && arrivedAtSystem) {
                            // --- Handle Scout Mission Arrival ---
                            if (ship.scoutMission && arrivedAtSystem.id === ship.scoutMission.to) {
                                // Arrived at scout destination
                                const fromSystemId = ship.scoutMission.from;
    
                                // 1. Perform scout action
                                let wasDestroyed = false;
                                if (ship.type === 'Scout' && (!arrivedAtSystem.visibility[ship.owner] || arrivedAtSystem.visibility[ship.owner] === 'unexplored')) {
                                    // COUNTER-SCOUTING LOGIC
                                    const friendlyShipsInSystem = this.engine.state.ships.filter(s => s.owner !== ship.owner && this.engine._isShipInSystem(s, arrivedAtSystem));
                                    let detectionChance = 0;
                                    friendlyShipsInSystem.forEach(friendlyShip => {
                                        if (friendlyShip.patrolSystemId === arrivedAtSystem.id && friendlyShip.type === 'Scout') {
                                            detectionChance += 0.4;
                                        } else {
                                            detectionChance += 0.1;
                                        }
                                    });
                                    detectionChance = Math.min(1.0, detectionChance);
    
                                    if (Math.random() < detectionChance) {
                                        if (Math.random() < 0.5) {
                                            ship.hull = 0;
                                            wasDestroyed = true;
                                        }
                                    }
    
                                    if (!wasDestroyed) {
                                        arrivedAtSystem.visibility[ship.owner] = 'scouted';
                                        const enemyShips = this.engine.state.ships.filter(s => s.owner !== ship.owner && this.engine._isShipInSystem(s, arrivedAtSystem));
                                        let reportedCount = enemyShips.length;
                                        let reportedTypes = enemyShips.map(s => s.type);
                                        if (detectionChance > 0) {
                                            reportedCount = Math.max(0, Math.floor(enemyShips.length * (1 - detectionChance)));
                                            reportedTypes = [];
                                        }
                                        const report = { shipCount: reportedCount, shipTypes: reportedTypes };
                                        this.engine.broadcast({ type: 'GAME_SCOUT_REPORT', systemId: arrivedAtSystem.id, playerId: ship.owner, report: report });
                                        this.engine.broadcast({ type: 'GAME_REVEAL', systemId: arrivedAtSystem.id, playerId: ship.owner, visibility: 'scouted' });
                                    }
                                }
    
                                // 2. Check for return path
                                const canReturn = arrivedAtSystem.links.some(l => l.targetId === fromSystemId);
    
                                if (canReturn && !wasDestroyed) { // Don't return if destroyed
                                    this.moveShip(ship.id, fromSystemId);
                                } else {
                                    // Cannot return or was destroyed, mission ends here
                                    delete ship.scoutMission;
                                    this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, scoutMission: null, targetId: null });
                                }
                            } else if (ship.scoutMission && arrivedAtSystem.id === ship.scoutMission.from) {
                                // Arrived back home from scout mission
                                delete ship.scoutMission;
                                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, scoutMission: null, targetId: null });
                            } else if (ship.salvageMission && arrivedAtSystem.id === ship.salvageMission.from) {
                                // Arrived back home from salvage mission
                                delete ship.salvageMission;
                                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, salvageMission: null, targetId: null });
                            } else {
                                // --- Handle Standard Arrival ---
                                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, targetId: null });
                                // Standard visibility reveal for any ship
                                if (!arrivedAtSystem.visibility[ship.owner] || arrivedAtSystem.visibility[ship.owner] !== 'explored') {
                                    arrivedAtSystem.visibility[ship.owner] = 'explored';
                                    arrivedAtSystem.links.forEach(link => {
                                        const neighbor = this.engine.state.systems.find(p => p.id === link.targetId);
                                        if (neighbor && !neighbor.visibility[ship.owner]) neighbor.visibility[ship.owner] = 'scouted';
                                    });
                                    this.engine.broadcast({ type: 'GAME_REVEAL', systemId: arrivedAtSystem.id, playerId: ship.owner, visibility: 'explored', neighbors: arrivedAtSystem.links.map(l => l.targetId) });
                                }
                            }
                        } else { // Arrived at debris
                            // Just broadcast the arrival, the salvage logic will be handled below in the idle check
                            this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, targetId: null });
                        }
                    }
                }
            } else if (this.engine.isHost && ship.salvageMission) {
                // Ship is on a salvage mission and is idle. It's at the debris field.
                const targetDebris = this.engine.state.debrisFields.find(d => d.id === ship.salvageMission.to);
                if (!targetDebris) {
                    // Debris is gone, time to return home.
                    this.moveShip(ship.id, ship.salvageMission.from);
                }
            } else if (this.engine.isHost && ship.patrolSystemId) {
                                // Arrived at scout destination
                // --- New Patrol Logic (HOST ONLY) ---
                const system = this.engine.state.systems.find(sys => sys.id === ship.patrolSystemId);
                if (!system) {
                    // System doesn't exist, stop patrolling
                    delete ship.patrolSystemId;
                    delete ship.patrolTarget;
                    this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, patrolSystemId: null });
                    return;
                }

                // If ship has no patrol target or has reached it, find a new one
                if (!ship.patrolTarget || (Math.abs(ship.x - ship.patrolTarget.x) < 5 && Math.abs(ship.y - ship.patrolTarget.y) < 5)) {
                    const systemRadius = this.engine.getSystemEffectiveRadius(system) * 0.8; // Patrol within 80% of the system's effective radius
                    const angle = Math.random() * 2 * Math.PI;
                    const distance = Math.random() * systemRadius;
                    ship.patrolTarget = {
                        x: system.x + Math.cos(angle) * distance,
                        y: system.y + Math.sin(angle) * distance
                    };
                }

                // Move towards the patrol target
                const dx = ship.patrolTarget.x - ship.x;
                const dy = ship.patrolTarget.y - ship.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 1) { // Use sublight speed for patrol
                    const moveSpeed = ship.sublight * SUBLIGHT_SPEED_FACTOR * 0.5; // Patrol at half sublight speed
                    const moveDistance = moveSpeed * (dt / 1000);
                    const travelDistance = Math.min(moveDistance, dist);
                    if (travelDistance > 0) {
                        ship.x += (dx / dist) * travelDistance;
                        ship.y += (dy / dist) * travelDistance;
                    }
                }
            }
        });
    }

    moveShip(shipId, targetId) {
        const ship = this.engine.state.ships.find(s => s.id === shipId);
        if (ship) {
            // Clear the sticky system ID when a new move order is given
            if (ship.currentSystemId) {
                delete ship.currentSystemId;
            }

            const startSystem = this.engine.getCurrentSystem(ship);
            const targetObj = this.engine.state.systems.find(s => s.id === targetId) || this.engine.state.debrisFields.find(d => d.id === targetId);
            const startName = startSystem ? startSystem.name : 'Deep Space';
            const targetName = targetObj ? (targetObj.name || 'Debris') : targetId;
            this.engine.log(`[Move Request] Ship ${ship.id.substring(0,5)}: ${startName} -> ${targetName}. Pos: (${ship.x.toFixed(1)}, ${ship.y.toFixed(1)})`);

            ship.targetId = targetId;
            ship.isDeparting = true;
            this.engine.broadcast({ type: 'GAME_MOVE', shipId, targetId });
        }
    }

    moveShipToTarget(shipId, targetId) {
        const selectedShip = this.engine.state.ships.find(s => s.id === shipId);
        if (!selectedShip) return false;

        // Is the target a system?
        const targetSystem = this.engine.state.systems.find(s => s.id === targetId);
        if (targetSystem) {
            let originSystem = null;

            if (selectedShip.targetId) {
                // Ship is in transit. The origin for the *next* move is its current destination.
                originSystem = this.engine.state.systems.find(s => s.id === selectedShip.targetId);
            } else {
                // Ship is idle. The origin is the system it's currently in.
                originSystem = this.engine.getCurrentSystem(selectedShip);
            }

            // We need an origin system to check for valid links.
            if (originSystem && originSystem.links.some(l => l.targetId === targetId)) {
                this.moveShip(shipId, targetId);
                return true;
            }
            return false;
        }

        // Is the target debris?
        const targetDebris = this.engine.state.debrisFields.find(d => d.id === targetId);
        if (targetDebris && selectedShip.type === 'Salvager') {
            this.moveShip(shipId, targetId);
            return true;
        }

        return false;
    }

    requestScoutMission(shipId, targetSystemId) {
        const request = {
            type: 'GAME_REQUEST_SCOUT_MISSION',
            senderId: this.engine.getIdentity().guid,
            shipId: shipId,
            targetSystemId: targetSystemId
        };
        if (this.engine.isHost) this.handleScoutMissionRequest(request);
        else this.engine.broadcast(request);
    }

    handleScoutMissionRequest({ senderId, shipId, targetSystemId }) {
        if (!this.engine.isHost) return;
    
        const ship = this.engine.state.ships.find(s => s.id === shipId);
        if (!ship || ship.owner !== senderId || ship.type !== 'Scout') return;
    
        const currentSystem = this.engine.getCurrentSystem(ship);
        if (!currentSystem) {
            console.warn(`Scout mission request failed: Ship ${shipId} is not in a system.`);
            return;
        }
    
        // Check for valid link
        if (currentSystem.links.some(l => l.targetId === targetSystemId)) {
            ship.scoutMission = { from: currentSystem.id, to: targetSystemId };
            this.moveShip(shipId, targetSystemId); // This will set targetId and broadcast
            // Also broadcast the mission state. moveShip already broadcasts targetId.
            this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: shipId, scoutMission: ship.scoutMission });
        }
    }

    requestPatrol(shipId, systemId) {
        const request = {
            type: 'GAME_REQUEST_PATROL',
            senderId: this.engine.getIdentity().guid,
            shipId: shipId,
            systemId: systemId
        };
        if (this.engine.isHost) this.handlePatrolRequest(request);
        else this.engine.broadcast(request);
    }

    handlePatrolRequest({ senderId, shipId, systemId }) {
        if (!this.engine.isHost) return;

        const ship = this.engine.state.ships.find(s => s.id === shipId);
        const system = this.engine.state.systems.find(s => s.id === systemId);
        const player = this.engine.state.players.find(p => p.id === senderId);

        // Validation
        if (!ship || !system || !player || ship.owner !== senderId || system.owner !== senderId) {
            return;
        }

        // Set the patrol state on the ship
        ship.patrolSystemId = systemId;
        ship.targetId = null; // Clear any movement target
        ship.patrolTarget = null; // Clear any specific patrol point

        this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: shipId, patrolSystemId: systemId, targetId: null });
    }

    requestSalvageMission(shipId, targetDebrisId) {
        const request = {
            type: 'GAME_REQUEST_SALVAGE_MISSION',
            senderId: this.engine.getIdentity().guid,
            shipId: shipId,
            targetDebrisId: targetDebrisId
        };
        if (this.engine.isHost) this.handleSalvageMissionRequest(request);
        else this.engine.broadcast(request);
    }

    handleSalvageMissionRequest({ senderId, shipId, targetDebrisId }) {
        if (!this.engine.isHost) return;
        const ship = this.engine.state.ships.find(s => s.id === shipId);
        if (ship && ship.owner === senderId && ship.type === 'Salvager') {
            const currentSystem = this.engine.getCurrentSystem(ship);
            if (currentSystem) {
                ship.salvageMission = { from: currentSystem.id, to: targetDebrisId };
                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, salvageMission: ship.salvageMission });
            }
            this.moveShip(shipId, targetDebrisId);
        }
    }

    requestStopPatrol(shipId) {
        const request = {
            type: 'GAME_REQUEST_STOP_PATROL',
            senderId: this.engine.getIdentity().guid,
            shipId: shipId
        };
        if (this.engine.isHost) this.handleStopPatrolRequest(request);
        else this.engine.broadcast(request);
    }

    handleStopPatrolRequest({ senderId, shipId }) {
        if (!this.engine.isHost) return;
        const ship = this.engine.state.ships.find(s => s.id === shipId);
        if (ship && ship.owner === senderId) {
            delete ship.patrolSystemId;
            delete ship.patrolTarget;
            this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: shipId, patrolSystemId: null });
        }
    }
}
