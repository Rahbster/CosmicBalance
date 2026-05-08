import { PLANET_TYPES } from './GalaxyService.js';
import { MAP_WIDTH, MAP_HEIGHT, SHIP_STATE } from '../cb_constants.js';
import { ShipRenderer } from './renderers/ShipRenderer.js';
import { TextureGenerator } from './renderers/TextureGenerator.js';
import { BackgroundRenderer } from './renderers/BackgroundRenderer.js';
import { SystemRenderer } from './renderers/SystemRenderer.js';
import { EntityRenderer } from './renderers/EntityRenderer.js';

export class RenderService {
    constructor(canvas, gameEngine, spriteService) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameEngine = gameEngine;
        this.spriteService = spriteService;
        this.shipRenderer = new ShipRenderer(this.ctx, this.gameEngine, this.spriteService);
        
        this.textureGenerator = new TextureGenerator();
        this.backgroundRenderer = new BackgroundRenderer(this.ctx, this.gameEngine, this.canvas);
        this.systemRenderer = new SystemRenderer(this.ctx, this.gameEngine, this.textureGenerator);
        this.entityRenderer = new EntityRenderer(this.ctx, this.gameEngine);
        
        this.systemRenderer.clearCache(); // Force clear cache on reload/init
    }

    draw() {
        const ctx = this.ctx;
        const state = this.gameEngine.state;
        const pan = this.gameEngine.camera.pan;
        const zoom = this.gameEngine.camera.zoom;

        // Viewport bounds for culling
        const viewX = -pan.x / zoom;
        const viewY = -pan.y / zoom;
        const viewW = this.canvas.width / zoom;
        const viewH = this.canvas.height / zoom;
        const buffer = 250; // Margin for culling

        // Clear background
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Cache players for O(1) lookup during rendering
        this.playerMap = new Map();
        state.players.forEach(p => this.playerMap.set(p.id, p));

        // Cache ships for O(1) lookup during rendering
        const shipMap = new Map();
        state.ships.forEach(s => shipMap.set(s.id, s));

        // Draw Background Stars (Screen Space)
        this.backgroundRenderer.drawStars(pan);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        const isHostGodView = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';
        const viewingIds = this.gameEngine.getViewingCommanderIds();
        
        // 1. Calculate Visibility for all systems once per frame
        const visibilityMap = new Map();
        const visibleSystems = [];
        const visibleSystemIds = new Set();
        
        if (isHostGodView) {
            state.systems.forEach(sys => {
                visibilityMap.set(sys.id, 'explored');
                visibleSystems.push(sys);
                visibleSystemIds.add(sys.id);
            });
        } else {
            state.systems.forEach(sys => {
                let result = 'unexplored';
                for (const id of viewingIds) {
                    const v = sys.visibility[id];
                    if (v === 'explored') { result = 'explored'; break; }
                    if (v === 'scouted') result = 'scouted';
                }
                if (result !== 'unexplored') {
                    visibilityMap.set(sys.id, result);
                    visibleSystems.push(sys);
                    visibleSystemIds.add(sys.id);
                }
            });
        }
        
        const checkVisibility = (system) => visibilityMap.get(system.id) || 'unexplored';

        // 0. Draw Fog of War on top of the game world
        this.backgroundRenderer.drawFogOfWar(state, visibleSystems, viewingIds, isHostGodView);

        // 0.1 Draw Watermark (World Space)
        this.backgroundRenderer.drawWatermark();

        // 0.5. Draw Debris (Behind everything else)
        state.debrisFields.forEach(debris => {
            // Viewport Culling
            if (debris.x < viewX - buffer || debris.x > viewX + viewW + buffer ||
                debris.y < viewY - buffer || debris.y > viewY + viewH + buffer) return;

            if (isHostGodView) {
                this.entityRenderer.drawDebris(debris);
            } else {
                // Check if debris is near any explored system
                let isVisible = false;
                if (debris.systemId) {
                    isVisible = visibleSystemIds.has(debris.systemId);
                } else {
                    isVisible = visibleSystems.some(sys => {
                        const dx = sys.x - debris.x;
                        const dy = sys.y - debris.y;
                        return (dx * dx + dy * dy) < (200 * 200);
                    });
                }
                if (isVisible) this.entityRenderer.drawDebris(debris);
            }
        });

        // 0.6 Draw Hazards (Nebulas, Black Holes)
        this.entityRenderer.drawHazards(state.hazards);

        // 0.7 Draw Mines
        this.entityRenderer.drawMines(state.mines, viewingIds, isHostGodView);

        // 1. Draw Links (Warp lanes)
        this.systemRenderer.drawLinks(visibleSystems, state.systems);

        // 2. Draw Systems (Stars and Planets)
        visibleSystems.forEach(system => {
            if (system.x >= viewX - buffer && system.x <= viewX + viewW + buffer &&
                system.y >= viewY - buffer && system.y <= viewY + viewH + buffer) {
                this.systemRenderer.drawSystem(system, checkVisibility, this.playerMap);
            }
        });

        // 4. Draw Fleet Movement Paths
        this.drawFleetMovementPaths(ctx, state, viewingIds, isHostGodView, shipMap);

        // Determine which systems are visible to the player (has ships present or owns the system)
        const presenceSystemIds = new Set();
        if (!isHostGodView) {
            state.systems.forEach(s => {
                if (viewingIds.includes(s.owner)) presenceSystemIds.add(s.id);
            });
            state.ships.forEach(s => {
                if (viewingIds.includes(s.owner) && s.currentSystemId) presenceSystemIds.add(s.currentSystemId);
            });
        }

        // 5. Draw Ships & Fleets
        const visibleShips = isHostGodView 
            ? state.ships 
            : state.ships.filter(ship => {
                // Cloaking Check
                const isOwner = viewingIds.includes(ship.owner);
                if (ship.isCloaked && !isOwner) return false;

                // Standard Visibility Check
                const isVisible = isOwner || (ship.currentSystemId && presenceSystemIds.has(ship.currentSystemId));
                
                return isVisible;
            });
        
        // Group by fleet
        const fleetsToDraw = new Map();
        const independentShips = [];

        visibleShips.forEach(ship => {
            if (ship.fleetId) {
                if (!fleetsToDraw.has(ship.fleetId)) {
                    fleetsToDraw.set(ship.fleetId, []);
                }
                fleetsToDraw.get(ship.fleetId).push(ship);
            } else {
                independentShips.push(ship);
            }
        });

        // Draw Fleets
        fleetsToDraw.forEach((ships, fleetId) => {
            this.shipRenderer.drawFleet(fleetId, ships);
            this.shipRenderer.drawFleetComposition(fleetId, ships);
        });

        // Draw Independent Ships
        independentShips.forEach(ship => {
            const isOwner = viewingIds.includes(ship.owner);
            const opacity = (ship.isCloaked && isOwner) ? 0.5 : 1.0;
            this.shipRenderer.drawShip(ship, opacity);
        });

        this.drawCombatEffects(ctx, state.systems, shipMap, state.gameTime);

        this.systemRenderer.drawSelection(ctx, checkVisibility, visibleShips);

        ctx.restore();
    }

    drawFleetMovementPaths(ctx, state, viewingIds, isHostGodView, shipMap) {
        const playersToRender = isHostGodView ? state.players : state.players.filter(p => {
            return viewingIds.includes(p.id);
        });

        // Draw paths for fleets
        playersToRender.forEach(player => {
            if (!player.fleets) return;

            player.fleets.forEach(fleet => {
                const fleetShips = [];
                fleet.shipIds.forEach(id => {
                    const s = shipMap.get(id);
                    if (s) fleetShips.push(s);
                });
                if (fleetShips.length === 0) return;

                // Find a representative moving ship to determine the target
                const movingShip = fleetShips.find(s => s.targetId);
                if (!movingShip) return; // Fleet is not moving

                const targetId = movingShip.targetId;
                const targetSystem = state.systems.find(s => s.id === targetId);
                if (!targetSystem) return; // Target isn't a system

                // Calculate the centroid of the entire fleet for a stable anchor point
                const { x, y, count } = fleetShips.reduce((acc, ship) => {
                    acc.x += ship.x;
                    acc.y += ship.y;
                    acc.count++;
                    return acc;
                }, { x: 0, y: 0, count: 0 });

                if (count === 0) return;

                const centerX = x / count;
                const centerY = y / count;

                // Draw the path
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(targetSystem.x, targetSystem.y);
                
                ctx.strokeStyle = player.color || '#FFFFFF';
                ctx.lineWidth = 2 / this.gameEngine.camera.zoom; // Thicker line for fleets
                ctx.setLineDash([8 / this.gameEngine.camera.zoom, 6 / this.gameEngine.camera.zoom]);
                ctx.globalAlpha = 0.7;
                
                ctx.stroke();
                ctx.restore();
            });
        });

        // Draw paths for individual moving ships
        const unassignedMovingShips = state.ships.filter(s => {
            let isVisible = isHostGodView;
            if (!isVisible) isVisible = viewingIds.includes(s.owner);
            return isVisible && s.targetId && !s.fleetId && !s.isStation;
        });

        unassignedMovingShips.forEach(ship => {
            const targetSystem = state.systems.find(s => s.id === ship.targetId);
            if (!targetSystem) return;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ship.x, ship.y);
            ctx.lineTo(targetSystem.x, targetSystem.y);

            ctx.strokeStyle = ship.color || '#FFFFFF';
            ctx.lineWidth = 1 / this.gameEngine.camera.zoom;
            ctx.setLineDash([4 / this.gameEngine.camera.zoom, 4 / this.gameEngine.camera.zoom]);
            ctx.globalAlpha = 0.5;

            ctx.stroke();
            ctx.restore();
        });
    }

    drawCombatEffects(ctx, systems, shipMap, gameTime) {
        systems.forEach(system => {
            if (!system.planets) return;
            system.planets.forEach((planet, i) => {
                // Draw Quasar Cannon Beam (lasts 500ms)
                if (planet.quasarFireTime && (gameTime - planet.quasarFireTime) < 500) {
                    let targetPos = null;
                    const targetShip = shipMap.get(planet.quasarTargetId);
                    
                    if (targetShip) {
                        targetPos = { x: targetShip.x, y: targetShip.y };
                    } else if (planet.quasarTargetPos) {
                        targetPos = planet.quasarTargetPos;
                    }

                    if (targetPos) {
                        const r = system.r;
                        const orbitBase = r + 10;
                        const planetGap = 8;
                        
                        const angle = (gameTime / 10000 + i) % (Math.PI * 2);
                        const semiMajor = orbitBase + (i * planetGap);
                        const semiMinor = semiMajor * 0.65;
                        const tilt = ((system.x + system.y) % 360) * (Math.PI / 180);

                        const ux = Math.cos(angle) * semiMajor;
                        const uy = Math.sin(angle) * semiMinor;

                        const px = system.x + (ux * Math.cos(tilt) - uy * Math.sin(tilt));
                        const py = system.y + (ux * Math.sin(tilt) + uy * Math.cos(tilt));

                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        ctx.lineTo(targetPos.x, targetPos.y);
                        
                        // Pulsing beam effect
                        const alpha = 1 - ((gameTime - planet.quasarFireTime) / 500);
                        ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
                        ctx.lineWidth = 4 / this.gameEngine.camera.zoom;
                        ctx.lineCap = 'round';
                        ctx.shadowColor = '#00FFFF';
                        ctx.shadowBlur = 15;
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            });

            // --- Genesis Torpedo Effect ---
            if (system.genesisEffect && (gameTime - system.genesisEffect.startTime) < system.genesisEffect.duration) {
                const effect = system.genesisEffect;
                const progress = (gameTime - effect.startTime) / effect.duration;

                // Find the planet's position
                const planetIndex = system.planets.findIndex(p => p.id === effect.planetId);
                if (planetIndex !== -1) {
                    // This is the same logic as in drawPlanetMini
                    const r = system.r;
                    const orbitBase = r + 10;
                    const planetGap = 8;
                    
                    const angle = (gameTime / 10000 + planetIndex) % (Math.PI * 2);
                    const semiMajor = orbitBase + (planetIndex * planetGap);
                    const semiMinor = semiMajor * 0.65;
                    const tilt = ((system.x + system.y) % 360) * (Math.PI / 180);

                    const ux = Math.cos(angle) * semiMajor;
                    const uy = Math.sin(angle) * semiMinor;

                    const px = system.x + (ux * Math.cos(tilt) - uy * Math.sin(tilt));
                    const py = system.y + (ux * Math.sin(tilt) + uy * Math.cos(tilt));

                    // Draw the effect
                    ctx.save();
                    
                    // Expanding shockwave
                    const shockwaveRadius = 150 * progress;
                    const shockwaveAlpha = 1 - progress;
                    ctx.strokeStyle = `rgba(174, 225, 249, ${shockwaveAlpha})`;
                    ctx.lineWidth = (3 / this.gameEngine.camera.zoom) * (1 - progress);
                    ctx.beginPath();
                    ctx.arc(px, py, shockwaveRadius, 0, Math.PI * 2);
                    ctx.stroke();

                    // Central flash
                    const flashRadius = 30 * (1 - progress);
                    const flashAlpha = 1 - (progress * progress);
                    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
                    ctx.shadowColor = '#aee1f9';
                    ctx.shadowBlur = 30;
                    ctx.beginPath();
                    ctx.arc(px, py, flashRadius, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.restore();
                }
            } else if (system.genesisEffect) {
                // Clean up old effect
                delete system.genesisEffect;
            }
        });
    }
}