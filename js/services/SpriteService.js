import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class SpriteService {
    constructor(loggingService) {
        this.sprites = {};
        this.isLoaded = false;
        this.loggingService = loggingService;
    }

    async loadSprites() {
        const spritePaths = {
            UNSC: {
                Fighter: './assets/sprites/unsc_fighter.png',
                Scout: './assets/sprites/unsc_scout.png',
                TroopTransport: './assets/sprites/unsc_transport.png',
                Salvager: './assets/sprites/unsc_salvager.png',
                Frigate: './assets/sprites/unsc_frigate.png',
                SpaceStation: './assets/sprites/unsc_station.png',
            },
            COVENANT: {
                Fighter: './assets/sprites/cov_fighter.png',
                Scout: './assets/sprites/cov_scout.png',
                TroopTransport: './assets/sprites/cov_transport.png',
                Salvager: './assets/sprites/cov_salvager.png',
                Frigate: './assets/sprites/cov_frigate.png',
                SpaceStation: './assets/sprites/cov_station.png',
            }
        };

        const promises = [];
        for (const faction in spritePaths) {
            this.sprites[faction] = {};
            for (const shipType in spritePaths[faction]) {
                const path = spritePaths[faction][shipType];
                const promise = new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        this.sprites[faction][shipType] = img;
                        resolve();
                    };
                    img.onerror = () => {
                        if (this.loggingService) this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.WARNING, `Failed to load sprite: ${path}. Using fallback shapes.`);
                        resolve(); // Don't reject, just resolve so the game can continue without this sprite
                    };
                    img.src = path;
                });
                promises.push(promise);
            }
        }

        await Promise.all(promises);
        this.isLoaded = true;
        if (this.loggingService) this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, "All ship sprites loaded.");
    }

    getSprite(faction, shipType) {
        return this.sprites[faction]?.[shipType] || null;
    }
}