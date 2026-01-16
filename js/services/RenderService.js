import { PLANET_TYPES } from './GalaxyService.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../cb_constants.js';

export class RenderService {
    constructor(canvas, gameEngine, spriteService) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameEngine = gameEngine;
        this.spriteService = spriteService;
    }

    draw() {
        const ctx = this.ctx;
        const state = this.gameEngine.state;
        const pan = this.gameEngine.camera.pan;
        const zoom = this.gameEngine.camera.zoom;

        // Clear background
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);

        const isHostGodView = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';
        const viewingIds = this.gameEngine.getViewingPlayerIds();
        
        // Helper to check visibility based on viewing mode (Player ID or Faction Name)
        const checkVisibility = (system) => {
            if (isHostGodView) return 'explored';
            // Check if ANY viewing player has visibility
            for (const id of viewingIds) {
                if (system.visibility[id] === 'explored') return 'explored';
            }
            for (const id of viewingIds) {
                if (system.visibility[id] === 'scouted') return 'scouted';
            }
            return 'unexplored';
        };

        // 0. Draw Fog of War on top of the game world
        this.drawFogOfWar(ctx, state, viewingIds, isHostGodView, checkVisibility);

        // 1. Draw Links (Warp lanes)
        this.drawLinks(ctx, state.systems, viewingIds, isHostGodView, checkVisibility);

        // 2. Draw Systems (Stars and Planets)
        state.systems.forEach(system => this.drawSystem(ctx, system, checkVisibility));

        // 3. Draw Debris
        state.debrisFields.forEach(debris => {
            if (isHostGodView) {
                this.drawDebris(ctx, debris);
            } else {
                // Check if debris is near any explored system
                const isVisible = state.systems.some(sys => {
                    const visibility = checkVisibility(sys);
                    if (!visibility || visibility === 'unexplored') return false;
                    
                    const dx = sys.x - debris.x;
                    const dy = sys.y - debris.y;
                    return (dx * dx + dy * dy) < (200 * 200);
                });
                if (isVisible) this.drawDebris(ctx, debris);
            }
        });

        // 4. Draw Fleet Movement Paths
        this.drawFleetMovementPaths(ctx, state, viewingIds, isHostGodView);

        // Determine which systems are visible to the player (has ships present or owns the system)
        const visibleSystemIds = new Set();
        if (!isHostGodView) {
            state.systems.forEach(s => {
                if (viewingIds.includes(s.owner)) visibleSystemIds.add(s.id);
            });
            state.ships.forEach(s => {
                if (viewingIds.includes(s.owner) && s.currentSystemId) visibleSystemIds.add(s.currentSystemId);
            });
        }

        // 5. Draw Ships
        const visibleShips = isHostGodView 
            ? state.ships 
            : state.ships.filter(ship => {
                const isOwner = viewingIds.includes(ship.owner);
                return isOwner || (ship.currentSystemId && visibleSystemIds.has(ship.currentSystemId));
            });
            
        visibleShips.forEach(ship => this.drawShip(ctx, ship));

        this.drawSelection(ctx, checkVisibility, visibleShips);

        ctx.restore();
    }

    drawFogOfWar(ctx, state, viewingIds, isHostGodView, checkVisibility) {
        if (isHostGodView) return;

        ctx.save();

        // 1. Fill the entire map with a semi-transparent color. This is our fog layer.
        // Using red for debugging as requested. A good production value would be 'rgba(15, 17, 21, 0.85)'
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(-50000, -50000, 100000, 100000);

        // 2. Cut out holes for vision using destination-out
        ctx.globalCompositeOperation = 'destination-out';

        const cutHole = (x, y, radius) => {
            const grad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius);
            grad.addColorStop(0, 'rgba(0, 0, 0, 1)'); // Opaque center of hole
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent edge of hole
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        };

        // Vision from Owned Ships
        const myShips = state.ships.filter(s => viewingIds.includes(s.owner));

        myShips.forEach(ship => {
            // Scouts have larger sensor range
            const sensorRange = ship.type === 'Scout' ? 250 : 150;
            cutHole(ship.x, ship.y, sensorRange);
        });

        // Vision from Owned Systems
        state.systems.forEach(system => {
            const visibility = checkVisibility(system);
            // Cut a hole for any system that is not completely unexplored.
            // This includes owned, explored, and scouted systems.
            if (visibility && visibility !== 'unexplored') {
                const r = this.gameEngine.spatialService.getSystemEffectiveRadius(system) + 100;
                cutHole(system.x, system.y, r);
            }
        });

        ctx.restore(); // Restore composite operation to default ('source-over')
    }

    drawFleetMovementPaths(ctx, state, viewingIds, isHostGodView) {
        const playersToRender = isHostGodView ? state.players : state.players.filter(p => {
            return viewingIds.includes(p.id);
        });

        // Draw paths for fleets
        playersToRender.forEach(player => {
            if (!player.fleets) return;

            player.fleets.forEach(fleet => {
                const fleetShips = state.ships.filter(s => fleet.shipIds.includes(s.id)); 
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

    drawLinks(ctx, systems, viewingIds, isHostGodView, checkVisibility) {
        ctx.lineWidth = 2;
        const drawn = new Set();
        
        systems.forEach(sys => {
            const visibility = checkVisibility(sys);
            if (!isHostGodView && (!visibility || visibility === 'unexplored')) {
                return; // Don't draw links from an unexplored system
            }

            sys.links.forEach(link => {
                // Sort IDs to ensure we don't draw the same link twice
                const key = [sys.id, link.targetId].sort().join('-');
                if (drawn.has(key)) return;
                
                const target = systems.find(s => s.id === link.targetId);
                if (target) {
                    ctx.beginPath();
                    ctx.moveTo(sys.x, sys.y);
                    ctx.lineTo(target.x, target.y);
                    
                    if (link.type === 'two-way') {
                        ctx.strokeStyle = 'rgba(0, 160, 192, 0.3)'; // Cyan low opacity
                        ctx.setLineDash([]);
                        drawn.add(key); // Only prevent drawing two-way links twice
                    } else {
                        ctx.strokeStyle = 'rgba(204, 51, 51, 0.3)'; // Red low opacity
                        ctx.setLineDash([5, 5]);
                    }
                    
                    ctx.stroke();
                }
            });
        });
        ctx.setLineDash([]);
    }

    drawSystem(ctx, system, checkVisibility) {
        const isHostGodView = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';
        const visibility = checkVisibility(system);
        
        // In God View, the host sees everything. Otherwise, respect visibility.
        if (!isHostGodView && (!visibility || visibility === 'unexplored')) return;

        // Draw Star
        const r = system.r;
        const grad = ctx.createRadialGradient(system.x, system.y, r * 0.2, system.x, system.y, r);
        grad.addColorStop(0, '#FFF');
        grad.addColorStop(0.5, system.color || '#FDB813'); // Default yellow star
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(system.x, system.y, r, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw System Name
        const baseFontSize = 12;
        const finalFontSize = Math.max(baseFontSize, 8 / this.gameEngine.camera.zoom); // Ensure a minimum readable size on screen
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `${finalFontSize}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(system.name, system.x, system.y - r - 10);

        // Draw Owner Flag
        if (system.owner) {
            const owner = this.gameEngine.state.players.find(p => p.id === system.owner);
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
            const ownerPlayer = this.gameEngine.state.players.find(p => p.id === system.owner);
            const ownerColor = ownerPlayer ? ownerPlayer.color : '#FFFFFF';
            ctx.strokeStyle = ownerColor;
            ctx.lineWidth = 3 / this.gameEngine.camera.zoom; // Keep line width constant on screen
            ctx.beginPath();
            ctx.arc(system.x, system.y, r + 5, 0, Math.PI * 2); // A ring just outside the star's glow
            ctx.stroke();
        }

        // Draw Capture Activity Indicator on System (if any planet is being captured)
        const activeCapture = system.planets.find(p => p.captureProgress > 0 && p.captureProgress < 100);
        if (activeCapture && (isHostGodView || visibility === 'explored')) {
             const capturingPlayer = this.gameEngine.state.players.find(p => p.id === activeCapture.capturingTeam);
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
        if (isHostGodView || visibility === 'explored' || visibility === 'scouted') {
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
                this.drawPlanetMini(ctx, planet, px, py, radius);
            });
        }

        // Draw AI Goal in God View
        if (isHostGodView && system.owner) {
            const owner = this.gameEngine.state.players.find(p => p.id === system.owner);
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
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        const path = new Path2D("M12.45 4L12 2H4v18h2v-7h5.55l.45 2h8V4h-7.55z");
        ctx.fill(path);
        ctx.restore();
    }

    drawPlanetMini(ctx, planet, x, y, r) {
        // Ensure planets have a minimum visible size when zoomed out
        const minPixelRadius = 1.5;
        const finalRadius = Math.max(r, minPixelRadius / this.gameEngine.camera.zoom);
        const typeInfo = PLANET_TYPES[planet.type];
        ctx.fillStyle = typeInfo ? typeInfo.color : '#888';
        
        ctx.beginPath();
        ctx.arc(x, y, finalRadius, 0, Math.PI * 2);
        ctx.fill();
        
        let ringOffset = 3 / this.gameEngine.camera.zoom;

        if (planet.owner) {
            const ownerPlayer = this.gameEngine.state.players.find(p => p.id === planet.owner);
            ctx.strokeStyle = ownerPlayer ? ownerPlayer.color : '#FFFFFF';
            ctx.lineWidth = 2 / this.gameEngine.camera.zoom; // Make it visible like the capture ring
            ctx.beginPath();
            ctx.arc(x, y, finalRadius + ringOffset, 0, Math.PI * 2);
            ctx.stroke();
            ringOffset += 3 / this.gameEngine.camera.zoom; // Push next ring out
        }

        // Draw capture progress ring
        if (planet.captureProgress > 0 && planet.captureProgress < 100) {
            const capturingPlayer = this.gameEngine.state.players.find(p => p.id === planet.capturingTeam);
            if (capturingPlayer) {
                const captureRadius = finalRadius + ringOffset;

                // Draw background track (faint)
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                ctx.beginPath();
                ctx.arc(x, y, captureRadius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = capturingPlayer.color;
                ctx.lineWidth = 2 / this.gameEngine.camera.zoom; // Keep it visible
                ctx.beginPath();
                // Draw a partial arc based on capture progress, starting from the top
                const endAngle = (planet.captureProgress / 100) * Math.PI * 2 - (Math.PI / 2);
                ctx.arc(x, y, captureRadius, -Math.PI / 2, endAngle);
                ctx.stroke();
            }
        }
    }

    drawDebris(ctx, debris) {
        const scrapAmount = debris.resources?.scrap || 0;
        
        const opacity = 0.25;
        const radius = 10 + (scrapAmount / 20); // Scale size with amount

        const grad = ctx.createRadialGradient(debris.x, debris.y, radius * 0.2, debris.x, debris.y, radius);
        grad.addColorStop(0, `rgba(150, 150, 150, ${opacity})`);
        grad.addColorStop(1, `rgba(100, 100, 100, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(debris.x, debris.y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    drawShip(ctx, ship) {
        const sprite = this.spriteService.getSprite(ship.techBase, ship.type);
        if (this.spriteService.isLoaded && sprite) {
            this._drawShipSprite(ctx, ship, sprite);
        } else {
            // Fallback to geometric shapes if sprites aren't loaded or one is missing
            this._drawShipShape(ctx, ship);
        }
    }

    _drawShipSprite(ctx, ship, sprite) {
        ctx.save();
        ctx.translate(ship.x, ship.y);

        let rotation = 0;
        if (ship.targetId) {
            const target = this.gameEngine.state.systems.find(s => s.id === ship.targetId) || this.gameEngine.state.debrisFields.find(d => d.id === ship.targetId);
            if (target) {
                rotation = Math.atan2(target.y - ship.y, target.x - ship.x);
            }
        }
        ctx.rotate(rotation + Math.PI / 2); // Assumes sprites face "up"

        // Define target display sizes for each ship type in pixels to approximate original polygon sizes.
        const TARGET_SIZES = {
            Fighter: 24,
            Scout: 32,
            TroopTransport: 32,
            Salvager: 28,
            Frigate: 48,
            SpaceStation: 64,
            default: 24
        };

        const targetSize = TARGET_SIZES[ship.type] || TARGET_SIZES.default;

        // Calculate scale to fit the target size, based on the sprite's largest dimension.
        // This ensures the ship fits within a `targetSize` x `targetSize` box.
        const maxDim = Math.max(sprite.width, sprite.height);
        if (maxDim === 0) return; // Avoid division by zero if sprite is not loaded
        const scale = targetSize / maxDim;

        const w = sprite.width * scale;
        const h = sprite.height * scale;

        // Draw sprite centered on the ship's coordinates
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);

        // Un-rotate for non-rotated UI elements like health bars and icons
        ctx.rotate(-(rotation + Math.PI / 2));

        // Health Bar
        if (ship.hull < ship.maxHull) {
            const barY = (h / 2) + 5; // Position below the sprite
            ctx.fillStyle = 'red';
            ctx.fillRect(-10, barY, 20, 3);
            ctx.fillStyle = '#0F0';
            ctx.fillRect(-10, barY, 20 * (ship.hull / ship.maxHull), 3);
        }

        // Repair/Upgrade Indicator
        if (ship.isRepairing) {
            const iconSize = 14 / this.gameEngine.camera.zoom;
            ctx.font = `${iconSize}px sans-serif`;
            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔧', 15, 0);
        }

        ctx.restore();
    }

    _drawShipShape(ctx, ship) {
        ctx.fillStyle = ship.color || '#FFFFFF';
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;

        ctx.save();
        ctx.translate(ship.x, ship.y);
        
        // Determine rotation based on target
        let rotation = 0;
        if (ship.targetId) {
            const target = this.gameEngine.state.systems.find(s => s.id === ship.targetId);
            if (target) {
                rotation = Math.atan2(target.y - ship.y, target.x - ship.x);
            }
        }
        ctx.rotate(rotation + Math.PI / 2); // +90deg because standard draw is pointing up

        if (ship.isStation) {
            // Station: Hexagon
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                ctx.lineTo(8 * Math.cos(i * Math.PI / 3), 8 * Math.sin(i * Math.PI / 3));
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            // Ships
            ctx.beginPath();

            if (ship.techBase === 'COVENANT') {
                // --- COVENANT SHIP SHAPES (Curved, Organic) ---
                if (ship.type === 'Fighter') {
                    ctx.moveTo(0, -8);
                    ctx.bezierCurveTo(6, 0, 6, 6, 0, 4);
                    ctx.bezierCurveTo(-6, 6, -6, 0, 0, -8);
                } else if (ship.type === 'Scout') {
                    ctx.moveTo(0, -9);
                    ctx.lineTo(4, 7);
                    ctx.lineTo(0, 5);
                    ctx.lineTo(-4, 7);
                } else if (ship.type === 'TroopTransport') {
                    ctx.moveTo(0, -7);
                    ctx.bezierCurveTo(8, -5, 8, 7, 0, 7);
                    ctx.bezierCurveTo(-8, 7, -8, -5, 0, -7);
                } else if (ship.type === 'Frigate') {
                    ctx.moveTo(0, -12);
                    ctx.bezierCurveTo(10, 0, 8, 10, 0, 6);
                    ctx.bezierCurveTo(-8, 10, -10, 0, 0, -12);
                } else { // Default Covenant shape (e.g., for Salvager)
                    ctx.moveTo(0, -7);
                    ctx.lineTo(5, 0);
                    ctx.lineTo(0, 7);
                    ctx.lineTo(-5, 0);
                }
            } else {
                // --- UNSC / DEFAULT SHIP SHAPES (Angular, Utilitarian) ---
                if (ship.type === 'Fighter') {
                    ctx.moveTo(0, -6);
                    ctx.lineTo(4, 4);
                    ctx.lineTo(0, 2);
                    ctx.lineTo(-4, 4);
                } else if (ship.type === 'Scout') {
                    ctx.moveTo(0, -8);
                    ctx.lineTo(3, 6);
                    ctx.lineTo(-3, 6);
                } else if (ship.type === 'TroopTransport') {
                    ctx.rect(-4, -6, 8, 12);
                } else if (ship.type === 'Salvager') {
                    ctx.moveTo(-4, -4);
                    ctx.lineTo(4, -4);
                    ctx.lineTo(6, 0);
                    ctx.lineTo(4, 4);
                    ctx.lineTo(-4, 4);
                    ctx.lineTo(-6, 0);
                } else if (ship.type === 'Frigate') {
                    ctx.moveTo(0, -10);
                    ctx.lineTo(5, 8);
                    ctx.lineTo(0, 5);
                    ctx.lineTo(-5, 8);
                } else { // Default triangle
                    ctx.moveTo(0, -6);
                    ctx.lineTo(5, 5);
                    ctx.lineTo(-5, 5);
                }
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Un-rotate for non-rotated UI elements like health bars and icons
        ctx.rotate(-(rotation + Math.PI / 2));

        // Health Bar
        if (ship.hull < ship.maxHull) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-6, 10, 12, 2);
            ctx.fillStyle = '#0F0';
            ctx.fillRect(-6, 10, 12 * (ship.hull / ship.maxHull), 2);
        }

        // Repair/Upgrade Indicator
        if (ship.isRepairing) {
            // Make icon size consistent regardless of zoom
            const iconSize = 14 / this.gameEngine.camera.zoom;
            ctx.font = `${iconSize}px sans-serif`;
            ctx.fillStyle = '#FFD700'; // Gold color for the wrench
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔧', 15, 0); // Position to the right of the ship
        }

        ctx.restore();
    }

    drawSelection(ctx, checkVisibility, visibleShips) {
        const selLocId = this.gameEngine.selectionManager.selectedLocationId;
        const selShipId = this.gameEngine.selectionManager.selectedShipId;
        const state = this.gameEngine.state;

        if (selLocId) {
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

        if (selShipId) {
            const ship = state.ships.find(s => s.id === selShipId);
            if (ship && (!visibleShips || visibleShips.includes(ship))) {
                // Make selection radius and line width constant in screen space
                const selectionRadius = 12 / this.gameEngine.camera.zoom;
                ctx.strokeStyle = '#00FF00';
                ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                ctx.beginPath();
                ctx.arc(ship.x, ship.y, selectionRadius, 0, Math.PI * 2);
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