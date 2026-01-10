import { LOG_LEVELS, LOG_CATEGORIES } from '../cb_constants.js';

export class LoggingService {
    constructor() {
        // Default configuration: Info level for System, Warning for others to reduce noise
        this.config = {
            [LOG_CATEGORIES.SYSTEM]: LOG_LEVELS.INFO,
            [LOG_CATEGORIES.MOVEMENT]: LOG_LEVELS.WARNING, // Set to TRACE (5) in modal to debug movement
            [LOG_CATEGORIES.COMBAT]: LOG_LEVELS.WARNING,
            [LOG_CATEGORIES.ECONOMY]: LOG_LEVELS.WARNING,
            [LOG_CATEGORIES.AI]: LOG_LEVELS.WARNING,
            [LOG_CATEGORIES.NETWORK]: LOG_LEVELS.WARNING
        };
        this.loadConfig();
    }

    log(category, level, message, ...data) {
        const currentLevel = this.config[category] !== undefined ? this.config[category] : LOG_LEVELS.WARNING;
        
        if (level <= currentLevel) {
            const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
            const prefix = `[${timestamp}] [${category}]`;
            
            switch (level) {
                case LOG_LEVELS.CRITICAL:
                case LOG_LEVELS.ERROR:
                    console.error(prefix, message, ...data);
                    break;
                case LOG_LEVELS.WARNING:
                    console.warn(prefix, message, ...data);
                    break;
                case LOG_LEVELS.INFO:
                    console.info(prefix, message, ...data);
                    break;
                default:
                    console.log(prefix, message, ...data);
            }
        }
    }

    setCategoryLevel(category, level) {
        if (this.config.hasOwnProperty(category)) {
            this.config[category] = parseInt(level, 10);
            this.saveConfig();
        }
    }

    saveConfig() {
        localStorage.setItem('logging_config', JSON.stringify(this.config));
    }
    
    loadConfig() {
        const saved = localStorage.getItem('logging_config');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.config = { ...this.config, ...parsed };
            } catch (e) {
                console.error("Failed to load logging config", e);
            }
        }
    }
}