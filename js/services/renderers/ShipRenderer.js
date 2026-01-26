export class ShipRenderer {
    constructor(ctx, engine, spriteService) {
        this.ctx = ctx;
        this.engine = engine;
        this.spriteService = spriteService;
    }

    drawFleet(fleetId, ships) {
        if (!ships || ships.length === 0) return;

        // Calculate centroid for all fleets (moving or idle) to prevent jumping
        let totalX = 0;
        let totalY = 0;
        ships.forEach(s => {
            totalX += s.x;
            totalY += s.y;
        });
        const x = totalX / ships.length;
        const y = totalY / ships.length;

        const firstShip = ships[0];

        const ownerId = ships[0].owner;
        const player = this.engine.state.players.find(p => p.id === ownerId);
        const fleet = player ? player.fleets.find(f => f.id === fleetId) : null;
        const fleetName = fleet ? fleet.name : "Unknown Fleet";
        const color = player ? player.color : '#FFFFFF';

        this.ctx.save();
        this.ctx.translate(x, y);

        // --- Draw Icon (Rotated) ---
        this.ctx.save();
        
        if (typeof firstShip.heading === 'number') {
            this.ctx.rotate(firstShip.heading * Math.PI / 180);
        } else {
            let rotation = 0;
            if (firstShip.targetId) {
                const target = this.engine.state.systems.find(s => s.id === firstShip.targetId);
                if (target) {
                    rotation = Math.atan2(target.y - y, target.x - x);
                }
            } else if (firstShip.arrivalPoint) {
                rotation = Math.atan2(firstShip.arrivalPoint.y - y, firstShip.arrivalPoint.x - x);
            }
            
            if (firstShip.targetId || firstShip.arrivalPoint) {
                this.ctx.rotate(rotation + Math.PI / 2);
            }
        } 

        // --- Visual Effects: Thrusters (Sublight) ---
        if (firstShip.arrivalPoint && !firstShip.targetId) {
             this.ctx.save();
             const thrustLength = 15 + Math.random() * 5;
             const thrustWidth = 8;
             
             this.ctx.fillStyle = '#FF4500';
             this.ctx.globalAlpha = 0.8;
             this.ctx.beginPath();
             this.ctx.moveTo(-thrustWidth/2, 18);
             this.ctx.lineTo(0, 18 + thrustLength);
             this.ctx.lineTo(thrustWidth/2, 18);
             this.ctx.fill();
             
             this.ctx.fillStyle = '#FFFF00';
             this.ctx.beginPath();
             this.ctx.moveTo(-thrustWidth/4, 18);
             this.ctx.lineTo(0, 18 + thrustLength * 0.6);
             this.ctx.lineTo(thrustWidth/4, 18);
             this.ctx.fill();
             this.ctx.restore();
        }

        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 1;

        // Main Chevron
        this.ctx.beginPath();
        this.ctx.moveTo(0, -12);
        this.ctx.lineTo(10, 8);
        this.ctx.lineTo(0, 2);
        this.ctx.lineTo(-10, 8);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        // Second Chevron
        this.ctx.beginPath();
        this.ctx.moveTo(0, -2);
        this.ctx.lineTo(10, 18);
        this.ctx.lineTo(0, 12);
        this.ctx.lineTo(-10, 18);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        
        // --- Visual Effects: Warp Bubble ---
        if (firstShip.targetId) {
             this.ctx.save();
             this.ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 100) * 0.1;
             this.ctx.fillStyle = '#00FFFF';
             this.ctx.strokeStyle = '#FFFFFF';
             this.ctx.beginPath();
             this.ctx.ellipse(0, 3, 18, 25, 0, 0, Math.PI * 2);
             this.ctx.fill();
             this.ctx.stroke();
             this.ctx.restore();
        }

        this.ctx.restore(); // Undo rotation

        // Fleet Health Bar
        let totalHull = 0;
        let currentMaxHull = 0;
        ships.forEach(s => {
            totalHull += s.hull;
            currentMaxHull += s.maxHull;
        });

        // Use fleet.totalMaxHull if available and valid (greater than current visible max), otherwise fallback to current
        const displayMaxHull = (fleet && fleet.totalMaxHull && fleet.totalMaxHull > currentMaxHull) ? fleet.totalMaxHull : currentMaxHull;

        let textYOffset = 25;

        if (totalHull < displayMaxHull && displayMaxHull > 0) {
            const barWidth = 24;
            const barHeight = 4;
            const barY = 20; 

            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(-barWidth / 2, barY, barWidth, barHeight);
            
            this.ctx.fillStyle = '#0F0';
            this.ctx.fillRect(-barWidth / 2, barY, barWidth * (totalHull / displayMaxHull), barHeight);
            
            textYOffset += 8; // Push text down
        }

        // --- Draw Text (Screen Aligned) ---
        const fontSize = Math.max(12, 8 / this.engine.camera.zoom);
        this.ctx.font = `bold ${fontSize}px Orbitron, sans-serif`;
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.textAlign = 'center';
        this.ctx.shadowColor = 'black';
        this.ctx.shadowBlur = 4;
        
        this.ctx.fillText(fleetName, 0, textYOffset + (5 / this.engine.camera.zoom));
        this.ctx.restore(); // Undo translation
    }

    drawShip(ship) {
        const sprite = this.spriteService.getSprite(ship.techBase, ship.type);
        if (this.spriteService.isLoaded && sprite) {
            this._drawShipSprite(ship, sprite);
        } else {
            this._drawShipShape(ship);
        }
    }

    _drawShipSprite(ship, sprite) {
        this.ctx.save();
        this.ctx.translate(ship.x, ship.y);

        let appliedRotation = 0;
        if (typeof ship.heading === 'number') {
            appliedRotation = ship.heading * Math.PI / 180;
        } else {
            let rotation = 0;
            if (ship.targetId) {
                const target = this.engine.state.systems.find(s => s.id === ship.targetId) || this.engine.state.debrisFields.find(d => d.id === ship.targetId);
                if (target) {
                    rotation = Math.atan2(target.y - ship.y, target.x - ship.x);
                }
            } else if (ship.arrivalPoint) {
                rotation = Math.atan2(ship.arrivalPoint.y - ship.y, ship.arrivalPoint.x - ship.x);
            }
            appliedRotation = rotation + Math.PI / 2;
        }
        // Correction for 225-degree sprites (South-West facing)
        const SPRITE_CORRECTION = 3 * Math.PI / 4;
        this.ctx.rotate(appliedRotation + SPRITE_CORRECTION);

        const TARGET_SIZES = {
            Fighter: 24, Scout: 32, TroopTransport: 32, Salvager: 28, Frigate: 48, SpaceStation: 64, default: 24
        };
        const targetSize = TARGET_SIZES[ship.type] || TARGET_SIZES.default;
        const maxDim = Math.max(sprite.width, sprite.height);
        if (maxDim === 0) { this.ctx.restore(); return; }
        const scale = targetSize / maxDim;
        const w = sprite.width * scale;
        const h = sprite.height * scale;

        const radius = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(h / 2, 2));

        const THRUST_CORRECTION = 235 * Math.PI / 180;
        this.ctx.rotate(THRUST_CORRECTION);

        // --- Visual Effects: Thrusters (Sublight) ---
        if (ship.arrivalPoint && !ship.targetId) {
            this.ctx.save();
            const thrustLength = h * 0.5 + Math.random() * (h * 0.2);
            const thrustWidth = w * 0.4;
            this.ctx.fillStyle = '#FF4500'; this.ctx.globalAlpha = 0.8;
            this.ctx.beginPath(); this.ctx.moveTo(-thrustWidth / 2, radius - 4); this.ctx.lineTo(0, radius + thrustLength); this.ctx.lineTo(thrustWidth / 2, radius - 4); this.ctx.fill();
            this.ctx.fillStyle = '#FFFF00'; this.ctx.beginPath(); this.ctx.moveTo(-thrustWidth / 4, radius - 4); this.ctx.lineTo(0, radius + thrustLength * 0.6); this.ctx.lineTo(thrustWidth / 4, radius - 4); this.ctx.fill();
            this.ctx.restore();
        }

        this.ctx.rotate(-THRUST_CORRECTION);

        this.ctx.drawImage(sprite, -w / 2, -h / 2, w, h);

        // --- Visual Effects: Warp Bubble ---
        if (ship.targetId) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 100) * 0.1;
            this.ctx.fillStyle = '#00FFFF'; this.ctx.strokeStyle = '#FFFFFF'; this.ctx.lineWidth = 1;
            this.ctx.beginPath(); this.ctx.ellipse(0, 0, radius * 0.8, radius * 0.8, 0, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
            this.ctx.restore();
        }

        // Un-rotate for non-rotated UI elements like health bars and icons
        this.ctx.rotate(-appliedRotation - SPRITE_CORRECTION); 

        // Health Bar
        if (ship.hull < ship.maxHull) {
            const barY = radius + 5; 
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(-10, barY, 20, 3);
            this.ctx.fillStyle = '#0F0';
            this.ctx.fillRect(-10, barY, 20 * (ship.hull / ship.maxHull), 3);
        }

        // Repair/Upgrade Indicator
        if (ship.isRepairing || ship.isBuilding) {
            const iconSize = 14 / this.engine.camera.zoom;
            this.ctx.font = `${iconSize}px sans-serif`;
            this.ctx.fillStyle = '#FFD700';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const shouldDraw = !ship.isBuilding || (Math.floor(Date.now() / 500) % 2 === 0);
            if (shouldDraw) this.ctx.fillText('🔧', 15, 0);
        }

        // Salvage Mission Indicator
        if (ship.salvageMission) {
            const iconSize = 14 / this.engine.camera.zoom;
            this.ctx.font = `${iconSize}px sans-serif`;
            this.ctx.fillStyle = '#00FF00';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('♻️', -15, 0);
        }

        // Scout/Explore Mission Indicator
        if (ship.scoutMission || ship.exploreMission) {
            const iconSize = 14 / this.engine.camera.zoom;
            this.ctx.font = `${iconSize}px sans-serif`;
            this.ctx.fillStyle = '#00FFFF';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('🔍', -15, 0);
        }

        this.ctx.restore();
    }

    _drawShipShape(ship) {
        this.ctx.fillStyle = ship.color || '#FFFFFF';
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 1;

        this.ctx.save();
        this.ctx.translate(ship.x, ship.y);
        
        let appliedRotation = 0;
        if (typeof ship.heading === 'number') {
            appliedRotation = ship.heading * Math.PI / 180;
        } else {
            let rotation = 0;
            if (ship.targetId) {
                const target = this.engine.state.systems.find(s => s.id === ship.targetId);
                if (target) {
                    rotation = Math.atan2(target.y - ship.y, target.x - ship.x);
                }
            } else if (ship.arrivalPoint) {
                rotation = Math.atan2(ship.arrivalPoint.y - ship.y, ship.arrivalPoint.x - ship.x);
            }
            appliedRotation = rotation + Math.PI / 2;
        }
        this.ctx.rotate(appliedRotation);

        // --- Visual Effects: Thrusters (Sublight) ---
        if (ship.arrivalPoint && !ship.targetId && !ship.isStation) {
             this.ctx.save();
             const thrustLength = 15 + Math.random() * 5;
             const thrustWidth = 6;
             
             this.ctx.fillStyle = '#FF4500';
             this.ctx.globalAlpha = 0.8;
             this.ctx.beginPath();
             this.ctx.moveTo(-thrustWidth/2, 5);
             this.ctx.lineTo(0, 5 + thrustLength);
             this.ctx.lineTo(thrustWidth/2, 5);
             this.ctx.fill();
             this.ctx.restore();
        }

        if (ship.isStation) {
            // Station: Hexagon
            this.ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                this.ctx.lineTo(8 * Math.cos(i * Math.PI / 3), 8 * Math.sin(i * Math.PI / 3));
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        } else {
            // Ships
            this.ctx.beginPath();

            if (ship.techBase === 'COVENANT') {
                if (ship.type === 'Fighter') {
                    this.ctx.moveTo(0, -8);
                    this.ctx.bezierCurveTo(6, 0, 6, 6, 0, 4);
                    this.ctx.bezierCurveTo(-6, 6, -6, 0, 0, -8);
                } else if (ship.type === 'Scout') {
                    this.ctx.moveTo(0, -9);
                    this.ctx.lineTo(4, 7);
                    this.ctx.lineTo(0, 5);
                    this.ctx.lineTo(-4, 7);
                } else if (ship.type === 'TroopTransport') {
                    this.ctx.moveTo(0, -7);
                    this.ctx.bezierCurveTo(8, -5, 8, 7, 0, 7);
                    this.ctx.bezierCurveTo(-8, 7, -8, -5, 0, -7);
                } else if (ship.type === 'Frigate') {
                    this.ctx.moveTo(0, -12);
                    this.ctx.bezierCurveTo(10, 0, 8, 10, 0, 6);
                    this.ctx.bezierCurveTo(-8, 10, -10, 0, 0, -12);
                } else { 
                    this.ctx.moveTo(0, -7);
                    this.ctx.lineTo(5, 0);
                    this.ctx.lineTo(0, 7);
                    this.ctx.lineTo(-5, 0);
                }
            } else {
                if (ship.type === 'Fighter') {
                    this.ctx.moveTo(0, -6);
                    this.ctx.lineTo(4, 4);
                    this.ctx.lineTo(0, 2);
                    this.ctx.lineTo(-4, 4);
                } else if (ship.type === 'Scout') {
                    this.ctx.moveTo(0, -8);
                    this.ctx.lineTo(3, 6);
                    this.ctx.lineTo(-3, 6);
                } else if (ship.type === 'TroopTransport') {
                    this.ctx.rect(-4, -6, 8, 12);
                } else if (ship.type === 'Salvager') {
                    this.ctx.moveTo(-4, -4);
                    this.ctx.lineTo(4, -4);
                    this.ctx.lineTo(6, 0);
                    this.ctx.lineTo(4, 4);
                    this.ctx.lineTo(-4, 4);
                    this.ctx.lineTo(-6, 0);
                } else if (ship.type === 'Frigate') {
                    this.ctx.moveTo(0, -10);
                    this.ctx.lineTo(5, 8);
                    this.ctx.lineTo(0, 5);
                    this.ctx.lineTo(-5, 8);
                } else { 
                    this.ctx.moveTo(0, -6);
                    this.ctx.lineTo(5, 5);
                    this.ctx.lineTo(-5, 5);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        // --- Visual Effects: Warp Bubble ---
        if (ship.targetId && !ship.isStation) {
             this.ctx.save();
             this.ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 100) * 0.1;
             this.ctx.fillStyle = '#00FFFF';
             this.ctx.strokeStyle = '#FFFFFF';
             this.ctx.beginPath();
             this.ctx.ellipse(0, 0, 12, 16, 0, 0, Math.PI * 2);
             this.ctx.fill();
             this.ctx.stroke();
             this.ctx.restore();
        }

        // Health Bar
        if (ship.hull < ship.maxHull) {
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(-6, 10, 12, 2);
            this.ctx.fillStyle = '#0F0';
            this.ctx.fillRect(-6, 10, 12 * (ship.hull / ship.maxHull), 2);
        }

        // Repair/Upgrade Indicator
        if (ship.isRepairing || ship.isBuilding) {
            const iconSize = 14 / this.engine.camera.zoom;
            this.ctx.font = `${iconSize}px sans-serif`;
            this.ctx.fillStyle = '#FFD700'; 
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const shouldDraw = !ship.isBuilding || (Math.floor(Date.now() / 500) % 2 === 0);
            if (shouldDraw) this.ctx.fillText('🔧', 15, 0); 
        }

        // Salvage Mission Indicator
        if (ship.salvageMission) {
            const iconSize = 14 / this.engine.camera.zoom;
            this.ctx.font = `${iconSize}px sans-serif`;
            this.ctx.fillStyle = '#00FF00';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('♻️', -15, 0);
        }

        // Scout/Explore Mission Indicator
        if (ship.scoutMission || ship.exploreMission) {
            const iconSize = 14 / this.engine.camera.zoom;
            this.ctx.font = `${iconSize}px sans-serif`;
            this.ctx.fillStyle = '#00FFFF';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('🔍', -15, 0);
        }

        this.ctx.restore();
    }

    drawFleetComposition(fleetId, ships) {
        const zoom = this.engine.camera.zoom;
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
        
        this.ctx.font = `${fontSize}px monospace`;
        let maxCountWidth = 0;
        let maxTypeWidth = 0;
        types.forEach(type => {
            const cWidth = this.ctx.measureText(`${counts[type]}x`).width;
            const tWidth = this.ctx.measureText(type).width;
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

        this.ctx.save();
        
        // Fade in based on zoom (0.8 to 1.0)
        this.ctx.globalAlpha = Math.min(1.0, (zoom - 0.8) * 5);
        
        // Draw connecting line
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(cx, boxY);
        this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
        this.ctx.lineWidth = 1 / zoom;
        this.ctx.stroke();

        // Pulsing Glow
        const time = this.engine.state.gameTime || 0;
        const pulse = (Math.sin(time / 800) + 1) / 2; 
        this.ctx.shadowColor = `rgba(0, 190, 255, ${0.3 + pulse * 0.3})`;
        this.ctx.shadowBlur = 10 / zoom;

        // Draw Forerunner-style background
        const chamfer = 8 / zoom;
        
        this.ctx.beginPath();
        this.ctx.moveTo(boxX + chamfer, boxY);
        this.ctx.lineTo(boxX + boxWidth - chamfer, boxY);
        this.ctx.lineTo(boxX + boxWidth, boxY + chamfer);
        this.ctx.lineTo(boxX + boxWidth, boxY + boxHeight - chamfer);
        this.ctx.lineTo(boxX + boxWidth - chamfer, boxY + boxHeight);
        this.ctx.lineTo(boxX + chamfer, boxY + boxHeight);
        this.ctx.lineTo(boxX, boxY + boxHeight - chamfer);
        this.ctx.lineTo(boxX, boxY + chamfer);
        this.ctx.closePath();

        const bgGrad = this.ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxHeight);
        bgGrad.addColorStop(0, 'rgba(0, 20, 40, 0.9)');
        bgGrad.addColorStop(1, 'rgba(0, 10, 20, 0.95)');
        this.ctx.fillStyle = bgGrad;
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
        this.ctx.lineWidth = 1 / zoom;
        this.ctx.stroke();

        // Corner Accents
        this.ctx.strokeStyle = 'rgba(100, 220, 255, 0.9)';
        this.ctx.lineWidth = 2 / zoom;
        this.ctx.beginPath();
        this.ctx.moveTo(boxX, boxY + chamfer * 2); this.ctx.lineTo(boxX, boxY + chamfer); this.ctx.lineTo(boxX + chamfer, boxY); this.ctx.lineTo(boxX + chamfer * 2, boxY);
        this.ctx.moveTo(boxX + boxWidth, boxY + boxHeight - chamfer * 2); this.ctx.lineTo(boxX + boxWidth, boxY + boxHeight - chamfer); this.ctx.lineTo(boxX + boxWidth - chamfer, boxY + boxHeight); this.ctx.lineTo(boxX + boxWidth - chamfer * 2, boxY + boxHeight);
        this.ctx.stroke();

        // Reset Shadow
        this.ctx.shadowBlur = 0;

        // Draw Content
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textBaseline = 'top';
        const contentStartY = boxY + padding;
        const blockX = boxX + padding;

        types.forEach((type, i) => {
            const y = contentStartY + (i * lineHeight);
            
            this.ctx.textAlign = 'right';
            this.ctx.fillText(`${counts[type]}x`, blockX + maxCountWidth, y);
            
            this.ctx.textAlign = 'left';
            this.ctx.fillText(type, blockX + maxCountWidth + colGap, y);
        });
        this.ctx.restore();
    }
}
