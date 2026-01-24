import { PLANET_TYPES } from './GalaxyService.js';
import { MAP_WIDTH, MAP_HEIGHT, SHIP_STATE } from '../cb_constants.js';
import { ShipRenderer } from './renderers/ShipRenderer.js';

export class RenderService {
    constructor(canvas, gameEngine, spriteService) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameEngine = gameEngine;
        this.spriteService = spriteService;
        this.shipRenderer = new ShipRenderer(this.ctx, this.gameEngine, this.spriteService);

        // Background Assets
        this.backgroundImage = new Image();
        this.backgroundImage.src = 'assets/icons/icon-512.png';
        
        this.stars = [];
        // Generate random background stars
        for (let i = 0; i < 150; i++) {
            this.stars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 1.5 + 0.5,
                opacity: Math.random() * 0.4 + 0.1
            });
        }

        // Pre-calculate flag path
        this.flagPath = new Path2D("M12.45 4L12 2H4v18h2v-7h5.55l.45 2h8V4h-7.55z");

        // Pre-render fog brush
        this.fogBrush = document.createElement('canvas');
        this.fogBrush.width = 512;
        this.fogBrush.height = 512;
        const fCtx = this.fogBrush.getContext('2d');
        const radius = 256;
        const grad = fCtx.createRadialGradient(radius, radius, radius * 0.5, radius, radius, radius);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        fCtx.fillStyle = grad;
        fCtx.beginPath();
        fCtx.arc(radius, radius, radius, 0, Math.PI * 2);
        fCtx.fill();

        // Pre-render generic star glow
        this.starGlow = document.createElement('canvas');
        this.starGlow.width = 64;
        this.starGlow.height = 64;
        const sCtx = this.starGlow.getContext('2d');
        const sRadius = 32;
        const sGrad = sCtx.createRadialGradient(sRadius, sRadius, sRadius * 0.2, sRadius, sRadius, sRadius);
        sGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        sCtx.fillStyle = sGrad;
        sCtx.fillRect(0, 0, 64, 64);

        // Pre-render debris glow
        this.debrisGlow = document.createElement('canvas');
        this.debrisGlow.width = 64;
        this.debrisGlow.height = 64;
        const dCtx = this.debrisGlow.getContext('2d');
        const dRadius = 32;
        const dGrad = dCtx.createRadialGradient(dRadius, dRadius, dRadius * 0.2, dRadius, dRadius, dRadius);
        dGrad.addColorStop(0, 'rgba(150, 150, 150, 1)');
        dGrad.addColorStop(1, 'rgba(100, 100, 100, 0)');
        dCtx.fillStyle = dGrad;
        dCtx.fillRect(0, 0, 64, 64);

        // Offscreen buffer for Fog of War
        this.fogLayer = document.createElement('canvas');

        // Cache for generated planet textures
        this.planetCache = new Map();
        this.starCache = new Map();
        this.debrisCache = new Map();
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
        this.drawStars(ctx, pan);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        const isHostGodView = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';
        const viewingIds = this.gameEngine.getViewingPlayerIds();
        
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
        this.drawFogOfWar(ctx, state, visibleSystems, viewingIds, isHostGodView);

        // 0.1 Draw Watermark (World Space)
        this.drawWatermark(ctx);

        // 0.5. Draw Debris (Behind everything else)
        state.debrisFields.forEach(debris => {
            // Viewport Culling
            if (debris.x < viewX - buffer || debris.x > viewX + viewW + buffer ||
                debris.y < viewY - buffer || debris.y > viewY + viewH + buffer) return;

            if (isHostGodView) {
                this.drawDebris(ctx, debris);
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
                if (isVisible) this.drawDebris(ctx, debris);
            }
        });

        // 0.6 Draw Hazards (Nebulas, Black Holes)
        this.drawHazards(ctx);

        // 0.7 Draw Mines
        this.drawMines(ctx);

        // 1. Draw Links (Warp lanes)
        this.drawLinks(ctx, visibleSystems, state.systems);

        // 2. Draw Systems (Stars and Planets)
        visibleSystems.forEach(system => {
            if (system.x >= viewX - buffer && system.x <= viewX + viewW + buffer &&
                system.y >= viewY - buffer && system.y <= viewY + viewH + buffer) {
                this.drawSystem(ctx, system, checkVisibility);
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
            this.drawFleetComposition(ctx, fleetId, ships);
        });

        // Draw Independent Ships
        independentShips.forEach(ship => {
            const isOwner = viewingIds.includes(ship.owner);
            const opacity = (ship.isCloaked && isOwner) ? 0.5 : 1.0;
            this.shipRenderer.drawShip(ship, opacity);
        });

        this.drawSelection(ctx, checkVisibility, visibleShips);

        ctx.restore();
    }

    drawWatermark(ctx) {
        if (this.backgroundImage.complete && this.backgroundImage.naturalWidth !== 0) {
            const systems = this.gameEngine.state.systems;
            if (!systems || systems.length === 0) return;

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const s of systems) {
                if (s.x < minX) minX = s.x;
                if (s.x > maxX) maxX = s.x;
                if (s.y < minY) minY = s.y;
                if (s.y > maxY) maxY = s.y;
            }

            const width = maxX - minX;
            const height = maxY - minY;
            const size = Math.max(width, height) * 1.5; // Scale up to cover the area comfortably
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            ctx.save();
            ctx.globalAlpha = 0.05; // Very subtle watermark
            ctx.drawImage(this.backgroundImage, centerX - size / 2, centerY - size / 2, size, size);
            ctx.restore();
        }
    }

    drawStars(ctx, pan) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.fillStyle = '#FFFFFF';
        this.stars.forEach(star => {
            // Parallax factor: smaller stars move slower (further away)
            const factor = 0.1 * star.size; 
            
            // Calculate wrapped position based on camera pan
            let x = (star.x * width + pan.x * factor) % width;
            let y = (star.y * height + pan.y * factor) % height;
            
            // Handle negative modulo
            if (x < 0) x += width;
            if (y < 0) y += height;

            ctx.globalAlpha = star.opacity;
            ctx.fillRect(x - star.size, y - star.size, star.size * 2, star.size * 2);
        });
        ctx.globalAlpha = 1.0;
    }

    drawFogOfWar(ctx, state, visibleSystems, viewingIds, isHostGodView) {
        if (isHostGodView) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        // Resize offscreen canvas if needed
        if (this.fogLayer.width !== width || this.fogLayer.height !== height) {
            this.fogLayer.width = width;
            this.fogLayer.height = height;
        }

        const fCtx = this.fogLayer.getContext('2d');
        const pan = this.gameEngine.camera.pan;
        const zoom = this.gameEngine.camera.zoom;

        // 1. Clear and Fill Fog (Screen Space)
        fCtx.globalCompositeOperation = 'source-over';
        fCtx.clearRect(0, 0, width, height);
        fCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        fCtx.fillRect(0, 0, width, height);

        // 2. Cut out holes for vision using destination-out
        fCtx.save();
        fCtx.translate(pan.x, pan.y);
        fCtx.scale(zoom, zoom);
        fCtx.globalCompositeOperation = 'destination-out';

        // Optimization: Only cut holes for entities within the viewport (plus buffer)
        // This prevents drawing thousands of fog clearings for off-screen entities
        const buffer = 500;
        const viewX = -pan.x / zoom;
        const viewY = -pan.y / zoom;
        const viewW = width / zoom;
        const viewH = height / zoom;

        const cutHole = (x, y, radius) => {
            if (x + radius < viewX - buffer || x - radius > viewX + viewW + buffer ||
                y + radius < viewY - buffer || y - radius > viewY + viewH + buffer) return;
            fCtx.drawImage(this.fogBrush, x - radius, y - radius, radius * 2, radius * 2);
        };

        // Vision from Owned Ships
        // Optimization: Filter ships first to avoid iterating all ships if not needed
        const myShips = state.ships.filter(s => viewingIds.includes(s.owner) && s.hull > 0);

        myShips.forEach(ship => {
            // Scouts have larger sensor range
            const sensorRange = ship.type === 'Scout' ? 250 : 150;
            cutHole(ship.x, ship.y, sensorRange);
        });

        // Vision from Owned Systems
        visibleSystems.forEach(system => {
            const r = this.gameEngine.spatialService.getSystemEffectiveRadius(system) + 100;
            cutHole(system.x, system.y, r);
        });

        fCtx.restore();

        // 3. Draw Fog Layer to Main Canvas (Screen Space)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to identity
        ctx.drawImage(this.fogLayer, 0, 0);
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

    drawLinks(ctx, visibleSystems, allSystems) {
        ctx.lineWidth = 2;
        const drawn = new Set();
        const gameTime = this.gameEngine.state.gameTime || 0;
        
        visibleSystems.forEach(sys => {
            sys.links.forEach(link => {
                // Sort IDs to ensure we don't draw the same link twice
                const key = [sys.id, link.targetId].sort().join('-');
                if (drawn.has(key)) return;
                
                const target = allSystems.find(s => s.id === link.targetId);
                if (target) {
                    ctx.beginPath();
                    ctx.moveTo(sys.x, sys.y);
                    ctx.lineTo(target.x, target.y);
                    
                    if (link.type === 'two-way') {
                        ctx.strokeStyle = 'rgba(0, 160, 192, 0.3)'; // Cyan low opacity
                        ctx.setLineDash([]);
                        ctx.lineDashOffset = 0;
                        drawn.add(key); // Only prevent drawing two-way links twice
                    } else {
                        ctx.strokeStyle = 'rgba(204, 51, 51, 0.3)'; // Red low opacity
                        ctx.setLineDash([5, 5]);
                        // Animate dashes in direction of warp (source -> target)
                        ctx.lineDashOffset = -(gameTime / 40) % 10;
                    }
                    
                    ctx.stroke();
                }
            });
        });
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    }

    drawSystem(ctx, system, checkVisibility) {
        const zoom = this.gameEngine.camera.zoom;
        const isHostGodView = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';
        const visibility = checkVisibility(system);
        
        // In God View, the host sees everything. Otherwise, respect visibility.
        if (!isHostGodView && (!visibility || visibility === 'unexplored')) return;

        // Level of Detail (LOD)
        const drawText = zoom > 0.3;
        const drawPlanets = zoom > 0.6;
        const drawEnhancedStars = zoom > 1.5;

        // Draw Star
        const r = system.r;
        
        if (drawEnhancedStars) {
            let starTexture = this.starCache.get(system.id);
            if (!starTexture) {
                starTexture = this.createStarTexture(system);
                this.starCache.set(system.id, starTexture);
            }
            ctx.drawImage(starTexture, system.x - r * 1.5, system.y - r * 1.5, r * 3, r * 3);
        }

        // Draw pre-rendered glow (Old Rendering) over top of the enhanced star
        ctx.drawImage(this.starGlow, system.x - r, system.y - r, r * 2, r * 2);

        // Draw colored core/tint
        ctx.fillStyle = system.color || '#FDB813';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(system.x, system.y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1.0;
        
        if (!drawText) return;

        // Draw System Name
        const baseFontSize = 12;
        const finalFontSize = Math.max(baseFontSize, 8 / this.gameEngine.camera.zoom); // Ensure a minimum readable size on screen
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `${finalFontSize}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(system.name, system.x, system.y - r - 10);

        // Draw Owner Flag
        if (system.owner) {
            const owner = this.playerMap.get(system.owner);
            if (owner) {
                const textWidth = ctx.measureText(system.name).width;
                const scale = finalFontSize / 24; // Scale flag to match text height
                const flagX = system.x + (textWidth / 2) + (6 / this.gameEngine.camera.zoom);
                const flagY = system.y - r - 10 - finalFontSize + (2 * scale); // Align with text top roughly
                this.drawFlag(ctx, flagX, flagY, owner.color, scale);
            }
        }

        // Draw ownership ring in God View
        if (isHostGodView && system.owner) {
            const owner = this.playerMap.get(system.owner);
            const ownerColor = owner ? owner.color : '#FFFFFF';
            ctx.strokeStyle = ownerColor;
            ctx.lineWidth = 3 / this.gameEngine.camera.zoom; // Keep line width constant on screen
            ctx.beginPath();
            ctx.arc(system.x, system.y, r + 5, 0, Math.PI * 2); // A ring just outside the star's glow
            ctx.stroke();
        }

        // Draw Capture Activity Indicator on System (if any planet is being captured)
        const activeCapture = system.planets.find(p => p.captureProgress > 0 && p.captureProgress < 100);
        if (activeCapture && (isHostGodView || visibility === 'explored')) {
             const capturingPlayer = this.playerMap.get(activeCapture.capturingTeam);
             if (capturingPlayer) {
                const indicatorRadius = r + 8 + (4 / this.gameEngine.camera.zoom);
                ctx.save();
                ctx.strokeStyle = capturingPlayer.color;
                ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                ctx.setLineDash([4 / this.gameEngine.camera.zoom, 4 / this.gameEngine.camera.zoom]);
                
                // Rotate based on time for visibility
                const rotation = (this.gameEngine.state.gameTime / 2000) % (Math.PI * 2);
                ctx.translate(system.x, system.y);
                ctx.rotate(rotation);
                
                ctx.beginPath();
                ctx.arc(0, 0, indicatorRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
             }
        }

        // Draw Planets (Miniature representation orbiting the star)
        if (drawPlanets && (isHostGodView || visibility === 'explored' || visibility === 'scouted')) {
            const orbitBase = r + 10;
            const planetGap = 8;
            
            system.planets.forEach((planet, i) => {
                // Simple orbit animation based on time
                const angle = (this.gameEngine.state.gameTime / 10000 + i) % (Math.PI * 2);
                const semiMajor = orbitBase + (i * planetGap);
                const semiMinor = semiMajor * 0.65; // Elliptical ratio

                // Rotate the ellipse based on system position for variety
                const tilt = ((system.x + system.y) % 360) * (Math.PI / 180);

                const ux = Math.cos(angle) * semiMajor;
                const uy = Math.sin(angle) * semiMinor;

                const px = system.x + (ux * Math.cos(tilt) - uy * Math.sin(tilt));
                const py = system.y + (ux * Math.sin(tilt) + uy * Math.cos(tilt));
                
                const typeInfo = PLANET_TYPES[planet.type];
                const radius = typeInfo ? typeInfo.radius : 3;
                this.drawPlanetMini(ctx, planet, px, py, radius, system);
            });
        }

        // Draw AI Goal in God View
        if (isHostGodView && system.owner) {
            const owner = this.playerMap.get(system.owner);
            if (owner && owner.isAI && owner.aiGoal) {
                // Only draw on systems with a station to reduce clutter and identify main bases
                const hasStation = this.gameEngine.state.ships.some(s => s.owner === system.owner && s.isStation && this.gameEngine.spatialService.isShipInSystem(s, system));
                
                if (hasStation) {
                    ctx.fillStyle = owner.color || '#FFFFFF';
                    const fontSize = Math.max(10, 10 / this.gameEngine.camera.zoom);
                    ctx.font = `bold ${fontSize}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.shadowColor = 'black';
                    ctx.shadowBlur = 4;
                    // Draw below the star
                    ctx.fillText(`[${owner.aiGoal}]`, system.x, system.y + r + (25 / this.gameEngine.camera.zoom));

                    // Draw Research Project
                    if (owner.researchQueue && owner.researchQueue.length > 0) {
                        const techId = owner.researchQueue[0].techId;
                        const techData = this.gameEngine.techService.getTechData();
                        if (techData) {
                            const tech = techData[owner.techBase]?.[techId];
                            if (tech) {
                                ctx.font = `italic ${fontSize * 0.8}px monospace`;
                                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                                ctx.fillText(`Rsrch: ${tech.name}`, system.x, system.y + r + (40 / this.gameEngine.camera.zoom));
                            }
                        }
                    }
                }
            }
        }
    }

    drawFlag(ctx, x, y, color, scale) {
        const zoom = this.gameEngine.camera.zoom;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        if (zoom < 0.8) {
            ctx.fillStyle = color;
            ctx.fill(this.flagPath);
        } else {
            // Detailed Flag Rendering
            
            // Pole
            const poleGrad = ctx.createLinearGradient(4, 0, 6, 0);
            poleGrad.addColorStop(0, '#555');
            poleGrad.addColorStop(0.4, '#AAA');
            poleGrad.addColorStop(1, '#333');
            ctx.fillStyle = poleGrad;
            ctx.fillRect(4, 1, 2, 20);

            // Finial
            const finialGrad = ctx.createRadialGradient(5, 1, 0, 5, 1, 2);
            finialGrad.addColorStop(0, '#FFF');
            finialGrad.addColorStop(0.5, '#FFD700');
            finialGrad.addColorStop(1, '#DAA520');
            ctx.fillStyle = finialGrad;
            ctx.beginPath();
            ctx.arc(5, 1, 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Flag Cloth Path
            ctx.beginPath();
            ctx.moveTo(6, 2);
            ctx.bezierCurveTo(10, 0, 15, 4, 20, 2); // Top wave
            ctx.lineTo(20, 11);
            ctx.bezierCurveTo(15, 13, 10, 9, 6, 11); // Bottom wave
            ctx.closePath();

            // Fill Color
            ctx.fillStyle = color;
            ctx.fill();

            // Shading/Folds
            ctx.save();
            ctx.clip();
            const foldGrad = ctx.createLinearGradient(6, 0, 20, 0);
            foldGrad.addColorStop(0, 'rgba(0,0,0,0.2)');
            foldGrad.addColorStop(0.3, 'rgba(255,255,255,0.3)');
            foldGrad.addColorStop(0.6, 'rgba(0,0,0,0.1)');
            foldGrad.addColorStop(1, 'rgba(255,255,255,0.1)');
            ctx.fillStyle = foldGrad;
            ctx.fill();

            // Emblem (High Zoom)
            if (zoom > 1.2) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.beginPath();
                ctx.arc(13, 6.5, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Outline
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        ctx.restore();
    }

    drawPlanetMini(ctx, planet, x, y, r, system) {
        const zoom = this.gameEngine.camera.zoom;
        // Ensure planets have a minimum visible size when zoomed out
        const minPixelRadius = 1.5;
        const finalRadius = Math.max(r, minPixelRadius / zoom);
        
        // Get or create texture
        let texture = this.planetCache.get(planet.id);
        if (!texture) {
            texture = this.createPlanetTexture(planet);
            this.planetCache.set(planet.id, texture);
        }

        // Atmosphere Glow (High Zoom)
        if (zoom > 1.2 && ['Terran', 'Farming'].includes(planet.type)) {
            ctx.save();
            const glowRadius = finalRadius * 1.3;
            const grad = ctx.createRadialGradient(x, y, finalRadius * 0.9, x, y, glowRadius);
            const color = planet.type === 'Terran' ? '135, 206, 235' : '174, 213, 129'; // Sky blue or Light Green
            grad.addColorStop(0, `rgba(${color}, 0.4)`);
            grad.addColorStop(1, `rgba(${color}, 0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        
        // Draw Planet Texture
        ctx.drawImage(texture, x - finalRadius, y - finalRadius, finalRadius * 2, finalRadius * 2);

        // Dynamic Shadow (Lighting from Star)
        if (system) {
            // Star is at system.x, system.y. Planet is at x, y.
            const angleToStar = Math.atan2(system.y - y, system.x - x);
            
            ctx.translate(x, y);
            ctx.rotate(angleToStar);
            
            // Create a gradient for the shadow. It's a radial gradient that is offset
            // towards the light source, so it creates a crescent shape of shadow.
            const shadowGradient = ctx.createRadialGradient(
                finalRadius * 0.5, 0, 0, // Inner circle (lightest part of shadow)
                0, 0, finalRadius       // Outer circle (planet edge)
            );
            shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            shadowGradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.4)');
            shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');

            ctx.fillStyle = shadowGradient;

            // We only want to draw this on the dark side of the planet.
            ctx.beginPath();
            ctx.arc(0, 0, finalRadius, Math.PI / 2, 3 * Math.PI / 2);
            ctx.fill();
        }

        ctx.restore();
        
        let ringOffset = 3 / zoom;

        if (planet.owner) {
            const owner = this.playerMap.get(planet.owner);
            ctx.strokeStyle = owner ? owner.color : '#FFFFFF';
            ctx.lineWidth = 2 / zoom; // Make it visible like the capture ring
            ctx.beginPath();
            ctx.arc(x, y, finalRadius + ringOffset, 0, Math.PI * 2);
            ctx.stroke();

            // Draw Citadel Level Indicators (Pips on the ring)
            if (planet.citadelLevel > 0) {
                ctx.fillStyle = owner ? owner.color : '#FFFFFF';
                const pipSize = 3 / zoom;
                const indicatorRadius = finalRadius + ringOffset;
                
                for (let i = 0; i < planet.citadelLevel; i++) {
                    const angle = (Math.PI * 2 * i) / planet.citadelLevel - (Math.PI / 2);
                    const px = x + Math.cos(angle) * indicatorRadius;
                    const py = y + Math.sin(angle) * indicatorRadius;
                    ctx.fillRect(px - pipSize / 2, py - pipSize / 2, pipSize, pipSize);
                }
            }

            ringOffset += 3 / zoom; // Push next ring out
        }

        // Draw capture progress ring
        if (planet.captureProgress > 0 && planet.captureProgress < 100) {
            const capturingPlayer = this.playerMap.get(planet.capturingTeam);
            if (capturingPlayer) {
                const captureRadius = finalRadius + ringOffset;

                // Determine if this is a hostile takeover (Neutralization) or friendly reinforcement/capture
                const isHostile = planet.owner && planet.owner !== planet.capturingTeam;
                
                // Draw background track (faint)
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 2 / zoom;
                ctx.beginPath();
                ctx.arc(x, y, captureRadius, 0, Math.PI * 2);
                ctx.stroke();

                if (isHostile) {
                    // Flashing Red for hostile neutralization
                    const flash = Math.sin(Date.now() / 100) > 0 ? '#FF4500' : '#8B0000';
                    ctx.strokeStyle = flash;
                } else {
                    ctx.strokeStyle = capturingPlayer.color;
                }
                ctx.lineWidth = 2 / zoom; // Keep it visible
                ctx.beginPath();
                // Draw a partial arc based on capture progress, starting from the top
                const endAngle = (planet.captureProgress / 100) * Math.PI * 2 - (Math.PI / 2);
                ctx.arc(x, y, captureRadius, -Math.PI / 2, endAngle);
                ctx.stroke();
            }
        }
    }

    drawDebris(ctx, debris) {
        const zoom = this.gameEngine.camera.zoom;
        const scrapAmount = debris.resources?.scrap || 0;
        const opacity = 0.25;
        const radius = 10 + (scrapAmount / 20);

        // Base glow - fade out slightly when zoomed in to reveal details
        ctx.globalAlpha = zoom > 1.0 ? Math.max(0.1, opacity - (zoom - 1.0) * 0.1) : opacity;
        ctx.drawImage(this.debrisGlow, debris.x - radius, debris.y - radius, radius * 2, radius * 2);
        

        // Detailed Debris Chunks (High Zoom)
        if (zoom > 0.8) {
            const seedStr = debris.id || 'debris';
            let seed = seedStr.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
            const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

            // Generate or retrieve cached geometry
            let geometry = this.debrisCache.get(debris.id);
            if (!geometry) {
                geometry = [];
                const chunkCount = Math.min(40, Math.ceil(scrapAmount / 5)); // Fixed count based on scrap
                
                for (let i = 0; i < chunkCount; i++) {
                    const angle = random() * Math.PI * 2;
                    const dist = Math.sqrt(random()) * (radius * 0.9);
                    const chunkSize = (random() * 3 + 2); // Fixed world size
                    
                    const cx = Math.cos(angle) * dist;
                    const cy = Math.sin(angle) * dist;
                    const tumbleSpeed = 0.0005 * (random() - 0.5);
                    
                    const vertices = [];
                    const sides = 3 + Math.floor(random() * 3);
                    for (let j = 0; j < sides; j++) {
                        const theta = (j / sides) * Math.PI * 2;
                        const r = chunkSize * (0.6 + random() * 0.4);
                        vertices.push({
                            x: Math.cos(theta) * r,
                            y: Math.sin(theta) * r
                        });
                    }
                    
                    geometry.push({ cx, cy, tumbleSpeed, vertices });
                }
                this.debrisCache.set(debris.id, geometry);
            }

            ctx.save();
            ctx.translate(debris.x, debris.y);
            
            // Slowly rotate the whole field
            const time = this.gameEngine.state.gameTime || 0;
            const rotationSpeed = 0.00005 * (seed % 2 === 0 ? 1 : -1);
            ctx.rotate(time * rotationSpeed);

            ctx.globalAlpha = Math.min(0.35, 0.075 * zoom);
            ctx.fillStyle = '#666666'; // Dark grey for scrap
            ctx.strokeStyle = '#444444';
            ctx.lineWidth = 0.5 / zoom;

            ctx.beginPath();

            geometry.forEach(chunk => {
                const tumbleAngle = time * chunk.tumbleSpeed;
                const cosT = Math.cos(tumbleAngle);
                const sinT = Math.sin(tumbleAngle);

                chunk.vertices.forEach((v, j) => {
                    // Rotate vertex
                    const rvx = v.x * cosT - v.y * sinT;
                    const rvy = v.x * sinT + v.y * cosT;

                    // Translate to position
                    const px = chunk.cx + rvx;
                    const py = chunk.cy + rvy;

                    if (j === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                });
                ctx.closePath();
            });
            
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        ctx.globalAlpha = 1.0;
    }

    drawFleetComposition(ctx, fleetId, ships) {
        const zoom = this.gameEngine.camera.zoom;
        if (zoom < 0.8) return; // Only show when zoomed in

        // Calculate centroid
        let totalX = 0;
        let totalY = 0;
        ships.forEach(s => {
            totalX += s.x;
            totalY += s.y;
        });
        const cx = totalX / ships.length;
        const cy = totalY / ships.length;

        // Group ships by type
        const counts = {};
        ships.forEach(s => {
            counts[s.type] = (counts[s.type] || 0) + 1;
        });

        // Sort types
        const types = Object.keys(counts).sort();

        // Layout configuration
        const fontSize = Math.max(12, 8 / zoom);
        const lineHeight = fontSize * 1.2;
        const padding = Math.max(6, 4 / zoom);
        const colGap = Math.max(8, 5 / zoom);
        
        ctx.font = `${fontSize}px monospace`;
        let maxCountWidth = 0;
        let maxTypeWidth = 0;
        types.forEach(type => {
            const cWidth = ctx.measureText(`${counts[type]}x`).width;
            const tWidth = ctx.measureText(type).width;
            if (cWidth > maxCountWidth) maxCountWidth = cWidth;
            if (tWidth > maxTypeWidth) maxTypeWidth = tWidth;
        });
        
        const contentWidth = maxCountWidth + colGap + maxTypeWidth;
        const boxWidth = padding * 2 + contentWidth;
        const boxHeight = (padding * 2) + (types.length * lineHeight);
        
        // Position bubble (Centered below fleet)
        const offset = 40 + (20 / zoom);
        const boxX = cx - (boxWidth / 2);
        const boxY = cy + offset;

        ctx.save();
        
        // Fade in based on zoom (0.8 to 1.0)
        ctx.globalAlpha = Math.min(1.0, (zoom - 0.8) * 5);
        
        // Draw connecting line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, boxY);
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        // Pulsing Glow
        const time = this.gameEngine.state.gameTime || 0;
        const pulse = (Math.sin(time / 800) + 1) / 2; 
        ctx.shadowColor = `rgba(0, 190, 255, ${0.3 + pulse * 0.3})`;
        ctx.shadowBlur = 10 / zoom;

        // Draw Forerunner-style background
        const chamfer = 8 / zoom;
        
        ctx.beginPath();
        ctx.moveTo(boxX + chamfer, boxY);
        ctx.lineTo(boxX + boxWidth - chamfer, boxY);
        ctx.lineTo(boxX + boxWidth, boxY + chamfer);
        ctx.lineTo(boxX + boxWidth, boxY + boxHeight - chamfer);
        ctx.lineTo(boxX + boxWidth - chamfer, boxY + boxHeight);
        ctx.lineTo(boxX + chamfer, boxY + boxHeight);
        ctx.lineTo(boxX, boxY + boxHeight - chamfer);
        ctx.lineTo(boxX, boxY + chamfer);
        ctx.closePath();

        const bgGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxHeight);
        bgGrad.addColorStop(0, 'rgba(0, 20, 40, 0.9)');
        bgGrad.addColorStop(1, 'rgba(0, 10, 20, 0.95)');
        ctx.fillStyle = bgGrad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        // Corner Accents
        ctx.strokeStyle = 'rgba(100, 220, 255, 0.9)';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.moveTo(boxX, boxY + chamfer * 2); ctx.lineTo(boxX, boxY + chamfer); ctx.lineTo(boxX + chamfer, boxY); ctx.lineTo(boxX + chamfer * 2, boxY);
        ctx.moveTo(boxX + boxWidth, boxY + boxHeight - chamfer * 2); ctx.lineTo(boxX + boxWidth, boxY + boxHeight - chamfer); ctx.lineTo(boxX + boxWidth - chamfer, boxY + boxHeight); ctx.lineTo(boxX + boxWidth - chamfer * 2, boxY + boxHeight);
        ctx.stroke();

        // Reset Shadow
        ctx.shadowBlur = 0;

        // Draw Content
        ctx.fillStyle = '#FFFFFF';
        ctx.textBaseline = 'top';
        const contentStartY = boxY + padding;
        const blockX = boxX + padding;

        types.forEach((type, i) => {
            const y = contentStartY + (i * lineHeight);
            
            ctx.textAlign = 'right';
            ctx.fillText(`${counts[type]}x`, blockX + maxCountWidth, y);
            
            ctx.textAlign = 'left';
            ctx.fillText(type, blockX + maxCountWidth + colGap, y);
        });
        ctx.restore();
    }

    createPlanetTexture(planet) {
        const size = 128; // Texture resolution
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Seeded RNG for consistent planet look
        let seed = planet.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
        const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2;

        // Configuration per planet type
        const configs = {
            Terran: { 
                base: '#1a4485', // Deep Blue
                features: ['#4b9e4b', '#2e6b2e', '#8d6e63', '#2b65b5'], // Land masses
                atmosphere: 'rgba(135, 206, 235, 0.4)', // Sky blue
                clouds: true 
            },
            Industrial: { 
                base: '#222222', // Dark Grey
                features: ['#555555', '#333333', '#1a1a1a', '#B8860B'], // Structures/Lights
                atmosphere: 'rgba(200, 200, 200, 0.2)', // Smog
                clouds: false 
            },
            Mining: { 
                base: '#3e2723', // Dark Brown
                features: ['#6d5446', '#8d6e63', '#4a3b32', '#A0522D'], // Rock variations
                atmosphere: 'rgba(160, 82, 45, 0.3)', // Dusty
                clouds: false 
            },
            Farming: { 
                base: '#558b2f', // Green
                features: ['#8bc34a', '#33691e', '#aed581', '#DAA520'], // Fields
                atmosphere: 'rgba(255, 255, 255, 0.3)', // Clean air
                clouds: true 
            }
        };

        const config = configs[planet.type] || configs['Terran'];

        // 1. Draw Base Sphere
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = config.base;
        ctx.fill();
        
        // Clip to sphere for subsequent layers
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        // 2. Draw Surface Features (Procedural blobs)
        ctx.globalAlpha = 0.125;
        const featureCount = 15 + Math.floor(random() * 15);
        for (let i = 0; i < featureCount; i++) {
            const color = config.features[Math.floor(random() * config.features.length)];
            const radius = (random() * r * 0.5) + (r * 0.1);
            const x = random() * size;
            const y = random() * size;
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 3. Draw Clouds (if applicable)
        if (config.clouds) {
            // Using just the fillStyle's alpha is cleaner. The previous combination of
            // globalAlpha and rgba alpha resulted in nearly invisible clouds.
            // This value provides a subtle but visible effect.
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            const cloudCount = 8 + Math.floor(random() * 8);
            for (let i = 0; i < cloudCount; i++) {
                const w = (random() * r) + 20;
                const h = w * 0.4;
                const x = random() * size;
                const y = random() * size;
                ctx.beginPath();
                ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 4. Atmosphere Glow (Inner Ring)
        if (config.atmosphere) {
            const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
            atmoGrad.addColorStop(0, 'rgba(0,0,0,0)');
            atmoGrad.addColorStop(1, config.atmosphere);
            
            ctx.fillStyle = atmoGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. Spherical Shading (Inner Shadow/Highlight) to give 3D effect
        const grad = ctx.createRadialGradient(
            cx - r * 0.3, cy - r * 0.3, r * 0.1,
            cx, cy, r
        );
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)'); // Specular highlight
        grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');       // Midtone
        grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.3)');    // Shadow edge
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');       // Dark rim

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        
        ctx.restore(); // Remove clip

        return canvas;
    }

    createStarTexture(system) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const r = size / 2;
        const center = size / 2;

        // Seeded random
        let seed = system.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
        const random = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        // Star Spectral Colors
        const spectralColors = [
            '#9bb0ff', // O - Blue
            '#aabfff', // B - Blue-white
            '#cad7ff', // A - White
            '#f8f7ff', // F - Yellow-white
            '#fff4ea', // G - Yellow
            '#ffd2a1', // K - Orange
            '#ffcc6f', // M - Red
            '#ff4500'  // Red Giant
        ];

        let baseColor = system.color;
        if (!baseColor) {
            // Pick a random spectral color if not assigned
            baseColor = spectralColors[Math.floor(random() * spectralColors.length)];
            system.color = baseColor;
        }

        // 1. Halo / Corona
        const coronaSize = 0.4 + (random() * 0.2); 
        const haloGrad = ctx.createRadialGradient(center, center, r * 0.2, center, center, r * coronaSize);
        haloGrad.addColorStop(0, baseColor);
        haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haloGrad;
        ctx.fillRect(0, 0, size, size);

        // 2. Core Surface
        const coreR = r * 0.25;
        const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, coreR);
        coreGrad.addColorStop(0, '#FFFFFF'); // Hot center
        coreGrad.addColorStop(0.5, baseColor);
        coreGrad.addColorStop(1, baseColor);
        
        ctx.beginPath();
        ctx.arc(center, center, coreR, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();

        // 2.5 Subtle Texture (Granulation)
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, coreR, 0, Math.PI * 2);
        ctx.clip();

        const textureCount = 40;
        for(let i = 0; i < textureCount; i++) {
            const angle = random() * Math.PI * 2;
            const dist = Math.sqrt(random()) * coreR;
            const x = center + Math.cos(angle) * dist;
            const y = center + Math.sin(angle) * dist;
            const size = random() * (coreR * 0.15) + 1;

            ctx.fillStyle = random() > 0.5 ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 3. Surface Turbulence
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, coreR, 0, Math.PI * 2);
        ctx.clip();

        const spotCount = 8 + Math.floor(random() * 8);
        for(let i = 0; i < spotCount; i++) {
            const angle = random() * Math.PI * 2;
            const dist = random() * coreR * 0.8;
            const spotR = random() * (coreR * 0.3);
            const x = center + Math.cos(angle) * dist;
            const y = center + Math.sin(angle) * dist;

            ctx.beginPath();
            ctx.arc(x, y, spotR, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + random() * 0.3})`;
            if (random() > 0.7) ctx.fillStyle = `rgba(0, 0, 0, ${0.1 + random() * 0.2})`;
            ctx.fill();
        }
        ctx.restore();

        return canvas;
    }

    drawMines(ctx) {
        if (!this.gameEngine.state.mines) return;
        const zoom = this.gameEngine.camera.zoom;
        const viewingIds = this.gameEngine.getViewingPlayerIds();
        const isHostGodView = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';

        this.gameEngine.state.mines.forEach(mine => {
            // Visibility check: Owner or God view
            if (!isHostGodView && !viewingIds.includes(mine.owner)) {
                // Mines are invisible to enemies unless detected (detection logic not yet implemented, so invisible for now)
                return;
            }

            ctx.fillStyle = '#FF4444';
            ctx.strokeStyle = '#880000';
            ctx.lineWidth = 1 / zoom;
            
            const r = 4 / zoom;
            ctx.beginPath();
            ctx.arc(mine.x, mine.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Draw spikes
            for(let i=0; i<4; i++) {
                const angle = (Math.PI / 2) * i + (this.gameEngine.state.gameTime / 500);
                const sx = mine.x + Math.cos(angle) * r * 2;
                const sy = mine.y + Math.sin(angle) * r * 2;
                ctx.beginPath();
                ctx.moveTo(mine.x, mine.y);
                ctx.lineTo(sx, sy);
                ctx.stroke();
            }
        });
    }

    drawHazards(ctx) {
        if (!this.gameEngine.state.hazards) return;
        const zoom = this.gameEngine.camera.zoom;

        this.gameEngine.state.hazards.forEach(hazard => {
            if (hazard.type === 'NEBULA') {
                ctx.save();
                ctx.translate(hazard.x, hazard.y);
                
                const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, hazard.radius);
                grad.addColorStop(0, 'rgba(100, 0, 100, 0.2)');
                grad.addColorStop(0.6, 'rgba(150, 50, 150, 0.1)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, hazard.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else if (hazard.type === 'BLACK_HOLE') {
                ctx.save();
                ctx.translate(hazard.x, hazard.y);
                
                // Event Horizon
                ctx.fillStyle = '#000000';
                ctx.strokeStyle = 'rgba(100, 100, 255, 0.5)';
                ctx.lineWidth = 2 / zoom;
                ctx.beginPath();
                ctx.arc(0, 0, hazard.radius * 0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Accretion Disk
                ctx.strokeStyle = 'rgba(200, 100, 50, 0.3)';
                ctx.lineWidth = 4 / zoom;
                ctx.beginPath();
                ctx.arc(0, 0, hazard.radius * 0.6, 0, Math.PI * 2);
                ctx.stroke();

                ctx.restore();
            }
        });
    }

    drawSelection(ctx, checkVisibility, visibleShips) {
        const selLocId = this.gameEngine.selectionManager.selectedLocationId;
        const selShipId = this.gameEngine.selectionManager.selectedShipId;
        const state = this.gameEngine.state;

        if (selLocId) {
            // Check if it's a planet
            if (selLocId.includes('-p')) {
                // Find planet
                for (const sys of state.systems) {
                    const planetIndex = sys.planets.findIndex(p => p.id === selLocId);
                    if (planetIndex !== -1) {
                        const planet = sys.planets[planetIndex];
                        // Calculate position (duplicate logic from drawSystem/InteractionService)
                        const r = sys.r;
                        const orbitBase = r + 10;
                        const planetGap = 8;
                        const angle = (this.gameEngine.state.gameTime / 10000 + planetIndex) % (Math.PI * 2);
                        const semiMajor = orbitBase + (planetIndex * planetGap);
                        const semiMinor = semiMajor * 0.65;
                        const tilt = ((sys.x + sys.y) % 360) * (Math.PI / 180);

                        const px = sys.x + (Math.cos(angle) * semiMajor * Math.cos(tilt) - Math.sin(angle) * semiMinor * Math.sin(tilt));
                        const py = sys.y + (Math.cos(angle) * semiMajor * Math.sin(tilt) + Math.sin(angle) * semiMinor * Math.cos(tilt));

                        const pRadius = (PLANET_TYPES[planet.type]?.radius || 3);
                        const selectionRadius = (pRadius + 5) / this.gameEngine.camera.zoom * this.gameEngine.camera.zoom + (4 / this.gameEngine.camera.zoom);

                        ctx.strokeStyle = '#00FF00';
                        ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                        ctx.beginPath();
                        ctx.arc(px, py, selectionRadius, 0, Math.PI * 2);
                        ctx.stroke();
                        break;
                    }
                }
            } else {
                const sys = state.systems.find(s => s.id === selLocId);
            if (sys) {
                // Check visibility
                const visibility = checkVisibility ? checkVisibility(sys) : 'explored';
                if (visibility && visibility !== 'unexplored') {
                    // Make padding and line width constant in screen space by dividing by zoom
                    const selectionPadding = 8 / this.gameEngine.camera.zoom;
                    ctx.strokeStyle = '#00FF00';
                    ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                    ctx.beginPath();
                    ctx.arc(sys.x, sys.y, sys.r + selectionPadding, 0, Math.PI * 2);
                    ctx.stroke();

                    // Draw effective radius boundary
                    const effectiveRadius = this.gameEngine.spatialService.getSystemEffectiveRadius(sys);
                    ctx.save();
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
                    ctx.lineWidth = 1 / this.gameEngine.camera.zoom;
                    ctx.setLineDash([5 / this.gameEngine.camera.zoom, 5 / this.gameEngine.camera.zoom]);
                    ctx.beginPath();
                    ctx.arc(sys.x, sys.y, effectiveRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
            } else {
                // Check if it's a station (which is stored in ships but selected as a location)
                const station = state.ships.find(s => s.id === selLocId && s.isStation);
                if (station && (!visibleShips || visibleShips.includes(station))) {
                    const selectionRadius = 40 / this.gameEngine.camera.zoom;
                    ctx.strokeStyle = '#00FF00';
                    ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                    ctx.beginPath();
                    ctx.arc(station.x, station.y, selectionRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            }
        }

        if (selShipId) {
            const ship = state.ships.find(s => s.id === selShipId);
            if (ship && (!visibleShips || visibleShips.includes(ship))) {
                let drawX = ship.x;
                let drawY = ship.y;

                // If ship is in a fleet, selection circle should be around the fleet icon
                if (ship.fleetId) {
                    // Use the same representative ship as drawFleet to ensure sync
                    const fleetShips = (visibleShips || state.ships).filter(s => s.fleetId === ship.fleetId);
                    
                    if (fleetShips.length > 0) {
                        // Centroid logic matching drawFleet for all fleets to ensure sync
                        let totalX = 0;
                        let totalY = 0;
                        fleetShips.forEach(s => {
                            totalX += s.x;
                            totalY += s.y;
                        });
                        drawX = totalX / fleetShips.length;
                        drawY = totalY / fleetShips.length;
                    }
                }

                // Make selection radius and line width constant in screen space
                const selectionRadius = 12 / this.gameEngine.camera.zoom;
                ctx.strokeStyle = '#00FF00';
                ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                ctx.beginPath();
                ctx.arc(drawX, drawY, selectionRadius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    drawSelectedLocationUI() {
        // This method is called by GameEngine to update the DOM UI based on selection
        // Implementation logic is handled in SelectionManager or a separate UI manager in a full framework,
        // but here we can trigger a custom event or update the DOM directly if needed.
        // For now, we'll rely on the GameEngine's existing logic or the RenderService logic if moved here.
        // (See implementation in previous thought block for full DOM update logic if required)
    }
}