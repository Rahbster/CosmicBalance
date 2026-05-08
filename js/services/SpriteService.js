import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';
import { ProceduralSpriteService } from './ProceduralSpriteService.js';

export class SpriteService {
    constructor(loggingService) {
        this.sprites = {};
        this.portraits = {};
        this.isLoaded = false;
        this.loggingService = loggingService;
    }

    async loadSprites() {
        const spritePaths = {
            Solaris: {
                Fighter: './assets/sprites/solaris_fighter_v3.png',
                Scout: './assets/sprites/solaris_scout_v3.png',
                TroopTransport: './assets/sprites/solaris_transport.svg',
                Salvager: './assets/sprites/solaris_salvager.svg',
                Frigate: './assets/sprites/solaris_frigate.svg',
                Destroyer: './assets/sprites/solaris_destroyer.svg',
                Cruiser: './assets/sprites/solaris_cruiser_v2.svg',
                SpaceStation: './assets/sprites/solaris_station.svg',
            },
            Syndicate: {
                Fighter: './assets/sprites/syndicate_fighter_v3.png',
                Scout: './assets/sprites/syndicate_scout_v3.png',
                TroopTransport: './assets/sprites/syndicate_transport.svg',
                Salvager: './assets/sprites/syndicate_salvager.svg',
                Frigate: './assets/sprites/syndicate_frigate.svg',
                Destroyer: './assets/sprites/syndicate_destroyer.svg',
                Cruiser: './assets/sprites/syndicate_cruiser.svg',
                SpaceStation: './assets/sprites/syndicate_station.svg',
            },
            Pirate: {
                Fighter: './assets/sprites/pirate_fighter_v3.png',
                Scout: './assets/sprites/pirate_scout.svg',
                TroopTransport: './assets/sprites/solaris_transport.svg', // Fallback
                Salvager: './assets/sprites/solaris_salvager.svg', // Fallback
                Frigate: './assets/sprites/pirate_frigate.svg',
                Destroyer: './assets/sprites/pirate_destroyer_v2.svg',
                Cruiser: './assets/sprites/solaris_cruiser_v2.svg', // Fallback
                SpaceStation: './assets/sprites/solaris_station.svg',
            }
        };

        const V3_TIERS = ['V3_T1_Scavenged', 'V3_T2_Refined', 'V3_T3_Elite'];
        const SHIP_TYPES = ['Fighter', 'Scout', 'TroopTransport', 'Salvager', 'Frigate', 'Destroyer', 'Cruiser', 'SpaceStation'];

        this.availableStyles = {};
        ['Solaris', 'Syndicate', 'Pirate'].forEach(faction => {
            this.availableStyles[faction] = {};
            SHIP_TYPES.forEach(type => {
                this.availableStyles[faction][type] = ['Default', ...V3_TIERS];
                if (faction === 'Solaris' && type === 'SpaceStation') this.availableStyles[faction][type].push('Bastion', 'Outpost');
                if (type === 'Cruiser') this.availableStyles[faction][type].push('V2');
            });
        });
        
        const portraitPaths = {
            Solaris: { Fighter: './assets/portraits/solaris_fighter.png' },
            Syndicate: { Fighter: './assets/portraits/syndicate_fighter.png' },
            Pirate: { Fighter: './assets/portraits/pirate_fighter.png' }
        };

        const promises = [];
        for (const faction in spritePaths) {
            this.sprites[faction] = {};
            for (const shipType in spritePaths[faction]) {
                const path = spritePaths[faction][shipType];
                const promise = new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        if (path.includes('_v3') || path.includes('_T')) {
                            this.sprites[faction][shipType] = this._applyChromakey(img);
                        } else {
                            this.sprites[faction][shipType] = img;
                        }
                        resolve();
                    };
                    img.onerror = () => {
                        const proceduralCanvas = ProceduralSpriteService.generateSprite(faction, shipType);
                        this.sprites[faction][shipType] = proceduralCanvas;
                        resolve(); 
                    };
                    img.src = path;
                });
                promises.push(promise);
            }
        }

        for (const faction in portraitPaths) {
            this.portraits[faction] = {};
            for (const type in portraitPaths[faction]) {
                const path = portraitPaths[faction][type];
                const promise = new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => { this.portraits[faction][type] = img; resolve(); };
                    img.onerror = () => { resolve(); };
                    img.src = path;
                });
                promises.push(promise);
            }
        }

        await Promise.all(promises);
        this.isLoaded = true;
    }

    getSprite(faction, shipType) {
        return this.sprites[faction]?.[shipType] || null;
    }

    getPortrait(faction, shipType) {
        return this.portraits[faction]?.[shipType] || null;
    }

    recolorSprite(source, faction, targetHex) {
        if (!source || !targetHex) return source;
        
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        const r_target = parseInt(targetHex.slice(1, 3), 16);
        const g_target = parseInt(targetHex.slice(3, 5), 16);
        const b_target = parseInt(targetHex.slice(5, 7), 16);

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a === 0) continue;

            let isMatch = false;
            // High-Tolerance RGB Detection
            if (faction === 'Solaris') {
                // Solaris DNA: Red > Green and overall high intensity, low Blue
                if (r > 120 && g > 40 && r > g && b < 140) isMatch = true;
            } else if (faction === 'Syndicate') {
                // Syndicate DNA: High Red and Blue, low Green
                if (r > 100 && b > 100 && g < 180) isMatch = true;
            } else if (faction === 'Pirate') {
                // Pirate DNA: Muted Brown/Rust (Red > Green > Blue)
                if (r > 60 && g > 30 && r > g && g > b) isMatch = true;
            }

            if (isMatch) {
                const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
                // Stronger intensity multiplier for custom colors
                data[i] = Math.min(255, r_target * lum * 2.2);
                data[i + 1] = Math.min(255, g_target * lum * 2.2);
                data[i + 2] = Math.min(255, b_target * lum * 2.2);
            }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    _applyChromakey(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const targetR = data[0], targetG = data[1], targetB = data[2];
        const tolerance = 96;
        for (let i = 0; i < data.length; i += 4) {
            if (Math.abs(data[i] - targetR) <= tolerance && Math.abs(data[i+1] - targetG) <= tolerance && Math.abs(data[i+2] - targetB) <= tolerance) {
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
}