export class EntityRenderer {
    constructor(ctx, gameEngine) {
        this.ctx = ctx;
        this.gameEngine = gameEngine;
        this.debrisCache = new Map();
        
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
    }

    clearCache() {
        this.debrisCache.clear();
    }

    drawDebris(debris) {
        const zoom = this.gameEngine.camera.zoom;
        const scrapAmount = debris.resources?.scrap || 0;
        const opacity = 0.25;
        const radius = 10 + (scrapAmount / 20);

        // Base glow - fade out slightly when zoomed in to reveal details
        this.ctx.globalAlpha = zoom > 1.0 ? Math.max(0.1, opacity - (zoom - 1.0) * 0.1) : opacity;
        this.ctx.drawImage(this.debrisGlow, debris.x - radius, debris.y - radius, radius * 2, radius * 2);
        

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

            this.ctx.save();
            this.ctx.translate(debris.x, debris.y);
            
            // Slowly rotate the whole field
            const time = this.gameEngine.state.gameTime || 0;
            const rotationSpeed = 0.00005 * (seed % 2 === 0 ? 1 : -1);
            this.ctx.rotate(time * rotationSpeed);

            this.ctx.globalAlpha = Math.min(0.35, 0.075 * zoom);
            this.ctx.fillStyle = '#666666'; // Dark grey for scrap
            this.ctx.strokeStyle = '#444444';
            this.ctx.lineWidth = 0.5 / zoom;

            this.ctx.beginPath();

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

                    if (j === 0) this.ctx.moveTo(px, py);
                    else this.ctx.lineTo(px, py);
                });
                this.ctx.closePath();
            });
            
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.restore();
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawHazards(hazards) {
        if (!hazards) return;
        const zoom = this.gameEngine.camera.zoom;

        hazards.forEach(hazard => {
            if (hazard.type === 'NEBULA') {
                this.ctx.save();
                this.ctx.translate(hazard.x, hazard.y);
                
                const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, hazard.radius);
                grad.addColorStop(0, 'rgba(100, 0, 100, 0.2)');
                grad.addColorStop(0.6, 'rgba(150, 50, 150, 0.1)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, hazard.radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            } else if (hazard.type === 'BLACK_HOLE') {
                this.ctx.save();
                this.ctx.translate(hazard.x, hazard.y);
                
                // Event Horizon
                this.ctx.fillStyle = '#000000';
                this.ctx.strokeStyle = 'rgba(100, 100, 255, 0.5)';
                this.ctx.lineWidth = 2 / zoom;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, hazard.radius * 0.3, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();

                // Accretion Disk
                this.ctx.strokeStyle = 'rgba(200, 100, 50, 0.3)';
                this.ctx.lineWidth = 4 / zoom;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, hazard.radius * 0.6, 0, Math.PI * 2);
                this.ctx.stroke();

                this.ctx.restore();
            }
        });
    }

    drawMines(mines, viewingIds, isHostGodView) {
        if (!mines) return;
        const zoom = this.gameEngine.camera.zoom;

        mines.forEach(mine => {
            // Visibility check: Owner or God view
            if (!isHostGodView && !viewingIds.includes(mine.owner)) {
                // Mines are invisible to enemies unless detected (detection logic not yet implemented, so invisible for now)
                return;
            }

            this.ctx.fillStyle = '#FF4444';
            this.ctx.strokeStyle = '#880000';
            this.ctx.lineWidth = 1 / zoom;
            
            const r = 4 / zoom;
            this.ctx.beginPath();
            this.ctx.arc(mine.x, mine.y, r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            // Draw spikes
            for(let i=0; i<4; i++) {
                const angle = (Math.PI / 2) * i + (this.gameEngine.state.gameTime / 500);
                const sx = mine.x + Math.cos(angle) * r * 2;
                const sy = mine.y + Math.sin(angle) * r * 2;
                this.ctx.beginPath();
                this.ctx.moveTo(mine.x, mine.y);
                this.ctx.lineTo(sx, sy);
                this.ctx.stroke();
            }
        });
    }
}