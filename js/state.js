/**
 * Centralized Application State for CosmicBalance.
 * Inspired by the PeerSudoku state management pattern.
 */

export const STORAGE_KEYS = {
    PLAYER_NAME: 'pwa_display_name',
    PLAYER_ID: 'pwa_user_guid',
    FACTION_NAME: 'cosmicBalance_factionName',
    FACTION_COLOR: 'cosmicBalance_factionColor',
    TECH_BASE: 'pwa_team',
    THEME: 'pwa_theme',
    SAVED_GAME: 'cosmicBalance_savedGame',
    IS_MUTED: 'cosmicBalance_isMuted',
    FRIENDS: 'cosmicBalance_friends',
    RECOVERY: 'cosmicBalance_recovery',
    REPORTS: 'cosmicBalance_reports'
};

export const VERSION = '1.0.0';
export const IS_DEBUG = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

/**
 * Enhanced logger for debug mode
 */
export const logger = {
    log: (...args) => IS_DEBUG && console.log('[CosmicBalance]', ...args),
    warn: (...args) => IS_DEBUG && console.warn('[CosmicBalance]', ...args),
    error: (...args) => console.error('[CosmicBalance]', ...args)
};

// Helper to read from localStorage and strip potential double-quotes
const cleanRead = (key, defaultValue = null) => {
    let val = localStorage.getItem(key);
    if (val === null) return defaultValue;
    if (val.startsWith('"') && val.endsWith('"')) {
        try {
            return JSON.parse(val);
        } catch (e) {
            return val.slice(1, -1);
        }
    }
    return val;
};

// Initialize or recover Player ID
let savedPlayerId = cleanRead(STORAGE_KEYS.PLAYER_ID);
if (!savedPlayerId) {
    savedPlayerId = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.PLAYER_ID, savedPlayerId);
} else {
    // Ensure it's saved clean if it was quoted
    localStorage.setItem(STORAGE_KEYS.PLAYER_ID, savedPlayerId);
}

export const appState = {
    // Identity
    playerId: savedPlayerId,
    commanderName: cleanRead(STORAGE_KEYS.PLAYER_NAME) || 'Commander-' + Math.floor(Math.random() * 999),
    factionName: cleanRead(STORAGE_KEYS.FACTION_NAME) || 'Solaris Alliance',
    factionColor: cleanRead(STORAGE_KEYS.FACTION_COLOR) || '#FFFFFF',
    techBase: cleanRead(STORAGE_KEYS.TECH_BASE) || 'Solaris',
    friends: JSON.parse(cleanRead(STORAGE_KEYS.FRIENDS, '[]')),
    
    // UI State
    theme: cleanRead(STORAGE_KEYS.THEME) || 'dark',
    isMuted: cleanRead(STORAGE_KEYS.IS_MUTED) === 'true',
    currentView: 'lobby', // 'lobby' | 'game' | 'combat'
    
    // Networking
    isHost: true,
    connectionStatus: 'disconnected', // 'connected' | 'connecting' | 'disconnected'
    peerId: null,
    connectedPeers: [],
    pendingVetting: null, // { requesterId, name, faction, conn }
    
    // Game Data (Volatile)
    gameActive: false,
    gameTime: 0,
    gameSpeed: 1.0,
    isPaused: false,
    
    // World Data
    galaxy: null,
    players: [],
    ships: [],
    systems: [],
    
    // Selection
    selectedEntity: null,
    selectedSystem: null,
    
    // UI References (set at runtime)
    dom: {}
};

/**
 * Helper to update state and persist to localStorage where applicable
 */
export const updateState = (updates) => {
    Object.assign(appState, updates);
    
    // Persist specific keys
    if (updates.commanderName) localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, updates.commanderName);
    if (updates.factionName) localStorage.setItem(STORAGE_KEYS.FACTION_NAME, updates.factionName);
    if (updates.factionColor) localStorage.setItem(STORAGE_KEYS.FACTION_COLOR, updates.factionColor);
    if (updates.techBase) localStorage.setItem(STORAGE_KEYS.TECH_BASE, updates.techBase);
    if (updates.theme) localStorage.setItem(STORAGE_KEYS.THEME, updates.theme);
    if (updates.isMuted !== undefined) localStorage.setItem(STORAGE_KEYS.IS_MUTED, updates.isMuted);
};
