import { PLANET_NAMES } from './GalaxyService.js';

export class CombatService {
    constructor(engine) {
        this.engine = engine;
    }

    runCombat(dt) {
        const shipsByPlanet = new Map();

        // Group ships by the system they are orbiting
        this.engine.state.systems.forEach(sys => {
            const orbitingShips = this.engine.state.ships.filter(ship => {
                if (ship.scoutMission) return false; // Ships on a scout mission do not participate in or trigger combat
                const dx = sys.x - ship.x;
                const dy = sys.y - ship.y;
                return (dx * dx + dy * dy) <= (this.engine.spatialService.getSystemEffectiveRadius(sys) ** 2);
            });
            if (orbitingShips.length > 0) {
                shipsByPlanet.set(sys.id, orbitingShips);
            }
        });

        // Process combat for each planet
        for (const [planetId, ships] of shipsByPlanet.entries()) {
            const teamsPresent = [...new Set(ships.map(s => s.team))];
            if (teamsPresent.length > 1) { // If contested
                ships.forEach(attacker => {
                    const enemyShips = ships.filter(s => s.team !== attacker.team);
                    if (enemyShips.length > 0) {
                        const target = enemyShips[Math.floor(Math.random() * enemyShips.length)];
                        const damagePerFrame = attacker.damage * (dt / 1000);

                        if (target.shield > 0) {
                            target.shield = Math.max(0, target.shield - damagePerFrame);
                        } else {
                            target.hull = Math.max(0, target.hull - damagePerFrame);
                        }
                        this.engine.broadcast({ type: 'GAME_SHIP_UPDATE', shipId: target.id, hull: target.hull, shield: target.shield });
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

            if (ownersPresent.length === 1) {
                const capturingOwnerId = ownersPresent[0];
                const capturingPlayer = this.engine.state.players.find(p => p.id === capturingOwnerId);

                // Find a planet within the system to capture
                const targetPlanet = system.planets.find(p => {
                    if (p.owner === capturingOwnerId) return false;
                    if (!p.owner) return true;
                    
                    const planetOwner = this.engine.state.players.find(pl => pl.id === p.owner);
                    // Only allow capture if planet owner is on a different team
                    return planetOwner && planetOwner.team !== capturingPlayer.team;
                });
                
                if (targetPlanet) {
                    if (targetPlanet.capturingTeam && targetPlanet.capturingTeam !== capturingOwnerId) targetPlanet.captureProgress = 0; // Reset if different team was capturing
                    targetPlanet.capturingTeam = capturingOwnerId;
                    targetPlanet.captureProgress += (CAPTURE_POINTS_PER_SECOND / 1000) * dt * orbitingTransports.length;

                    if (targetPlanet.captureProgress >= 100) {
                        targetPlanet.owner = capturingOwnerId;
                        targetPlanet.captureProgress = 100;
                        targetPlanet.capturingTeam = null;
                        // If the system itself has no owner yet, or the new planet owner is now in the majority, prompt for rename
                        if (!system.owner) {
                            // Assign system ownership
                            system.owner = capturingOwnerId;
                            
                            const ownerPlayer = this.engine.state.players.find(p => p.id === capturingOwnerId);
                            if (ownerPlayer) {
                                if (ownerPlayer.isAI) {
                                    system.name = this.engine.galaxyService.generateSystemName(ownerPlayer.team);
                                    this.engine.broadcast({ type: 'GAME_SYSTEM_RENAMED', systemId: system.id, newName: system.name });
                                } else {
                                    this.engine.broadcast({ type: 'GAME_PROMPT_RENAME', systemId: system.id, playerId: capturingOwnerId });
                                }
                            }
                        }
                    }
                    this.engine.broadcast({ type: 'GAME_PLANET_UPDATE', planetId: targetPlanet.id, owner: targetPlanet.owner, captureProgress: targetPlanet.captureProgress, capturingTeam: targetPlanet.capturingTeam });
                }
            } else { // 0 or 2+ teams present (neutral or contested)
                system.planets.forEach(planet => {
                    if (planet.captureProgress > 0 && planet.captureProgress < 100) {
                        planet.captureProgress -= (DECAY_POINTS_PER_SECOND / 1000) * dt;
                        if (planet.captureProgress <= 0) {
                            planet.captureProgress = 0;
                            planet.capturingTeam = null;
                        }
                        this.engine.broadcast({ type: 'GAME_PLANET_UPDATE', planetId: planet.id, captureProgress: planet.captureProgress, capturingTeam: planet.capturingTeam });
                    }
                });
            }
        });
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
