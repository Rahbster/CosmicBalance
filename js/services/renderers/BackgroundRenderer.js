export class BackgroundRenderer {
    constructor(ctx, gameEngine, canvas) {
        this.ctx = ctx;
        this.gameEngine = gameEngine;
        this.canvas = canvas;
        
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

        // Offscreen buffer for Fog of War
        this.fogLayer = document.createElement('canvas');
    }

    drawStars(pan) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Fill background with deep space color
        this.ctx.fillStyle = '#05070a';
        this.ctx.fillRect(0, 0, width, height);

        this.ctx.fillStyle = '#FFFFFF';
        this.stars.forEach(star => {
            // Parallax factor: smaller stars move slower (further away)
            const factor = 0.1 * star.size; 
            
            // Calculate wrapped position based on camera pan
            let x = (star.x * width + pan.x * factor) % width;
            let y = (star.y * height + pan.y * factor) % height;
            
            // Handle negative modulo
            if (x < 0) x += width;
            if (y < 0) y += height;

            this.ctx.globalAlpha = star.opacity;
            this.ctx.fillRect(x - star.size, y - star.size, star.size * 2, star.size * 2);
        });
        this.ctx.globalAlpha = 1.0;
    }

    drawWatermark() {
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

            this.ctx.save();
            this.ctx.globalAlpha = 0.05; // Very subtle watermark
            this.ctx.drawImage(this.backgroundImage, centerX - size / 2, centerY - size / 2, size, size);
            this.ctx.restore();
        }
    }

    drawFogOfWar(state, visibleSystems, viewingIds, isHostGodView) {
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
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to identity
        this.ctx.drawImage(this.fogLayer, 0, 0);
        this.ctx.restore();
    }
}