export class TextureGenerator {
    constructor() {}

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

        // 1. Draw Base Sphere with neutral shading (Ambient Occlusion only)
        const baseGrad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
        baseGrad.addColorStop(0, config.base);
        baseGrad.addColorStop(1, this._adjustColorBrightness(config.base, -40)); // Darker edge

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = baseGrad;
        ctx.fill();
        
        // Clip to sphere for subsequent layers
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        // 2. Draw Surface Features (Procedural blobs) with blending
        ctx.globalCompositeOperation = 'overlay'; // Better blending for features
        ctx.globalAlpha = 0.6;
        const featureCount = 15 + Math.floor(random() * 15);
        for (let i = 0; i < featureCount; i++) {
            const color = config.features[Math.floor(random() * config.features.length)];
            const radius = (random() * r * 0.5) + (r * 0.1);
            const x = random() * size;
            const y = random() * size;
            
            // Distort features slightly for perspective
            const distFromCenter = Math.sqrt((x-cx)**2 + (y-cy)**2) / r;
            const distortion = 1 - (distFromCenter * 0.3);

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(x, y, radius * distortion, radius, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 3. Draw Clouds (if applicable)
        if (config.clouds) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
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
        ctx.globalCompositeOperation = 'source-over';
        if (config.atmosphere) {
            const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
            atmoGrad.addColorStop(0, 'rgba(0,0,0,0)');
            atmoGrad.addColorStop(1, config.atmosphere);
            
            ctx.fillStyle = atmoGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore(); // Remove clip

        return canvas;
    }

    _adjustColorBrightness(hex, percent) {
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);

        r = parseInt(r * (100 + percent) / 100);
        g = parseInt(g * (100 + percent) / 100);
        b = parseInt(b * (100 + percent) / 100);

        r = (r < 255) ? r : 255;
        g = (g < 255) ? g : 255;
        b = (b < 255) ? b : 255;

        const rr = ((r.toString(16).length === 1) ? "0" + r.toString(16) : r.toString(16));
        const gg = ((g.toString(16).length === 1) ? "0" + g.toString(16) : g.toString(16));
        const bb = ((b.toString(16).length === 1) ? "0" + b.toString(16) : b.toString(16));

        return "#" + rr + gg + bb;
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
}