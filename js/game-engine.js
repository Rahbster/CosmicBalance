import { GalaxyService, SHIP_DATA, PLANET_TYPES } from './services/GalaxyService.js';
import { InteractionService } from './services/InteractionService.js';
import { RenderService } from './services/RenderService.js';
import { AIService } from './services/AIService.js';
import { SpriteService } from './services/SpriteService.js';
import { FleetService } from './services/FleetService.js';
import { CombatService } from './services/CombatService.js';
import { EconomyService } from './services/EconomyService.js';
import { MovementService } from './services/MovementService.js';
import { LoggingService } from './services/LoggingService.js';
import { TechService } from './services/TechService.js';
import { SpatialService } from './services/SpatialService.js';
import { CameraManager } from './services/CameraManager.js';
import { SelectionManager } from './services/SelectionManager.js';
import { GameMessageHandler } from './services/GameMessageHandler.js';
import { GameSetupService } from './services/GameSetupService.js';
import { UnitService } from './services/UnitService.js';
import { PerformanceMonitor } from './services/PerformanceMonitor.js';
import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS, DEFAULT_SHIP_DESIGNS } from './cb_constants.js';


export class GameEngine {
    constructor(canvas, peerManager, profileService, loggingService, storageService) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.peerManager = peerManager;
        this.profileService = profileService;
        this.isHost = true; // Assume host role by default for local play. A peer joining will have this set to false.
        
        this.storageService = storageService;
        this.loggingService = loggingService || new LoggingService();
        console.log("[GameEngine] Constructor started.");
        
        this.state = {
            systems: [],
            ships: [],
            players: [],
            debrisFields: [],
            gameTime: 0,
        };

        // Try to load state from localStorage
        console.log("[GameEngine] Attempting to load game state from localStorage...");
        
        let loadedState = null;
        if (this.storageService) {
            loadedState = this.storageService.getGameState();
        } else {
            console.warn("[GameEngine] StorageService not provided, falling back to localStorage.");
            const raw = localStorage.getItem('cosmic_balance_gamestate');
            if (raw) loadedState = JSON.parse(raw);
        }

        if (loadedState) {
            console.log("[GameEngine] Found saved game state.");
            try {
                this.state = loadedState;
                // Explicitly set the engine's paused status from the loaded state.
                this.paused = loadedState.paused || false;
                this.timeScale = loadedState.timeScale || 1.0;
                console.log(`[GameEngine] Loaded 'paused' state from storage: ${loadedState.paused}. Engine 'paused' is now: ${this.paused}`);
                if (this.state.gameTime === undefined) this.state.gameTime = 0;
            } catch (e) {
                console.error("[GameEngine] Failed to parse saved state", e);
                this.paused = false; // Default on error
            }
        } else {
            // No saved state, so the game is not paused.
            console.log("[GameEngine] No saved game state found. Defaulting to not paused.");
            this.paused = false;
            this.timeScale = 1.0;
        }

        this.galaxyService = new GalaxyService(this.canvas, this.loggingService);
        this.camera = new CameraManager(this, this.canvas);
        this.spatialService = new SpatialService(this);
        this.techService = new TechService(this);
        this.selectionManager = new SelectionManager(this);
        this.spriteService = new SpriteService(this.loggingService);
        this.renderService = new RenderService(this.canvas, this, this.spriteService);
        this.interactionService = new InteractionService(this.canvas, this);
        this.aiService = new AIService(this);
        this.fleetService = new FleetService(this);
        this.combatService = new CombatService(this);
        this.economyService = new EconomyService(this);
        this.movementService = new MovementService(this);
        this.messageHandler = new GameMessageHandler(this);
        this.gameSetupService = new GameSetupService(this);
        this.unitService = new UnitService(this);
        this.performanceMonitor = new PerformanceMonitor();
        
        this.lastTime = 0;
        this.uiUpdateTimer = 0;
        this.uiUpdateInterval = 500; // Update UI twice a second
        this.saveStateTimer = 0;
        this.saveStateInterval = 5000; // Save state every 5 seconds
        this.aiDebugMode = false;
        
        this.reportHistory = this.storageService ? this.storageService.getReports() : [];

        this.autoReportTimer = 0;
        this.autoReportInterval = 60000; // 1 minute
        this.liveReportTimer = 0;
        this.liveReportInterval = 1000; // 1 second
        this.victoryCheckTimer = 0;
        this.victoryCheckInterval = 2000; // 2 seconds
        
        // Host-specific view settings
        this.hostView = {
            mode: 'player', // 'player', 'god', or 'faction'
            faction: this.profileService.getTeam(), // The faction to view as, defaults to own team
            selectedPlayerIds: []
        };
    }

    getIdentity() {
        return this.profileService.getIdentity();
    }

    getTeam() {
        return this.profileService.getTeam();
    }

    get elapsedTime() {
        return this.state.gameTime || 0;
    }

    setAIDebugMode(enabled) {
        this.aiDebugMode = enabled;
        this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `AI Debug Mode (Infinite Resources): ${enabled}`);
    }

    togglePause() {
        console.log(`[GameEngine] togglePause called. Current: ${this.paused}, New: ${!this.paused}`);
        this.paused = !this.paused;
        this.broadcast({ type: 'GAME_SET_PAUSE', paused: this.paused });
    }

    setGameSpeed(speed) {
        this.timeScale = parseFloat(speed);
        this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `Game Speed set to ${this.timeScale}x`);
        this.broadcast({ type: 'GAME_SET_SPEED', speed: this.timeScale });
    }

    requestSelfDestruct(shipId) {
        this.combatService.requestSelfDestruct(shipId);
    }

    requestScoutMission(shipId, targetSystemId) {
        this.movementService.requestScoutMission(shipId, targetSystemId);
    }

    requestExploreMission(shipId) {
        this.movementService.requestExploreMission(shipId);
    }

    requestPatrol(shipId, systemId) {
        this.movementService.requestPatrol(shipId, systemId);
    }

    requestStopPatrol(shipId) {
        this.movementService.requestStopPatrol(shipId);
    }

    requestSalvageMission(shipId, targetDebrisId) {
        this.movementService.requestSalvageMission(shipId, targetDebrisId);
    }

    requestRepairShip(shipId) {
        this.economyService.requestRepairShip(shipId);
    }

    // Proxy to SelectionManager for group repair logic
    requestRepairShipGroup(shipType, serviceType) {
        // Logic moved to SelectionManager or kept here? 
        // Actually, this is game logic triggered by UI. Let's keep it here but use selectionManager state.
        // ... (Implementation remains similar but accesses selectionManager.selectedLocationId)
        // For brevity, assuming SelectionManager handles the UI part, but the Engine handles the request.
        // We need to update the implementation to use this.selectionManager.selectedLocationId
        const localPlayer = this.getLocalPlayer();
        const selectedId = this.selectionManager.selectedLocationId;
        if (!selectedId || !localPlayer) return;

        let location = this.state.systems.find(s => s.id === selectedId);
        if (!location) {
            location = this.state.ships.find(s => s.id === selectedId && s.isStation);
        }
        if (!location) return;

        const systemContext = location.isStation 
            ? this.state.systems.find(sys => this.spatialService.isShipInSystem(location, sys))
            : location;
        
        if (!systemContext) return;

        const dockedShips = this.state.ships.filter(s => 
            s.owner === localPlayer.id && 
            s.type === shipType &&
            !s.targetId && 
            !s.isRepairing && // Don't re-request for ships already being serviced
            this.spatialService.isShipInSystem(s, systemContext)
        );

        this.loggingService.log(LOG_CATEGORIES.ECONOMY, LOG_LEVELS.INFO, `[RepairGroup] Found ${dockedShips.length} ships for ${serviceType}. Context: ${systemContext.name || systemContext.type}`);

        dockedShips.forEach(ship => {
            const needsRepair = ship.hull < ship.maxHull;
            const canUpgrade = localPlayer.researchedTechs.length > (ship.vintageTechs?.length || 0);

            if ((serviceType === 'upgrade' && canUpgrade) || (serviceType === 'repair' && needsRepair && !canUpgrade)) {
                this.requestRepairShip(ship.id);
            }
        });
    }

    _saveState() {
        if (this.isHost) {
            this.state.paused = this.paused;
            this.state.timeScale = this.timeScale;
            
            if (this.storageService) {
                if (!this.storageService.saveGameState(this.state)) {
                    if (window.toastManager) window.toastManager.show("Save Failed: Storage Full!", 'error');
                    this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.ERROR, `Failed to save game state.`);
                }
                // Save reports
                this.storageService.saveReports(this.reportHistory);
            } else {
                // Fallback
                localStorage.setItem('cosmic_balance_gamestate', JSON.stringify(this.state));
            }
        }
    }

    setState(newState) {
        this.state = newState;
        this.isHost = false; // Clients receiving state are not the host
        this.paused = this.state.paused || false; // Sync pause state for client
        this.timeScale = this.state.timeScale || 1.0;
        // When a new state is set, we might need to reset some local things
        this.selectionManager.selectedLocationId = null;
        this.selectionManager.selectedShipId = null;
        this.camera.pan = { x: 0, y: 0 };
        this.camera.zoom = 1;
    }

    getLocalPlayer() {
        return this.state.players.find(p => p.id === this.getIdentity().guid);
    }

    getViewingPlayerIds() {
        if (this.isHost) {
            if (this.hostView.mode === 'god') {
                return this.state.players.map(p => p.id);
            }
            if (this.hostView.mode === 'filtered') {
                return this.hostView.selectedPlayerIds || [];
            }
            if (this.hostView.mode === 'player') {
                return [this.hostView.faction]; // In 'player' mode, faction holds the player ID
            }
            if (this.hostView.mode === 'faction') {
                return this.state.players.filter(p => p.team === this.hostView.faction).map(p => p.id);
            }
        }
        return [this.getIdentity().guid]; // Default to the local player's own ID
    }

    getLocalPlayerTechBase() {
        const localPlayer = this.getLocalPlayer();
        return localPlayer ? localPlayer.team : this.getTeam();
    }

    async createNewGame(config) {
        return this.gameSetupService.createNewGame(config);
    }

    async restartGame(config) {
        if (config || this.state.gameConfig) {
            await this.createNewGame(config || this.state.gameConfig);
            this._saveState();
            window.location.reload();
        } else {
            this.resetGame();
        }
    }

    resetGame() {
        if (this.storageService) this.storageService.clearGameState();
        else localStorage.removeItem('cosmic_balance_gamestate');
        window.location.reload();
    }

    requestPlayerUpdate(update) {
        const request = {
            type: 'GAME_REQUEST_PLAYER_UPDATE',
            senderId: this.getIdentity().guid,
            update: update
        };
        if (this.isHost) {
            this.handlePlayerUpdateRequest(request);
        } else {
            this.broadcast(request);
        }
    }

    handlePlayerUpdateRequest({ senderId, update }) {
        if (!this.isHost) return;

        const player = this.state.players.find(p => p.id === senderId);
        if (!player) return;

        // Validate uniqueness
        if (update.factionName && this.state.players.some(p => p.id !== senderId && p.factionName === update.factionName)) {
            // TODO: Send error toast back to player
            return;
        }
        if (update.color && this.state.players.some(p => p.id !== senderId && p.color === update.color)) {
            // TODO: Send error toast back to player
            return;
        }

        Object.assign(player, update);
        this.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: senderId, update: update });
    }

    requestDisbandFleet(fleetId) {
        const request = {
            type: 'GAME_REQUEST_DISBAND_FLEET',
            senderId: this.getIdentity().guid,
            fleetId
        };
        if (this.isHost) this.fleetService.handleDisbandFleetRequest(request);
        else this.broadcast(request);
    }

    requestMoveFleet(fleetId, targetSystemId, navigationPath = null) {
        const request = {
            type: 'GAME_REQUEST_MOVE_FLEET',
            senderId: this.getIdentity().guid,
            fleetId,
            targetSystemId,
            navigationPath
        };
        if (this.isHost) this.fleetService.handleMoveFleetRequest(request);
        else this.broadcast(request);
    }
    
    async requestResearch(techId) {
        this.economyService.requestResearch(techId);
    }

    requestCancelBuild(locationId, itemId) {
        this.economyService.requestCancelBuild(locationId, itemId);
    }

    requestCreateFleet(name, shipIds) {
        const request = {
            type: 'GAME_REQUEST_CREATE_FLEET',
            senderId: this.getIdentity().guid,
            name,
            shipIds
        };
        if (this.isHost) this.fleetService.handleCreateFleetRequest(request);
        else this.broadcast(request);
    }

    requestUpdateFleetShips(fleetId, shipIdsToAdd, shipIdsToRemove) {
        const request = {
            type: 'GAME_REQUEST_UPDATE_FLEET_SHIPS',
            senderId: this.getIdentity().guid,
            fleetId,
            shipIdsToAdd,
            shipIdsToRemove
        };
        if (this.isHost) this.fleetService.handleUpdateFleetShipsRequest(request);
        else this.broadcast(request);
    }

    requestRenameFleet(fleetId, newName) {
        const request = {
            type: 'GAME_REQUEST_RENAME_FLEET',
            senderId: this.getIdentity().guid,
            fleetId,
            newName
        };
        if (this.isHost) this.fleetService.handleRenameFleetRequest(request);
        else this.broadcast(request);
    }

    // Client-side method to request a ship spawn from the host
    requestBuild(shipType, count = 1) {
        this.economyService.requestBuild(shipType, count);
    }

    addPlayer(id, name, role = 'player') {
        this.gameSetupService.addPlayer(id, name, role);
    }

    async start() {
        // Resize canvas to fit window
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Load sprites and tech data before starting the loop
        await Promise.all([
            this.spriteService.loadSprites(),
            this.techService.loadTechData()
        ]);
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.draw();
    }

    loop(timestamp) {
        let dt = Math.max(0, timestamp - this.lastTime);
        this.lastTime = timestamp;

        // Cap dt to prevent massive simulation jumps after sleep/suspend
        if (dt > 1000) {
            this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.WARNING, `[GameEngine] Large time delta detected (${dt}ms). Clamping to 100ms.`);
            dt = 100; 
        }

        // Simulation delta time. If paused, simulation stops.
        const simDt = this.paused ? 0 : dt * (this.timeScale || 1.0);

        // Update gameTime for both host and client to drive animations
        this.state.gameTime = (this.state.gameTime || 0) + simDt;
        
        if (this.isHost && !this.paused) {
            this.performanceMonitor.start('HostLogic');
            this.runHostLogic(simDt);
            this.performanceMonitor.end('HostLogic');
            
            this.performanceMonitor.start('AI');
            this.runAI(simDt);
            this.performanceMonitor.end('AI');
        }

        if (!this.paused) {
            this.performanceMonitor.start('Movement');
            this.update(simDt);
            this.performanceMonitor.end('Movement');
        }

        this.camera.updateAnimation(timestamp);
        
        this.performanceMonitor.start('Render');
        this.draw();
        this.performanceMonitor.end('Render');

        // Throttle UI updates to avoid constant re-rendering, but still update timers
        this.uiUpdateTimer += dt;
        if (this.uiUpdateTimer >= this.uiUpdateInterval) {
            this.uiUpdateTimer = 0;
            if (this.selectionManager.selectedLocationId || this.selectionManager.selectedShipId) {
                this.selectionManager.renderSelectedUI();
            }
            this.selectionManager.renderTechTreeProgress();
        }

        // Throttle saving the game state
        if (this.isHost) {
            this.saveStateTimer += dt;
            if (this.saveStateTimer >= this.saveStateInterval) {
                this.saveStateTimer = 0;
                this._saveState();
            }
        }

        if (this.isHost && !this.paused) {
            // Auto-generate AI reports (History Snapshot)
            this.autoReportTimer += simDt;
            if (this.autoReportTimer >= this.autoReportInterval) {
                this.autoReportTimer = 0;
                const report = this.generateAIReport();
                this.reportHistory.push(report);
                this.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Auto-generated AI Report #${this.reportHistory.length}`);
            }

            // Live AI Report (UI Update)
            this.liveReportTimer += simDt;
            if (this.liveReportTimer >= this.liveReportInterval) {
                this.liveReportTimer = 0;
                const report = this.generateAIReport();
                window.dispatchEvent(new CustomEvent('ai-report-generated', { detail: { report, history: this.reportHistory } }));
            }
        }
        
        requestAnimationFrame((t) => this.loop(t));
    }

    generateAIReport() {
        const report = {
            timestamp: new Date().toISOString(),
            gameTimeSeconds: Math.floor((this.state.gameTime || 0) / 1000),
            elapsedTime: this.state.gameTime || 0,
            players: []
        };

        this.state.players.forEach(p => {
            const myShips = this.state.ships.filter(s => s.owner === p.id);
            const shipCounts = {};
            myShips.forEach(s => {
                shipCounts[s.type] = (shipCounts[s.type] || 0) + 1;
            });

            const mySystems = this.state.systems.filter(s => s.owner === p.id);
            const myPlanets = this.state.systems.flatMap(sys => sys.planets.filter(pl => pl.owner === p.id));
            
            const planetTypeCounts = {};
            myPlanets.forEach(pl => {
                planetTypeCounts[pl.type] = (planetTypeCounts[pl.type] || 0) + 1;
            });

            const totalRes = p.totalResources || { IO: 0, minerals: 0, energy: 0, scrap: 0 };

            report.players.push({
                id: p.id,
                factionName: p.factionName,
                aiProfile: p.isAI ? (p.aiProfile || 'Unknown') : 'Human',
                aiGoal: p.isAI ? (p.aiGoal || 'Unknown') : 'Player Control',
                resources: { ...p.resources },
                totalResources: { ...totalRes },
                stats: {
                    systemsControlled: mySystems.length,
                    planetsControlled: myPlanets.length,
                    planetTypes: planetTypeCounts,
                    totalShips: myShips.length,
                    shipComposition: shipCounts,
                    techsResearched: p.researchedTechs.length,
                    fleetsFormed: p.fleets ? p.fleets.length : 0
                },
                techs: p.researchedTechs
            });
        });

        return report;
    }

    resetReportHistory() {
        this.reportHistory = [];
        if (this.storageService) this.storageService.saveReports([]);
        this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, "AI Report History reset.");
    }

    runHostLogic(dt) {
        this.performanceMonitor.start('Combat');
        this.combatService.runCombat(dt);
        this.performanceMonitor.end('Combat');
        
        this.performanceMonitor.start('Capture');
        this.combatService.runCaptureLogic(dt);
        this.performanceMonitor.end('Capture');
        
        this.runVictoryCheck(dt);
        // These methods accumulate state changes without broadcasting every frame
        this.performanceMonitor.start('Economy');
        this.economyService.runResourceGeneration(dt);
        this.economyService.runResearch(dt);
        this.economyService.runAutoRepair(dt); // Check for idle stations to assign repairs
        // These methods are event-driven and broadcast as needed
        this.economyService.runBuildQueues(dt);
        this.economyService.runRepairJobs(dt);
        this.performanceMonitor.end('Economy');
        
        this.combatService.runShieldRegen(dt);
        this.runHeatDecay(dt);
        // This method handles throttled broadcasts for economy state
        this.economyService.runPeriodicBroadcasts(dt);
    }

    runVictoryCheck(dt) {
        this.victoryCheckTimer += dt;
        if (this.victoryCheckTimer >= this.victoryCheckInterval) {
            this.victoryCheckTimer = 0;
            
            const defeatedPlayers = [];
            this.state.players.forEach(p => {
                if (p.isDead) return;

                const hasShips = this.state.ships.some(s => s.owner === p.id);
                const hasPlanets = this.state.systems.some(sys => sys.planets.some(pl => pl.owner === p.id));

                if (!hasShips && !hasPlanets) {
                    defeatedPlayers.push(p);
                }
            });

            defeatedPlayers.forEach(p => {
                p.isDead = true;
                this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `VICTORY CHECK: Player ${p.factionName} has been eliminated.`);
                this.broadcast({ 
                    type: 'GAME_TOAST', 
                    message: `${p.factionName} has been eliminated!`, 
                    toastType: 'warning' 
                });
                this.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: p.id, update: { isDead: true } });

                if (p.isAI) {
                    this.gameSetupService.replaceAIPlayer(p);
                }
            });
        }
    }

    runHeatDecay(dt) {
        const decayRate = 2 * (dt / 1000); // 2 points per second decay
        this.state.systems.forEach(sys => {
            if (sys.heat > 0) {
                sys.heat = Math.max(0, sys.heat - decayRate);
            }
        });
    }

    update(dt) {
        this.movementService.update(dt);
    }

    runAI(dt) {
        this.aiService.run(dt);
    }

    draw() {
        this.renderService.draw();
    }

    logDiagnostics(eventName, mouseEvent, coords) {
        // const { x, y } = coords;
        // const rect = this.canvas.getBoundingClientRect();

        // console.group(`[Diagnostics] - ${eventName}`);
        // console.log(`Timestamp: ${new Date().toISOString()}`);
        // console.log(`Canvas Rect: { L: ${rect.left.toFixed(2)}, T: ${rect.top.toFixed(2)}, W: ${rect.width}, H: ${rect.height} }`);
        // console.group("Pan/Zoom State");
        // console.log(`Pan: { x: ${this.pan.x.toFixed(2)}, y: ${this.pan.y.toFixed(2)} }`);
        // console.log(`Zoom: ${this.zoom.toFixed(4)}`);
        // console.groupEnd();
        // console.group("Mouse Coordinates");
        // console.log(`Client Coords: { x: ${mouseEvent.clientX}, y: ${mouseEvent.clientY} }`);
        // console.log(`Transformed World Coords: { x: ${x.toFixed(2)}, y: ${y.toFixed(2)} }`);
        // console.groupEnd();
        // console.groupEnd();
    }

    moveShip(shipId, targetId) {
        const ship = this.state.ships.find(s => s.id === shipId);
        if (ship) {
            this.movementService.moveShip(shipId, targetId);
        } else {
            this.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.WARNING, `[GameEngine] moveShip failed: Ship ${shipId} not found.`);
        }
    }

    broadcast(msg) {
        // Send to remote peers only if a data channel is open
        if (this.peerManager && this.peerManager.conn && this.peerManager.conn.open) {
            this.peerManager.send(msg);
        }

        // Process the message locally for the host to keep state and UI in sync
        if (this.isHost) {
            // This will update the engine's state
            this.handlePeerMessage(msg);
            // Dispatch a custom event that the UI layer (app.js) can listen to
            window.dispatchEvent(new CustomEvent('local-message', { detail: msg }));
            // State saving is now throttled in the main loop
        }
    }

    handlePeerMessage(data) {
        this.messageHandler.handle(data);
    }

    showScoutReport(report) {
        // This is a simple alert for now, but could be a modal.
        const shipList = report.shipTypes.join(', ') || 'None';
        alert(`Scout Report:\n- Estimated Ships: ${report.shipCount}\n- Detected Types: ${shipList}`);
    }

    setSelectedShip(shipId, openPanel = false) {
        this.selectionManager.setSelectedShip(shipId, openPanel);
    }

    setSelectedLocation(locationId, openPanel = true) {
        this.selectionManager.setSelectedLocation(locationId, openPanel);
    }

    centerOn(worldX, worldY, targetZoom) {
        this.camera.centerOn(worldX, worldY, targetZoom);
    }

    openSelectionPanel() {
        this.selectionManager.openSelectionPanel();
    }

    closeSelectionPanel() {
        this.selectionManager.closeSelectionPanel();
    }
    
    moveShipToTarget(shipId, targetId) {
        return this.movementService.moveShipToTarget(shipId, targetId);
    }
}