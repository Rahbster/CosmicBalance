import { MAP_WIDTH, MAP_HEIGHT, LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';
import { TacticalCombatSimulator } from '../combat/TacticalCombatSimulator.js';
import { renderCombatMap, renderCombatInfoPanel, initRenderer, resetRenderer, showBattleIntro, showBattleSummary } from './TacticalCombatRenderer.js';

let simulator = null;
let gameEngine = null;
let viewState = {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    isPanning: false,
    dragStartX: 0,
    dragStartY: 0,
    lastTouchDistance: 0,
    isAutoZoom: true
};
let preCombatCamera = null;

export function initTacticalCombat(engine) {
    gameEngine = engine;
}

function initializeCombatUI() {
    initRenderer(); // Inject styles and init stars
    document.body.classList.add('combat-mode');
    const gameState = gameEngine.state;
    gameState.combat.active = true;
    gameState.combat.ships = [];
    ensureCombatDOM();

    const starmapView = document.getElementById('starmap-view');
    if (starmapView) starmapView.classList.add('hidden');
    const designerView = document.getElementById('ship-designer-view');
    if (designerView) designerView.classList.add('hidden');
    const combatMapView = document.getElementById('combat-map-view');
    if (combatMapView) combatMapView.classList.remove('hidden');
    const designerBtn = document.getElementById('ship-designer-btn-main');
    if (designerBtn) designerBtn.classList.add('hidden');
    const aboutBtn = document.getElementById('about-btn-main');
    if (aboutBtn) aboutBtn.classList.add('hidden');
}

function ensureCombatDOM() {
    let container = document.getElementById('cosmic-balance-area');
    if (!container) {
        container = document.getElementById('game-board-area') || document.body;
    }

    if (!document.getElementById('combat-map-view')) {
        const view = document.createElement('div');
        view.id = 'combat-map-view';
        view.className = 'hidden';
        container.appendChild(view);
    }

    let infoPanel = document.getElementById('info-panel');
    if (!infoPanel) {
        infoPanel = document.createElement('div');
        infoPanel.id = 'info-panel';
        container.appendChild(infoPanel);
    }
    if (!document.getElementById('info-panel-nav')) {
        const nav = document.createElement('div');
        nav.id = 'info-panel-nav';
        infoPanel.appendChild(nav);
    }
    if (!document.getElementById('info-panel-content')) {
        const content = document.createElement('div');
        content.id = 'info-panel-content';
        infoPanel.appendChild(content);
    }

    if (!document.getElementById('combat-scale-bar')) {
        const bar = document.createElement('div');
        bar.id = 'combat-scale-bar';
        container.appendChild(bar);
    }
}

export function startTacticalCombat(system, entities, localPlayerId) {
    initRenderer(); // Ensure styles are loaded for any overlays
    if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, `[TacticalCombat] Battle detected in ${system.name}`);

    let safetyTimer = null;

    // 1. Store current camera state and pan to battle
    const startSim = () => {
        if (safetyTimer) clearTimeout(safetyTimer);
        
        // Prevent double-start if safety timer also fires
        if (simulator) return;

        // This function is called after the camera sequence is complete.
        // It shows the battle intro overlay, and its callback starts the actual simulation.
        console.log("[TacticalCombat] Camera sequence complete. Showing intro.");
        if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, "[TacticalCombat] Camera sequence complete. Showing intro.");
        try {
            showBattleIntro(system, entities, gameEngine, () => {
                if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, "[TacticalCombat] Intro complete. Starting simulation.");
                startBattleSimulation(system, entities, localPlayerId);
            });
        } catch (e) {
            console.error("[TacticalCombat] Failed to show battle intro:", e);
            if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.ERROR, `[TacticalCombat] Failed to show battle intro: ${e.message}`);
            startBattleSimulation(system, entities, localPlayerId);
        }
    };

    // 1. Camera Sequence
    if (gameEngine && gameEngine.camera) {
        if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, "[TacticalCombat] Starting camera sequence.");
        preCombatCamera = {
            pan: { ...gameEngine.camera.pan },
            zoom: gameEngine.camera.zoom
        };

        // Calculate the ideal zoom level to frame the system
        const effectiveRadius = gameEngine.spatialService.getSystemEffectiveRadius(system);
        const buffer = 1.5; // Add some padding
        const targetZoom = Math.min(
            gameEngine.canvas.width / (effectiveRadius * 2 * buffer),
            gameEngine.canvas.height / (effectiveRadius * 2 * buffer)
        );

        const minZoom = gameEngine.camera.getMinZoom();
        // Zoom out to a wide view of the system
        gameEngine.camera.centerOn(system.x, system.y, minZoom, 3000, () => {
            if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, "[TacticalCombat] Zoom out complete. Zooming in.");
            // Then zoom in to the battle system
            gameEngine.camera.centerOn(system.x, system.y, targetZoom, 2500, startSim);
        });

        // Safety fallback: If camera animation gets stuck or interrupted without callback, force start after 7 seconds
        safetyTimer = setTimeout(() => {
            if (!simulator) {
                if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.WARNING, "[TacticalCombat] Camera sequence timed out. Forcing simulation start.");
                startSim();
            }
        }, 8000);
    } else {
        if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.WARNING, "[TacticalCombat] No camera/engine found. Skipping sequence.");
        startSim();
    }
}

function startBattleSimulation(system, entities, localPlayerId) {
    if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, `[TacticalCombat] Initializing simulation for ${system.name}`);
    simulator = new TacticalCombatSimulator({
        onToast: (msg, type) => { if (window.toastManager) window.toastManager.show(msg, type); }
    });
    const seed = Date.now();
    const playerNames = {};
    if (gameEngine && gameEngine.state && gameEngine.state.players) {
        gameEngine.state.players.forEach(p => playerNames[p.id] = p.factionName);
    }
    simulator.createInstance({ system, entities, localPlayerId, seed, shipDesigns: gameEngine.state.shipDesigns, playerNames });
    resetRenderer();
    initializeCombatUI();
    const combatState = simulator.getState();
    if (!combatState.selectedShipId) {
        const playerShip = combatState.ships.find(s => s.isPlayer);
        if (playerShip) combatState.selectedShipId = playerShip.id;
    }
    setupCombatInput();
    viewState.isAutoZoom = true;
    renderCombatMap(combatState, viewState, gameEngine, simulator, getCallbacks());
    renderCombatInfoPanel(combatState, viewState, gameEngine, simulator, getCallbacks());
    if (gameEngine.isHost) {
        const msg = { type: 'combat-start', game: 'cosmicbalance', system, entities, seed };
        gameEngine.broadcast(msg);
    }
}

function setupCombatInput() {
    const combatView = document.getElementById('combat-map-view');
    if (combatView) {
        combatView.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        combatView.addEventListener('wheel', handleZoom, { passive: false });
        combatView.addEventListener('touchstart', handleTouchStart, { passive: false });
        combatView.addEventListener('touchmove', handleTouchMove, { passive: false });
        combatView.addEventListener('touchend', handleTouchEnd);
    }
}

export function handleCombatStart(data, localPlayerId) {
    if (gameEngine.isHost) return;
    if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, `[TacticalCombat] Joiner handling combat start in ${data.system ? data.system.name : 'unknown'}`);

    // Store current camera state and pan to battle for joiner
    if (gameEngine && gameEngine.camera) {
        preCombatCamera = {
            pan: { ...gameEngine.camera.pan },
            zoom: gameEngine.camera.zoom
        };
        if (data.system) {
            gameEngine.camera.centerOn(data.system.x, data.system.y, 2.0);
        }
    }

    simulator = new TacticalCombatSimulator({
        onToast: (msg, type) => { if (window.toastManager) window.toastManager.show(msg, type); }
    });
    const playerNames = {};
    if (gameEngine && gameEngine.state && gameEngine.state.players) {
        gameEngine.state.players.forEach(p => playerNames[p.id] = p.factionName);
    }
    simulator.createInstance({ system: data.system, entities: data.entities, localPlayerId, seed: data.seed, shipDesigns: gameEngine.state.shipDesigns, playerNames });
    resetRenderer();

    initializeCombatUI();

    const combatState = simulator.getState();
    if (!combatState.selectedShipId && combatState.ships.length > 0) {
        combatState.selectedShipId = combatState.ships[0].id; // Auto-select first ship for spectators
    }

    setupCombatInput();
    viewState.isAutoZoom = true;
    renderCombatMap(combatState, viewState, gameEngine, simulator, getCallbacks());
    renderCombatInfoPanel(combatState, viewState, gameEngine, simulator, getCallbacks());
}

export function startReplay(replayData) {
    simulator = new TacticalCombatSimulator({
        onToast: (msg, type) => { if (window.toastManager) window.toastManager.show(msg, type); }
    });
    simulator.isReplay = true;
    // Restore initial state
    simulator.createInstance(replayData.initialConfig);
    resetRenderer();
    // Restore command history
    simulator.state.commandHistory = replayData.commandHistory;

    initRenderer();
    const gameState = gameEngine.state;
    gameState.combat.active = true;
    
    const starmapView = document.getElementById('starmap-view');
    if (starmapView) starmapView.classList.add('hidden');
    const designerView = document.getElementById('ship-designer-view');
    if (designerView) designerView.classList.add('hidden');
    const combatMapView = document.getElementById('combat-map-view');
    if (combatMapView) combatMapView.classList.remove('hidden');
    const designerBtn = document.getElementById('ship-designer-btn-main');
    if (designerBtn) designerBtn.classList.add('hidden');

    setupCombatInput();
    viewState.isAutoZoom = true;
    renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
    renderCombatInfoPanel(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
}

export function closeCombatView(onComplete) {
    if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, "[TacticalCombat] Closing combat view.");
    document.body.classList.remove('combat-mode');
    const gameState = gameEngine.state;
    gameState.combat.active = false;

    const combatMapView = document.getElementById('combat-map-view');
    if (combatMapView) combatMapView.classList.add('hidden');
    const designerView = document.getElementById('ship-designer-view');
    if (designerView) designerView.classList.add('hidden');
    const starmapView = document.getElementById('starmap-view');
    if (starmapView) starmapView.classList.remove('hidden');
    
    const designerBtn = document.getElementById('ship-designer-btn-main');
    if (designerBtn) designerBtn.classList.remove('hidden');
    const aboutBtn = document.getElementById('about-btn-main');
    if (aboutBtn) aboutBtn.classList.remove('hidden');
    
    if (simulator) {
        if (simulator.autoPlayTimer) clearInterval(simulator.autoPlayTimer);
        // Always cleanup simulator instance when closing view to allow next battle to start
        simulator = null;
    }

    const combatView = document.getElementById('combat-map-view');
    if (combatView) {
        combatView.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        combatView.removeEventListener('wheel', handleZoom);
        combatView.removeEventListener('touchstart', handleTouchStart);
        combatView.removeEventListener('touchmove', handleTouchMove);
        combatView.removeEventListener('touchend', handleTouchEnd);
    }
    document.getElementById('info-panel-content').innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';
    
    const nav = document.getElementById('info-panel-nav');
    if (nav) {
        nav.innerHTML = '';
        nav.remove();
    }

    // Restore Camera
    if (preCombatCamera && gameEngine && gameEngine.camera) {
        // Calculate world coordinates from the stored pan/zoom
        // Pan is offset, so World = (Center - Pan) / Zoom
        const cx = gameEngine.canvas.width / 2;
        const cy = gameEngine.canvas.height / 2;
        const worldX = (cx - preCombatCamera.pan.x) / preCombatCamera.zoom;
        const worldY = (cy - preCombatCamera.pan.y) / preCombatCamera.zoom;

        gameEngine.camera.centerOn(worldX, worldY, preCombatCamera.zoom, 2000, () => {
            preCombatCamera = null;
            if (onComplete) onComplete();
        });
    } else if (onComplete) {
        onComplete();
    }
}

export function endCombat() {
    if (gameEngine) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.INFO, "[TacticalCombat] Ending combat.");
    const gameState = gameEngine.state;
    const simState = simulator ? simulator.getState() : null;
    const summaryStats = {};

    // Sync results back to main game state
    if (gameEngine.isHost && simulator && !simulator.isReplay && simState) {
        simState.ships.forEach(simShip => {
            // Find the corresponding ship in the main game state
            const realShip = gameState.ships.find(s => s.id === simShip.id);
            if (realShip) {
                if (simShip.destroyed) {
                    const ownerName = simShip.name.split(' ').slice(0, -2).join(' ') || 'Unknown'; // Rough extraction or use player map
                    // Better: use owner ID to get name from game state
                    const p = gameState.players.find(pl => pl.id === simShip.owner);
                    if (p) summaryStats[p.factionName] = (summaryStats[p.factionName] || 0) + 1;
                    realShip.hull = 0; // Mark for destruction by CombatService
                } else {
                    // Map tactical damage back to strategic stats
                    const healthPct = simShip.maxHullIntegrity > 0 ? simShip.hullIntegrity / simShip.maxHullIntegrity : 0;
                    realShip.hull = realShip.maxHull * healthPct;
                    // Note: Shields are more complex to map back perfectly, but hull is the critical persistence factor.
                }
            }
        });
    }

    // Archive Log
    if (simulator && !simulator.isReplay) {
        if (!gameState.combatLogHistory) gameState.combatLogHistory = [];
        gameState.combatLogHistory.push({
            timestamp: Date.now(),
            systemId: simState?.system?.id || 'unknown',
            log: simState ? [...simState.battleLog] : [],
            initialConfig: simulator.initialConfig,
            commandHistory: simulator.state.commandHistory
        });
    }

    // Determine Winner for Summary
    let winner = 'Draw';
    let winnerColor = '#fff';
    if (simState) {
        const survivors = simState.ships.filter(s => !s.destroyed && !s.isPlanet);
        const owners = [...new Set(survivors.map(s => s.owner))];
        if (owners.length === 1) {
            const p = gameState.players.find(pl => pl.id === owners[0]);
            if (p) {
                winner = p.factionName;
                winnerColor = p.color;
            }
        }
    }

    showBattleSummary({ winner, winnerColor, stats: summaryStats }, () => {
        closeCombatView(() => {
            if (gameEngine) gameEngine.resumeFromCombat();
        });
    });
}

function fastForwardCombat() {
    const combatState = simulator.getState();
    let safety = 0;
    while (safety < 1000) {
        const activeShips = combatState.ships.filter(s => !s.destroyed);
        const owners = new Set(activeShips.map(s => s.owner));
        if (owners.size <= 1) break;
        
        executeTurn(true); // suppressUI
        safety++;
    }
    endCombat();
}

function handleZoom(e) {
    e.preventDefault();
    const zoomSpeed = 0.1;
    if (e.deltaY < 0) {
        viewState.zoom *= (1 + zoomSpeed);
    } else {
        viewState.zoom /= (1 + zoomSpeed);
    }
    viewState.zoom = Math.max(0.1, Math.min(viewState.zoom, 10.0));
    if (simulator) renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
}

function handleMouseDown(e) {
    if (e.button !== 0) return; // Only left click
    viewState.isPanning = true;
    viewState.dragStartX = e.clientX;
    viewState.dragStartY = e.clientY;
    const combatView = document.getElementById('combat-map-view');
    if (combatView) combatView.style.cursor = 'grabbing';
}

function handleMouseMove(e) {
    if (!viewState.isPanning) return;
    
    const dx = e.clientX - viewState.dragStartX;
    const dy = e.clientY - viewState.dragStartY;

    // Add threshold to prevent micro-movements from killing click events on ships
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    const combatView = document.getElementById('combat-map-view');
    const rect = combatView.getBoundingClientRect();
    
    e.preventDefault();
    // Convert pixel delta to world delta based on current zoom and map scale
    const scale = rect.width / MAP_WIDTH;
    viewState.panX += dx / (viewState.zoom * scale);
    viewState.panY += dy / (viewState.zoom * scale);
    
    viewState.dragStartX = e.clientX;
    viewState.dragStartY = e.clientY;
    
    if (simulator) renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
}

function handleMouseUp(e) {
    if (viewState.isPanning) {
        const dx = e.clientX - viewState.dragStartX;
        const dy = e.clientY - viewState.dragStartY;
        // If movement is minimal, treat as a click
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
            // If we clicked the background (not a ship), deselect
            if (!e.target.closest('.ship')) {
                const gameState = simulator ? simulator.getState() : null;
                if (gameState && gameState.selectedShipId) {
                    gameState.selectedShipId = null;
                    renderCombatInfoPanel(gameState, viewState, gameEngine, simulator, getCallbacks());
                }
            }
        }
    }
    viewState.isPanning = false;
    const combatView = document.getElementById('combat-map-view');
    if (combatView) combatView.style.cursor = 'default';
}

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        viewState.isPanning = true;
        viewState.dragStartX = e.touches[0].clientX;
        viewState.dragStartY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        viewState.isPanning = false;
        viewState.lastTouchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && viewState.isPanning) {
        const dx = e.touches[0].clientX - viewState.dragStartX;
        const dy = e.touches[0].clientY - viewState.dragStartY;

        // Add threshold to prevent micro-movements from killing click events on ships
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

        const combatView = document.getElementById('combat-map-view');
        const rect = combatView.getBoundingClientRect();
        const scale = rect.width / MAP_WIDTH;
        viewState.panX += dx / (viewState.zoom * scale);
        viewState.panY += dy / (viewState.zoom * scale);
        viewState.dragStartX = e.touches[0].clientX;
        viewState.dragStartY = e.touches[0].clientY;
        if (simulator) renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
    } else if (e.touches.length === 2) {
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        if (viewState.lastTouchDistance > 0) {
            const delta = dist - viewState.lastTouchDistance;
            viewState.zoom *= (1 + delta * 0.005);
            viewState.zoom = Math.max(0.1, Math.min(viewState.zoom, 10.0));
            if (simulator) renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
        }
        viewState.lastTouchDistance = dist;
    }
}

function handleTouchEnd(e) {
    viewState.isPanning = false;
    viewState.lastTouchDistance = 0;
}

function jumpToTurn(targetTurn) {
    if (!simulator || !simulator.isReplay) return;
    
    if (simulator.autoPlayTimer) {
        clearInterval(simulator.autoPlayTimer);
        simulator.autoPlayTimer = null;
    }

    let currentTurn = simulator.getState().turn;

    if (targetTurn < currentTurn) {
        const history = simulator.state.commandHistory;
        simulator.createInstance(simulator.initialConfig);
        simulator.state.commandHistory = history;
        currentTurn = 1;
    }

    while (currentTurn < targetTurn) {
        executeTurn(true);
        currentTurn = simulator.getState().turn;
    }

    renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
    renderCombatInfoPanel(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
}

function gatherHostOrders(combatState) {
    const hostShips = combatState.ships.filter(s => s.owner === simulator.localPlayerId && !s.destroyed && !s.retreated);

    hostShips.forEach(ship => {
        if (ship.id === combatState.selectedShipId) {
            const newOrders = {
                targetSpeed: parseInt(document.getElementById('speed-order').value, 10),
                targetHeading: parseInt(document.getElementById('heading-order').value, 10)
            };
            ship.orders = newOrders;

            ship.weapons.forEach((weapon, i) => {
                weapon.targetId = document.getElementById(`weapon-target-${i}`).value;
            });
        }
    });
}

function executeTurn(suppressUI = false) {
    const combatState = simulator.getState();
    if (gameEngine && !suppressUI) gameEngine.loggingService.log(LOG_CATEGORIES.COMBAT, LOG_LEVELS.DEBUG, `[TacticalCombat] Executing Turn ${combatState.turn}`);

    if (simulator.isReplay) {
        // Apply recorded orders for this turn (index is turn - 1)
        simulator.applyTurnOrders(combatState.turn - 1);
    } else {
        // Live game logic
        if (gameEngine.isHost) {
            gatherHostOrders(combatState);
            simulator.aiGenerateOrders();
        }
    }
    
    simulator.executeTurn(suppressUI);
    
    const isSpectator = !combatState.ships.some(s => s.owner === simulator.localPlayerId);
    const remainingPlayerShips = combatState.ships.filter(s => s.isPlayer && !s.destroyed && !s.retreated).length;
    const remainingEnemyShips = combatState.ships.filter(s => !s.isPlayer && !s.destroyed && !s.retreated).length;

    if (!suppressUI) {
        if (isSpectator) {
            const activeShips = combatState.ships.filter(s => !s.destroyed && !s.retreated && !s.isPlanet);
            const activeOwners = new Set(activeShips.map(s => s.owner));
            if (activeOwners.size === 0) {
                if (window.toastManager) window.toastManager.show('All ships destroyed.', 'info');
            } else if (activeOwners.size === 1) {
                // One side remains. We avoid spamming "Winner" every turn, endCombat will handle finality.
            }
        } else {
            if (remainingPlayerShips === 0 && window.toastManager) window.toastManager.show('All player ships have been destroyed! You lose.', 'error');
            if (remainingEnemyShips === 0 && window.toastManager) window.toastManager.show('All enemy ships have been destroyed! You win!', 'info');
        }
    }

    if (gameEngine.isHost) {
        const turnUpdate = { type: 'move-update', game: 'cosmicbalance', combatState: combatState };
        gameEngine.broadcast(turnUpdate);
    }

    if (!suppressUI) renderCombatInfoPanel(combatState, viewState, gameEngine, simulator, getCallbacks());
}

export function processMove(moveData) {
    if (!gameEngine.isHost || moveData.game !== 'cosmicbalance') return;

    const ship = simulator.getState().ships.find(s => s.id === moveData.shipId);
    if (ship) {
        if (moveData.orders) {
            ship.orders = moveData.orders;
            console.log(`Received move orders for ${ship.name} from joiner.`);
        }
        if (moveData.weaponOrders) {
            moveData.weaponOrders.forEach(order => {
                if (ship.weapons[order.index]) {
                    ship.weapons[order.index].targetId = order.targetId;
                }
            });
            console.log(`Received fire orders for ${ship.name} from joiner.`);
        }
    }
}

export function processUIUpdate(data) {
    if (gameEngine.isHost || data.game !== 'cosmicbalance') return;

    if (!simulator) return;

    simulator.state = data.combatState;
    
    renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
    renderCombatInfoPanel(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
}

function getCallbacks() {
    return {
        onEndCombat: () => {
            const combatState = simulator.getState();
            const isHost = gameEngine.isHost;
            // Check if all active ships are AI controlled (AI vs AI battle)
            const isAiVsAi = isHost && combatState.ships.filter(s => !s.destroyed && !s.isPlanet).every(s => s.aiAssisted);

            if (isHost) {
                if (isAiVsAi) {
                    fastForwardCombat();
                } else {
                    // If player leaves manually, disable watching to prevent immediate re-entry loop
                    if (gameEngine.watchBattles) gameEngine.watchBattles = false;
                    endCombat();
                }
            } else {
                endCombat();
            }
        },
        onToggleAutoPlay: () => {
            if (simulator.autoPlayTimer) {
                clearInterval(simulator.autoPlayTimer);
                simulator.autoPlayTimer = null;
            } else {
                simulator.autoPlayTimer = setInterval(() => {
                    executeTurn();
                    requestAnimationFrame(() => renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks()));
                }, 1000);
            }
            renderCombatInfoPanel(simulator.getState(), viewState, gameEngine, simulator, getCallbacks());
        },
        onRunGameLoop: () => {
            executeTurn();
            requestAnimationFrame(() => renderCombatMap(simulator.getState(), viewState, gameEngine, simulator, getCallbacks()));
        },
        onCloseDetails: () => {
            const gameState = simulator.getState();
            gameState.selectedShipId = null;
            renderCombatInfoPanel(gameState, viewState, gameEngine, simulator, getCallbacks());
        },
        onUndoTurn: () => { /* Implement if needed */ },
        onSubmitOrders: () => { /* Logic is inside renderCombatInfoPanel for now due to DOM access */ },
        onRetreat: () => { /* Logic is inside renderCombatInfoPanel for now */ },
        onJumpToTurn: jumpToTurn,
        onSetSpeed: (speed) => { /* Logic handled in renderCombatInfoPanel for now */ },
        onAiAssistToggle: (enabled) => {
            const combatState = simulator.getState();
            const selectedShip = combatState.ships.find(s => s.id === combatState.selectedShipId);
            if (selectedShip) {
                selectedShip.aiAssisted = enabled;
                if (window.toastManager) window.toastManager.show(`AI Assistant for ${selectedShip.name} is now ${enabled ? 'ON' : 'OFF'}.`, 'info');
                if (enabled) simulator.aiGenerateOrders();
            }
        }
    };
}
