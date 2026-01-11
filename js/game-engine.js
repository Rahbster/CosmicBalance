import { GalaxyService, PLANET_NAMES, SHIP_DATA } from './services/GalaxyService.js';
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
import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS, FACTION_COLORS } from './cb_constants.js';


export class GameEngine {
    constructor(canvas, peerManager, profileService) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.peerManager = peerManager;
        this.profileService = profileService;
        this.isHost = true; // Assume host role by default for local play. A peer joining will have this set to false.
        
        this.state = {
            systems: [],
            ships: [],
            players: [],
            debrisFields: [],
        };

        // Try to load state from localStorage
        const savedState = localStorage.getItem('cosmic_balance_gamestate');
        if (savedState) {
            this.state = JSON.parse(savedState);
        } else {
        }

        this.loggingService = new LoggingService();
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
        
        // Host-specific view settings
        this.hostView = {
            mode: 'player', // 'player', 'god', or 'faction'
            faction: this.profileService.getTeam() // The faction to view as, defaults to own team
        };
    }

    getIdentity() {
        return this.profileService.getIdentity();
    }

    getTeam() {
        return this.profileService.getTeam();
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
            localStorage.setItem('cosmic_balance_gamestate', JSON.stringify(this.state));
            this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, "Game state saved to localStorage.");
        }
    }

    setState(newState) {
        this.state = newState;
        this.isHost = false; // Clients receiving state are not the host
        // When a new state is set, we might need to reset some local things
        this.selectionManager.selectedLocationId = null;
        this.selectionManager.selectedShipId = null;
        this.camera.pan = { x: 0, y: 0 };
        this.camera.zoom = 1;
    }

    getLocalPlayer() {
        return this.state.players.find(p => p.id === this.getIdentity().guid);
    }

    getViewingPlayerId() {
        if (this.isHost) {
            if (this.hostView.mode === 'player') {
                return this.hostView.faction; // In 'player' mode, faction holds the player ID
            }
            // For 'faction' mode, we return the Team Name (e.g. 'UNSC')
            if (this.hostView.mode === 'faction') {
                return this.hostView.faction;
            }
        }
        return this.getIdentity().guid; // Default to the local player's own ID
    }

    getLocalPlayerTechBase() {
        const localPlayer = this.getLocalPlayer();
        return localPlayer ? localPlayer.team : this.getTeam();
    }

    async createNewGame({ numSystems, aiPlayers, twoWayDensity, oneWayDensity, resourceRate, shipSpeedRate }) {
    
        this.isHost = true;

        const availableColors = [...FACTION_COLORS];
        const humanColor = availableColors.splice(0, 1)[0];

        this.state.players = [
            { 
                id: this.getIdentity().guid, 
                factionName: this.getIdentity().name,
                team: this.getIdentity().name, // Faction Name (Alliance)
                techBase: this.getTeam(), // Tech Tree / Visuals
                color: humanColor,
                isAI: false, 
                resources: { IO: 100, minerals: 50, food: 200, scrap: 100, energy: 50 }, 
                researchedTechs: [], 
                researchQueue: [], 
                fleets: [] 
            },
            // Add resources to AI players
            ...aiPlayers.map((p, i) => ({ ...p, factionName: `AI Overlord ${i + 1}`, color: availableColors.splice(0, 1)[0], resources: { IO: 100, minerals: 50, food: 200, scrap: 100, energy: 50 }, researchedTechs: [], researchQueue: [], fleets: [] }))
        ];
        this.state.systems = this.galaxyService.generateGalaxyMap(numSystems, twoWayDensity, oneWayDensity);
        this.state.ships = [];
        this.state.debrisFields = [];
        this.selectedLocationId = null;
        this.selectedShipId = null;
        this.state.settings = {
            resourceRate: resourceRate || 1.0,
            shipSpeedRate: shipSpeedRate || 1.0
        };

        await this.techService.loadTechData(); // Pre-load tech data for the host.
        await this.spriteService.loadSprites(); // Pre-load sprites

        // --- Assign Home Systems ---
        const availableSystems = [...this.state.systems];
        this.state.players.forEach(player => {
            if (availableSystems.length > 0) {
                // 1. Pick a random system
                const index = Math.floor(Math.random() * availableSystems.length);
                const homeSystem = availableSystems.splice(index, 1)[0];

                // 2. Assign ownership
                homeSystem.owner = player.id; // Owner is now player ID

                // 2.5 Assign ownership of the first planet in the home system
                if (homeSystem.planets && homeSystem.planets.length > 0) {
                    const homePlanet = homeSystem.planets[0];
                    homePlanet.owner = player.id;
                    homePlanet.captureProgress = 100;
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
        const homeSystem = this.state.systems.find(s => s.owner === localPlayer.id);
        if (homeSystem) {
            this.camera.centerOn(homeSystem.x, homeSystem.y, 1);
        }

        return this.state;
    }

    resetGame() {
        localStorage.removeItem('cosmic_balance_gamestate');
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

    // Client-side method to request a ship spawn from the host
    requestBuild(shipType, count = 1) {
        this.economyService.requestBuild(shipType, count);
    }

    // Internal method to create and broadcast a ship. Does not handle costs.
    _spawnShip(owner, type, position, spawnInSystem = null) {
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
        requestAnimationFrame((t) => this.loop(t));
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.draw();
    }

    loop(timestamp) {
        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        if (this.isHost) {
            this.runHostLogic(dt);
            this.runAI(dt);
        }

        this.update(dt);
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
        this.saveStateTimer += dt;
        if (this.isHost && this.saveStateTimer >= this.saveStateInterval) {
            this.saveStateTimer = 0;
            this._saveState();
        }
        
        requestAnimationFrame((t) => this.loop(t));
    }

    runHostLogic(dt) {
        this.combatService.runCombat(dt);
        this.combatService.runCaptureLogic(dt);
        // These methods accumulate state changes without broadcasting every frame
        this.economyService.runResourceGeneration(dt);
        this.economyService.runResearch(dt);
        // These methods are event-driven and broadcast as needed
        this.economyService.runBuildQueues(dt);
        this.economyService.runRepairJobs(dt);
        this.combatService.runShieldRegen(dt);
        // This method handles throttled broadcasts for economy state
        this.economyService.runPeriodicBroadcasts(dt);
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
        if (this.peerManager && this.peerManager.dataChannel && this.peerManager.dataChannel.readyState === 'open') {
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
                    Object.assign(player, data.update);
                    // If the updated player is the local player, update the UI
                    if (player.id === getIdentity().guid) {
                        setVal('faction-name-input', player.factionName);
                    }
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
        } else if (data.type === 'GAME_REQUEST_DISBAND_FLEET') {
            this.fleetService.handleDisbandFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_MOVE_FLEET') {
            this.fleetService.handleMoveFleetRequest(data);
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