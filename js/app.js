import { PeerManager } from './peer.js';
import { showPeerConnectionModal } from './modals/peer_connection_modal.js';
import { showGameSetupModal } from './modals/GameSetupModal.js';
import { showAboutModal } from './modals/AboutModal.js';
import { ToastManager } from './ToastManager.js';
import { ChatManager } from './ChatManager.js';
import { GameEngine } from './game-engine.js';
import { TechTreeModal } from './modals/TechTreeModal.js';
import { FleetManagerModal } from './modals/FleetManagerModal.js';
import { RadialMenu } from './ui/RadialMenu.js';
import { LoggingModal } from './modals/LoggingModal.js';
import { LoggingService } from './services/LoggingService.js';
import { LOG_CATEGORIES, LOG_LEVELS } from './cb_constants.js';
import { UIManager } from './ui/UIManager.js';
import { ProfileService } from './services/ProfileService.js';
import { StorageService } from './services/StorageService.js';
import { GameStatusModal } from './modals/GameStatusModal.js';
import { ShipDesignerModal } from './modals/ShipDesignerModal.js';

let gameEngine = null;
const storageService = new StorageService();
let uiManager = new UIManager(null, storageService); // Initialize early for theme
const profileService = new ProfileService(storageService);
const loggingService = new LoggingService(storageService);

// Initialize Theme on script load to prevent flash of wrong theme
const savedTheme = storageService.getTheme();
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
if (savedTheme) {
    uiManager.setTheme(savedTheme);
} else {
    uiManager.setTheme(prefersDarkScheme.matches ? 'dark' : 'light');
}

const peerManager = new PeerManager(profileService, loggingService);
let currentRemoteName = 'Peer';
let currentRemoteIdentity = null;

// iOS Detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// PWA Install Prompt Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) installBtn.classList.remove('hidden');
});

// For iOS, we show the button manually if not in standalone mode
if (isIOS && !window.navigator.standalone) {
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) installBtn.classList.remove('hidden');
}

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) installBtn.classList.add('hidden');
    deferredPrompt = null;
});

const toastManager = new ToastManager();
window.toastManager = toastManager; // Expose to global scope for engine access
let chatManager = null;

let techTreeModal = null;
let fleetManagerModal = null;
let loggingModal = null;
let gameStatusModal = null;
let shipDesignerModal = null;
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

function updateHeaderControls() {
    const controls = document.getElementById('header-controls');
    const pauseBtn = document.getElementById('header-pause-btn');
    const speedSlider = document.getElementById('game-speed-slider');
    const speedValue = document.getElementById('game-speed-value');

    if (!controls || !gameEngine) return;
    
    if (gameEngine.state.systems.length > 0) {
        controls.classList.remove('hidden');
        pauseBtn.textContent = gameEngine.paused ? "▶️" : "⏸️";
        pauseBtn.title = gameEngine.paused ? "Resume Game" : "Pause Game";
        speedSlider.value = gameEngine.timeScale || 1.0;
        speedValue.textContent = `${(gameEngine.timeScale || 1.0).toFixed(1)}x`;
    } else {
        controls.classList.add('hidden');
    }
}

// --- PeerManager Callbacks ---
peerManager.onMessage((data) => {
    loggingService.log(LOG_CATEGORIES.PEER, LOG_LEVELS.INFO, "[App] Peer Message Received:", data);
    // Handle incoming data (chat or game state)
    if (data.type === 'chat') {
        if (chatManager) {
            chatManager.handleIncomingMessage(data);
        } else {
            loggingService.log(LOG_CATEGORIES.PEER, LOG_LEVELS.WARNING, "[App] ChatManager not initialized, dropping chat message.");
        }
    } else if (data.type === 'GAME_REQUEST_BUILD') {
        // Add senderId for host processing
        // This is now handled by the client sending its own GUID.
    } else if (data.type === 'identity') {
        currentRemoteName = data.name;
        currentRemoteIdentity = { guid: data.guid, name: data.name, team: data.team, role: data.role }; // Store role
        profileService.savePeer(data.guid, data.name, data.team);
        // If we are the host and a game is running, try to add the player
        if (gameEngine && gameEngine.isHost) {
            gameEngine.addPlayer(data.guid, data.name, data.role);
        }
    } else if (data.type.startsWith('GAME_')) {
        // Pass game events to engine
        if (gameEngine) {
            gameEngine.handlePeerMessage(data);
            if (data.type === 'GAME_SET_PAUSE' || data.type === 'GAME_SET_SPEED') updateHeaderControls();
            if (data.type === 'GAME_FLEET_UPDATE' && fleetManagerModal && !document.getElementById('fleet-manager-modal').classList.contains('hidden')) {
                fleetManagerModal.render();
            }
        }
    } else if (data.type === 'GAME_SET_STATE') {
        // When state is set, update local UI like faction name input
        if (gameEngine) {
            gameEngine.setState(data.state);
            const localPlayer = gameEngine.getLocalPlayer();
            if (localPlayer) setVal('faction-name-input', localPlayer.factionName);
            uiManager.updateColorPickerUI();
            updateHeaderControls();
        }
    } else if (data.type === 'GAME_PLAYER_UPDATE') {
        if (gameEngine) {
            gameEngine.handlePeerMessage(data); // Let engine update state
            uiManager.updateColorPickerUI(); // Refresh color picker availability
        }
    } else if (data.type === 'GAME_PROMPT_RENAME') {
        const localPlayerId = profileService.getIdentity().guid;
        if (data.playerId === localPlayerId) {
            // This client needs to name the planet
            const renameModal = document.getElementById('rename-planet-modal');
            renameModal.classList.remove('hidden');
            const confirmBtn = document.getElementById('btn-confirm-rename');
            confirmBtn.onclick = () => confirmRename(data.systemId, data.planetId);
        }
    }
});

peerManager.onStatusChange((status) => {
    if (chatManager) chatManager.enable(status === 'connected');
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.className = 'connection-status'; // Reset classes
        if (status === 'connected') {
            statusEl.classList.add('connected');
            statusEl.title = "Connected to Peer";
        } else {
            statusEl.classList.add('disconnected');
            statusEl.title = `Disconnected (${status})`;
            if (status !== 'connected') {
                currentRemoteIdentity = null; // Clear the remote identity on disconnect
            }
        }
    }
});

// Listen for local messages dispatched by the host's game engine
window.addEventListener('local-message', (e) => {
    const data = e.detail;
    if (data.type === 'GAME_PLAYER_UPDATE') {
        uiManager.updateColorPickerUI(); // Refresh color picker availability
        uiManager.updateHeaderUI();
    } else if (data.type === 'GAME_SET_PAUSE' || data.type === 'GAME_SET_SPEED') {
        updateHeaderControls();
    } else if (data.type === 'GAME_FLEET_UPDATE') {
        if (fleetManagerModal && !document.getElementById('fleet-manager-modal').classList.contains('hidden')) {
            fleetManagerModal.render();
        }
    }
});

function confirmRename(systemId, planetId = null) {
    const input = document.getElementById('new-planet-name-input');
    const newName = input.value.trim();
    if (newName) {
        let msg;
        if (planetId) {
            msg = { type: 'GAME_PLANET_RENAMED', systemId: systemId, planetId: planetId, newName: newName };
        } else {
            msg = { type: 'GAME_SYSTEM_RENAMED', systemId: systemId, newName: newName };
        }
        peerManager.send(msg);
        if (gameEngine) {
            gameEngine.handlePeerMessage(msg);
        }
        document.getElementById('rename-planet-modal').classList.add('hidden');
        input.value = '';
    }
}

function updateHostViewControls() {
    if (!gameEngine) return;
    const hostViewSelect = document.getElementById('host-view-select');
    const hostFactionSelect = document.getElementById('host-faction-select');
    if (!hostViewSelect || !hostFactionSelect) return;

    const mode = hostViewSelect.value;
    gameEngine.hostView.mode = mode;

    hostFactionSelect.innerHTML = '';
    
    if (mode === 'god' || mode === 'filtered') {
        hostFactionSelect.classList.add('hidden');
    } else {
        hostFactionSelect.classList.remove('hidden');
        if (mode === 'player') {
            gameEngine.state.players.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = `${player.factionName} (${player.team})`;
                hostFactionSelect.appendChild(option);
            });
        } else if (mode === 'faction') {
            const teams = [...new Set(gameEngine.state.players.map(p => p.team))];
            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team;
                option.textContent = team;
                hostFactionSelect.appendChild(option);
            });
        }
        
        // Set initial value if not set or invalid
        if (hostFactionSelect.options.length > 0) {
             // Try to keep current selection if valid
             const current = gameEngine.hostView.faction;
             let found = false;
             for(let i=0; i<hostFactionSelect.options.length; i++) {
                 if (hostFactionSelect.options[i].value === current) {
                     hostFactionSelect.value = current;
                     found = true;
                     break;
                 }
             }
             if (!found) {
                 hostFactionSelect.value = hostFactionSelect.options[0].value;
                 gameEngine.hostView.faction = hostFactionSelect.value;
             }
        }
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Sidenav Logic - Moved to top to ensure 'overlay' is initialized for Context Slider
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeSidenavBtn = document.getElementById('close-sidenav-btn');
    const sidenav = document.getElementById('sidenav');
    const overlay = document.getElementById('overlay');

    const openNav = () => { if(sidenav) sidenav.style.width = "280px"; if(overlay) overlay.style.display = "block"; };
    const closeNav = () => { if(sidenav) sidenav.style.width = "0"; if(overlay) overlay.style.display = "none"; };

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openNav);
    if (closeSidenavBtn) closeSidenavBtn.addEventListener('click', closeNav);
    if (overlay) overlay.addEventListener('click', closeNav);

    // Inject dynamic styles for UI behavior
    const uiStyle = document.createElement('style');
    uiStyle.textContent = `
        body.fullscreen-mode #ship-designer-btn-main,
        body.fullscreen-mode #btn-open-ship-designer { display: none !important; }
        body.fullscreen-mode #about-btn-main { display: none !important; }
    `;
    document.head.appendChild(uiStyle);

    // Initialize ChatManager here to ensure DOM is ready
    chatManager = new ChatManager({
        send: (data) => peerManager.send(data)
    }, () => profileService.getIdentity(), () => profileService.getTeam(), loggingService);
    
    // PWA Install Button
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (isIOS) {
                // Show iOS instructions
                const iosModal = document.getElementById('ios-install-modal');
                if (iosModal) iosModal.classList.remove('hidden');
                closeNav();
            } else if (deferredPrompt) {
                installBtn.classList.add('hidden');
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                deferredPrompt = null;
            }
        });
    }

    // Inject About Button into Sidenav
    if (sidenav) {
        const actionButtonsContainer = sidenav.querySelector('.sidenav-item');
        
        // Close iOS modal button logic
        const closeIosBtn = document.getElementById('close-ios-install-modal');
        if (closeIosBtn) {
            closeIosBtn.addEventListener('click', () => document.getElementById('ios-install-modal').classList.add('hidden'));
        }

        if (actionButtonsContainer) {
            const statusBtn = document.createElement('button');
            statusBtn.textContent = "Game Status";
            statusBtn.style.width = "100%";
            statusBtn.style.marginTop = "0.5rem";
            statusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeNav();
                if (gameStatusModal) {
                    gameStatusModal.show();
                    if (gameEngine && gameEngine.isHost) {
                        // Delay update to allow modal to render and layout so charts can size correctly
                        setTimeout(() => {
                            const report = gameEngine.generateAIReport();
                            report.history = gameEngine.reportHistory;
                            gameStatusModal.update(report);
                            // Force a resize event to ensure charts render correctly after modal becomes visible
                            window.dispatchEvent(new Event('resize'));
                        }, 250);
                    }
                }
            });
            actionButtonsContainer.appendChild(statusBtn);
        }
    }

    // Show About on first load if no game state exists
    if (!localStorage.getItem('cosmic_balance_gamestate')) {
        showAboutModal();
    }

    // Modal Logic
    const btnOpenPeerModal = document.getElementById('btn-open-peer-modal');

    if (btnOpenPeerModal) {
        btnOpenPeerModal.addEventListener('click', () => {
            closeNav();
            showPeerConnectionModal(toastManager, {
                peerManager,
                getIdentity: () => profileService.getIdentity()
            });
        });
    }

    const btnOpenGameSetupModal = document.getElementById('btn-open-game-setup-modal');
    if (btnOpenGameSetupModal) {
        btnOpenGameSetupModal.addEventListener('click', () => {
            closeNav();
            showGameSetupModal(storageService);
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
            if (chatManager) chatManager.resetUnread();
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
        if (report.shipCount === 0) {
            toastManager.show('Scout Report: No ships detected.', 'info');
            return;
        }
        const contentEl = document.getElementById('scout-report-content');
        const shipList = report.shipTypes.join(', ') || 'None';
        contentEl.innerHTML = `<p><strong>Estimated Ships:</strong> ${report.shipCount}</p>
                               <p><strong>Detected Types:</strong> ${shipList}</p>`;
        scoutModal.classList.remove('hidden');
    };

    // Settings View
    const settingsNameInput = document.getElementById('settings-name');
    if (settingsNameInput) {
        settingsNameInput.value = profileService.getIdentity().name;
        settingsNameInput.addEventListener('change', (e) => {
            const newName = e.target.value;
            profileService.saveIdentity(newName);
            // Also update the game state if a game is in progress
            if (gameEngine) gameEngine.requestPlayerUpdate({ factionName: newName });
        });
    }

    // Team Selector
    const teamSelect = document.getElementById('team-select');
    if (teamSelect) {
        teamSelect.value = profileService.getTeam();
        teamSelect.addEventListener('change', (e) => profileService.saveTeam(e.target.value));
    }

    // Theme Toggle Listener
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            uiManager.setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    // Header Toggle Logic
    const hideHeaderHandle = document.getElementById('hide-header-handle');
    const showHeaderHandle = document.getElementById('show-header-handle');
    if (hideHeaderHandle && showHeaderHandle) {
        hideHeaderHandle.addEventListener('click', () => {
            document.body.classList.add('fullscreen-mode');
        });
        showHeaderHandle.addEventListener('click', () => {
            document.body.classList.remove('fullscreen-mode');
        });
    }

    // --- GAME LOGIC ---
    const viewGame = document.getElementById('view-game'); // Game view is now default
    viewGame.classList.remove('hidden');
    viewGame.classList.add('active');

    const gameCanvas = document.getElementById('game-canvas');

    // Auto-hide header on canvas interaction
    if (gameCanvas) {
        gameCanvas.addEventListener('mousedown', () => {
            document.body.classList.add('fullscreen-mode');
        });
    }

    // Initialize Game Engine on load since it's the main view
    if (!gameEngine && gameCanvas) {
        console.log("[App] Initializing GameEngine...");
        gameEngine = new GameEngine(gameCanvas, peerManager, profileService, loggingService, storageService);
        uiManager.gameEngine = gameEngine; // Link engine to UI manager
        uiManager.colorPicker = document.getElementById('faction-color-picker'); // Re-bind element
        techTreeModal = new TechTreeModal(gameEngine, () => profileService.getTeam());
        fleetManagerModal = new FleetManagerModal(gameEngine);
        loggingModal = new LoggingModal(gameEngine);
        gameStatusModal = new GameStatusModal(gameEngine);
        shipDesignerModal = new ShipDesignerModal(gameEngine);
        
        // Wire up live updates for Game Status Modal
        
        // Header Pause Button Logic
        const headerPauseBtn = document.getElementById('header-pause-btn');
        if (headerPauseBtn) {
            headerPauseBtn.addEventListener('click', () => {
                if (gameEngine && gameEngine.isHost) {
                    gameEngine.togglePause();
                    updateHeaderControls();
                }
            });
        }

        const speedSlider = document.getElementById('game-speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                if (gameEngine && gameEngine.isHost) {
                    gameEngine.setGameSpeed(e.target.value);
                }
            });
        }
        window.addEventListener('ai-report-generated', (e) => {
            if (gameStatusModal && typeof gameStatusModal.update === 'function') {
                const reportData = e.detail.report;
                // Include the current report in the history for the graph to show the latest data point
                const liveHistory = [...e.detail.history, reportData];
                gameStatusModal.update(reportData, liveHistory);
                // Force a resize event to ensure charts render correctly during live updates
                window.dispatchEvent(new Event('resize'));
            }
        });

        gameEngine.start();
        updateHeaderControls();

        // --- Radial Menu Integration ---
        gameCanvas.addEventListener('showradialmenu', (e) => {
            const { entity, x, y } = e.detail;
            const isSystem = !!(entity.planets && entity.r);
            
            // Allow menu for systems even if not owned (e.g. to see details or just selection feedback)
            // For ships, usually only owner, but maybe we want 'Details' for enemy ships too?
            // Keeping owner check for command-giving, but basic menu might be open to all.

            const menuItems = [
                {
                    label: 'Details',
                    icon: 'ℹ️',
                    action: () => {
                        // Explicitly open the panel when "Details" is clicked in the radial menu
                        if (isSystem) {
                            gameEngine.setSelectedLocation(entity.id, true);
                        } else {
                            gameEngine.setSelectedShip(entity.id, true);
                        }
                    }
                }
            ];

            const isOwner = entity.owner === profileService.getIdentity().guid;

            if (isOwner) {
                // If the ship is currently patrolling, add Stop Patrol action
                if (entity.patrolSystemId) {
                    menuItems.push({
                        label: 'Stop Patrol',
                        icon: '🛑',
                        action: () => {
                            gameEngine.requestStopPatrol(entity.id);
                            toastManager.show('Patrol stopped.', 'info');
                        }
                    });
                }

                // If the ship is a scout, add scout actions
                if (entity.type === 'Scout') {
                    // Auto-Explore Option
                    if (!entity.exploreMission) {
                        const hasUnexplored = gameEngine.state.systems.some(s => !s.visibility[profileService.getIdentity().guid] || s.visibility[profileService.getIdentity().guid] === 'unexplored');
                        if (hasUnexplored) {
                            menuItems.push({
                                label: 'Auto-Explore',
                                icon: '🧭',
                                action: () => {
                                    gameEngine.requestExploreMission(entity.id);
                                }
                            });
                        }
                    }

                    const currentSystem = gameEngine.spatialService.getCurrentSystem(entity);

                    if (currentSystem) {
                        // Add Patrol action if in a friendly system
                        if (currentSystem.owner === profileService.getIdentity().guid) {
                            menuItems.push({
                                label: `Patrol ${currentSystem.name}`,
                                icon: '🛡️',
                                action: () => {
                                    gameEngine.requestPatrol(entity.id, currentSystem.id);
                                    toastManager.show(`Patrolling ${currentSystem.name}.`, 'info');
                                }
                            });
                        }

                        const viewingPlayerId = profileService.getIdentity().guid;
                        const neighborsToScout = currentSystem.links
                            .map(link => gameEngine.state.systems.find(s => s.id === link.targetId))
                            .filter(neighbor => {
                                if (!neighbor) return false;
                                return neighbor.owner !== viewingPlayerId;
                            });

                        neighborsToScout.forEach(neighbor => {
                            const visibility = neighbor.visibility[viewingPlayerId];
                            const isUnexplored = !visibility || visibility === 'unexplored';
                            const actionVerb = isUnexplored ? 'Explore' : 'Scout';
                            const actionIcon = isUnexplored ? '🚀' : '🔭';

                            menuItems.push({
                                label: `${actionVerb} ${neighbor.name}`,
                                icon: actionIcon,
                                action: () => {
                                    gameEngine.requestScoutMission(entity.id, neighbor.id);
                                    toastManager.show(`${actionVerb} mission to ${neighbor.name} initiated.`, 'info');
                                }
                            });
                        });
                    }
                }

                // If the ship is a TroopTransport, add Colonize actions
                if (entity.type === 'TroopTransport') {
                    const currentSystem = gameEngine.spatialService.getCurrentSystem(entity);

                    if (currentSystem) {
                        const viewingPlayerId = profileService.getIdentity().guid;
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
                                    icon: '🌱',
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
                            icon: '♻️',
                            action: () => {
                                const targetDebris = nearbyDebris[0]; // Target the first one found
                                gameEngine.requestSalvageMission(entity.id, targetDebris.id);
                                toastManager.show(`Salvage mission to debris field initiated.`, 'info');
                            }
                        });
                    }

                    // Auto-Recycle Option (Find nearest debris in controlled space)
                    menuItems.push({
                        label: 'Auto-Recycle',
                        icon: '🔄',
                        action: () => {
                            gameEngine.requestSalvageMission(entity.id, null);
                            toastManager.show('Auto-Recycle mission initiated.', 'info');
                        }
                    });
                }

                // If the ship is a station, add a "Build" option
                if (entity.isStation) {
                    menuItems.unshift({ // Add to the beginning
                        label: 'Build',
                        icon: '🏗️',
                        action: () => gameEngine.setSelectedLocation(entity.id, true) // Explicitly open panel for build
                    });
                }
            }

            radialMenu.show(menuItems, x, y);
        });

        // Listener for bottom panel actions
        const selectedInfoContainer = document.getElementById('selected-planet-info');
        if (selectedInfoContainer) {
            selectedInfoContainer.addEventListener('click', (e) => {
                const action = e.target.dataset.action || e.target.parentElement?.dataset?.action;
                if (!action) return;

                const shipId = e.target.dataset.shipId;
                const targetId = e.target.dataset.targetId;

                if (action === 'select-ship') {
                    if (shipId) gameEngine.setSelectedShip(shipId, true);
                } else if (action === 'rename-system' || action === 'rename-planet') {
                    const systemId = e.target.dataset.systemId || e.target.parentElement.dataset.systemId;
                    const planetId = e.target.dataset.planetId || e.target.parentElement.dataset.planetId;
                    if (systemId) {
                        const renameModal = document.getElementById('rename-planet-modal');
                        const input = document.getElementById('new-planet-name-input');
                        let currentName = '';
                        if (planetId) {
                            const system = gameEngine.state.systems.find(s => s.id === systemId);
                            const planet = system?.planets.find(p => p.id === planetId);
                            if (planet) currentName = planet.name;
                        } else {
                            const system = gameEngine.state.systems.find(s => s.id === systemId);
                            if (system) currentName = system.name;
                        }
                        
                        if (renameModal && input) {
                            input.value = currentName;
                            renameModal.classList.remove('hidden');
                            const confirmBtn = document.getElementById('btn-confirm-rename');
                            confirmBtn.onclick = () => confirmRename(systemId, planetId);
                        }
                    }
                } else if (action === 'open-radial') {
                    if (shipId) {
                        const ship = gameEngine.state.ships.find(s => s.id === shipId);
                        if (ship) {
                            const rect = gameCanvas.getBoundingClientRect();
                            const screenX = (ship.x * gameEngine.camera.zoom) + gameEngine.camera.pan.x + rect.left;
                            const screenY = (ship.y * gameEngine.camera.zoom) + gameEngine.camera.pan.y + rect.top;
                            
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
                } else if (action === 'explore') {
                    gameEngine.requestExploreMission(shipId);
                    // Toast handled by engine response
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
                    right: 10px;
                    left: auto;
                    z-index: 1000;
                    pointer-events: auto;
                    user-select: none;
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
                    display: flex;
                    align-items: center;
                }
                .connection-status {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    margin-left: 10px;
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .connection-status.connected {
                    background-color: #2ecc71;
                    box-shadow: 0 0 8px #2ecc71;
                }
                .connection-status.disconnected {
                    background-color: #e74c3c;
                }
            `;
            document.head.appendChild(style);
        }

        // After engine starts, we can get the local player and set the faction name
        const localPlayer = gameEngine.getLocalPlayer();
        if (localPlayer) {
            setVal('faction-name-input', localPlayer.factionName);
        }
        uiManager.renderResourceHeader();
        uiManager.updateHeaderUI();
        uiManager.updateColorPickerUI();

        // If the user is the host (default for local play), show host controls.
        if (gameEngine.isHost) {
            const hostViewControls = document.getElementById('host-view-controls');
            if (hostViewControls) {
                hostViewControls.classList.remove('hidden');
                // If there are players in the loaded state, populate the dropdown.
                if (gameEngine.state.players.length > 0) {
                    updateHostViewControls();
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

        const btnOpenShipDesigner = document.getElementById('btn-open-ship-designer');
        if (btnOpenShipDesigner) {
            btnOpenShipDesigner.addEventListener('click', () => shipDesignerModal.show());
        }

        const btnOpenAbout = document.getElementById('about-btn-main');
        if (btnOpenAbout) {
            btnOpenAbout.addEventListener('click', () => showAboutModal());
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
                updateHostViewControls();
                uiManager.updateHeaderUI();
            });
        }

        if (hostFactionSelect) {
            hostFactionSelect.addEventListener('change', (e) => {
                gameEngine.hostView.faction = e.target.value;
                uiManager.updateHeaderUI();
            });
        }

        window.addEventListener('host-view-changed', () => {
            if (hostViewSelect && gameEngine) {
                if (gameEngine.hostView.mode === 'filtered' && !hostViewSelect.querySelector('option[value="filtered"]')) {
                    const option = document.createElement('option');
                    option.value = 'filtered';
                    option.textContent = 'Custom';
                    hostViewSelect.appendChild(option);
                }

                hostViewSelect.value = gameEngine.hostView.mode;
                updateHostViewControls();
                if (hostFactionSelect && gameEngine.hostView.mode !== 'god' && gameEngine.hostView.mode !== 'filtered') {
                    hostFactionSelect.value = gameEngine.hostView.faction;
                }
            }
        });

        // Logging Modal Logic
        const btnOpenLoggingModal = document.getElementById('btn-open-logging-modal');
        if (btnOpenLoggingModal) {
            btnOpenLoggingModal.addEventListener('click', () => {
                closeNav();
                loggingModal.show();
            });
        }
    }

    // Use event delegation for the create game button which is now in a modal
    document.body.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-create-game') {
            const humanPlayers = [];
            const numSystems = parseInt(document.getElementById('galaxy-size').value, 10);
            const numAI = parseInt(document.getElementById('ai-opponents').value, 10);
            const aiPlayers = [];
            for (let i = 0; i < numAI; i++) {
                aiPlayers.push({ id: `AI_${i + 1}`, team: `AI Faction ${i + 1}`, techBase: 'COVENANT', isAI: true });
            }

            const isSpectator = document.getElementById('spectator-mode').checked;
            if (!isSpectator) {
                humanPlayers.push({ ...profileService.getIdentity(), team: profileService.getTeam() });
            }
            if (peerManager.conn && peerManager.conn.open && currentRemoteIdentity) {
                if (currentRemoteIdentity.role !== 'spectator') {
                    humanPlayers.push(currentRemoteIdentity);
                }
            }

            const twoWayDensity = parseInt(document.getElementById('two-way-density').value, 10);
            const oneWayDensity = parseInt(document.getElementById('one-way-density').value, 10);
            
            const resourceRateRaw = parseInt(document.getElementById('resource-rate').value, 10);
            const shipSpeedRateRaw = parseInt(document.getElementById('ship-speed-rate').value, 10);
            const isSymmetric = document.getElementById('symmetric-map').checked;

            // Save configuration for next time
            const setupConfig = {
                numSystems, numAI, twoWayDensity, oneWayDensity,
                resourceRateVal: resourceRateRaw,
                shipSpeedRateVal: shipSpeedRateRaw,
                isSpectator, isSymmetric
            };
            storageService.saveSetupConfig(setupConfig);

            let resourceRateVal = resourceRateRaw;
            if (resourceRateVal === 1000) resourceRateVal = 10000; // Boost max to 10000% for simulation
            const resourceRate = resourceRateVal / 100; // Convert percentage to multiplier
            const shipSpeedRate = shipSpeedRateRaw / 100; // Convert percentage to multiplier

            const newState = await gameEngine.createNewGame({ numSystems, aiPlayers, humanPlayers, twoWayDensity, oneWayDensity, resourceRate, shipSpeedRate, isSpectator, isSymmetric });
            peerManager.send({ type: 'GAME_SET_STATE', state: newState });
            updateHeaderControls();
            toastManager.show('New game created and sent to peers!', 'success');

            const hostViewControls = document.getElementById('host-view-controls');
            if (hostViewControls) {
                hostViewControls.classList.remove('hidden');
                
                // Sync UI with engine state (e.g. Spectator sets mode to 'god')
                const hostViewSelect = document.getElementById('host-view-select');
                if (hostViewSelect) {
                    hostViewSelect.value = gameEngine.hostView.mode;
                }

                updateHostViewControls();
            }

            // Close the modal
            const modal = document.getElementById('game-setup-modal');
            if (modal) modal.classList.add('hidden');
        } else if (e.target.id === 'btn-reset-game') {
            if (confirm('Are you sure you want to reset the game? This will permanently delete your saved game state.')) {
                gameEngine.resetGame();
                updateHeaderControls();
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