//==============================
// Global Variables and State
//==============================

export const dom = {}; // Object to cache DOM elements
export const dataChannels = []; // Array to hold active WebRTC data channels

export const appState = {
    isInitiator: false,
    soloGameState: null,
    players: [],
    teams: {},
    playerTeam: null,
    playerId: null,
    sessionId: Math.random().toString(36).substring(2, 15),
    settings: {}
};

// Initialize DOM elements required by game modules
document.addEventListener('DOMContentLoaded', () => {
    dom.body = document.body;
    dom.gameBoardArea = document.getElementById('game-board-area') || document.getElementById('game-container');
    dom.newPuzzleButton = document.getElementById('new-puzzle-btn') || document.getElementById('btn-new-game');
    
    // If elements aren't found (different HTML structure), ensure dom properties exist to prevent crashes
    if (!dom.gameBoardArea) dom.gameBoardArea = document.body;
    if (!dom.newPuzzleButton) dom.newPuzzleButton = document.createElement('button');
    
    // Add other common elements here as needed
});