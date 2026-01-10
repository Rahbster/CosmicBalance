import { PeerManager } from './peer.js';
import { SignalingChannel } from './signaling-service.js';
import { showPeerConnectionModal } from './modals/peer_connection_modal.js';
import { showGameSetupModal } from './modals/GameSetupModal.js';
import { ToastManager } from './ToastManager.js';
import { ChatManager } from './ChatManager.js';
import { GameEngine } from './game-engine.js';
import { TechTreeModal } from './modals/TechTreeModal.js';
import { FleetManagerModal } from './modals/FleetManagerModal.js';
import { RadialMenu } from './ui/RadialMenu.js';
import { LoggingModal } from './modals/LoggingModal.js';
import { LOG_CATEGORIES, LOG_LEVELS } from './cb_constants.js';

// --- Theme Management ---
function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌓';
    }
}

// Initialize Theme on script load to prevent flash of wrong theme
const savedTheme = localStorage.getItem('theme');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
if (savedTheme) {
    setTheme(savedTheme);
} else {
    setTheme(prefersDarkScheme.matches ? 'dark' : 'light');
}

const FACTION_COLORS = [
    '#00A0C0', // Cyan
    '#CC3333', // Red
    '#33CC33', // Green
    '#EFB82A', // Yellow
    '#9400D3', // Purple
    '#FF8C00', // Orange
    '#FFFFFF', // White
    '#FF69B4'  // Pink
];

const RESOURCE_TYPES = [
    { key: 'IO', domId: 'res-io', label: 'IO', icon: '🪙', cssClass: 'icon-io', title: 'Inter-system Organizational Credits' },
    { key: 'minerals', domId: 'res-minerals', label: 'Minerals', icon: '💎', cssClass: 'icon-minerals', title: 'Minerals' },
    { key: 'energy', domId: 'res-energy', label: 'Energy', icon: '⚡', cssClass: 'icon-energy', title: 'Energy', threshold: 20 },
    { key: 'food', domId: 'res-food', label: 'Food', icon: '🌾', cssClass: 'icon-food', title: 'Food', threshold: 20 },
    { key: 'scrap', domId: 'res-scrap', label: 'Scrap', icon: '⚙️', cssClass: 'icon-scrap', title: 'Scrap' }
];

// --- User Identity & Peer History ---
function getIdentity() {
    let guid = localStorage.getItem('pwa_user_guid');
    if (!guid) {
        guid = crypto.randomUUID();
        localStorage.setItem('pwa_user_guid', guid);
    }
    const name = localStorage.getItem('pwa_display_name') || 'Anonymous';
    return { guid, name };
}

function saveIdentity(name) {
    localStorage.setItem('pwa_display_name', name);
}

function savePeer(guid, name) {
    if (getIdentity().guid === guid) return; // Don't save self
    let peers = JSON.parse(localStorage.getItem('pwa_peers') || '{}');
    peers[guid] = { name, lastSeen: Date.now() };
    localStorage.setItem('pwa_peers', JSON.stringify(peers));
    loadPeerList(); // Refresh the UI
}

function getPeers() {
    return JSON.parse(localStorage.getItem('pwa_peers') || '{}');
}

function removePeer(guid) {
    let peers = getPeers();
    delete peers[guid];
    localStorage.setItem('pwa_peers', JSON.stringify(peers));
}

// Export for use in peer.js
export { getIdentity, savePeer };

// --- Team Management ---
function getTeam() {
    return localStorage.getItem('pwa_team') || 'UNSC';
}
function saveTeam(team) {
    localStorage.setItem('pwa_team', team);
}

const peerManager = new PeerManager();
let currentRemoteName = 'Peer';

const signaling = new SignalingChannel();
const toastManager = new ToastManager();
window.toastManager = toastManager; // Expose to global scope for engine access
const chatManager = new ChatManager({
    send: (data) => peerManager.send(data)
}, getIdentity, getTeam);

let gameEngine = null;
let techTreeModal = null;
let fleetManagerModal = null;
let loggingModal = null;
const radialMenu = new RadialMenu();

let colorPicker = null;

// --- UI Helpers ---
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function getVal(id) { return document.getElementById(id).value; }
function setVal(id, val) { document.getElementById(id).value = val; }

async function copyToClipboard(id) {
    const el = document.getElementById(id);
    if (el && el.value) {
        try {
            await navigator.clipboard.writeText(el.value);
            toastManager.show("Copied to clipboard!", 'success');
        } catch (err) {
            console.error("Failed to copy", err);
            toastManager.show("Failed to copy to clipboard", 'error');
        }
    }
}

function renderResourceHeader() {
    const container = document.getElementById('resource-list');
    if (!container) return;
    container.innerHTML = RESOURCE_TYPES.map(res => `
        <span title="${res.title}">
            <span class="res-label">${res.label}</span>
            <span class="res-value-group">
                <strong id="${res.domId}">0</strong>
                <i class="${res.cssClass}">${res.icon}</i>
            </span>
        </span>
    `).join('');
}

// --- PeerManager Callbacks ---
peerManager.onMessage((data) => {
    // Handle incoming data (chat or game state)
    if (data.type === 'chat') {
        chatManager.handleIncomingMessage(data);
    } else if (data.type === 'GAME_REQUEST_BUILD') {
        // Add senderId for host processing
        // This is now handled by the client sending its own GUID.
    } else if (data.type === 'identity') {
        currentRemoteName = data.name;
        savePeer(data.guid, data.name);
        console.log('Received data:', data);
    } else if (data.type.startsWith('GAME_')) {
        // Pass game events to engine
        if (gameEngine) gameEngine.handlePeerMessage(data);
    } else if (data.type === 'GAME_SET_STATE') {
        // When state is set, update local UI like faction name input
        if (gameEngine) {
            gameEngine.setState(data.state);
            const localPlayer = gameEngine.getLocalPlayer();
            if (localPlayer) setVal('faction-name-input', localPlayer.factionName);
            updateColorPickerUI();
        }
    } else if (data.type === 'GAME_PLAYER_UPDATE') {
        if (gameEngine) {
            gameEngine.handlePeerMessage(data); // Let engine update state
            updateColorPickerUI(); // Refresh color picker availability
        }
    } else if (data.type === 'GAME_PROMPT_RENAME') {
        const localPlayerId = getIdentity().guid;
        if (data.playerId === localPlayerId) {
            // This client needs to name the planet
            const renameModal = document.getElementById('rename-planet-modal');
            renameModal.classList.remove('hidden');
            const confirmBtn = document.getElementById('btn-confirm-rename');
            confirmBtn.onclick = () => confirmPlanetRename(data.systemId);
        }
    }
});

peerManager.onStatusChange((status) => {
    console.log('Connection status:', status);
    chatManager.enable(status === 'connected');
});

// Listen for local messages dispatched by the host's game engine
window.addEventListener('local-message', (e) => {
    const data = e.detail;
    if (data.type === 'GAME_PLAYER_UPDATE') {
        updateColorPickerUI(); // Refresh color picker availability
        updateHeaderUI();
    }
});

function confirmPlanetRename(systemId) {
    const input = document.getElementById('new-planet-name-input');
    const newName = input.value.trim();
    if (newName) {
        peerManager.send({ type: 'GAME_SYSTEM_RENAMED', systemId: systemId, newName: newName });
        document.getElementById('rename-planet-modal').classList.add('hidden');
        input.value = '';
    }
}

function populateFactionSelect() {
    if (!gameEngine) return;
    const hostFactionSelect = document.getElementById('host-faction-select');
    if (!hostFactionSelect) return;

    hostFactionSelect.innerHTML = '';
    gameEngine.state.players.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.factionName} (${player.team})`;
        hostFactionSelect.appendChild(option);
    });
    // Set the initial value in the engine
    if (gameEngine.state.players.length > 0) {
        const localPlayer = gameEngine.getLocalPlayer();
        hostFactionSelect.value = localPlayer ? localPlayer.id : gameEngine.state.players[0].id;
        gameEngine.hostView.faction = hostFactionSelect.value;
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Sidenav Logic
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeSidenavBtn = document.getElementById('close-sidenav-btn');
    const sidenav = document.getElementById('sidenav');
    const overlay = document.getElementById('overlay');

    const openNav = () => { sidenav.style.width = "280px"; overlay.style.display = "block"; };
    const closeNav = () => { sidenav.style.width = "0"; overlay.style.display = "none"; };

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openNav);
    if (closeSidenavBtn) closeSidenavBtn.addEventListener('click', closeNav);
    if (overlay) overlay.addEventListener('click', closeNav);

    // Modal Logic
    const btnOpenPeerModal = document.getElementById('btn-open-peer-modal');

    if (btnOpenPeerModal) {
        btnOpenPeerModal.addEventListener('click', () => {
            closeNav();
            showPeerConnectionModal(toastManager, {
                signaling,
                peerManager,
                getIdentity
            });
        });
    }

    const btnOpenGameSetupModal = document.getElementById('btn-open-game-setup-modal');
    if (btnOpenGameSetupModal) {
        btnOpenGameSetupModal.addEventListener('click', () => {
            closeNav();
            showGameSetupModal();
        });
    }

    // Chat Modal Logic
    const chatModal = document.getElementById('chat-modal');
    const btnOpenChat = document.getElementById('btn-open-chat');
    const closeChatModalBtn = document.getElementById('close-chat-modal');

    if (btnOpenChat) {
        btnOpenChat.addEventListener('click', () => {
            closeNav();
            chatModal.classList.remove('hidden');
            chatManager.resetUnread();
        });
    }

    if (closeChatModalBtn) {
        closeChatModalBtn.addEventListener('click', () => {
            chatModal.classList.add('hidden');
        });
    }

    // Scout Report Modal Logic
    const scoutModal = document.getElementById('scout-report-modal');
    const closeScoutModalBtn = document.getElementById('close-scout-report-modal');

    if (closeScoutModalBtn) {
        closeScoutModalBtn.addEventListener('click', () => {
            scoutModal.classList.add('hidden');
        });
    }
    // This function will be called by the game engine to show the modal
    window.showScoutReport = (report) => {
        const contentEl = document.getElementById('scout-report-content');
        const shipList = report.shipTypes.join(', ') || 'None';
        contentEl.innerHTML = `<p><strong>Estimated Ships:</strong> ${report.shipCount}</p>
                               <p><strong>Detected Types:</strong> ${shipList}</p>`;
        scoutModal.classList.remove('hidden');
    };

    // Settings View
    const settingsNameInput = document.getElementById('settings-name');
    if (settingsNameInput) {
        settingsNameInput.value = getIdentity().name;
        settingsNameInput.addEventListener('change', (e) => {
            const newName = e.target.value;
            saveIdentity(newName);
            // Also update the game state if a game is in progress
            if (gameEngine) gameEngine.requestPlayerUpdate({ factionName: newName });
        });
    }

    // Team Selector
    const teamSelect = document.getElementById('team-select');
    if (teamSelect) {
        teamSelect.value = getTeam();
        teamSelect.addEventListener('change', (e) => saveTeam(e.target.value));
    }

    // Theme Toggle Listener
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    // --- GAME LOGIC ---
    const viewGame = document.getElementById('view-game'); // Game view is now default
    viewGame.classList.remove('hidden');
    viewGame.classList.add('active');

    const gameCanvas = document.getElementById('game-canvas');

    // Initialize Game Engine on load since it's the main view
    if (!gameEngine && gameCanvas) {
        gameEngine = new GameEngine(gameCanvas, peerManager, getIdentity, getTeam);
        techTreeModal = new TechTreeModal(gameEngine, getTeam);
        fleetManagerModal = new FleetManagerModal(gameEngine);
        loggingModal = new LoggingModal(gameEngine);
        gameEngine.start();

        // --- Radial Menu Integration ---
        gameCanvas.addEventListener('showradialmenu', (e) => {
            const { entity, x, y } = e.detail;
            const isOwner = entity.owner === getIdentity().guid;

            if (!isOwner) return; // Only show menu for ships you own

            const menuItems = [
                {
                    label: 'Details',
                    action: () => {
                        // Explicitly open the panel when "Details" is clicked in the radial menu
                        gameEngine.setSelectedShip(entity.id, true);
                    }
                }
            ];

            // If the ship is currently patrolling, add Stop Patrol action
            if (entity.patrolSystemId) {
                menuItems.push({
                    label: 'Stop Patrol',
                    action: () => {
                        gameEngine.requestStopPatrol(entity.id);
                        toastManager.show('Patrol stopped.', 'info');
                    }
                });
            }

            // If the ship is a scout, add scout actions
            if (entity.type === 'Scout') {
                const currentSystem = gameEngine.getCurrentSystem(entity);

                if (currentSystem) {
                    // Add Patrol action if in a friendly system
                    if (currentSystem.owner === getIdentity().guid) {
                        menuItems.push({
                            label: `Patrol ${currentSystem.name}`,
                            action: () => {
                                gameEngine.requestPatrol(entity.id, currentSystem.id);
                                toastManager.show(`Patrolling ${currentSystem.name}.`, 'info');
                            }
                        });
                    }

                    const viewingPlayerId = getIdentity().guid;
                    const unexploredNeighbors = currentSystem.links
                        .map(link => gameEngine.state.systems.find(s => s.id === link.targetId))
                        .filter(neighbor => {
                            if (!neighbor) return false;
                            const visibility = neighbor.visibility[viewingPlayerId];
                            return !visibility || visibility === 'unexplored';
                        });

                    unexploredNeighbors.forEach(neighbor => {
                        menuItems.push({
                            label: `Scout ${neighbor.name}`,
                            action: () => {
                                gameEngine.requestScoutMission(entity.id, neighbor.id);
                                toastManager.show(`Scout mission to ${neighbor.name} initiated.`, 'info');
                            }
                        });
                    });
                }
            }

            // If the ship is a TroopTransport, add Colonize actions
            if (entity.type === 'TroopTransport') {
                const currentSystem = gameEngine.getCurrentSystem(entity);

                if (currentSystem) {
                    const viewingPlayerId = getIdentity().guid;
                    // Find visible neighbors (explored or scouted)
                    const visibleNeighbors = currentSystem.links
                        .map(link => gameEngine.state.systems.find(s => s.id === link.targetId))
                        .filter(neighbor => {
                            if (!neighbor) return false;
                            const visibility = neighbor.visibility[viewingPlayerId];
                            return visibility === 'explored' || visibility === 'scouted';
                        });

                    visibleNeighbors.forEach(neighbor => {
                        // Check if neighbor has any planets not owned by me (potential for colonization/capture)
                        const hasTargets = neighbor.planets.some(p => p.owner !== viewingPlayerId);
                        
                        if (hasTargets) {
                            menuItems.push({
                                label: `Colonize ${neighbor.name}`,
                                action: () => {
                                    gameEngine.moveShip(entity.id, neighbor.id);
                                    toastManager.show(`Transport sent to colonize ${neighbor.name}.`, 'info');
                                }
                            });
                        }
                    });
                }
            }

            // If the ship is a salvager, add salvager actions
            if (entity.type === 'Salvager') {
                // find nearby debris fields
                const nearbyDebris = gameEngine.state.debrisFields.filter(d => {
                    const dx = d.x - entity.x;
                    const dy = d.y - entity.y;
                    return (dx * dx + dy * dy) < (400 * 400); // within 400px radius
                });

                if (nearbyDebris.length > 0) {
                     menuItems.push({
                        label: `Recycle Debris`,
                        action: () => {
                            const targetDebris = nearbyDebris[0]; // Target the first one found
                            gameEngine.requestSalvageMission(entity.id, targetDebris.id);
                            toastManager.show(`Salvage mission to debris field initiated.`, 'info');
                        }
                    });
                }
            }

            menuItems.push({
                label: 'Self-Destruct',
                action: () => {
                    if (confirm(`Are you sure you want to self-destruct ${entity.type}?`)) {
                        gameEngine.requestSelfDestruct(entity.id);
                        toastManager.show(`${entity.type} self-destruct sequence initiated.`, 'error');
                    }
                }
            });

            // If the ship is a station, add a "Build" option
            if (entity.isStation) {
                menuItems.unshift({ // Add to the beginning
                    label: 'Build',
                    action: () => gameEngine.setSelectedLocation(entity.id)
                });
            }

            radialMenu.show(menuItems, x, y);
        });

        // Listener for bottom panel actions
        const selectedInfoContainer = document.getElementById('selected-planet-info');
        if (selectedInfoContainer) {
            selectedInfoContainer.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (!action) return;

                const shipId = e.target.dataset.shipId;
                const targetId = e.target.dataset.targetId;

                if (action === 'select-ship') {
                    if (shipId) gameEngine.setSelectedShip(shipId);
                } else if (action === 'open-radial') {
                    if (shipId) {
                        const ship = gameEngine.state.ships.find(s => s.id === shipId);
                        if (ship) {
                            const rect = gameCanvas.getBoundingClientRect();
                            const screenX = (ship.x * gameEngine.zoom) + gameEngine.pan.x + rect.left;
                            const screenY = (ship.y * gameEngine.zoom) + gameEngine.pan.y + rect.top;
                            
                            gameCanvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                                detail: { entity: ship, x: screenX, y: screenY } 
                            }));
                        }
                    }
                } else if (action === 'stop-patrol') {
                    gameEngine.requestStopPatrol(shipId);
                    toastManager.show('Patrol stopped.', 'info');
                } else if (action === 'patrol') {
                    gameEngine.requestPatrol(shipId, targetId);
                    toastManager.show('Patrol initiated.', 'info');
                } else if (action === 'scout') {
                    gameEngine.requestScoutMission(shipId, targetId);
                    toastManager.show('Scout mission initiated.', 'info');
                } else if (action === 'colonize') {
                    gameEngine.moveShip(shipId, targetId);
                    toastManager.show('Transport sent.', 'info');
                } else if (action === 'move-ship') {
                    const ship = gameEngine.state.ships.find(s => s.id === shipId);
                    if (ship) {
                        gameEngine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.INFO, `[UI] Move Ship requested. Ship: ${ship.id} (${ship.type}), Status: ${ship.moveState}, Target: ${targetId}, CurrentSystem: ${ship.currentSystemId}, ArrivalPoint: ${JSON.stringify(ship.arrivalPoint)}`);
                    } else {
                        gameEngine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.WARNING, `[UI] Move Ship requested for unknown ship: ${shipId}`);
                    }
                    gameEngine.moveShip(shipId, targetId);
                    toastManager.show('Course set.', 'info');
                } else if (action === 'recycle') {
                    gameEngine.requestSalvageMission(shipId, targetId);
                    toastManager.show('Salvage mission initiated.', 'info');
                } else if (action === 'ship-self-destruct') {
                    if (!shipId) return;
                    if (confirm(`Are you sure you want to self-destruct this ship?`)) {
                        gameEngine.requestSelfDestruct(shipId);
                        toastManager.show(`Self-destruct sequence initiated.`, 'error');
                    }
                } else if (action === 'ship-details') {
                    if (!shipId) return;
                    toastManager.show('Ship details view not yet implemented.', 'info');
                } else if (action === 'repair-ship') {
                    if (!shipId) return;
                    gameEngine.requestRepairShip(shipId);
                    // The button will be disabled/updated by the game engine's UI render
                    e.target.disabled = true;
                } else if (action === 'repair-ship-group') {
                    const shipType = e.target.dataset.shipType;
                    const serviceType = e.target.dataset.serviceType;
                    if (shipType && serviceType) gameEngine.requestRepairShipGroup(shipType, serviceType);
                    e.target.disabled = true;
                } else if (action === 'cancel-build') {
                    const locationId = e.target.dataset.locationId;
                    const itemId = e.target.dataset.itemId;
                    if (!locationId || !itemId) return;
                    gameEngine.requestCancelBuild(locationId, itemId);
                } else if (action === 'hide-panel') {
                    gameEngine.closeSelectionPanel();
                }
            });
        }

        // Faction Color Picker
        colorPicker = document.getElementById('faction-color-picker');
        if (colorPicker) {
            // Inject CSS for the color picker
            const style = document.createElement('style');
            style.textContent = `
                #selected-planet-info { 
                    position: absolute; 
                    bottom: 0; 
                    left: 0; 
                    width: 100%; 
                    z-index: 20; 
                    background: var(--surface-color, #1a1a1a); 
                    border-top: 1px solid var(--border-color, #333);
                    padding: 10px;
                    max-height: 300px;
                    overflow-y: auto;
                }
                .color-picker { display: flex; gap: 5px; flex-wrap: wrap; } .color-swatch { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; } .color-swatch.selected { border-color: var(--primary-color); }
                .build-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
                .build-item { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1); padding: 5px 10px; border-radius: 4px; }
                .build-controls { display: flex; gap: 5px; }
                .build-queue-list { list-style: none; padding: 0; margin-top: 10px; }
                .build-queue-list li { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; padding: 5px 0; border-bottom: 1px solid var(--border-color); }
                .build-queue-list .progress-bar-container { width: 100%; order: 3; }
                .cancel-build-btn { background: none; border: none; color: #999; font-size: 1.5rem; cursor: pointer; padding: 0 5px; line-height: 1; order: 2; }
                .cancel-build-btn:hover { color: #dc3545; }
                .planet-list { list-style: none; padding: 0; margin-top: 10px; } .planet-list li { padding: 5px 0; border-bottom: 1px solid var(--border-color); font-size: 0.9em; }
                .progress-bar-container { height: 5px; background: #555; border-radius: 3px; overflow: hidden; margin-top: 3px; }
                .progress-bar { height: 100%; background: var(--primary-color); width: 50%; }
                .repair-bay-list { list-style: none; padding: 0; margin-top: 10px; }
                .repair-bay-list li { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--border-color); }
                .research-queue-list { list-style: none; padding: 0; margin: 15px 0; }
                .research-queue-list li { display: flex; flex-direction: column; gap: 5px; padding: 8px 0; border-bottom: 1px solid var(--border-color); }
                .queue-badge { display: inline-block; background-color: var(--primary-color); color: var(--surface-color, #1a1a1a); padding: 1px 6px; border-radius: 7px; font-size: 0.75em; font-weight: bold; margin-left: 5px; vertical-align: middle; }
                
                /* Neon Glow / Sci-Fi HUD Styles */
                .resource-display {
                    position: absolute;
                    top: 70px;
                    left: 10px;
                    z-index: 10;
                    width: 220px;
                    background-color: rgba(0, 20, 30, 0.85);
                    border: 1px solid rgba(0, 242, 255, 0.3);
                    box-shadow: 0 0 15px rgba(0, 242, 255, 0.2), inset 0 0 10px rgba(0, 242, 255, 0.1);
                    backdrop-filter: blur(4px);
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    display: flex; flex-direction: column; gap: 5px; /* Ensure vertical stacking */
                }
                .resource-display strong {
                    color: #00f2ff;
                    text-shadow: 0 0 8px rgba(0, 242, 255, 0.8), 0 0 2px rgba(255, 255, 255, 0.5);
                }
                .low-resource {
                    color: #ff3131 !important;
                    animation: emergency-pulse 1.5s infinite;
                }
                @keyframes emergency-pulse {
                    0% { text-shadow: 0 0 2px #ff3131; }
                    50% { text-shadow: 0 0 12px #ff3131; }
                    100% { text-shadow: 0 0 2px #ff3131; }
                }

                /* Resource Display Layout Updates */
                #resource-list {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    width: 100%;
                }
                #resource-list > span {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                    gap: 2rem;
                }
                .res-value-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    justify-content: flex-end;
                }
                .res-value-group i, .res-value-group .icon-svg {
                    width: 20px;
                    text-align: center;
                    font-style: normal;
                    margin-right: 0; /* Reset margin from previous styles */
                }

                /* SVG Icon Styles */
                .icon-svg {
                    vertical-align: middle;
                }
                .system-flag {
                    fill: var(--player-color);
                    filter: drop-shadow(0 0 3px var(--player-color));
                }
                .resource-display span:hover .system-flag {
                    fill: #ffffff;
                    filter: drop-shadow(0 0 5px var(--player-color));
                    transition: 0.2s;
                }
                .app-header {
                    position: relative;
                    z-index: 100;
                }
            `;
            document.head.appendChild(style);
        }

        // After engine starts, we can get the local player and set the faction name
        const localPlayer = gameEngine.getLocalPlayer();
        if (localPlayer) {
            setVal('faction-name-input', localPlayer.factionName);
        }
        renderResourceHeader();
        updateHeaderUI();
        updateColorPickerUI();

        // If the user is the host (default for local play), show host controls.
        if (gameEngine.isHost) {
            const hostViewControls = document.getElementById('host-view-controls');
            if (hostViewControls) {
                hostViewControls.classList.remove('hidden');
                // If there are players in the loaded state, populate the dropdown.
                if (gameEngine.state.players.length > 0) {
                    populateFactionSelect();
                }
            }
        }
        
        const btnOpenTechTree = document.getElementById('btn-open-tech-tree');
        if (btnOpenTechTree) {
            btnOpenTechTree.addEventListener('click', () => techTreeModal.show());
        }

        const btnOpenFleetManager = document.getElementById('btn-open-fleet-manager');
        if (btnOpenFleetManager) {
            btnOpenFleetManager.addEventListener('click', () => fleetManagerModal.show());
        }

        // UI listeners for density sliders
        const twoWaySlider = document.getElementById('two-way-density');
        const twoWayValue = document.getElementById('two-way-density-value');
        const oneWaySlider = document.getElementById('one-way-density');
        const oneWayValue = document.getElementById('one-way-density-value');

        if (twoWaySlider) {
            twoWaySlider.addEventListener('input', () => twoWayValue.textContent = `${twoWaySlider.value}%`);
        }
        if (oneWaySlider) {
            oneWaySlider.addEventListener('input', () => oneWayValue.textContent = `${oneWaySlider.value}%`);
        }

        // --- Host View Controls ---
        const hostViewSelect = document.getElementById('host-view-select');
        const hostFactionSelect = document.getElementById('host-faction-select');

        if (hostViewSelect) {
            hostViewSelect.addEventListener('change', (e) => {
                const mode = e.target.value;
                gameEngine.hostView.mode = mode;
                hostFactionSelect.classList.toggle('hidden', mode !== 'faction');
            });
        }

        if (hostFactionSelect) {
            hostFactionSelect.addEventListener('change', (e) => {
                gameEngine.hostView.faction = e.target.value;
            });
        }

        // Add Logging Button to Sidenav
        const sidenav = document.getElementById('sidenav');
        if (sidenav) {
            const logBtn = document.createElement('button');
            logBtn.textContent = 'Logging Settings';
            logBtn.style.width = '100%';
            logBtn.style.marginTop = '0.5rem';
            logBtn.onclick = () => {
                // Close nav
                sidenav.style.width = "0"; 
                document.getElementById('overlay').style.display = "none";
                loggingModal.show();
            };
            // Insert before the HR
            const hr = sidenav.querySelector('hr');
            if (hr) sidenav.insertBefore(logBtn, hr);
        }
    }

    // Use event delegation for the create game button which is now in a modal
    document.body.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-create-game') {
            const numSystems = parseInt(document.getElementById('galaxy-size').value, 10);
            const numAI = parseInt(document.getElementById('ai-opponents').value, 10);
            const aiPlayers = [];
            for (let i = 0; i < numAI; i++) {
                aiPlayers.push({ id: `AI_${i + 1}`, team: 'COVENANT', isAI: true });
            }
            const twoWayDensity = parseInt(document.getElementById('two-way-density').value, 10);
            const oneWayDensity = parseInt(document.getElementById('one-way-density').value, 10);
            const resourceRate = parseInt(document.getElementById('resource-rate').value, 10) / 100; // Convert percentage to multiplier

            const newState = await gameEngine.createNewGame({ numSystems, aiPlayers, twoWayDensity, oneWayDensity, resourceRate });
            peerManager.send({ type: 'GAME_SET_STATE', state: newState });
            toastManager.show('New game created and sent to peers!', 'success');

            const hostViewControls = document.getElementById('host-view-controls');
            if (hostViewControls) {
                hostViewControls.classList.remove('hidden');
                populateFactionSelect();
            }

            // Close the modal
            const modal = document.getElementById('game-setup-modal');
            if (modal) modal.classList.add('hidden');
        } else if (e.target.id === 'btn-reset-game') {
            if (confirm('Are you sure you want to reset the game? This will permanently delete your saved game state.')) {
                gameEngine.resetGame();
                toastManager.show('Game has been reset.', 'info');
            }
        } else if (e.target.dataset.action === 'queue-build') {
            const shipType = e.target.dataset.shipType;
            const countInput = document.getElementById(`build-count-${shipType}`);
            const count = parseInt(countInput.value, 10);
            if (shipType && count > 0) {
                gameEngine.requestBuild(shipType, count);
                // toastManager.show(`Queued ${count}x ${shipType}.`, 'info'); // Moved to host-side for confirmation
                countInput.value = 1; // Reset input
            }
        } else if (e.target.id === 'context-open-tech-tree') {
            techTreeModal.show();
        } else if (e.target.id === 'context-open-fleet-manager') {
            fleetManagerModal.show();
        }
    });
});

function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    const n = Math.floor(num);
    if (n < 1000) return n.toString();
    if (n < 1000000) return (n / 1000).toFixed(2) + 'K';
    if (n < 1000000000) return (n / 1000000).toFixed(2) + 'M';
    return (n / 1000000000).toFixed(2) + 'B';
}

function updateHeaderUI() {
    if (!gameEngine) return;
    const localPlayer = gameEngine.getLocalPlayer();
    const resourceDisplay = document.getElementById('resource-display');
    if (!localPlayer || !localPlayer.resources) {
        resourceDisplay.style.display = 'none';
        return;
    }
    resourceDisplay.style.display = 'flex';

    const controlledSystems = gameEngine.state.systems.filter(s => s.owner === localPlayer.id).length;

    const updateResource = (id, value, threshold = 0) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = formatNumber(value);
            if (value <= threshold) el.classList.add('low-resource');
            else el.classList.remove('low-resource');
        }
    };

    RESOURCE_TYPES.forEach(res => {
        updateResource(res.domId, localPlayer.resources[res.key], res.threshold || 0);
    });
    
    // Update System Counts by Participant
    const systemList = document.getElementById('system-list');
    if (systemList) {
        systemList.innerHTML = '';
        gameEngine.state.players.forEach(p => {
            const count = gameEngine.state.systems.filter(s => s.owner === p.id).length;
            
            const span = document.createElement('span');
            span.title = `${p.factionName} Controlled Systems`;
            span.style.setProperty('--player-color', p.color);
            // span styles handled by CSS now (flex, space-between)
            span.style.cursor = 'help';

            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.classList.add("icon-svg", "system-flag");
            svg.setAttribute("viewBox", "0 0 24 24");
            
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M12.45 4L12 2H4v18h2v-7h5.55l.45 2h8V4h-7.55z");
            svg.appendChild(path);

            // Create label
            const label = document.createElement('span');
            label.className = 'res-label';
            label.textContent = p.factionName;
            span.appendChild(label);

            // Create value group
            span.innerHTML += `<span class="res-value-group"><strong>${count}</strong></span>`;
            span.querySelector('.res-value-group').appendChild(svg);

            systemList.appendChild(span);
        });
    }
}

function updateColorPickerUI() {
    if (!colorPicker || !gameEngine) return;
    colorPicker.innerHTML = '';

    const localPlayer = gameEngine.getLocalPlayer();
    const takenColors = gameEngine.state.players
        .filter(p => p.id !== localPlayer?.id)
        .map(p => p.color);

    FACTION_COLORS.forEach(color => {
        const isMyColor = localPlayer && localPlayer.color === color;
        const isTakenByOther = takenColors.includes(color);

        // Only render the swatch if it's the player's current color, or if it's not taken by another player.
        if (isMyColor || !isTakenByOther) {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.dataset.color = color;

            if (isMyColor) {
                swatch.classList.add('selected');
            } else {
                swatch.addEventListener('click', () => gameEngine.requestPlayerUpdate({ color: color }));
            }
            colorPicker.appendChild(swatch);
        }
    });
}