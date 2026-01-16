import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class MovementService {
    constructor(engine) {
        this.engine = engine;
    }

    update(dt) {
        // Base speeds are halved so that 100% setting = 50% of original speed.
        // Original: Warp 150, Sublight 10. New Base: Warp 75, Sublight 5.
        const speedMultiplier = (this.engine.state.settings?.shipSpeedRate || 1.0);
        const WARP_SPEED_FACTOR = 75 * speedMultiplier;
        const SUBLIGHT_SPEED_FACTOR = 5 * speedMultiplier;

        const shipsToUpdate = this.engine.state.ships.filter(s => s.targetId || s.arrivalPoint || (this.engine.isHost && s.patrolSystemId));
        const fleetSpeeds = {}; // Cache for fleet speeds

        shipsToUpdate.forEach(ship => {
            let warpSpeed = ship.warp;
            let sublightSpeed = ship.sublight;

            // If part of a moving fleet, use the fleet's slowest speed.
            if (ship.fleetId && (ship.targetId || ship.arrivalPoint)) {
                if (!fleetSpeeds[ship.fleetId]) {
                    // Calculate and cache the fleet's speed
                    const fleetShips = this.engine.state.ships.filter(s => s.fleetId === ship.fleetId);
                    const minWarp = Math.min(...fleetShips.map(s => s.warp || 0));
                    const minSublight = Math.min(...fleetShips.map(s => s.sublight || 0));
                    fleetSpeeds[ship.fleetId] = { warp: minWarp, sublight: minSublight };
                }
                warpSpeed = fleetSpeeds[ship.fleetId].warp;
                sublightSpeed = fleetSpeeds[ship.fleetId].sublight;
            }

            this._updateShipMovement(ship, dt, WARP_SPEED_FACTOR, SUBLIGHT_SPEED_FACTOR, warpSpeed, sublightSpeed);
        });

        // Handle Orbiting for Idle Ships
        this.engine.state.ships.forEach(ship => {
            if (ship.moveState === SHIP_STATE.IDLE && ship.currentSystemId && !ship.isStation && !ship.targetId && !ship.arrivalPoint && !ship.patrolSystemId) {
                this._updateShipOrbit(ship, dt);
            }
        });
    }

    _updateShipMovement(ship, dt, WARP_SPEED_FACTOR, SUBLIGHT_SPEED_FACTOR, warpSpeed, sublightSpeed) {
        if (ship.targetId) {
            const system = this.engine.state.systems.find(sys => sys.id === ship.targetId);
            const debris = !system ? this.engine.state.debrisFields.find(d => d.id === ship.targetId) : null;
            const target = system || debris;

            if (target) {
                const dx = target.x - ship.x;
                const dy = target.y - ship.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // Use effective radius for systems to match location detection logic
                const effectiveRadius = system ? this.engine.spatialService.getSystemEffectiveRadius(system) : 10;
                // Increased buffer to 15 to ensure we are well inside the system radius
                const arrivalRadius = system ? Math.min(effectiveRadius - 15, system.r + 50) : 10;

                if (dist > arrivalRadius + 1) { // If ship is in transit (Added +1 tolerance to prevent floating point stuck state)
                    if (ship.isDeparting) {
                        this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.INFO, `${ship.type} ${ship.id} departing to ${ship.targetId}. Dist: ${dist.toFixed(1)} ArrivalRadius: ${arrivalRadius.toFixed(1)}`);
                        delete ship.isDeparting;
                    }
                    const moveSpeed = warpSpeed * WARP_SPEED_FACTOR;
                    const moveDistance = moveSpeed * (dt / 1000);
                    const travelDistance = dist > arrivalRadius ? Math.min(moveDistance, dist - arrivalRadius) : moveDistance;

                    if (travelDistance > 0 && dist > 0) {
                        ship.x += (dx / dist) * travelDistance;
                        ship.y += (dy / dist) * travelDistance;
                        // Trace log for movement details
                        this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.TRACE, `Ship ${ship.id} WARP. Pos: (${ship.x.toFixed(1)}, ${ship.y.toFixed(1)}) Dist: ${dist.toFixed(1)}`);
                    }
                } else { // Ship has arrived at the system's edge
                    if (ship.isDeparting) delete ship.isDeparting; // Clear flag if we arrived instantly
                    this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.INFO, `${ship.type} ${ship.id} arrived at edge of ${ship.targetId}`);
                    const arrivedAtSystem = system;
                    ship.targetId = null; // Stop warping

                    if (arrivedAtSystem) {
                        ship.currentSystemId = arrivedAtSystem.id; // Explicitly set current system on arrival
                    }

                    if (!ship.arrivalPoint) ship.moveState = SHIP_STATE.IDLE; // If no sublight destination, we are done.

                    if (this.engine.isHost && arrivedAtSystem) {
                        arrivedAtSystem.heat = (arrivedAtSystem.heat || 0) + 20; // Arrival signature
                        // Update fleet location if this ship belongs to a fleet
                        if (ship.fleetId) {
                            const player = this.engine.state.players.find(p => p.id === ship.owner);
                            const fleet = player?.fleets.find(f => f.id === ship.fleetId);
                            if (fleet) {
                                if (fleet.locationId !== arrivedAtSystem.id) {
                                    this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.INFO, `Fleet ${fleet.id} location updated from ${fleet.locationId} to ${arrivedAtSystem.id}`);
                                    fleet.locationId = arrivedAtSystem.id;
                                }
                            } else {
                                this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.WARNING, `Fleet ${ship.fleetId} not found for ship ${ship.id} (Owner: ${ship.owner})`);
                            }
                        }

                        // --- Handle Multi-Hop Navigation ---
                        if (ship.navigationPath && ship.navigationPath.length > 0) {
                            const nextSystemId = ship.navigationPath.shift();
                            this.moveShip(ship.id, nextSystemId);
                            // We must return here to prevent the "Standard Arrival" logic below from firing,
                            // which would broadcast an IDLE state and cancel the move we just started.
                            return;
                        }
                        // --- Handle Scout Mission Arrival ---
                        if (ship.scoutMission && arrivedAtSystem.id === ship.scoutMission.to) {
                            // Arrived at scout destination
                            const fromSystemId = ship.scoutMission.from;

                            // 1. Perform scout action
                            let wasDestroyed = false;
                            if (ship.type === 'Scout' && arrivedAtSystem.visibility[ship.owner] !== 'explored') {
                                // COUNTER-SCOUTING LOGIC
                                const friendlyShipsInSystem = this.engine.state.ships.filter(s => s.owner !== ship.owner && this.engine.spatialService.isShipInSystem(s, arrivedAtSystem));
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
                                    const enemyShips = this.engine.state.ships.filter(s => s.owner !== ship.owner && this.engine.spatialService.isShipInSystem(s, arrivedAtSystem));
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
                                    this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, scoutMission: null, targetId: null, moveState: SHIP_STATE.IDLE, currentSystemId: ship.currentSystemId });
                            }
                        } else if (ship.scoutMission && arrivedAtSystem.id === ship.scoutMission.from) {
                            // Arrived back home from scout mission
                            delete ship.scoutMission;
                                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, scoutMission: null, targetId: null, moveState: SHIP_STATE.IDLE });
                        } else if (ship.salvageMission && arrivedAtSystem.id === ship.salvageMission.from) {
                            // Arrived back home from salvage mission
                            delete ship.salvageMission;
                                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, salvageMission: null, targetId: null, moveState: SHIP_STATE.IDLE });
                        } else {
                            // --- Handle Standard Arrival ---
                                this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, targetId: null, moveState: SHIP_STATE.IDLE, currentSystemId: ship.currentSystemId });
                            // Standard visibility reveal for any ship
                            if (!arrivedAtSystem.visibility[ship.owner] || arrivedAtSystem.visibility[ship.owner] !== 'explored') {
                                arrivedAtSystem.visibility[ship.owner] = 'explored';
                                this.engine.broadcast({ type: 'GAME_REVEAL', systemId: arrivedAtSystem.id, playerId: ship.owner, visibility: 'explored' });
                            }
                        }
                    } else { // Arrived at debris
                        // Just broadcast the arrival, the salvage logic will be handled below in the idle check
                        this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, targetId: null, moveState: SHIP_STATE.IDLE, currentSystemId: null });
                    }
                }
            }
        } else if (ship.arrivalPoint) {
            // Ship has arrived at the system edge and is now moving to its final point with sublight engines
            const dx = ship.arrivalPoint.x - ship.x;
            const dy = ship.arrivalPoint.y - ship.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Increased snap distance to 5 to prevent micro-stuttering at end of travel
            if (dist > 5) {
                const moveSpeed = (sublightSpeed || 0) * SUBLIGHT_SPEED_FACTOR;
                
                // Safety check: if speed is 0, we will never arrive. Force arrival.
                if (moveSpeed <= 0) {
                    this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.WARNING, `Ship ${ship.id} stuck with 0 sublight speed. Forcing arrival.`);
                    ship.moveState = SHIP_STATE.IDLE;
                    delete ship.arrivalPoint;
                    this.engine.spatialService.getCurrentSystem(ship);
                    return;
                }

                const moveDistance = moveSpeed * (dt / 1000);
                const travelDistance = Math.min(moveDistance, dist);

                ship.x += (dx / dist) * travelDistance;
                ship.y += (dy / dist) * travelDistance;
                // Trace log for sublight movement
                this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.TRACE, `Ship ${ship.id} SUBLIGHT. Pos: (${ship.x.toFixed(1)}, ${ship.y.toFixed(1)}) Dist: ${dist.toFixed(1)}`);
            } else {
                // Final destination reached
                // Snap to exact position to prevent drifting/floating point errors
                ship.x = ship.arrivalPoint.x;
                ship.y = ship.arrivalPoint.y;

                ship.moveState = SHIP_STATE.IDLE;
                this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.INFO, `Ship ${ship.id} reached sublight destination.`);
                delete ship.arrivalPoint;
                // The getCurrentSystem logic will now assign its sticky system ID
                    this.engine.spatialService.getCurrentSystem(ship);
            }

        } else if (this.engine.isHost && ship.salvageMission) {
            // Ship is on a salvage mission and is idle. It's at the debris field.
            const targetDebris = this.engine.state.debrisFields.find(d => d.id === ship.salvageMission.to);
            if (!targetDebris) {
                // Debris is gone, time to return home.
                this.moveShip(ship.id, ship.salvageMission.from);
            }
        } else if (this.engine.isHost && ship.patrolSystemId) {
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
                const systemRadius = this.engine.spatialService.getSystemEffectiveRadius(system) * 0.8; // Patrol within 80% of the system's effective radius
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
                const moveSpeed = sublightSpeed * SUBLIGHT_SPEED_FACTOR * 0.5; // Patrol at half sublight speed
                const moveDistance = moveSpeed * (dt / 1000);
                const travelDistance = Math.min(moveDistance, dist);
                if (travelDistance > 0) {
                    ship.x += (dx / dist) * travelDistance;
                    ship.y += (dy / dist) * travelDistance;
                }
            }
        }
    }

    _updateShipOrbit(ship, dt) {
        const system = this.engine.state.systems.find(sys => sys.id === ship.currentSystemId);
        if (!system) return;

        const dx = ship.x - system.x;
        const dy = ship.y - system.y;
        const distSq = dx*dx + dy*dy;
        
        // Only orbit if not right on top of the star (avoid jitter)
        if (distSq > 100) { 
            const dist = Math.sqrt(distSq);
            // Angular speed: slower further out. 
            const angularSpeed = 8 / dist; // rads/sec
            
            const currentAngle = Math.atan2(dy, dx);
            const dAngle = angularSpeed * (dt / 1000);
            const newAngle = currentAngle + dAngle;
            
            ship.x = system.x + Math.cos(newAngle) * dist;
            ship.y = system.y + Math.sin(newAngle) * dist;
            
            // Face the direction of orbit (tangent)
            ship.heading = (newAngle * 180 / Math.PI) + 90;
        }
    }

    moveShip(shipId, targetId) {
        const ship = this.engine.state.ships.find(s => s.id === shipId);
        if (ship) {
            const startSystem = this.engine.spatialService.getCurrentSystem(ship);

            // Clear the sticky system ID when a new move order is given
            if (ship.currentSystemId) {
                ship.lastSystemId = ship.currentSystemId; // Set last system for AI
                delete ship.currentSystemId; // Clear it for the new move
            }
            const targetObj = this.engine.state.systems.find(s => s.id === targetId) || this.engine.state.debrisFields.find(d => d.id === targetId);
            const startName = startSystem ? startSystem.name : 'Deep Space';
            const targetName = targetObj ? (targetObj.name || 'Debris') : targetId;
            
            let logMsg = `[Move Request] ${ship.type} ${ship.id.substring(0,5)}: ${startName} -> ${targetName}. Pos: (${ship.x.toFixed(1)}, ${ship.y.toFixed(1)})`;

            if (this.engine.isHost && startSystem) {
                startSystem.heat = (startSystem.heat || 0) + 15; // Departure signature
            }

            if (startSystem) {
                const startRadius = this.engine.spatialService.getSystemEffectiveRadius(startSystem);
                logMsg += `\n  Start System: ${startSystem.name} Center: (${startSystem.x.toFixed(0)}, ${startSystem.y.toFixed(0)}) Radius: ${startRadius.toFixed(1)}`;
            }

            // When moving to a system, calculate a random arrival point within it.
            const targetSystem = this.engine.state.systems.find(s => s.id === targetId);
            if (targetSystem) {
                const angle = Math.random() * 2 * Math.PI;
                const effRadius = this.engine.spatialService.getSystemEffectiveRadius(targetSystem);
                
                // Calculate arrival distance: outside the star but within the system
                const minArrivalDist = targetSystem.r + 30; // Star radius + buffer
                const maxArrivalDist = effRadius > 0 ? effRadius * 0.7 : 50; // 70% of system radius
                
                const distance = minArrivalDist + Math.random() * (Math.max(minArrivalDist + 10, maxArrivalDist) - minArrivalDist);

                ship.arrivalPoint = {
                    x: targetSystem.x + Math.cos(angle) * distance,
                    y: targetSystem.y + Math.sin(angle) * distance
                };

                const targetRadius = this.engine.spatialService.getSystemEffectiveRadius(targetSystem);
                logMsg += `\n  Target System: ${targetSystem.name} Center: (${targetSystem.x.toFixed(0)}, ${targetSystem.y.toFixed(0)}) Radius: ${targetRadius.toFixed(1)}`;
            } else {
                // Target is not a system (e.g., debris), so there's no sublight arrival point.
                delete ship.arrivalPoint;
            }
            
            this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.INFO, logMsg);

            ship.targetId = targetId;
            ship.isDeparting = true;
            ship.moveState = SHIP_STATE.MOVING;
            
            // If we are just moving to the next step of a path, ensure the path is preserved/broadcast
            // If this is a new manual move, navigationPath might be set by moveShipToTarget before calling this.
            
             // Broadcast the arrivalPoint so clients know where to move the ship with sublight engines
            this.engine.broadcast({ type: 'GAME_MOVE', shipId, targetId, moveState: SHIP_STATE.MOVING, lastSystemId: ship.lastSystemId, arrivalPoint: ship.arrivalPoint, navigationPath: ship.navigationPath });
        }
    }

    moveShipToTarget(shipId, targetId) {
        const selectedShip = this.engine.state.ships.find(s => s.id === shipId);
        if (!selectedShip || selectedShip.moveState !== SHIP_STATE.IDLE) return false; // Can only move idle ships

        // If the selected ship is part of a fleet, move the entire fleet.
        if (selectedShip.fleetId) {
            const player = this.engine.state.players.find(p => p.id === selectedShip.owner);
            const fleet = player?.fleets.find(f => f.id === selectedShip.fleetId);
            if (fleet) {
                const originSystem = this.engine.state.systems.find(s => s.id === fleet.locationId);
                if (originSystem && originSystem.links.some(l => l.targetId === targetId)) {
                    this.engine.requestMoveFleet(fleet.id, targetId);
                    return true;
                }
                return false; // Invalid move for the fleet
            }
        }

        // Is the target a system?
        const targetSystem = this.engine.state.systems.find(s => s.id === targetId);
        if (targetSystem) {
            const originSystem = this.engine.spatialService.getCurrentSystem(selectedShip);

            if (originSystem) {
                // Check for direct link first (optimization)
                if (originSystem.links.some(l => l.targetId === targetId)) {
                    selectedShip.navigationPath = []; // Clear any old path
                    this.moveShip(shipId, targetId);
                    return true;
                } else {
                    // Find path for multi-hop
                    const path = this.findPath(originSystem.id, targetId);
                    if (path && path.length > 0) {
                        const nextStep = path.shift();
                        selectedShip.navigationPath = path; // Store the rest of the path
                        this.moveShip(shipId, nextStep);
                        return true;
                    }
                }
            }
        }

        // Is the target debris?
        const targetDebris = this.engine.state.debrisFields.find(d => d.id === targetId);
        if (targetDebris && selectedShip.type === 'Salvager') {
            this.moveShip(shipId, targetId);
            return true;
        }

        return false;
    }

    findPath(startSystemId, targetSystemId) {
        const systems = this.engine.state.systems;
        const queue = [[startSystemId]];
        const visited = new Set([startSystemId]);

        while (queue.length > 0) {
            const path = queue.shift();
            const currentId = path[path.length - 1];

            if (currentId === targetSystemId) {
                return path.slice(1); // Return path excluding start
            }

            const currentSystem = systems.find(s => s.id === currentId);
            if (currentSystem) {
                for (const link of currentSystem.links) {
                    if (!visited.has(link.targetId)) {
                        // Check if the target system is known/visible to the player?
                        // The prompt says "any known star system". 
                        // Assuming the UI prevents clicking unknown systems, we just need graph connectivity here.
                        visited.add(link.targetId);
                        queue.push([...path, link.targetId]);
                    }
                }
            }
        }
        return null; // No path found
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
    
        const currentSystem = this.engine.spatialService.getCurrentSystem(ship);
        if (!currentSystem) {
            this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.WARNING, `Scout mission request failed: Ship ${shipId} is not in a system.`);
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
        if (!ship || ship.owner !== senderId || ship.type !== 'Salvager') return;

        const targetDebris = this.engine.state.debrisFields.find(d => d.id === targetDebrisId);
        if (!targetDebris) return;

        const currentSystem = this.engine.spatialService.getCurrentSystem(ship);
        const debrisSystem = this.engine.spatialService.getClosestSystem(targetDebris);

        // If debris is in a different system, move to that system first
        if (currentSystem && debrisSystem && currentSystem.id !== debrisSystem.id) {
            // This will use standard navigation logic (warp lanes) to get to the system
            this.moveShip(shipId, debrisSystem.id);
            return;
        }

        // If in same system (or deep space), move directly to debris
        if (currentSystem) {
            ship.salvageMission = { from: currentSystem.id, to: targetDebrisId };
            this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: ship.id, salvageMission: ship.salvageMission });
        }
        this.moveShip(shipId, targetDebrisId);
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
