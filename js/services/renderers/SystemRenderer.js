import { PLANET_TYPES } from '../GalaxyService.js';

export class SystemRenderer {
    constructor(ctx, gameEngine, textureGenerator) {
        this.ctx = ctx;
        this.gameEngine = gameEngine;
        this.textureGenerator = textureGenerator;
        this.planetCache = new Map();
        this.starCache = new Map();
        this.flagPath = new Path2D("M12.45 4L12 2H4v18h2v-7h5.55l.45 2h8V4h-7.55z");

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
    }

    clearCache() {
        this.planetCache.clear();
        this.starCache.clear();
    }

    drawLinks(visibleSystems, allSystems) {
        this.ctx.lineWidth = 2;
        const drawn = new Set();
        const gameTime = this.gameEngine.state.gameTime || 0;
        
        visibleSystems.forEach(sys => {
            sys.links.forEach(link => {
                // Sort IDs to ensure we don't draw the same link twice
                const key = [sys.id, link.targetId].sort().join('-');
                if (drawn.has(key)) return;
                
                const target = allSystems.find(s => s.id === link.targetId);
                if (target) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(sys.x, sys.y);
                    this.ctx.lineTo(target.x, target.y);
                    
                    if (link.type === 'two-way') {
                        this.ctx.strokeStyle = 'rgba(0, 160, 192, 0.3)'; // Cyan low opacity
                        this.ctx.setLineDash([]);
                        this.ctx.lineDashOffset = 0;
                        drawn.add(key); // Only prevent drawing two-way links twice
                    } else {
                        this.ctx.strokeStyle = 'rgba(204, 51, 51, 0.3)'; // Red low opacity
                        this.ctx.setLineDash([5, 5]);
                        // Animate dashes in direction of warp (source -> target)
                        this.ctx.lineDashOffset = -(gameTime / 40) % 10;
                    }
                    
                    this.ctx.stroke();
                }
            });
        });
        this.ctx.setLineDash([]);
        this.ctx.lineDashOffset = 0;
    }

    drawSystem(system, checkVisibility, playerMap) {
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
                starTexture = this.textureGenerator.createStarTexture(system);
                this.starCache.set(system.id, starTexture);
            }
            this.ctx.drawImage(starTexture, system.x - r * 1.5, system.y - r * 1.5, r * 3, r * 3);
        }

        // Draw pre-rendered glow (Old Rendering) over top of the enhanced star
        this.ctx.drawImage(this.starGlow, system.x - r, system.y - r, r * 2, r * 2);

        // Draw colored core/tint
        this.ctx.fillStyle = system.color || '#FDB813';
        this.ctx.globalAlpha = 0.4;
        this.ctx.beginPath();
        this.ctx.arc(system.x, system.y, r * 0.6, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.globalAlpha = 1.0;
        
        if (!drawText) return;

        // Draw System Name
        const baseFontSize = 12;
        const finalFontSize = Math.max(baseFontSize, 8 / this.gameEngine.camera.zoom); // Ensure a minimum readable size on screen
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = `${finalFontSize}px Orbitron, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(system.name, system.x, system.y - r - 10);

        // Draw Owner Flag
        if (system.owner) {
            const owner = playerMap.get(system.owner);
            if (owner) {
                const textWidth = this.ctx.measureText(system.name).width;
                const scale = finalFontSize / 24; // Scale flag to match text height
                const flagX = system.x + (textWidth / 2) + (6 / this.gameEngine.camera.zoom);
                const flagY = system.y - r - 10 - finalFontSize + (2 * scale); // Align with text top roughly
                this.drawFlag(flagX, flagY, owner.color, scale);
            }
        }

        // Draw ownership ring in God View
        if (isHostGodView && system.owner) {
            const owner = playerMap.get(system.owner);
            const ownerColor = owner ? owner.color : '#FFFFFF';
            this.ctx.strokeStyle = ownerColor;
            this.ctx.lineWidth = 3 / this.gameEngine.camera.zoom; // Keep line width constant on screen
            this.ctx.beginPath();
            this.ctx.arc(system.x, system.y, r + 5, 0, Math.PI * 2); // A ring just outside the star's glow
            this.ctx.stroke();
        }

        // Draw Capture Activity Indicator on System (if any planet is being captured)
        const activeCapture = system.planets.find(p => p.captureProgress > 0 && p.captureProgress < 100);
        if (activeCapture && (isHostGodView || visibility === 'explored')) {
             const capturingPlayer = playerMap.get(activeCapture.capturingTeam);
             if (capturingPlayer) {
                const indicatorRadius = r + 8 + (4 / this.gameEngine.camera.zoom);
                this.ctx.save();
                this.ctx.strokeStyle = capturingPlayer.color;
                this.ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                this.ctx.setLineDash([4 / this.gameEngine.camera.zoom, 4 / this.gameEngine.camera.zoom]);
                
                // Rotate based on time for visibility
                const rotation = (this.gameEngine.state.gameTime / 2000) % (Math.PI * 2);
                this.ctx.translate(system.x, system.y);
                this.ctx.rotate(rotation);
                
                this.ctx.beginPath();
                this.ctx.arc(0, 0, indicatorRadius, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
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
                this.drawPlanetMini(planet, px, py, radius, system, playerMap);
            });
        }

        // Draw AI Goal in God View
        if (isHostGodView && system.owner) {
            const owner = playerMap.get(system.owner);
            if (owner && owner.isAI && owner.aiGoal) {
                // Only draw on systems with a station to reduce clutter and identify main bases
                const hasStation = this.gameEngine.state.ships.some(s => s.owner === system.owner && s.isStation && this.gameEngine.spatialService.isShipInSystem(s, system));
                
                if (hasStation) {
                    this.ctx.fillStyle = owner.color || '#FFFFFF';
                    const fontSize = Math.max(10, 10 / this.gameEngine.camera.zoom);
                    this.ctx.font = `bold ${fontSize}px monospace`;
                    this.ctx.textAlign = 'center';
                    this.ctx.shadowColor = 'black';
                    this.ctx.shadowBlur = 4;
                    // Draw below the star
                    this.ctx.fillText(`[${owner.aiGoal}]`, system.x, system.y + r + (25 / this.gameEngine.camera.zoom));

                    // Draw Research Project
                    if (owner.researchQueue && owner.researchQueue.length > 0) {
                        const techId = owner.researchQueue[0].techId;
                        const techData = this.gameEngine.techService.getTechData();
                        if (techData) {
                            const tech = techData[owner.techBase]?.[techId];
                            if (tech) {
                                this.ctx.font = `italic ${fontSize * 0.8}px monospace`;
                                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                                this.ctx.fillText(`Rsrch: ${tech.name}`, system.x, system.y + r + (40 / this.gameEngine.camera.zoom));
                            }
                        }
                    }
                }
            }
        }
    }

    drawFlag(x, y, color, scale) {
        // ... (Implementation from RenderService.js) ...
        // I will copy the implementation in the next step to keep this block concise
        // For now, assume it's the same logic.
        const zoom = this.gameEngine.camera.zoom;
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.scale(scale, scale);

        if (zoom < 0.8) {
            this.ctx.fillStyle = color;
            this.ctx.fill(this.flagPath);
        } else {
            // Detailed Flag Rendering
            // Pole
            const poleGrad = this.ctx.createLinearGradient(4, 0, 6, 0);
            poleGrad.addColorStop(0, '#555');
            poleGrad.addColorStop(0.4, '#AAA');
            poleGrad.addColorStop(1, '#333');
            this.ctx.fillStyle = poleGrad;
            this.ctx.fillRect(4, 1, 2, 20);

            // Finial
            const finialGrad = this.ctx.createRadialGradient(5, 1, 0, 5, 1, 2);
            finialGrad.addColorStop(0, '#FFF');
            finialGrad.addColorStop(0.5, '#FFD700');
            finialGrad.addColorStop(1, '#DAA520');
            this.ctx.fillStyle = finialGrad;
            this.ctx.beginPath();
            this.ctx.arc(5, 1, 1.5, 0, Math.PI * 2);
            this.ctx.fill();

            // Flag Cloth Path
            this.ctx.beginPath();
            this.ctx.moveTo(6, 2);
            this.ctx.bezierCurveTo(10, 0, 15, 4, 20, 2); // Top wave
            this.ctx.lineTo(20, 11);
            this.ctx.bezierCurveTo(15, 13, 10, 9, 6, 11); // Bottom wave
            this.ctx.closePath();

            // Fill Color
            this.ctx.fillStyle = color;
            this.ctx.fill();

            // Shading/Folds
            this.ctx.save();
            this.ctx.clip();
            const foldGrad = this.ctx.createLinearGradient(6, 0, 20, 0);
            foldGrad.addColorStop(0, 'rgba(0,0,0,0.2)');
            foldGrad.addColorStop(0.3, 'rgba(255,255,255,0.3)');
            foldGrad.addColorStop(0.6, 'rgba(0,0,0,0.1)');
            foldGrad.addColorStop(1, 'rgba(255,255,255,0.1)');
            this.ctx.fillStyle = foldGrad;
            this.ctx.fill();

            // Emblem (High Zoom)
            if (zoom > 1.2) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                this.ctx.beginPath();
                this.ctx.arc(13, 6.5, 3, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.restore();

            // Outline
            this.ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            this.ctx.lineWidth = 0.5;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawPlanetMini(planet, x, y, r, system, playerMap) {
        const zoom = this.gameEngine.camera.zoom;
        // Ensure planets have a minimum visible size when zoomed out
        const minPixelRadius = 1.5;
        const finalRadius = Math.max(r, minPixelRadius / zoom);
        
        // Get or create texture
        let texture = this.planetCache.get(planet.id);
        if (!texture) {
            texture = this.textureGenerator.createPlanetTexture(planet);
            this.planetCache.set(planet.id, texture);
        }

        // Atmosphere Glow (High Zoom)
        if (zoom > 1.2 && ['Terran', 'Farming'].includes(planet.type)) {
            this.ctx.save();
            const glowRadius = finalRadius * 1.3;
            const grad = this.ctx.createRadialGradient(x, y, finalRadius * 0.9, x, y, glowRadius);
            const color = planet.type === 'Terran' ? '135, 206, 235' : '174, 213, 129'; // Sky blue or Light Green
            grad.addColorStop(0, `rgba(${color}, 0.4)`);
            grad.addColorStop(1, `rgba(${color}, 0)`);
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }

        // --- Draw Planet Body ---
        this.ctx.save();
        this.ctx.translate(x, y);

        // 1. Planet Spin Animation
        // Generate a stable random speed based on planet ID
        let seed = planet.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const spinSpeed = 0.0002 * ((seed % 5) + 1) * (seed % 2 === 0 ? 1 : -1);
        const rotation = (this.gameEngine.state.gameTime * spinSpeed) % (Math.PI * 2);
        
        this.ctx.save();
        this.ctx.rotate(rotation);
        this.ctx.drawImage(texture, -finalRadius, -finalRadius, finalRadius * 2, finalRadius * 2);
        this.ctx.restore();

        // 2. Dynamic Lighting (Shadows & Highlights based on Star position)
        if (system) {
            // Star is at system.x, system.y. Planet is at x, y.
            // Since we translated to (x,y), star is at (system.x - x, system.y - y)
            const angleToStar = Math.atan2(system.y - y, system.x - x);
            
            this.ctx.rotate(angleToStar + Math.PI / 2); // Rotate so "up" points to star
            
            // A. Shadow (Crescent on the back side)
            // We draw a radial gradient offset AWAY from the star to create the dark side
            const shadowGradient = this.ctx.createRadialGradient(
                0, -finalRadius * 0.5, 0,   // Offset up (towards star)
                0, 0, finalRadius           // Center
            );
            // Transparent near the light source, darkens as it goes away
            shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            shadowGradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.1)');
            shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
            shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');

            this.ctx.fillStyle = shadowGradient;
            
            // Draw the shadow over the planet
            this.ctx.beginPath();
            this.ctx.arc(0, 0, finalRadius, 0, Math.PI * 2);
            this.ctx.fill();

            // 2. Specular Highlight (Hotspot facing the star)
            const specGradient = this.ctx.createRadialGradient(
                0, -finalRadius * 0.5, 0,
                0, -finalRadius * 0.5, finalRadius * 0.6
            );
            specGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
            specGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            this.ctx.fillStyle = specGradient;
            this.ctx.beginPath();
            this.ctx.arc(0, -finalRadius * 0.5, finalRadius * 0.6, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
        
        let ringOffset = 3 / zoom;

        if (planet.owner) {
            const owner = playerMap.get(planet.owner);
            this.ctx.strokeStyle = owner ? owner.color : '#FFFFFF';
            this.ctx.lineWidth = 2 / zoom; // Make it visible like the capture ring
            this.ctx.beginPath();
            this.ctx.arc(x, y, finalRadius + ringOffset, 0, Math.PI * 2);
            this.ctx.stroke();

            // Draw Citadel Level Indicators (Pips on the ring)
            if (planet.citadelLevel > 0) {
                this.ctx.fillStyle = owner ? owner.color : '#FFFFFF';
                const pipSize = 3 / zoom;
                const indicatorRadius = finalRadius + ringOffset;
                
                for (let i = 0; i < planet.citadelLevel; i++) {
                    const angle = (Math.PI * 2 * i) / planet.citadelLevel - (Math.PI / 2);
                    const px = x + Math.cos(angle) * indicatorRadius;
                    const py = y + Math.sin(angle) * indicatorRadius;
                    this.ctx.fillRect(px - pipSize / 2, py - pipSize / 2, pipSize, pipSize);
                }
            }

            ringOffset += 3 / zoom; // Push next ring out
        }

        // Draw capture progress ring
        if (planet.captureProgress > 0 && planet.captureProgress < 100) {
            const capturingPlayer = playerMap.get(planet.capturingTeam);
            if (capturingPlayer) {
                const captureRadius = finalRadius + ringOffset;

                // Determine if this is a hostile takeover (Neutralization) or friendly reinforcement/capture
                const isHostile = planet.owner && planet.owner !== planet.capturingTeam;
                
                // Draw background track (faint)
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.lineWidth = 2 / zoom;
                this.ctx.beginPath();
                this.ctx.arc(x, y, captureRadius, 0, Math.PI * 2);
                this.ctx.stroke();

                if (isHostile) {
                    // Flashing Red for hostile neutralization
                    const flash = Math.sin(Date.now() / 100) > 0 ? '#FF4500' : '#8B0000';
                    this.ctx.strokeStyle = flash;
                } else {
                    this.ctx.strokeStyle = capturingPlayer.color;
                }
                this.ctx.lineWidth = 2 / zoom; // Keep it visible
                this.ctx.beginPath();
                // Draw a partial arc based on capture progress, starting from the top
                const endAngle = (planet.captureProgress / 100) * Math.PI * 2 - (Math.PI / 2);
                this.ctx.arc(x, y, captureRadius, -Math.PI / 2, endAngle);
                this.ctx.stroke();
            }
        }

        // Draw Shield Bubble (Citadel Level 5)
        if (planet.shield > 0) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
            this.ctx.fillStyle = 'rgba(100, 200, 255, 0.1)';
            this.ctx.lineWidth = 1 / zoom;
            this.ctx.beginPath();
            this.ctx.arc(x, y, finalRadius * 1.4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }
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

                        this.ctx.strokeStyle = '#00FF00';
                        this.ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                        this.ctx.beginPath();
                        this.ctx.arc(px, py, selectionRadius, 0, Math.PI * 2);
                        this.ctx.stroke();
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
                        this.ctx.strokeStyle = '#00FF00';
                        this.ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                        this.ctx.beginPath();
                        this.ctx.arc(sys.x, sys.y, sys.r + selectionPadding, 0, Math.PI * 2);
                        this.ctx.stroke();

                        // Draw effective radius boundary
                        const effectiveRadius = this.gameEngine.spatialService.getSystemEffectiveRadius(sys);
                        this.ctx.save();
                        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
                        this.ctx.lineWidth = 1 / this.gameEngine.camera.zoom;
                        this.ctx.setLineDash([5 / this.gameEngine.camera.zoom, 5 / this.gameEngine.camera.zoom]);
                        this.ctx.beginPath();
                        this.ctx.arc(sys.x, sys.y, effectiveRadius, 0, Math.PI * 2);
                        this.ctx.stroke();
                        this.ctx.restore();
                    }
                } else {
                    // Check if it's a station (which is stored in ships but selected as a location)
                    const station = state.ships.find(s => s.id === selLocId && s.isStation);
                    if (station && (!visibleShips || visibleShips.includes(station))) {
                        const selectionRadius = 40 / this.gameEngine.camera.zoom;
                        this.ctx.strokeStyle = '#00FF00';
                        this.ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                        this.ctx.beginPath();
                        this.ctx.arc(station.x, station.y, selectionRadius, 0, Math.PI * 2);
                        this.ctx.stroke();
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
                this.ctx.strokeStyle = '#00FF00';
                this.ctx.lineWidth = 2 / this.gameEngine.camera.zoom;
                this.ctx.beginPath();
                this.ctx.arc(drawX, drawY, selectionRadius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
    }
}