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
import { initTacticalCombat } from './modals/TacticalCombat.js';
import { CombatLogModal } from './modals/CombatLogModal.js';
import { appState, updateState, logger } from './state.js';
import { StellarNavigator } from './ui/StellarNavigator.js';
import { FriendsRadar } from './ui/FriendsRadar.js';

let gameEngine = null;
const storageService = new StorageService();
let uiManager = new UIManager(null, storageService); // Initialize early for theme
const profileService = new ProfileService(storageService);
const loggingService = new LoggingService(storageService);

// Initialize Theme on script load to prevent flash of wrong theme
const savedTheme = appState.theme;
uiManager.setTheme(savedTheme);

const peerManager = new PeerManager(profileService, loggingService);
let currentRemoteName = 'Peer';
let currentRemoteIdentity = null;

// iOS Detection
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// --- Social Initialization ---
const toastManager = new ToastManager();
const friendsRadar = new FriendsRadar(peerManager, toastManager, (code) => {
    // Quick join from Radar
    peerManager.join(code).then(() => {
        switchScreen('game');
    }).catch(err => {
        toastManager.show(`Join failed: ${err.message}`, 'error');
    });
});
window.friendsRadar = friendsRadar;
window.toastManager = toastManager;
window.uiManager = uiManager; // Make globally accessible for simple event handlers

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

let chatManager = null;

let techTreeModal = null;
let fleetManagerModal = null;
let loggingModal = null;
let gameStatusModal = null;
let shipDesignerModal = null;
let combatLogModal = null;
const radialMenu = new RadialMenu();

let colorPicker = null;

// --- Phase 1: Recovery & Vetting ---

function saveRecoveryState() {
    if (!appState.gameActive || !gameEngine) return;
    
    const recoveryData = {
        timestamp: Date.now(),
        isSolo: appState.isSolo,
        isHost: gameEngine.isHost,
        peerId: appState.peerId,
        playerName: appState.playerName,
        techBase: appState.techBase,
        gameState: gameEngine.getState()
    };
    
    storageService.saveRecoveryState(recoveryData);
}

// Start auto-save loop
setInterval(() => {
    if (appState.gameActive) saveRecoveryState();
}, 30000);

/**
 * Show a vetting prompt for the host to approve/deny incoming players.
 */
function showVettingModal(requestData, conn) {
    if (!document.getElementById('vetting-modal')) {
        const modalHtml = `
        <div id="vetting-modal" class="modal">
            <div class="modal-content glass" style="max-width: 400px; text-align: center;">
                <h2 class="orbitron" style="color: var(--primary-color);">Personnel Clearance</h2>
                <p style="font-size: 0.9rem; margin-bottom: 1rem;">Incoming transmission from potential fleet commander.</p>
                <div id="vetting-info" style="margin: 1.5rem 0; padding: 1rem; background: rgba(0,242,255,0.05); border: 1px solid rgba(0,242,255,0.2); border-radius: 8px;">
                    <!-- Filled dynamically -->
                </div>
                <div style="display: flex; gap: 15px;">
                    <button id="btn-vetting-deny" class="secondary-btn" style="flex: 1;">DENY</button>
                    <button id="btn-vetting-approve" class="primary-btn" style="flex: 1;">APPROVE</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const modal = document.getElementById('vetting-modal');
    const info = document.getElementById('vetting-info');
    const btnApprove = document.getElementById('btn-vetting-approve');
    const btnDeny = document.getElementById('btn-vetting-deny');

    const factionText = requestData.factionId === 'new' ? 'Start a New Faction' : `Join Faction: <strong>${requestData.factionName || 'Unassigned'}</strong>`;
    
    info.innerHTML = `
        <div style="font-size: 1.1rem; font-weight: bold; color: #fff; margin-bottom: 5px;">${requestData.name}</div>
        <div style="font-size: 0.8rem; opacity: 0.8; margin-bottom: 10px;">Enlistment Request:</div>
        <div style="font-size: 0.9rem; color: var(--primary-color);">${factionText}</div>
    `;

    modal.classList.add('show');

    const cleanup = () => {
        modal.classList.remove('show');
        btnApprove.onclick = null;
        btnDeny.onclick = null;
    };

    btnApprove.onclick = () => {
        conn.send({ type: 'FACTION_APPROVED' });
        if (gameEngine && gameEngine.isHost) {
            // If they chose an existing faction, add them to it
            // If they chose 'new', the engine handles it during addPlayer
            gameEngine.addPlayer(requestData.guid, requestData.name, requestData.role, requestData.color, requestData.factionName);
        }
        cleanup();
    };

    btnDeny.onclick = () => {
        conn.send({ type: 'join-denied', reason: 'Access denied by Commander.' });
        toastManager.show(`Denied entry to ${requestData.name}.`, 'info');
        modal.classList.add('hidden');
        conn.close();
    };
}

// --- UI Helpers ---
function show(id) { 
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden'); 
}
function hide(id) { 
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden'); 
}
function getVal(id) { return document.getElementById(id)?.value; }
function setVal(id, val) { 
    const el = document.getElementById(id);
    if (el) el.value = val; 
}

/**
 * Switch between main application screens
 * @param {'lobby' | 'game'} screenId 
 */
function switchScreen(screenId) {
    // logger.log(`Switching to screen: ${screenId}`);
    updateState({ currentView: screenId });
    
    if (screenId === 'lobby') {
        show('lobby-screen');
        hide('game-view');
        hide('game-header');
        if (gameEngine) gameEngine.stop();
    } else {
        hide('lobby-screen');
        show('game-view');
        show('game-header');
        if (gameEngine) {
            gameEngine.start();
            if (appState.isHost) {
                const hostViewControls = document.getElementById('host-view-controls');
                if (hostViewControls) hostViewControls.classList.remove('hidden');
                
                const btnTransfer = document.getElementById('btn-transfer-host');
                if (btnTransfer) btnTransfer.classList.remove('hidden');

                // Sync UI with engine BEFORE updating controls to avoid overwriting engine state
                const hostViewSelect = document.getElementById('host-view-select');
                if (hostViewSelect && gameEngine.hostView && gameEngine.hostView.mode) {
                    if (hostViewSelect.value !== gameEngine.hostView.mode) {
                        hostViewSelect.value = gameEngine.hostView.mode;
                    }
                }
                updateHostViewControls();
            }
        }
    }
}

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
    loggingService.log(LOG_CATEGORIES.PEER, LOG_LEVELS.DEBUG, "[App] Peer Message Received:", data);
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
        currentRemoteIdentity = { 
            guid: data.guid, 
            name: data.name, 
            team: data.team, 
            role: data.role,
            factionName: data.factionName,
            color: data.color
        };
        profileService.savePeer(data.guid, data.name, data.team);
        // If we are the host and a game is running, try to add the player
        if (gameEngine && gameEngine.isHost) {
            gameEngine.addPlayer(data.guid, data.name, data.role, data.color, data.factionName);
        }
    } else if (data.type.startsWith('GAME_') || data.type === 'combat-start') {
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
            if (localPlayer) {
                setVal('faction-name-input-sidenav', localPlayer.factionName);
            }
            uiManager.updateColorPickerUI();
            updateHeaderControls();
            window.dispatchEvent(new Event('game-started'));
        }
    } else if (data.type === 'GAME_REQUEST_PLAYER_UPDATE') {
        if (gameEngine) gameEngine.processPlayerUpdate(data.senderId, data.update);
    } else if (data.type === 'GAME_SET_PAUSE') {
        if (gameEngine) {
            gameEngine.setPaused(data.paused);
            updateHeaderControls();
        }
    } else if (data.type === 'GAME_HOST_MIGRATED') {
        loggingService.log(LOG_CATEGORIES.PEER, LOG_LEVELS.INFO, `Host migrated to ${data.newHostId}. Reconnecting...`);
        toastManager.show(`Command transferred to ${data.newHostName}. Re-establishing link...`, 'info');
        // Disconnect from old host and connect to new host's presence ID
        peerManager.cleanup();
        setTimeout(() => {
            peerManager.join(data.newHostId, appState.isSpectator ? 'spectator' : 'player');
        }, 2000);
    } else if (data.type === 'GAME_STATE_FULL') {
        loggingService.log(LOG_CATEGORIES.PEER, LOG_LEVELS.INFO, "Received full state transfer from previous host.");
        if (gameEngine) {
            gameEngine.restoreState(data.state);
            appState.isHost = true;
            appState.isSolo = false;
            peerManager.promoteToHost((conn) => {
                loggingService.log(LOG_CATEGORIES.PEER, LOG_LEVELS.INFO, `New peer linked: ${conn.peer}`);
            });
            toastManager.show("You are now the Fleet Commander. authoritative link established.", 'success');
            updateHeaderControls();
        }

    } else if (data.type === 'GAME_PLAYER_UPDATE') {
        if (gameEngine) {
            gameEngine.handlePeerMessage(data); // Let engine update state
            const localId = profileService.getIdentity().guid;
            if (data.playerId === localId) {
                const updates = {};
                if (data.update.color) updates.factionColor = data.update.color;
                if (data.update.factionName) updates.factionName = data.update.factionName;
                if (Object.keys(updates).length > 0) updateState(updates);
                
                // Sync local inputs
                if (data.update.factionName) setVal('faction-name-input-sidenav', data.update.factionName);
            }
            uiManager.updateColorPickerUI(); // Refresh color picker availability
            uiManager.updateHeaderUI();
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
            if (status !== 'connected' && appState.gameActive && !appState.isHost) {
                handleHostDisconnect();
            }
        }
    }
});

/**
 * HOST MIGRATION: Handles the re-establishment of command if the host drops.
 */
async function handleHostDisconnect() {
    if (!appState.gameActive || appState.isHost) return;
    
    toastManager.show("Command Signal Lost. Analyzing fleet signatures...", 'warning', 5000);
    logger.log("[Migration] Host disconnected. Starting election...");

    // 1. Get all players and find the next candidate
    const players = gameEngine ? gameEngine.state.players : [];
    const aliveHumans = players.filter(p => !p.isAI && !p.isDead).sort((a, b) => a.id.localeCompare(b.id));
    
    if (aliveHumans.length <= 1) {
        toastManager.show("All other commanders lost. Mission terminated.", 'error');
        return;
    }

    const myId = profileService.getIdentity().guid;
    const isCandidate = aliveHumans[0].id === myId;

    if (isCandidate) {
        toastManager.show("You are the senior officer. Seizing Command...", 'info');
        
        // Try to take over the old ID (it might be taken for a few seconds)
        const originalId = appState.peerId;
        
        setTimeout(async () => {
            try {
                const newId = await peerManager.host(originalId);
                updateState({ isHost: true, isSolo: false, peerId: newId });
                gameEngine.isHost = true;
                
                toastManager.show("Command re-established. Syncing fleet data.", 'success');
                // Recovery state was saved locally by the interval loop
                const recovery = storageService.getRecoveryState();
                if (recovery) {
                    gameEngine.setState(recovery.gameState);
                }
                
                // Broadcast new state to anyone who connects
                peerManager.onJoinRequest(showVettingModal);
                
            } catch (err) {
                console.error("[Migration] Failed to seize command:", err);
                toastManager.show("Failed to re-establish command. Fleet scattered.", 'error');
            }
        }, 3000); // Wait for PeerJS to clear old ID
    } else {
        toastManager.show(`Establishing link to new Commander: ${aliveHumans[0].factionName}...`, 'info');
        
        // Keep trying to reconnect to the original ID
        let retries = 0;
        const retryInterval = setInterval(async () => {
            retries++;
            if (retries > 10) {
                clearInterval(retryInterval);
                toastManager.show("Unable to link with fleet. Mission failed.", 'error');
                return;
            }
            
            try {
                const role = appState.isSpectator ? 'spectator' : 'player';
                await peerManager.join(appState.peerId, role);
                clearInterval(retryInterval);
                toastManager.show("Link established. Commander identified.", 'success');
            } catch (e) {
                // Keep trying
            }
        }, 5000);
    }
}

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
    
    // Initialize DOM references in appState
    appState.dom = {
        lobbyScreen: document.getElementById('lobby-screen'),
        gameView: document.getElementById('game-view'),
        gameHeader: document.getElementById('game-header'),
        hamburgerBtn: document.getElementById('hamburger-btn'),
        closeSidenavBtn: document.getElementById('close-sidenav-btn'),
        sidenav: document.getElementById('sidenav'),
        overlay: document.getElementById('overlay')
    };

    const { hamburgerBtn, closeSidenavBtn, sidenav, overlay } = appState.dom;

    const lobbyHamburgerBtn = document.getElementById('lobby-hamburger-btn');

    const openNav = () => { 
        if(sidenav) sidenav.style.width = "280px"; 
        if(overlay) overlay.style.display = "block"; 
        uiManager.renderSidenavFriends();
    };
    const closeNav = () => { 
        if(sidenav) sidenav.style.width = "0"; 
        if(overlay) overlay.style.display = "none"; 
    };

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openNav);
    if (lobbyHamburgerBtn) lobbyHamburgerBtn.addEventListener('click', openNav);
    if (closeSidenavBtn) closeSidenavBtn.addEventListener('click', closeNav);
    if (overlay) overlay.addEventListener('click', closeNav);

    // Radar Button
    const btnOpenRadar = document.getElementById('btn-open-radar');
    if (btnOpenRadar) btnOpenRadar.onclick = () => friendsRadar.show();

    // Design Lab
    const designLabBtn = document.getElementById('design-lab-btn');
    if (designLabBtn) {
        designLabBtn.onclick = () => {
            closeNav();
            if (!window.assetViewer) {
                import('./ui/AssetViewer.js').then(module => {
                    window.assetViewer = new module.AssetViewer(gameEngine, gameEngine.spriteService);
                    window.assetViewer.show();
                });
            } else {
                window.assetViewer.show();
            }
        };
    }

    // Initialize 3D Lobby
    initLobby();

    // Register Join Vetting
    peerManager.onJoinRequest(showVettingModal);

    // Lobby & Faction Message Handlers
    peerManager.onMessage((data, conn) => {
        if (data.type === 'LOBBY_REQUEST_FACTIONS') {
            if (gameEngine && gameEngine.isHost) {
                const factions = gameEngine.state.players.reduce((acc, p) => {
                    if (!acc.find(f => f.team === p.team)) {
                        acc.push({ team: p.team, factionName: p.factionName, color: p.color });
                    }
                    return acc;
                }, []);
                conn.send({ type: 'LOBBY_FACTION_LIST', factions });
            }
        } else if (data.type === 'LOBBY_FACTION_LIST') {
            renderLobbyFactionList(data.factions);
        } else if (data.type === 'FACTION_JOIN_REQUEST') {
            if (gameEngine && gameEngine.isHost) {
                showVettingModal(data, conn);
            }
        } else if (data.type === 'FACTION_APPROVED') {
            toastManager.show("Enlistment approved! Synchronizing sectors...", "success");
            lobbyNavigator.next(); // Go to Engage slide
        }
    });

    const renderLobbyFactionList = (factions) => {
        const list = document.getElementById('lobby-faction-list');
        if (!list) return;
        list.innerHTML = '';
        
        factions.forEach(f => {
            const btn = document.createElement('button');
            btn.className = 'faction-card glass';
            btn.id = `btn-join-faction-${f.team}`;
            btn.dataset.name = f.factionName;
            btn.style.borderLeft = `4px solid ${f.color}`;
            btn.innerHTML = `
                <div style="font-weight: bold; color: ${f.color};">${f.factionName}</div>
                <div style="font-size: 0.7rem; opacity: 0.7;">Active Command</div>
            `;
            list.appendChild(btn);
        });
    };

    // Initialize Presence
    peerManager.setupPresence(appState.playerId, () => {
        // Status Request handler
        return {
            playerName: appState.commanderName,
            factionName: appState.factionName,
            isHost: peerManager.peer?.id === peerManager.peerPrefix + (appState.peerId || ''),
            roomCode: appState.peerId,
            gameActive: appState.gameActive,
            view: appState.currentView
        };
    }, (inviteData) => {
        // Invite Received handler
        toastManager.show(`${inviteData.senderName} invited you to a mission!`, 'info', 8000);
        logger.log("Received Invite:", inviteData);
    });

    // Inject dynamic styles for UI behavior
    const uiStyle = document.createElement('style');
    uiStyle.textContent = `
        body.fullscreen-mode #ship-designer-btn-main,
        body.fullscreen-mode #btn-open-ship-designer { display: none !important; }
        body.fullscreen-mode #about-btn-main { display: none !important; }
        #hamburger-btn {
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 2000;
            display: none;
        }
        body.fullscreen-mode #hamburger-btn {
            display: block;
        }
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

    // Show Lobby by default
    switchScreen('lobby');

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

    const settingsNameInput = document.getElementById('settings-name');
    const sidenavFactionNameInput = document.getElementById('faction-name-input-sidenav');
    
    if (settingsNameInput) {
        settingsNameInput.value = profileService.getIdentity().name;
        settingsNameInput.addEventListener('change', (e) => {
            const newName = e.target.value;
            profileService.saveIdentity(newName);
            if (gameEngine) gameEngine.requestPlayerUpdate({ name: newName });
        });
    }

    if (sidenavFactionNameInput) {
        sidenavFactionNameInput.value = profileService.getIdentity().factionName;
        sidenavFactionNameInput.addEventListener('change', (e) => {
            const newFactionName = e.target.value;
            updateState({ factionName: newFactionName });
            if (gameEngine) gameEngine.requestPlayerUpdate({ factionName: newFactionName });
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
        hideHeaderHandle.style.display = 'none';
        showHeaderHandle.addEventListener('click', () => {
            document.body.classList.remove('fullscreen-mode');
        });
    }


    const gameCanvas = document.getElementById('game-canvas');

    // Auto-hide header on canvas interaction
    if (gameCanvas) {
        gameCanvas.addEventListener('mousedown', () => {
            document.body.classList.add('fullscreen-mode');
        });
    }

    // Initialize Game Engine on load since it's the main view
    if (!gameEngine && gameCanvas) {
        loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, "Initializing GameEngine...");
        gameEngine = new GameEngine(gameCanvas, peerManager, profileService, loggingService, storageService);
        uiManager.gameEngine = gameEngine; // Link engine to UI manager
        initTacticalCombat(gameEngine); // Initialize Tactical Combat with engine
        uiManager.colorPicker = document.getElementById('faction-color-picker'); // Re-bind element
        techTreeModal = new TechTreeModal(gameEngine, () => profileService.getTeam());
        fleetManagerModal = new FleetManagerModal(gameEngine);
        loggingModal = new LoggingModal(gameEngine);
        gameStatusModal = new GameStatusModal(gameEngine);
        shipDesignerModal = new ShipDesignerModal(gameEngine);
        combatLogModal = new CombatLogModal();
        
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

        // Inject Combat Controls (Log & Watch Toggle)
        const hostControls = document.getElementById('host-view-controls');
        if (hostControls) {
            const combatControls = document.createElement('div');
            combatControls.style.display = 'flex';
            combatControls.style.gap = '10px';
            combatControls.style.alignItems = 'center';
            combatControls.style.marginTop = '5px';
            
            const btnLog = document.createElement('button');
            btnLog.textContent = 'Combat Log';
            btnLog.className = 'theme-button small';
            btnLog.onclick = () => {
                if (gameEngine && gameEngine.state.combatLogHistory) {
                    combatLogModal.show(gameEngine.state.combatLogHistory, gameEngine.state.systems);
                } else {
                    toastManager.show('No combat history available.', 'info');
                }
            };

            const lblWatch = document.createElement('label');
            lblWatch.style.display = 'flex';
            lblWatch.style.alignItems = 'center';
            lblWatch.style.gap = '5px';
            lblWatch.style.fontSize = '0.9em';
            lblWatch.innerHTML = `<input type="checkbox" id="chk-watch-battles"> Watch Battles`;
            
            combatControls.appendChild(btnLog);
            combatControls.appendChild(lblWatch);
            hostControls.appendChild(combatControls);

            document.getElementById('chk-watch-battles').addEventListener('change', (e) => {
                if (gameEngine) gameEngine.watchBattles = e.target.checked;
            });
        }

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
                } else if (action === 'upgrade-citadel') {
                    const planetId = e.target.dataset.planetId;
                    if (planetId) gameEngine.economyService.requestUpgradeCitadel(planetId);
                } else if (action === 'deploy-mine') {
                    if (shipId) gameEngine.economyService.requestDeployMine(shipId);
                } else if (action === 'genesis-torpedo') {
                    if (shipId) gameEngine.economyService.requestGenesisTorpedo(shipId);
                } else if (action === 'toggle-cloak') {
                    if (shipId) gameEngine.economyService.requestToggleCloak(shipId);
                } else if (action === 'hide-panel') {
                    gameEngine.closeSelectionPanel();
                }
            });
        }

        // Faction Color Picker
        colorPicker = document.getElementById('faction-color-picker');
        if (colorPicker) {
            // CSS consolidated in styles.css
        }

        // After engine starts, we can get the local player and set the faction name
        const localPlayer = gameEngine.getLocalPlayer();
        if (localPlayer) {
            setVal('faction-name-input-sidenav', localPlayer.factionName);
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
        const hazardSlider = document.getElementById('hazard-density');
        const hazardValue = document.getElementById('hazard-density-value');

        if (twoWaySlider) {
            twoWaySlider.addEventListener('input', () => twoWayValue.textContent = `${twoWaySlider.value}%`);
        }
        if (oneWaySlider) {
            oneWaySlider.addEventListener('input', () => oneWayValue.textContent = `${oneWaySlider.value}%`);
        }
        if (hazardSlider) {
            hazardSlider.addEventListener('input', () => hazardValue.textContent = `${hazardSlider.value}%`);
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
        // Logging Modal Logic
        const btnOpenLoggingModal = document.getElementById('btn-open-logging-modal');
        if (btnOpenLoggingModal) {
            btnOpenLoggingModal.addEventListener('click', () => {
                closeNav();
                loggingModal.show();
            });
        }

        const btnTransferHost = document.getElementById('btn-transfer-host');
        if (btnTransferHost) {
            btnTransferHost.addEventListener('click', () => {
                if (!gameEngine.isHost) return;
                const players = gameEngine.state.players.filter(p => !p.isAI && p.id !== appState.playerId);
                if (players.length === 0) {
                    toastManager.show("No other human commanders available for transfer.", "warning");
                    return;
                }
                
                const names = players.map(p => p.name).join(', ');
                const targetName = prompt(`Transfer command to whom? (${names})`);
                const target = players.find(p => p.name === targetName);
                
                if (target) {
                    if (confirm(`Are you sure you want to transfer Fleet Command to ${target.name}?`)) {
                        gameEngine.requestHostTransfer(target.id);
                        closeNav();
                    }
                } else if (targetName !== null) {
                    toastManager.show("Invalid commander name.", "error");
                }
            });
        }

        window.addEventListener('host-transfer-initiated', (e) => {
            const { targetPeerId } = e.detail;
            const target = gameEngine.state.players.find(p => p.id === targetPeerId);
            
            // 1. Pause game
            peerManager.broadcast({ type: 'GAME_SET_PAUSE', paused: true });
            
            // 2. Send full state to target
            peerManager.sendToPeer(targetPeerId, { 
                type: 'GAME_STATE_FULL', 
                state: gameEngine.getState() 
            });
            
            // 3. Tell everyone else about the move
            peerManager.relay({ 
                type: 'GAME_HOST_MIGRATED', 
                newHostId: targetPeerId,
                newHostName: target.name
            }, targetPeerId);
            
            // 4. Become a joiner to the new host
            appState.isHost = false;
            toastManager.show(`Relinquishing command to ${target.name}...`, 'info');
            setTimeout(() => {
                peerManager.cleanup();
                peerManager.join(targetPeerId, 'player');
            }, 3000);
        });
    }

    // Use event delegation for the create game button which is now in a modal
    document.body.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-create-game') {
            const humanPlayers = [];
            const numSystems = parseInt(document.getElementById('galaxy-size').value, 10);
            const numAI = parseInt(document.getElementById('ai-opponents').value, 10);
            const aiPlayers = [];
            for (let i = 0; i < numAI; i++) {
                aiPlayers.push({ id: `AI_${i + 1}`, team: `AI Faction ${i + 1}`, techBase: 'Syndicate', isAI: true });
            }

            const isSpectator = document.getElementById('spectator-mode').checked;
            if (!isSpectator) {
                humanPlayers.push(profileService.getIdentity());
            }
            if (peerManager.conn && peerManager.conn.open && currentRemoteIdentity) {
                if (currentRemoteIdentity.role !== 'spectator') {
                    humanPlayers.push(currentRemoteIdentity);
                }
            }

            const twoWayDensity = parseInt(document.getElementById('two-way-density').value, 10);
            const oneWayDensity = parseInt(document.getElementById('one-way-density').value, 10);
            
            const hazardDensity = document.getElementById('hazard-density') ? parseInt(document.getElementById('hazard-density').value, 10) : 33;

            const resourceRateRaw = parseInt(document.getElementById('resource-rate').value, 10);
            const shipSpeedRateRaw = parseInt(document.getElementById('ship-speed-rate').value, 10);
            const isSymmetric = document.getElementById('symmetric-map').checked;

            // Save configuration for next time
            const setupConfig = {
                numSystems, numAI, twoWayDensity, oneWayDensity, hazardDensity,
                resourceRateVal: resourceRateRaw,
                shipSpeedRateVal: shipSpeedRateRaw,
                isSpectator, isSymmetric
            };
            storageService.saveSetupConfig(setupConfig);

            let resourceRateVal = resourceRateRaw;
            if (resourceRateVal === 1000) resourceRateVal = 10000; // Boost max to 10000% for simulation
            const resourceRate = resourceRateVal / 100; // Convert percentage to multiplier
            const shipSpeedRate = shipSpeedRateRaw / 100; // Convert percentage to multiplier

            const newState = await gameEngine.createNewGame({ numSystems, aiPlayers, humanPlayers, twoWayDensity, oneWayDensity, resourceRate, shipSpeedRate, isSpectator, isSymmetric, hazardDensity });
            peerManager.send({ type: 'GAME_SET_STATE', state: newState });
            updateHeaderControls();
            toastManager.show('New game created and sent to peers!', 'success');
            window.dispatchEvent(new Event('game-started'));


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
            fleetManagerModal.show();
        }
    });
});

/**
 * Initialize the 3D Lobby Carousel - 4-Stage Wizard Pattern
 */
function initLobby() {
    const carouselEl = document.getElementById('main-lobby-carousel');
    const dotNav = document.getElementById('lobby-dot-nav');
    const controls = {
        prev: document.getElementById('lobby-prev-btn'),
        next: document.getElementById('lobby-next-btn')
    };

    if (!carouselEl) return;

    // --- 1. Prepare Slides & Recovery ---
    const lobbySlides = [
        {
            html: `
                <div class="stellar-slide-icon">👑</div>
                <div class="stellar-slide-title">Commander Identity</div>
                <div class="input-group" style="width: 100%; margin-top: 1rem;">
                    <label>Commander Name</label>
                    <input type="text" id="lobby-commander-name" class="highlight-input" placeholder="Enter your title..." value="${appState.commanderName}">
                </div>
                <div class="input-group" style="width: 100%; margin-top: 1rem;">
                    <label>Strategic Background (Tech Base)</label>
                    <select id="lobby-tech-base" class="highlight-input" style="width: 100%;">
                        <option value="Solaris" ${appState.techBase === 'Solaris' ? 'selected' : ''}>Solaris Alliance (Terran)</option>
                        <option value="Syndicate" ${appState.techBase === 'Syndicate' ? 'selected' : ''}>Void Syndicate (Remnant)</option>
                    </select>
                </div>
                <button class="primary-btn" style="margin-top: 1.5rem; width: 100%;" id="btn-confirm-identity">Establish Command</button>
            `
        },
        // STAGE 2: CHOOSE MODE
        {
            html: `
                <div class="stellar-slide-icon">🛰️</div>
                <div class="stellar-slide-title">Mission Mode</div>
                <div class="role-selection">
                    <button id="btn-role-solo" class="role-btn">
                        Solo Campaign
                        <span>Standalone tactical simulation</span>
                    </button>
                    <button id="btn-role-host" class="role-btn">
                        Host Multiplayer
                        <span>Command a joint-operation fleet</span>
                    </button>
                    <button id="btn-role-join" class="role-btn">
                        Join Mission
                        <span>Augment an existing task force</span>
                    </button>
                    <button id="btn-role-spectator" class="role-btn">
                        Join as Spectator
                        <span>Observe tactical operations</span>
                    </button>
                </div>
            `
        },
        // STAGE 3: GALAXY CONFIGURATION (Solo/Host Only)
        {
            html: `
                <div id="panel-galaxy-config" class="role-panel">
                    <div class="stellar-slide-icon">⚙️</div>
                    <div class="stellar-slide-title">Galaxy Configuration</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: left; font-size: 0.8rem;">
                        <div class="input-group">
                            <label>Systems</label>
                            <input type="number" id="lobby-galaxy-size" class="highlight-input" value="45" min="5" max="200">
                        </div>
                        <div class="input-group">
                            <label>AI Opponents</label>
                            <input type="number" id="lobby-ai-count" class="highlight-input" value="7" min="0" max="7">
                        </div>
                        <div class="input-group">
                            <label>Resource Rate</label>
                            <select id="lobby-resource-rate" class="highlight-input">
                                <option value="50">50%</option>
                                <option value="100" selected>100%</option>
                                <option value="200">200%</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label>Ship Speed</label>
                            <select id="lobby-ship-speed" class="highlight-input">
                                <option value="50">50%</option>
                                <option value="100" selected>100%</option>
                                <option value="200">200%</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 0.7rem;">
                        <label><input type="checkbox" id="lobby-symmetric" checked> Symmetric Sector</label>
                        <label><input type="checkbox" id="lobby-spectator"> Host as Observer</label>
                    </div>
                    <button class="primary-btn" id="btn-advance-setup" style="margin-top: 15px; width: 100%;">Configure Faction</button>
                </div>
            `
        },
        // STAGE 4: FACTION / FLEET ASSIGNMENT
        {
            html: `
                <div id="panel-solo-host-faction" class="role-panel">
                    <div class="stellar-slide-icon faction-flag-preview" id="lobby-faction-flag">
                        <svg width="80" height="80" viewBox="0 0 24 24" style="filter: drop-shadow(0 0 15px rgba(0,0,0,0.6));">
                            <defs>
                                <linearGradient id="flagPoleGrad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stop-color="#444" />
                                    <stop offset="40%" stop-color="#CCC" />
                                    <stop offset="100%" stop-color="#222" />
                                </linearGradient>
                                <radialGradient id="flagFinialGrad" cx="0.4" cy="0.4" r="0.6">
                                    <stop offset="0%" stop-color="#FFF" />
                                    <stop offset="40%" stop-color="#FFD700" />
                                    <stop offset="100%" stop-color="#B8860B" />
                                </radialGradient>
                                <linearGradient id="flagFoldGrad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stop-color="rgba(0,0,0,0.3)" />
                                    <stop offset="30%" stop-color="rgba(255,255,255,0.2)" />
                                    <stop offset="60%" stop-color="rgba(0,0,0,0.2)" />
                                    <stop offset="100%" stop-color="rgba(255,255,255,0.1)" />
                                </linearGradient>
                            </defs>
                            <!-- Pole -->
                            <rect x="4" y="1" width="2" height="21" fill="url(#flagPoleGrad)" rx="0.5" />
                            <!-- Finial -->
                            <circle cx="5" cy="1" r="1.8" fill="url(#flagFinialGrad)" />
                            <!-- Cloth -->
                            <g>
                                <path d="M 6 2 C 10 0 15 4 20 2 L 20 11 C 15 13 10 9 6 11 Z" fill="var(--faction-color, #FFF)" />
                                <path d="M 6 2 C 10 0 15 4 20 2 L 20 11 C 15 13 10 9 6 11 Z" fill="url(#flagFoldGrad)" />
                                <!-- Central Emblem -->
                                <circle cx="13" cy="6.5" r="3" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5" />
                                <circle cx="13" cy="6.5" r="2.2" fill="rgba(0,0,0,0.1)" />
                            </g>
                        </svg>
                    </div>
                    <div class="stellar-slide-title">Faction Identity</div>
                    <div class="input-group">
                        <label>Faction Name</label>
                        <input type="text" id="lobby-faction-name" class="highlight-input" placeholder="Enter faction name..." value="${appState.factionName}">
                    </div>
                    <div class="input-group" style="margin-top: 10px;">
                        <label>Faction Color</label>
                        <div id="lobby-color-picker" class="color-picker-grid">
                            <!-- Populated by JS -->
                        </div>
                    </div>
                    <button class="primary-btn" id="btn-finalize-faction" style="margin-top: 15px; width: 100%;">Finalize Enlistment</button>
                </div>

                <div id="panel-join" class="role-panel">
                    <div class="stellar-slide-icon">📡</div>
                    <div class="stellar-slide-title">Fleet Assignment</div>
                    <div id="join-connection-panel">
                        <div class="input-group">
                            <label>Host Peer ID</label>
                            <input type="text" id="lobby-join-id" class="highlight-input" placeholder="e.g. 123456">
                        </div>
                        <button class="primary-btn" id="btn-lobby-connect">Connect to Fleet</button>
                    </div>
                    <div id="join-faction-panel" class="hidden">
                        <label style="font-size: 0.8rem; margin-bottom: 5px; display: block;">Select Faction to Join</label>
                        <div id="lobby-faction-list" style="max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 4px; margin-bottom: 10px;">
                            <!-- Populated after connection -->
                        </div>
                        <button class="secondary-btn" id="btn-create-new-faction" style="width: 100%; font-size: 0.8rem;">Enlist in New Faction</button>
                    </div>
                </div>
            `
        },
        // STAGE 4: READINESS
        {
            html: `
                <div class="stellar-slide-icon">🚀</div>
                <div class="stellar-slide-title">Fleet Readiness</div>
                <div id="lobby-summary" style="margin: 1.5rem 0; font-size: 0.9rem; text-align: left; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
                    <!-- Populated by JS -->
                </div>
                <button id="btn-engage-mission" class="primary-btn" style="width: 100%; padding: 1.5rem; font-size: 1.2rem;">ENGAGE MISSION</button>
            `
        }
    ];

    const recovery = storageService.getRecoveryState();
    if (recovery) {
        lobbySlides.unshift({
            html: `
                <div class="stellar-slide-icon">📡</div>
                <div class="stellar-slide-title" style="color: #00ff88; text-shadow: 0 0 10px #00ff88;">Resume Mission</div>
                <div style="font-size: 0.8rem; margin: 1rem 0; text-align: left; background: rgba(0,255,136,0.05); padding: 0.8rem; border-radius: 8px; border: 1px solid rgba(0,255,136,0.2);">
                    A saved session from ${new Date(recovery.timestamp).toLocaleTimeString()} was detected.
                </div>
                <button id="btn-resume-mission" class="primary-btn" style="background: #00ff88; color: #000; width: 100%;">RESTORE SECTOR</button>
                <button id="btn-clear-recovery" class="secondary-btn" style="margin-top: 0.5rem; width: 100%; font-size: 0.7rem;">DISCARD SESSION</button>
            `
        });
    }

    // --- 2. Initialize Navigator ---
    const lobbyNavigator = new StellarNavigator(lobbySlides, carouselEl, dotNav, controls, {
        radius: window.innerWidth < 600 ? 250 : 350,
        circular: false,
        onChange: (idx) => {
            // Summary slide is always the last one
            if (idx === lobbySlides.length - 1) updateLobbySummary();
        }
    });
    appState.lobbyNavigator = lobbyNavigator;

    window.addEventListener('resize', () => {
        lobbyNavigator.recalculate({ radius: window.innerWidth < 600 ? 250 : 350 });
    });

    // --- 3. Event Delegation for Lobby Slides ---
    carouselEl.addEventListener('input', (e) => {
        if (e.target.id === 'lobby-commander-name') {
            const val = e.target.value;
            updateState({ commanderName: val });
            const settingsName = document.getElementById('settings-name');
            if (settingsName) settingsName.value = val;
        }
        if (e.target.id === 'lobby-faction-name') {
            updateState({ factionName: e.target.value });
        }
    });

    carouselEl.addEventListener('change', (e) => {
        if (e.target.id === 'lobby-tech-base') {
            const val = e.target.value;
            updateState({ techBase: val });
            const settingsTech = document.getElementById('team-select');
            if (settingsTech) settingsTech.value = val;
            uiManager.setTheme(val === 'Syndicate' ? 'syndicate' : 'dark');
        }
    });

    carouselEl.addEventListener('click', async (e) => {
        const target = e.target.closest('button, .role-btn');
        if (!target) return;

        const id = target.id;

        // Stage 1
        if (id === 'btn-confirm-identity') {
            lobbyNavigator.next();
        }

        // Stage 2: Mode Selection
        if (id.startsWith('btn-role-')) {
            const role = id.replace('btn-role-', '');
            setLobbyRole(role);
        }

        // Host as Observer toggle
        if (id === 'lobby-spectator') {
            const isChecked = e.target.checked;
            updateState({ isSpectator: isChecked });
            // Hide/Show Stage 4 (Faction Identity) for the host if they are an observer
            if (appState.lobbyNavigator) {
                appState.lobbyNavigator.setSlideVisible(3, !isChecked);
            }
        }

        // Stage 3: Galaxy
        if (id === 'btn-advance-setup') {
            lobbyNavigator.next();
        }

        // Stage 4: Faction
        if (id === 'btn-finalize-faction') {
            lobbyNavigator.next();
        }
        
        if (id === 'btn-lobby-connect') {
            const code = document.getElementById('lobby-join-id').value.trim();
            if (!code) return toastManager.show("Please enter a Host ID", "error");
            
            const role = appState.isSpectator ? 'spectator' : 'player';
            peerManager.join(code, role).then(() => {
                toastManager.show("Secure link established. Fetching fleet data...", "success");
                
                if (appState.isSpectator) {
                    // Spectators go straight to the end
                    const carouselEl = document.getElementById('main-lobby-carousel');
                    const slides = carouselEl?.querySelectorAll('.stellar-slide');
                    if (slides && appState.lobbyNavigator) {
                        appState.lobbyNavigator.goTo(slides.length - 1);
                    }
                    return;
                }

                // Hide connection panel, show faction selection
                document.getElementById('join-connection-panel').classList.add('hidden');
                document.getElementById('join-faction-panel').classList.remove('hidden');
                
                // Fetch factions from host
                peerManager.send({ type: 'LOBBY_REQUEST_FACTIONS' });
            }).catch(err => {
                toastManager.show(`Link failed: ${err.message}`, "error");
            });
        }

        if (id.startsWith('btn-join-faction-')) {
            const factionId = id.replace('btn-join-faction-', '');
            const factionName = target.dataset.name;
            requestJoinFaction(factionId, factionName);
        }

        if (id === 'btn-create-new-faction') {
            const name = prompt("Enter Name for New Faction:", `${appState.commanderName}'s Fleet`);
            if (name) requestJoinFaction('new', name);
        }

        if (id === 'btn-open-radar') {
            window.friendsRadar.show();
        }

        // Stage 4: Engage
        if (id === 'btn-engage-mission') {
            if (!gameEngine) {
                toastManager.show("Game Engine not ready. Please refresh.", "error");
                return;
            }
            if (appState.isSolo || appState.isHost) {
                try {
                    const sizeEl = document.getElementById('lobby-galaxy-size');
                    const numSystems = parseInt(document.getElementById('lobby-galaxy-size')?.value || "45");
                    const numAI = parseInt(document.getElementById('lobby-ai-count')?.value || "7");
                    const resourceRate = (parseInt(document.getElementById('lobby-resource-rate')?.value || "100")) / 100;
                    const shipSpeedRate = (parseInt(document.getElementById('lobby-ship-speed')?.value || "100")) / 100;
                    const isSymmetric = document.getElementById('lobby-symmetric')?.checked ?? true;
                    const isSpectator = document.getElementById('lobby-spectator')?.checked ?? false;

                    const aiPlayers = [];
                    for (let i = 0; i < numAI; i++) {
                        aiPlayers.push({ id: `ai_${Date.now()}_${i}`, isAI: true });
                    }

                    const humanPlayers = isSpectator ? [] : [{
                        guid: appState.playerId,
                        name: document.getElementById('lobby-commander-name')?.value || appState.commanderName,
                        factionName: document.getElementById('lobby-faction-name')?.value || appState.factionName,
                        factionColor: appState.factionColor,
                        team: appState.techBase || "Solaris"
                    }];

                    const newState = await gameEngine.createNewGame({ 
                        numSystems, 
                        aiPlayers,
                        humanPlayers,
                        resourceRate,
                        shipSpeedRate,
                        isSymmetric,
                        isSpectator,
                        twoWayDensity: 30, // Defaults from user list
                        oneWayDensity: 3,
                        hazardDensity: 10
                    });
                    
                    if (appState.isHost && !appState.isSolo) {
                        peerManager.send({ type: 'GAME_SET_STATE', state: newState });
                    }
                    
                    switchScreen('game');
                    window.dispatchEvent(new Event('game-started'));
                } catch (err) {
                    console.error("Game Initialization Failed:", err);
                    toastManager.show(`Engage Failed: ${err.message}`, "error");
                }
            } else {
                switchScreen('game');
            }
        }

        // Recovery Slide
        if (id === 'btn-resume-mission') {
            toastManager.show("Restoring Sector...", "info");
            updateState({ 
                playerName: recovery.playerName,
                techBase: recovery.techBase,
                isSolo: recovery.isSolo,
                isHost: recovery.isHost,
                peerId: recovery.peerId
            });
            if (recovery.isHost) await peerManager.host(recovery.peerId);
            if (gameEngine) gameEngine.setState(recovery.gameState);
            switchScreen('game');
        }

        if (id === 'btn-clear-recovery') {
            storageService.clearRecoveryState();
            location.reload();
        }
    });

    const requestJoinFaction = (factionId, factionName) => {
        const identity = profileService.getIdentity();
        peerManager.send({
            type: 'FACTION_JOIN_REQUEST',
            guid: identity.guid,
            name: appState.commanderName,
            factionId: factionId,
            factionName: factionName,
            color: appState.factionColor,
            role: appState.isSpectator ? 'spectator' : 'player'
        });
        toastManager.show(`Clearance request sent to ${factionName}. Waiting for approval...`, 'info');
    };

    const setLobbyRole = (role) => {
        appState.isSolo = role === 'solo';
        appState.isHost = role === 'solo' || role === 'host';
        appState.isSpectator = role === 'spectator';
        
        // Dynamic Slide Visibility
        if (appState.lobbyNavigator) {
            // Slide 2 is Galaxy Config (Stage 3). Hidden for joiners/spectators.
            appState.lobbyNavigator.setSlideVisible(2, appState.isHost);
            
            // Slide 3 is Faction Identity / Connection (Stage 4). 
            // Everyone needs this slide to either create a faction or connect to host.
            appState.lobbyNavigator.setSlideVisible(3, true);
        }

        // Update Panel Visibility
        setTimeout(() => {
            const panelGalaxy = document.getElementById('panel-galaxy-config');
            const panelFaction = document.getElementById('panel-solo-host-faction');
            const panelJoin = document.getElementById('panel-join');

            if (panelGalaxy) panelGalaxy.classList.toggle('show', role === 'solo' || role === 'host');
            if (panelFaction) panelFaction.classList.toggle('show', role === 'solo' || role === 'host');
            if (panelJoin) panelJoin.classList.toggle('show', role === 'join' || role === 'spectator');

            // Reset Join Panels
            const connPanel = document.getElementById('join-connection-panel');
            const factionPanel = document.getElementById('join-faction-panel');
            if (connPanel) connPanel.classList.remove('hidden');
            if (factionPanel) factionPanel.classList.add('hidden');

            // Active State for Buttons
            document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`btn-role-${role}`)?.classList.add('active');

            if (role === 'host' || role === 'solo') {
                uiManager.updateColorPickerUI('lobby-color-picker');
                if (role === 'host') {
                    peerManager.host().then(id => {
                        updateState({ peerId: id });
                        const idEl = document.getElementById('lobby-host-id');
                        if (idEl) idEl.textContent = id;
                    });
                }
            }
        }, 0);

        // Navigation logic: Joiners skip Slide 3 (Galaxy Config)
        if (role === 'join' || role === 'spectator') {
            lobbyNavigator.goTo(3); // Go to Slide 4 (Fleet Assignment/Connect)
        } else {
            lobbyNavigator.next(); // Go to Slide 3 (Galaxy Config)
        }
    };

    const updateLobbySummary = () => {
        const summaryEl = document.getElementById('lobby-summary');
        if (!summaryEl) return;
        
        const modeText = appState.isSolo ? "Solo Campaign" : (appState.isHost ? "Multiplayer Host" : "Joined Fleet");
        let detailText = "";
        
        if (appState.isSolo || appState.isHost) {
            const systems = document.getElementById('lobby-galaxy-size')?.value || 0;
            const ai = document.getElementById('lobby-ai-count')?.value || 0;
            const res = document.getElementById('lobby-resource-rate')?.value || 100;
            const speed = document.getElementById('lobby-ship-speed')?.value || 100;
            const sym = document.getElementById('lobby-symmetric')?.checked ? "Symmetric" : "Random";
            detailText = `<li>Sector: ${systems} Systems (${sym})</li><li>Opposition: ${ai} AI</li><li>Economy: ${res}% | Drive: ${speed}%</li>`;
        } else {
            detailText = `<li>Status: Linked to Command</li>`;
        }

        summaryEl.innerHTML = `
            <div style="font-weight: 700; color: var(--primary-color); margin-bottom: 0.5rem;">${modeText}</div>
            <ul style="padding-left: 1.2rem; margin: 0; font-size: 0.75rem;">
                <li>Commander: ${appState.commanderName}</li>
                <li>Strategic Base: ${appState.techBase}</li>
                ${detailText}
            </ul>
        `;
    };

    // Update friends radar join callback
    window.friendsRadar.joinCallback = (code) => {
        const idInput = document.getElementById('lobby-join-id');
        if (idInput) idInput.value = code;
        peerManager.join(code).then(() => {
            toastManager.show("Connected via Radar!", "success");
            lobbyNavigator.goTo(lobbySlides.length - 1);
        }).catch(err => {
            toastManager.show(`Join failed: ${err.message}`, "error");
        });
    };

    // Global listeners
    window.addEventListener('game-started', () => switchScreen('game'));
    const btnReturn = document.getElementById('btn-return-to-lobby');
    if (btnReturn) btnReturn.addEventListener('click', () => switchScreen('lobby'));
}
