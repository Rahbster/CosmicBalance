import { GalaxyService, SHIP_DATA, PLANET_TYPES } from './services/GalaxyService.js';
import { InteractionService } from './services/InteractionService.js';
import { RenderService } from './services/RenderService.js';
import { AIService, AI_PROFILES } from './services/AIService.js';
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
import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS, FACTION_COLORS, DEFAULT_SHIP_DESIGNS } from './cb_constants.js';


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
        const { numSystems, aiPlayers, humanPlayers, twoWayDensity, oneWayDensity, resourceRate, shipSpeedRate, isSpectator, isSymmetric } = config;
    
        this.isHost = true;
        this.paused = false; // Explicitly reset pause state for a new game
        this.timeScale = 1.0;
        this.state.gameConfig = config;

        const availableColors = [...FACTION_COLORS];
        
        this.state.players = [];
        this.state.gameTime = 0;

        if (humanPlayers && humanPlayers.length > 0) {
            humanPlayers.forEach(human => {
                const humanColor = availableColors.splice(0, 1)[0];
                this.state.players.push({
                    id: human.guid,
                    factionName: human.name,
                    team: human.name,
                    techBase: human.team || 'UNSC', // Use the human's team, fallback to UNSC
                    color: humanColor,
                    isAI: false,
                    resources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
                    totalResources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
                    researchedTechs: [],
                    researchQueue: [],
                    fleets: [],
                    designs: []
                });
            });
        }

        if (isSpectator) {
            this.hostView.mode = 'god';
            this.hostView.selectedPlayerIds = [];
        } else {
            this.hostView.mode = 'player';
            this.hostView.selectedPlayerIds = [this.getIdentity().guid];
        }

        // Add resources to AI players
        const profileKeys = Object.keys(AI_PROFILES);
        
        // Shuffle profiles to ensure random matchups, especially for symmetric maps
        for (let i = profileKeys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [profileKeys[i], profileKeys[j]] = [profileKeys[j], profileKeys[i]];
        }

        this.state.players.push(...aiPlayers.map((p, i) => {
            const profileKey = profileKeys[i % profileKeys.length];
            const profileName = AI_PROFILES[profileKey].name;
            return { 
                ...p, 
                factionName: `${profileName} AI ${i + 1}`, 
                aiProfile: profileKey,
                color: availableColors.splice(0, 1)[0], 
                resources: { IO: 500, minerals: 200, scrap: 200, energy: 200 }, 
                totalResources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
                researchedTechs: [], 
                researchQueue: [], 
                fleets: [],
                designs: []
            };
        }));

        this.state.systems = this.galaxyService.generateGalaxyMap(numSystems, twoWayDensity, oneWayDensity, isSymmetric, this.state.players.length);
        this.state.ships = [];
        this.state.debrisFields = [];
        this.selectedLocationId = null;
        this.selectedShipId = null;
        this.reportHistory = [];
        if (this.storageService) this.storageService.saveReports([]); // Clear reports
        this.state.settings = {
            resourceRate: resourceRate || 1.0,
            shipSpeedRate: shipSpeedRate || 1.0
        };

        await this.techService.loadTechData(); // Pre-load tech data for the host.
        await this.spriteService.loadSprites(); // Pre-load sprites

        // --- Assign Home Systems ---
        const availableSystems = [...this.state.systems];
        
        // If symmetric, we assume the galaxy service returned systems in slices.
        // Player i gets the first system of Slice i.
        const stride = isSymmetric ? Math.floor(this.state.systems.length / this.state.players.length) : 0;

        this.state.players.forEach((player, i) => {
            if (availableSystems.length > 0) {
                let homeSystem;
                
                if (isSymmetric) {
                    // Deterministic assignment for symmetry
                    // The systems array is generated slice by slice.
                    homeSystem = this.state.systems[i * stride];
                } else {
                    // 1. Pick a random system
                    const index = Math.floor(Math.random() * availableSystems.length);
                    homeSystem = availableSystems.splice(index, 1)[0];
                }

                if (!homeSystem) return;

                // 2. Assign ownership
                homeSystem.owner = player.id; // Owner is now player ID

                // 2.5 Assign ownership of the first planet in the home system
                if (homeSystem.planets && homeSystem.planets.length > 0) {
                    const homePlanet = homeSystem.planets[0];
                    homePlanet.owner = player.id;
                    homePlanet.captureProgress = 100;
                    homePlanet.type = 'Terran'; // Force fair start
                }

                // 3. Reveal system to owner
                if (!homeSystem.visibility) homeSystem.visibility = {};
                homeSystem.visibility[player.id] = 'explored';

                // 4. Spawn starting units (Station + Scout)
                this._spawnShip(player, 'SpaceStation', { x: homeSystem.x, y: homeSystem.y }, homeSystem);
                this._spawnShip(player, 'Scout', { x: homeSystem.x + 30, y: homeSystem.y + 30 }, homeSystem);
            }
        });

        this._saveState();

        // Center the camera on the local player's home system
        const localPlayer = this.getLocalPlayer();
        if (localPlayer) {
            const homeSystem = this.state.systems.find(s => s.owner === localPlayer.id);
            if (homeSystem) {
                this.camera.centerOn(homeSystem.x, homeSystem.y, 1);
            }
        } else if (this.state.systems.length > 0) {
            // Spectator mode: Center on the first system
            const firstSystem = this.state.systems[0];
            this.camera.centerOn(firstSystem.x, firstSystem.y, 0.5);
        }

        return this.state;
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

    requestMoveFleet(fleetId, targetSystemId) {
        const request = {
            type: 'GAME_REQUEST_MOVE_FLEET',
            senderId: this.getIdentity().guid,
            fleetId,
            targetSystemId
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
        if (!this.isHost) return;

        // 1. Check if player already exists (Re-join)
        let player = this.state.players.find(p => p.id === id);
        if (player) {
            this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `Player ${name} re-joined.`);
            player.factionName = name; // Update name in case it changed
            this.peerManager.send({ type: 'GAME_SET_STATE', state: this.state });
            return;
        }

        if (role === 'spectator') {
            this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `User ${name} joined as Spectator.`);
            this.broadcast({ type: 'GAME_TOAST', message: `${name} joined as spectator.`, toastType: 'info' });
            this.peerManager.send({ type: 'GAME_SET_STATE', state: this.state });
            return;
        }

        // 2. Try to convert an AI player to Human (Drop-in)
        const aiPlayer = this.state.players.find(p => p.isAI && !p.isDead);
        if (aiPlayer) {
            this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `Converting AI ${aiPlayer.factionName} to Human Player ${name}`);
            
            aiPlayer.id = id;
            aiPlayer.factionName = name;
            aiPlayer.isAI = false;
            delete aiPlayer.aiProfile; // Remove AI behavior
            delete aiPlayer.aiGoal;

            // Notify everyone of the update
            this.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: id, update: aiPlayer });
            this.broadcast({ type: 'GAME_TOAST', message: `${name} has joined the game!`, toastType: 'success' });
            
            // Send full state to the new player
            this.peerManager.send({ type: 'GAME_SET_STATE', state: this.state });
            return;
        }

        // 3. If no AI to convert, try to spawn new (if map allows)
        const unownedSystem = this.state.systems.find(s => !s.owner && (!s.planets || !s.planets.some(p => p.owner)));
        
        if (unownedSystem) {
            const availableColors = FACTION_COLORS.filter(c => !this.state.players.some(p => p.color === c));
            const color = availableColors.length > 0 ? availableColors[0] : '#FFFFFF';

            const newPlayer = {
                id: id, factionName: name, team: name, techBase: 'UNSC', color: color, isAI: false,
                resources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
                totalResources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
                researchedTechs: [], researchQueue: [], fleets: [], designs: []
            };

            this.state.players.push(newPlayer);
            this._spawnShip(newPlayer, 'SpaceStation', { x: unownedSystem.x, y: unownedSystem.y }, unownedSystem);
            this._spawnShip(newPlayer, 'Scout', { x: unownedSystem.x + 30, y: unownedSystem.y + 30 }, unownedSystem);
            
            unownedSystem.owner = newPlayer.id;
            unownedSystem.visibility[newPlayer.id] = 'explored';
            
            this.peerManager.send({ type: 'GAME_SET_STATE', state: this.state });
        } else {
            // Game full - Spectator
            this.peerManager.send({ type: 'GAME_SET_STATE', state: this.state });
            if (window.toastManager) window.toastManager.show(`Game full! ${name} joined as spectator.`, 'warning');
        }
    }

    // Internal method to create and broadcast a ship. Does not handle costs.
    _spawnShip(owner, type, position, spawnInSystem = null, overrides = {}) {
        const id = crypto.randomUUID();
        const baseData = { ...SHIP_DATA[type] }; // Create a mutable copy
        const ownerPlayer = this.state.players.find(p => p.id === owner.id);

        const modifiedData = this.techService.applyTechToShipData(baseData, ownerPlayer);
        
        // Calculate position
        let x = position.x;
        let y = position.y;

        if (spawnInSystem && type !== 'SpaceStation') {
            // Spawn radially around the star to avoid clutter
            const angle = Math.random() * 2 * Math.PI;
            const minSpawnDist = spawnInSystem.r + 25; // Star radius + buffer
            const maxSpawnDist = this.spatialService.getSystemEffectiveRadius(spawnInSystem) * 0.6;
            const dist = minSpawnDist + Math.random() * (Math.max(minSpawnDist + 10, maxSpawnDist) - minSpawnDist);
            
            x = spawnInSystem.x + Math.cos(angle) * dist;
            y = spawnInSystem.y + Math.sin(angle) * dist;
        } else {
            // Standard jitter for stations or deep space spawns
            x += (Math.random() * 40 - 20);
            y += (Math.random() * 40 - 20);
        }

        // If a system context is provided, ensure the ship spawns inside it (clamping max distance)
        if (spawnInSystem) {
            const dx = x - spawnInSystem.x;
            const dy = y - spawnInSystem.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = this.spatialService.getSystemEffectiveRadius(spawnInSystem) - 5; // 5px buffer

            if (dist > maxDist) {
                const angle = Math.atan2(dy, dx);
                x = spawnInSystem.x + Math.cos(angle) * maxDist;
                y = spawnInSystem.y + Math.sin(angle) * maxDist;
            }
        }

        const ship = {
            id: id,
            owner: owner.id,
            type: type,
            color: owner.color,
            team: owner.team,
            techBase: owner.techBase,
            x: x,
            y: y,
            hull: Math.round(modifiedData.maxHull),
            maxHull: Math.round(modifiedData.maxHull),
            shield: Math.round(modifiedData.maxShield),
            maxShield: Math.round(modifiedData.maxShield),
            damage: modifiedData.damage,
            targetId: null,
            sublight: modifiedData.sublight,
            warp: modifiedData.warp,
            isStation: !!baseData.isStation,
            fleetId: null,
            moveState: SHIP_STATE.IDLE,
            vintageTechs: ownerPlayer ? [...ownerPlayer.researchedTechs] : [],
            currentSystemId: null,
            ...overrides
        };

        if (ship.isStation) {
            ship.buildQueue = [];
        }
        
        this.broadcast({ type: 'GAME_SPAWN', ship });

        // Set initial system after broadcasting spawn so clients can do the same
        if (spawnInSystem) {
            ship.currentSystemId = spawnInSystem.id;
        } else {
            const detectedSystem = this.state.systems.find(s => {
                const dx = s.x - ship.x;
                const dy = s.y - ship.y;
                return (dx * dx + dy * dy) <= (this.spatialService.getSystemEffectiveRadius(s) ** 2);
            });
            if (detectedSystem) ship.currentSystemId = detectedSystem.id;
        }
        return ship;
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
        const dt = Math.max(0, timestamp - this.lastTime);
        this.lastTime = timestamp;

        // Simulation delta time. If paused, simulation stops.
        const simDt = this.paused ? 0 : dt * (this.timeScale || 1.0);

        // Update gameTime for both host and client to drive animations
        this.state.gameTime = (this.state.gameTime || 0) + simDt;
        
        if (this.isHost && !this.paused) {
            this.runHostLogic(simDt);
            this.runAI(simDt);
        }

        if (!this.paused) {
            this.update(simDt);
        }

        this.camera.updateAnimation(timestamp);
        this.draw();

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
        this.combatService.runCombat(dt);
        this.combatService.runCaptureLogic(dt);
        this.runVictoryCheck(dt);
        // These methods accumulate state changes without broadcasting every frame
        this.economyService.runResourceGeneration(dt);
        this.economyService.runResearch(dt);
        this.economyService.runAutoRepair(dt); // Check for idle stations to assign repairs
        // These methods are event-driven and broadcast as needed
        this.economyService.runBuildQueues(dt);
        this.economyService.runRepairJobs(dt);
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
                    this.replaceAIPlayer(p);
                }
            });
        }
    }

    replaceAIPlayer(deadPlayer) {
        // Find a system with no owner and no planet owners
        const unownedSystems = this.state.systems.filter(s => !s.owner && (!s.planets || !s.planets.some(pl => pl.owner)));
        
        if (unownedSystems.length === 0) {
            // No room for new AI. Remove the dead player to clean up.
            this.state.players = this.state.players.filter(p => p.id !== deadPlayer.id);
            this.broadcast({ type: 'GAME_SET_STATE', state: this.state });
            return;
        }

        const unownedSystem = unownedSystems[Math.floor(Math.random() * unownedSystems.length)];
        
        // Pick a new profile
        const profileKeys = Object.keys(AI_PROFILES);
        let newProfileKey = profileKeys[Math.floor(Math.random() * profileKeys.length)];
        // Try to avoid the same profile if possible
        if (profileKeys.length > 1 && newProfileKey === deadPlayer.aiProfile) {
             const otherKeys = profileKeys.filter(k => k !== deadPlayer.aiProfile);
             if (otherKeys.length > 0) {
                 newProfileKey = otherKeys[Math.floor(Math.random() * otherKeys.length)];
             }
        }
        const profileName = AI_PROFILES[newProfileKey].name;

        // Create new player
        const newId = `AI_${crypto.randomUUID().split('-')[0]}`;
        // Ensure unique name
        let nameSuffix = 1;
        let newName = `${profileName} AI ${nameSuffix}`;
        while (this.state.players.some(p => p.factionName === newName)) {
            nameSuffix++;
            newName = `${profileName} AI ${nameSuffix}`;
        }

        const newPlayer = {
            id: newId,
            factionName: newName,
            team: newName,
            techBase: 'COVENANT', // AI Default
            color: deadPlayer.color, // Reuse color
            isAI: true,
            aiProfile: newProfileKey,
            resources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
            totalResources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
            researchedTechs: [],
            researchQueue: [],
            fleets: [],
            designs: []
        };

        this.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Replacing ${deadPlayer.factionName} with ${newPlayer.factionName} in ${unownedSystem.name}`);

        // Replace in array
        const idx = this.state.players.indexOf(deadPlayer);
        if (idx !== -1) {
            this.state.players[idx] = newPlayer;
        } else {
            this.state.players.push(newPlayer);
        }

        // Setup System
        unownedSystem.owner = newPlayer.id;
        unownedSystem.visibility[newPlayer.id] = 'explored';
        
        // Claim a planet
        if (unownedSystem.planets && unownedSystem.planets.length > 0) {
            const homePlanet = unownedSystem.planets[0];
            homePlanet.owner = newPlayer.id;
            homePlanet.captureProgress = 100;
        }

        // Spawn Ships
        this._spawnShip(newPlayer, 'SpaceStation', { x: unownedSystem.x, y: unownedSystem.y }, unownedSystem);
        this._spawnShip(newPlayer, 'Scout', { x: unownedSystem.x + 30, y: unownedSystem.y + 30 }, unownedSystem);

        this.broadcast({ 
            type: 'GAME_TOAST', 
            message: `A new faction, ${newPlayer.factionName}, has entered the galaxy!`, 
            toastType: 'info' 
        });
        
        // Full state update required because player list changed
        this.broadcast({ type: 'GAME_SET_STATE', state: this.state });
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
        if (data.type === 'GAME_SPAWN') {
            this.state.ships.push(data.ship);
        } else if (data.type === 'GAME_SET_PAUSE') {
            console.log(`[GameEngine] Handling GAME_SET_PAUSE. Paused: ${data.paused}`);
            this.paused = data.paused;
            if (window.toastManager) {
                window.toastManager.show(this.paused ? "Game Paused" : "Game Resumed", 'info');
            }
            if (this.isHost) this._saveState();
        } else if (data.type === 'GAME_SET_SPEED') {
            this.timeScale = data.speed;
            // UI update is handled via 'local-message' event in app.js or direct binding
        } else if (data.type === 'GAME_MOVE') {
            const ship = this.state.ships.find(s => s.id === data.shipId);
            if (ship) {
                ship.moveState = data.moveState;
                ship.targetId = data.targetId;
                ship.arrivalPoint = data.arrivalPoint;
                ship.currentSystemId = null;
                if (data.navigationPath) ship.navigationPath = data.navigationPath;
                if (data.lastSystemId) ship.lastSystemId = data.lastSystemId;
                // Also clear patrol state when a move order is given
                if (ship.patrolSystemId) delete ship.patrolSystemId;
                if (ship.patrolTarget) delete ship.patrolTarget;
            }
        } else if (data.type === 'GAME_SHIP_UPDATE') {
            const ship = this.state.ships.find(s => s.id === data.shipId);
            if (ship) {
                // Update all possible properties from the message
                Object.keys(data).forEach(key => {
                    if (key !== 'type' && key !== 'shipId') {
                        if (key === 'isRepairing' && data[key] === false) {
                            delete ship.isRepairing; delete ship.repairTimer; delete ship.totalRepairTime;
                        } else if (key === 'patrolSystemId' && data[key] === null) {
                            delete ship.patrolSystemId;
                            delete ship.patrolTarget;
                        } else if (key === 'scoutMission' && data[key] === null) {
                            delete ship.scoutMission;
                        } else if (key === 'salvageMission' && data[key] === null) {
                            delete ship.salvageMission;
                        } else {
                            ship[key] = data[key];
                        }
                    }
                });
            }
        } else if (data.type === 'GAME_SHIPS_DESTROYED') {
            this.state.ships = this.state.ships.filter(s => !data.shipIds.includes(s.id));
            if (this.selectionManager.selectedShipId && data.shipIds.includes(this.selectionManager.selectedShipId)) {
                this.selectionManager.selectedShipId = null;
                this.selectionManager.renderSelectedUI(); // Immediately hide the panel
            }
        } else if (data.type === 'GAME_DEBRIS_CREATED') {
            this.state.debrisFields.push(data.debris);
        } else if (data.type === 'GAME_DEBRIS_REMOVED') {
            this.state.debrisFields = this.state.debrisFields.filter(d => !data.debrisIds.includes(d.id));
        } else if (data.type === 'GAME_PLAYER_UPDATE') {
            const player = this.state.players.find(p => p.id === data.playerId);
            if (player) {
                if (data.resources) player.resources = data.resources;
                if (data.researchQueue) player.researchQueue = data.researchQueue;
                if (data.update) {
                    if (data.update.designs) player.designs = data.update.designs;
                    Object.assign(player, data.update);
                }
            }
        } else if (data.type === 'GAME_REQUEST_BUILD') {
            // A client is requesting to spawn a ship. Only the host will process this.
            this.economyService.handleBuildRequest(data);
        } else if (data.type === 'GAME_BUILD_QUEUE_UPDATE') {
            let location = this.state.systems.find(sys => sys.id === data.locationId);
            if (!location) location = this.state.ships.find(s => s.id === data.locationId);
            if (location) {
                location.buildQueue = data.queue;
                if (this.selectionManager.selectedLocationId === location.id) this.selectionManager.renderSelectedUI();
            }
        } else if (data.type === 'GAME_SCOUT_REPORT') {
            const system = this.state.systems.find(sys => sys.id === data.systemId);
            if (system && data.team === this.getTeam()) {
                system.scoutReport = data;
                // Re-render UI if this planet is selected
                if (this.selectionManager.selectedLocationId === system.id) this.selectionManager.renderSelectedUI();
            }
        } else if (data.type === 'GAME_REQUEST_RESEARCH') {
            this.economyService.handleResearchRequest(data);
        } else if (data.type === 'GAME_REQUEST_PLAYER_UPDATE') {
            this.handlePlayerUpdateRequest(data);
        } else if (data.type === 'GAME_REQUEST_SCOUT_MISSION') {
            this.movementService.handleScoutMissionRequest(data);
        } else if (data.type === 'GAME_REQUEST_SALVAGE_MISSION') {
            this.movementService.handleSalvageMissionRequest(data);
        } else if (data.type === 'GAME_REQUEST_CANCEL_BUILD') {
            this.economyService.handleCancelBuildRequest(data);
        } else if (data.type === 'GAME_REQUEST_PATROL') {
            this.movementService.handlePatrolRequest(data);
        } else if (data.type === 'GAME_REQUEST_STOP_PATROL') {
            this.movementService.handleStopPatrolRequest(data);
        } else if (data.type === 'GAME_REQUEST_REPAIR_SHIP') {
            this.economyService.handleRepairShipRequest(data);
        } else if (data.type === 'GAME_TECH_RESEARCHED') {
            const player = this.state.players.find(p => p.id === data.playerId);
            if (player && !player.researchedTechs.includes(data.techId)) {
                player.researchedTechs.push(data.techId);
            }
        } else if (data.type === 'GAME_REQUEST_CREATE_FLEET') {
            this.fleetService.handleCreateFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_UPDATE_FLEET_SHIPS') {
            this.fleetService.handleUpdateFleetShipsRequest(data);
        } else if (data.type === 'GAME_REQUEST_DISBAND_FLEET') {
            this.fleetService.handleDisbandFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_MOVE_FLEET') {
            this.fleetService.handleMoveFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_RENAME_FLEET') {
            this.fleetService.handleRenameFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_SELF_DESTRUCT') {
            this.combatService.handleSelfDestructRequest(data);
        } else if (data.type === 'GAME_FLEET_UPDATE') {
            const player = this.state.players.find(p => p.id === data.playerId);
            if (player) player.fleets = data.fleets;
            if (data.updatedShips) {
                data.updatedShips.forEach(shipUpdate => {
                    const ship = this.state.ships.find(s => s.id === shipUpdate.id);
                    if (ship) ship.fleetId = shipUpdate.fleetId;
                });
            }
        } else if (data.type === 'GAME_PLANET_UPDATE') {
            for (const system of this.state.systems) {
                const planet = system.planets.find(p => p.id === data.planetId);
                if (planet) {
                    if (data.owner !== undefined) planet.owner = data.owner;
                    if (data.captureProgress !== undefined) planet.captureProgress = data.captureProgress;
                    if (data.capturingTeam !== undefined) planet.capturingTeam = data.capturingTeam;
                    if (data.systemOwner !== undefined && (!data.systemId || data.systemId === system.id)) {
                        system.owner = data.systemOwner;
                    }
                    break;
                }
            }
        } else if (data.type === 'GAME_SYSTEM_RENAMED' || data.type === 'GAME_PLANET_RENAMED') {
            const system = this.state.systems.find(sys => sys.id === data.systemId);
            if (system) {
                system.name = data.newName;
            }
        } else if (data.type === 'GAME_REVEAL') {
            const system = this.state.systems.find(sys => sys.id === data.systemId);
            if (system && data.playerId === this.getIdentity().guid) {
                system.visibility[data.playerId] = data.visibility;
                if (data.neighbors) {
                    data.neighbors.forEach(linkTargetId => {
                        const neighbor = this.state.systems.find(sys => sys.id === linkTargetId);
                        // Only update if it's currently unexplored
                        if (neighbor && !neighbor.visibility[data.playerId]) neighbor.visibility[data.playerId] = 'scouted';
                    });
                }
            }
        } else if (data.type === 'GAME_SCOUT_REPORT') {
            if (data.playerId === this.getIdentity().guid) {
                // This is a report for me. The global function is on window.
                if (window.showScoutReport) {
                    window.showScoutReport(data.report);
                }
            }
        } else if (data.type === 'GAME_TOAST') {
            if (data.playerId === this.getIdentity().guid) {
                if (window.toastManager) {
                    window.toastManager.show(data.message, data.toastType || 'info');
                }
            }
        }
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