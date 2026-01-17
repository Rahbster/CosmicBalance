export class StorageService {
    constructor() {
        this.appPrefix = 'pwa';
        this.gamePrefix = 'cosmic_balance';
    }

    // --- Generic Helpers ---

    getItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error(`[StorageService] Error getting item ${key}:`, e);
            return defaultValue;
        }
    }

    setItem(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error(`[StorageService] Error setting item ${key}:`, e);
            // Handle QuotaExceededError specifically if needed
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
                console.warn("[StorageService] Storage quota exceeded.");
                return false;
            }
            return false;
        }
    }

    removeItem(key) {
        localStorage.removeItem(key);
    }

    // --- Game State ---

    getGameState() {
        return this.getItem(`${this.gamePrefix}_gamestate`);
    }

    saveGameState(state) {
        // Try to save. If it fails due to quota, try to clear reports first.
        if (!this.setItem(`${this.gamePrefix}_gamestate`, state)) {
            console.warn("[StorageService] Save failed. Attempting cleanup...");
            this.removeItem(`${this.gamePrefix}_reports`);
            // Try again
            if (!this.setItem(`${this.gamePrefix}_gamestate`, state)) {
                console.error("[StorageService] CRITICAL: Save failed even after cleanup.");
                return false;
            }
        }
        return true;
    }

    clearGameState() {
        this.removeItem(`${this.gamePrefix}_gamestate`);
        this.removeItem(`${this.gamePrefix}_reports`);
    }

    // --- Reports ---

    getReports() {
        return this.getItem(`${this.gamePrefix}_reports`, []);
    }

    saveReports(reports) {
        // Only save the last 60 reports to manage space
        const reportsToSave = reports.slice(-60);
        this.setItem(`${this.gamePrefix}_reports`, reportsToSave);
    }

    // --- Settings & Config ---

    getSetupConfig() {
        return this.getItem(`${this.gamePrefix}_setup_config`);
    }

    saveSetupConfig(config) {
        this.setItem(`${this.gamePrefix}_setup_config`, config);
    }

    getLoggingConfig() {
        return this.getItem('logging_config', {});
    }

    saveLoggingConfig(config) {
        this.setItem('logging_config', config);
    }

    getTheme() {
        // Theme is stored as a raw string, not JSON
        return localStorage.getItem('theme');
    }

    saveTheme(theme) {
        localStorage.setItem('theme', theme);
    }
}