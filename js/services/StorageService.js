import { STORAGE_KEYS } from '../state.js';

export class StorageService {
    constructor() {
        this.lastSaveErrorTime = 0;
        this.saveErrorCooldown = 30000; // 30 seconds cooldown on error
    }

    // --- Generic Helpers ---

    getItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            if (item === null) return defaultValue;
            // Handle both JSON and raw strings
            try {
                return JSON.parse(item);
            } catch (e) {
                return item;
            }
        } catch (e) {
            console.error(`[StorageService] Error getting item ${key}:`, e);
            return defaultValue;
        }
    }

    setItem(key, value) {
        try {
            const valToStore = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, valToStore);
            return true;
        } catch (e) {
            console.error(`[StorageService] Error setting item ${key}:`, e);
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
                console.warn("[StorageService] Storage quota exceeded.");
            }
            return false;
        }
    }

    removeItem(key) {
        localStorage.removeItem(key);
    }

    // --- Game State ---

    getGameState() {
        return this.getItem(STORAGE_KEYS.SAVED_GAME);
    }

    saveGameState(state) {
        if (Date.now() - this.lastSaveErrorTime < this.saveErrorCooldown) return false;

        if (!this.setItem(STORAGE_KEYS.SAVED_GAME, state)) {
            console.warn("[StorageService] Save failed. Attempting cleanup...");
            // Aggressive cleanup: Remove combat logs from state copy
            const slimState = { ...state };
            if (slimState.combatLogHistory) {
                delete slimState.combatLogHistory;
            }

            if (!this.setItem(STORAGE_KEYS.SAVED_GAME, slimState)) {
                console.error("[StorageService] CRITICAL: Save failed even after cleanup.");
                this.lastSaveErrorTime = Date.now();
                return false;
            }
        }
        return true;
    }

    clearGameState() {
        this.removeItem(STORAGE_KEYS.SAVED_GAME);
    }

    // --- Settings & Config ---

    getTheme() {
        return this.getItem(STORAGE_KEYS.THEME, 'dark');
    }

    saveTheme(theme) {
        this.setItem(STORAGE_KEYS.THEME, theme);
    }

    getLoggingConfig() {
        return this.getItem('logging_config', {});
    }

    saveLoggingConfig(config) {
        this.setItem('logging_config', config);
    }

    // --- Recovery ---

    saveRecoveryState(recoveryData) {
        return this.setItem(STORAGE_KEYS.RECOVERY, recoveryData);
    }

    getRecoveryState() {
        return this.getItem(STORAGE_KEYS.RECOVERY);
    }

    clearRecoveryState() {
        this.removeItem(STORAGE_KEYS.RECOVERY);
    }

    // --- Setup Config ---

    saveSetupConfig(config) {
        this.setItem('cb_setup_config', config);
    }

    getSetupConfig() {
        return this.getItem('cb_setup_config');
    }

    // --- Reports ---

    getReports() {
        return this.getItem(STORAGE_KEYS.REPORTS, []);
    }

    saveReports(reports) {
        return this.setItem(STORAGE_KEYS.REPORTS, reports);
    }
}