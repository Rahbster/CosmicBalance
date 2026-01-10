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

export class GameEngine {
    constructor(canvas, peerManager, getIdentity, getTeam) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.peerManager = peerManager;
        this.getIdentity = getIdentity;
        this.getTeam = getTeam;
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
            console.log("Loaded saved game state from localStorage.");
        } else {
            console.log("No saved game state found. Initializing empty state.");
        }

        if (this.state.systems.length > 0) {
            console.groupCollapsed(`[GameEngine] Initial State - ${this.state.systems.length} Systems, ${this.state.ships.length} Ships`);
            this.state.systems.forEach(s => console.log(`System: ${s.name} (${s.id}) at ${s.x.toFixed(0)},${s.y.toFixed(0)}`));
            this.state.ships.forEach(s => console.log(`Ship: ${s.type} (${s.id}) at ${s.x.toFixed(0)},${s.y.toFixed(0)}`));
            console.groupEnd();
        }

        this.galaxyService = new GalaxyService(this.canvas);
        this.spriteService = new SpriteService();
        this.renderService = new RenderService(this.canvas, this, this.spriteService);
        this.interactionService = new InteractionService(this.canvas, this);
        this.aiService = new AIService(this);
        this.fleetService = new FleetService(this);
        this.combatService = new CombatService(this);
        this.economyService = new EconomyService(this);
        this.movementService = new MovementService(this);
        this.loggingService = new LoggingService();
        
        this.selectedShipId = null;
        this.selectedLocationId = null;
        this.lastTime = 0;
        this.uiUpdateTimer = 0;
        this.uiUpdateInterval = 500; // Update UI twice a second
        this.saveStateTimer = 0;
        this.saveStateInterval = 5000; // Save state every 5 seconds
        
        // Pan and Zoom state
        this.pan = { x: 0, y: 0 };
        this.zoom = 1;

        // Animation state
        this.isAnimating = false;
        this.animationStartTime = 0;
        this.animationDuration = 700; // ms
        this.panStart = { x: 0, y: 0 };
        this.panEnd = { x: 0, y: 0 };
        this.zoomStart = 1;
        this.zoomEnd = 1;

        // Host-specific view settings
        this.hostView = {
            mode: 'player', // 'player', 'god', or 'faction'
            faction: this.getTeam() // The faction to view as, defaults to own team
        };
    }

    _isShipInSystem(ship, system) {
        const dx = system.x - ship.x;
        const dy = system.y - ship.y;
        // Using effective radius is more accurate for ships orbiting
        return (dx * dx + dy * dy) <= (this.getSystemEffectiveRadius(system) ** 2);
    }

    getSystemEffectiveRadius(system) {
        // A system must have a radius `r` and a `planets` array.
        if (!system || typeof system.r === 'undefined' || !Array.isArray(system.planets)) {
            // If it's not a valid system object, it has no effective radius for orbiting ships.
            // This can happen if a station is mistakenly passed.
            return 0;
        }
        const r = system.r;
        const orbitBase = r + 10;
        const planetGap = 8;
        const planetCount = system.planets.length; // Safe now due to check above
        // The max distance a planet can be from the star's center
        const maxOrbitDist = planetCount > 0 ? orbitBase + ((planetCount - 1) * planetGap) : r;
        // Add a little buffer for the planet's own radius (3px in RenderService) and some padding
        return maxOrbitDist + 5;
    }

    getCurrentSystem(ship) {
        // A ship in transit is not "in" any system.
        // A ship is considered in transit if it has a warp target.
        // We allow arrivalPoint (sublight) to be considered in-system so ships don't appear lost while parking.
        if (ship.targetId) {
            return null;
        }

        // If a ship has no target, but is still marked as MOVING, its state is inconsistent.
        // This is a defensive check to fix ships that get "stuck" in a moving state.
        // This prevents them from being lost in the UI.
        if (ship.moveState === 'MOVING' && !ship.arrivalPoint) {
            console.warn(`Correcting stuck 'MOVING' state for idle ship ${ship.id}`);
            ship.moveState = 'IDLE';
        }
    
        // If it has a "sticky" current system and is still inside, trust that.
        if (ship.currentSystemId) {
            const lastSystem = this.state.systems.find(s => s.id === ship.currentSystemId);
            if (lastSystem && this._isShipInSystem(ship, lastSystem)) {
                return lastSystem;
            }
        }
    
        // If no sticky system or it has left the radius, find the new closest one.
        let bestSystem = null;
        let minDistSq = Infinity;
    
        for (const system of this.state.systems) {
            if (this._isShipInSystem(ship, system)) {
                const dx = system.x - ship.x;
                const dy = system.y - ship.y;
                const distSq = dx * dx + dy * dy;
                
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    bestSystem = system;
                }
            }
        }
        
        // Update the sticky ID for next time.
        ship.currentSystemId = bestSystem ? bestSystem.id : null;
        return bestSystem;
    }

    getClosestSystem(entity) {
        let closestSystem = null;
        let minDistanceSq = Infinity;

        for (const system of this.state.systems) {
            const dx = system.x - entity.x;
            const dy = system.y - entity.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                closestSystem = system;
            }
        }
        return closestSystem;
    }

    _applyTechToShipData(baseData, ownerPlayer) {
        const modifiedData = { ...baseData };
        if (this._techData && ownerPlayer && ownerPlayer.researchedTechs.length > 0) {
            ownerPlayer.researchedTechs.forEach(techId => {
                const tech = this._techData[ownerPlayer.team]?.[techId];
                if (tech && tech.effects) {
                    tech.effects.forEach(effect => {
                        if (effect.target === 'ALL_SHIPS') {
                            if (effect.type === 'HULL_MODIFIER') modifiedData.maxHull *= effect.value;
                            else if (effect.type === 'SHIELD_MODIFIER') modifiedData.maxShield *= effect.value;
                            else if (effect.type === 'DAMAGE_MODIFIER') modifiedData.damage *= effect.value;
                            else if (effect.type === 'SUBLIGHT_MODIFIER') modifiedData.sublight *= effect.value;
                            else if (effect.type === 'WARP_MODIFIER') modifiedData.warp *= effect.value;
                        }
                    });
                }
            });
        }
        return modifiedData;
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

    requestRepairShipGroup(shipType, serviceType) {
        const localPlayer = this.getLocalPlayer();
        if (!this.selectedLocationId || !localPlayer) return;

        let location = this.state.systems.find(s => s.id === this.selectedLocationId);
        if (!location) {
            location = this.state.ships.find(s => s.id === this.selectedLocationId && s.isStation);
        }
        if (!location) return;

        const systemContext = location.isStation 
            ? this.state.systems.find(sys => this._isShipInSystem(location, sys))
            : location;
        
        if (!systemContext) return;

        const dockedShips = this.state.ships.filter(s => 
            s.owner === localPlayer.id && 
            s.type === shipType &&
            !s.isStation && 
            !s.targetId && 
            !s.isRepairing && // Don't re-request for ships already being serviced
            this._isShipInSystem(s, systemContext)
        );

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
            console.log("Game state saved to localStorage.");
        }
    }

    setState(newState) {
        this.state = newState;
        this.isHost = false; // Clients receiving state are not the host
        // When a new state is set, we might need to reset some local things
        this.selectedLocationId = null;
        this.pan = { x: 0, y: 0 };
        this.zoom = 1;
        this.selectedShipId = null;
    }

    getLocalPlayer() {
        return this.state.players.find(p => p.id === this.getIdentity().guid);
    }

    getViewingPlayerId() {
        if (this.isHost && this.hostView.mode === 'faction') {
            return this.hostView.faction; // this is a player ID
        }
        return this.getIdentity().guid; // Default to the local player's own ID
    }

    getLocalPlayerTechBase() {
        const localPlayer = this.getLocalPlayer();
        return localPlayer ? localPlayer.team : this.getTeam();
    }

    async createNewGame({ numSystems, aiPlayers, twoWayDensity, oneWayDensity, resourceRate }) {
    
        this.isHost = true;

        const availableColors = [...FACTION_COLORS];
        const humanColor = availableColors.splice(0, 1)[0];

        this.state.players = [
            { 
                id: this.getIdentity().guid, 
                factionName: this.getIdentity().name,
                team: this.getTeam(), // Tech base
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
            resourceRate: resourceRate || 1.0
        };

        await this._getTechData(); // Pre-load tech data for the host.
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
            this.centerOn(homeSystem.x, homeSystem.y, 1);
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

        const modifiedData = this._applyTechToShipData(baseData, ownerPlayer);
        
        // Calculate position with jitter
        let x = position.x + (Math.random() * 40 - 20); // Reduced jitter range (+/- 20)
        let y = position.y + (Math.random() * 40 - 20);

        // If a system context is provided, ensure the ship spawns inside it
        if (spawnInSystem) {
            const dx = x - spawnInSystem.x;
            const dy = y - spawnInSystem.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = this.getSystemEffectiveRadius(spawnInSystem) - 5; // 5px buffer

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
            moveState: 'IDLE',
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
                return (dx * dx + dy * dy) <= (this.getSystemEffectiveRadius(s) ** 2);
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
            this._getTechData()
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
        this.updateAnimation(timestamp);
        this.draw();

        // Throttle UI updates to avoid constant re-rendering, but still update timers
        this.uiUpdateTimer += dt;
        if (this.uiUpdateTimer >= this.uiUpdateInterval) {
            this.uiUpdateTimer = 0;
            if (this.selectedLocationId || this.selectedShipId) {
                this._renderSelectedUI();
            }
            this._renderTechTreeProgress();
        }

        // Throttle saving the game state
        this.saveStateTimer += dt;
        if (this.isHost && this.saveStateTimer >= this.saveStateInterval) {
            this.saveStateTimer = 0;
            this._saveState();
        }
        
        requestAnimationFrame((t) => this.loop(t));
    }

    updateAnimation(timestamp) {
        if (!this.isAnimating) return;

        const elapsed = timestamp - this.animationStartTime;
        let progress = Math.min(elapsed / this.animationDuration, 1);

        // Ease-out function for a smoother stop
        progress = 1 - Math.pow(1 - progress, 3);

        // Interpolate pan and zoom
        this.pan.x = this.panStart.x + (this.panEnd.x - this.panStart.x) * progress;
        this.pan.y = this.panStart.y + (this.panEnd.y - this.panStart.y) * progress;
        this.zoom = this.zoomStart + (this.zoomEnd - this.zoomStart) * progress;

        if (progress >= 1) {
            this.isAnimating = false;
            // Apply constraints only at the end of the animation
            this.constrainPanAndZoom();
        }
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

    constrainPanAndZoom() {
        const allSystems = this.state.systems;
        if (allSystems.length === 0) return;

        const padding = 100;
        // Use effective radius for a more accurate bounding box
        const minX = Math.min(...allSystems.map(s => s.x - this.getSystemEffectiveRadius(s))) - padding;
        const maxX = Math.max(...allSystems.map(s => s.x + this.getSystemEffectiveRadius(s))) + padding;
        const minY = Math.min(...allSystems.map(s => s.y - this.getSystemEffectiveRadius(s))) - padding;
        const maxY = Math.max(...allSystems.map(s => s.y + this.getSystemEffectiveRadius(s))) + padding;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        const minZoomX = this.canvas.width / contentWidth;
        const minZoomY = this.canvas.height / contentHeight;
        const minZoom = Math.min(minZoomX, minZoomY, 1);
        this.zoom = Math.max(this.zoom, minZoom);

        const constrained = this._getConstrainedPan(this.pan, this.zoom);
        this.pan.x = constrained.x;
        this.pan.y = constrained.y;
    }

    _getConstrainedPan(pan, zoom) {
        const allSystems = this.state.systems;
        if (allSystems.length === 0) return pan;

        const padding = 100;
        const minX = Math.min(...allSystems.map(s => s.x - this.getSystemEffectiveRadius(s))) - padding;
        const maxX = Math.max(...allSystems.map(s => s.x + this.getSystemEffectiveRadius(s))) + padding;
        const minY = Math.min(...allSystems.map(s => s.y - this.getSystemEffectiveRadius(s))) - padding;
        const maxY = Math.max(...allSystems.map(s => s.y + this.getSystemEffectiveRadius(s))) + padding;

        // Calculate the two potential boundary points for the pan.
        const boundX1 = this.canvas.width - (maxX * zoom);
        const boundX2 = -(minX * zoom);
        const boundY1 = this.canvas.height - (maxY * zoom);
        const boundY2 = -(minY * zoom);

        const newPan = { x: pan.x, y: pan.y };

        // The valid range is always between the min and max of the two bounds.
        // This standard clamp function works regardless of which bound is smaller.
        newPan.x = Math.max(Math.min(boundX1, boundX2), Math.min(pan.x, Math.max(boundX1, boundX2)));
        newPan.y = Math.max(Math.min(boundY1, boundY2), Math.min(pan.y, Math.max(boundY1, boundY2)));

        return newPan;
    }

    moveShip(shipId, targetId) {
        const ship = this.state.ships.find(s => s.id === shipId);
        if (ship) {
            this.movementService.moveShip(shipId, targetId);
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
                            delete ship.isRepairing; delete ship.repairTimer;
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
            if (this.selectedShipId && data.shipIds.includes(this.selectedShipId)) {
                this.selectedShipId = null;
                this._renderSelectedUI(); // Immediately hide the panel
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
                if (this.selectedLocationId === location.id) this._renderSelectedLocationUI();
            }
        } else if (data.type === 'GAME_SCOUT_REPORT') {
            const system = this.state.systems.find(sys => sys.id === data.systemId);
            if (system && data.team === this.getTeam()) {
                system.scoutReport = data;
                // Re-render UI if this planet is selected
                if (this.selectedLocationId === system.id) this.renderService.drawSelectedLocationUI();
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
        } else if (data.type === 'GAME_BUILD_QUEUE_UPDATE') {
            const planet = this.state.systems.find(p => p.id === data.locationId);
            if (planet) {
                planet.buildQueue = data.queue;
                if (this.selectedLocationId === planet.id) this.drawSelectedLocationUI();
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

    async _getTechData() {
        if (!this._techData) {
            const response = await fetch('./data/tech-tree.json');
            this._techData = await response.json();
        }
        return this._techData;
    }

    // --- SELECTION AND UI METHODS ---
    setSelectedShip(shipId) {
        // Force a full re-render by clearing the 'renderedFor' cache on the panel
        const container = document.getElementById('selected-planet-info');
        if (container) delete container.dataset.renderedFor;
        this.selectedLocationId = null;
        this.selectedShipId = shipId;
        this._renderSelectedUI();
    }

    setSelectedLocation(locationId) {
        // Force a full re-render by clearing the 'renderedFor' cache on the panel
        const container = document.getElementById('selected-planet-info');
        if (container) delete container.dataset.renderedFor;
        this.selectedShipId = null;
        this.selectedLocationId = locationId;
        this._renderSelectedUI();
    }

    centerOn(worldX, worldY, targetZoom) {
        // Stop any manual panning by the user
        this.interactionService.isPanning = false;
        this.canvas.style.cursor = 'default';

        // If targetZoom is not provided, use the current zoom level.
        const finalZoom = targetZoom === undefined ? this.zoom : targetZoom;

        this.panStart = { ...this.pan };
        this.zoomStart = this.zoom;

        // Calculate the IDEAL target pan to center the view
        const idealPanEnd = {
            x: this.canvas.width / 2 - worldX * finalZoom,
            y: this.canvas.height / 2 - worldY * finalZoom
        };

        // Now, get the CONSTRAINED final position and animate to that
        this.panEnd = this._getConstrainedPan(idealPanEnd, finalZoom);
        this.zoomEnd = finalZoom;
        
        this.isAnimating = true;
        this.animationStartTime = performance.now();
    }

    _renderSelectedUI() {
        if (this.selectedShipId) {
            this._renderSelectedShipUI();
        } else if (this.selectedLocationId) {
            this._renderSelectedLocationUI();
        } else {
            const container = document.getElementById('selected-planet-info');
            container.classList.add('hidden');
        }
    }

    _renderSelectedShipUI() {
        const container = document.getElementById('selected-planet-info');
        const ship = this.state.ships.find(s => s.id === this.selectedShipId);
        if (!ship) {
            container.classList.add('hidden');
            return;
        }

        const owner = this.state.players.find(p => p.id === ship.owner);
        const isOwner = owner && owner.id === this.getIdentity().guid;

        const currentSystem = this.getCurrentSystem(ship);
        const locationName = currentSystem ? currentSystem.name : 'Deep Space';

        // --- Fleet Info ---
        let fleetInfoHtml = '';
        if (ship.fleetId && owner && owner.fleets) {
            const fleet = owner.fleets.find(f => f.id === ship.fleetId);
            if (fleet) {
                fleetInfoHtml = `<p>Fleet: <strong>${fleet.name}</strong></p>`;
            }
        }

        // --- Next/Prev Logic ---
        let navHtml = '';
        if (isOwner) {
            // Find ships in the same system or general vicinity
            let siblings = [];
            if (currentSystem) {
                siblings = this.state.ships.filter(s => s.owner === ship.owner && this._isShipInSystem(s, currentSystem));
            } else {
                // Deep space: use all owned ships
                siblings = this.state.ships.filter(s => s.owner === ship.owner);
            }
            
            // Sort by ID to ensure stable order
            siblings.sort((a, b) => a.id.localeCompare(b.id));

            if (siblings.length > 1) {
                const currentIndex = siblings.findIndex(s => s.id === ship.id);
                
                const prevIndex = currentIndex - 1;
                const nextIndex = currentIndex + 1;

                const prevShip = prevIndex >= 0 ? siblings[prevIndex] : null;
                const nextShip = nextIndex < siblings.length ? siblings[nextIndex] : null;

                const prevDisabled = !prevShip ? 'disabled' : '';
                const nextDisabled = !nextShip ? 'disabled' : '';

                navHtml = `
                    <div class="ship-nav" style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <button data-action="select-ship" data-ship-id="${prevShip ? prevShip.id : ''}" ${prevDisabled}>&lt; Prev</button>
                        <button data-action="select-ship" data-ship-id="${nextShip ? nextShip.id : ''}" ${nextDisabled}>Next &gt;</button>
                    </div>
                `;
            }
        }

        // --- Actions Logic ---
        let actionsHtml = '';
        if (isOwner) {
            if (!currentSystem) { // Ship is in Deep Space
                const closestSystem = this.getClosestSystem(ship);
                if (closestSystem) {
                    // This button uses the existing 'move-ship' action handler
                    actionsHtml += `<button data-action="move-ship" data-ship-id="${ship.id}" data-target-id="${closestSystem.id}">Move to Nearest System (${closestSystem.name})</button>`;
                }
            }

            if (ship.patrolSystemId) {
                actionsHtml += `<button data-action="stop-patrol" data-ship-id="${ship.id}">Stop Patrol</button>`;
            }

            if (currentSystem) {
                if (ship.type === 'Scout' && currentSystem.owner === ship.owner && !ship.patrolSystemId) {
                     actionsHtml += `<button data-action="patrol" data-ship-id="${ship.id}" data-target-id="${currentSystem.id}">Patrol System</button>`;
                }

                const viewingPlayerId = this.getIdentity().guid;
                
                if (ship.type === 'Scout') {
                     const unexploredNeighbors = currentSystem.links
                        .map(link => this.state.systems.find(s => s.id === link.targetId))
                        .filter(neighbor => {
                            if (!neighbor) return false;
                            const vis = neighbor.visibility[viewingPlayerId];
                            return !vis || vis === 'unexplored' || vis === 'scouted';
                        });
                    
                    unexploredNeighbors.forEach(n => {
                        actionsHtml += `<button data-action="scout" data-ship-id="${ship.id}" data-target-id="${n.id}">Scout ${n.name}</button>`;
                    });
                }

                if (ship.type === 'TroopTransport') {
                     const visibleNeighbors = currentSystem.links
                        .map(link => this.state.systems.find(s => s.id === link.targetId))
                        .filter(neighbor => {
                            if (!neighbor) return false;
                            const visibility = neighbor.visibility[viewingPlayerId];
                            return visibility === 'explored' || visibility === 'scouted';
                        });

                    visibleNeighbors.forEach(n => {
                        const hasTargets = n.planets.some(p => p.owner !== viewingPlayerId);
                        if (hasTargets) {
                            actionsHtml += `<button data-action="colonize" data-ship-id="${ship.id}" data-target-id="${n.id}">Colonize ${n.name}</button>`;
                        }
                    });
                }
            }

            // Standard Navigation Options (Always available if in a system)
            if (currentSystem) {
                const neighbors = currentSystem.links.map(link => this.state.systems.find(s => s.id === link.targetId));
                if (neighbors.length > 0) {
                    actionsHtml += `<div style="width: 100%; margin-top: 10px; border-top: 1px solid #444; padding-top: 5px;"><strong>Navigation:</strong><div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">`;
                    neighbors.forEach(n => actionsHtml += `<button data-action="move-ship" data-ship-id="${ship.id}" data-target-id="${n.id}" style="font-size: 0.8em; padding: 2px 6px;">Go to ${n.name}</button>`);
                    actionsHtml += `</div></div>`;
                }
            }

            if (ship.type === 'Salvager') {
                const nearbyDebris = this.state.debrisFields.filter(d => {
                    const dx = d.x - ship.x;
                    const dy = d.y - ship.y;
                    return (dx * dx + dy * dy) < (400 * 400);
                });
                if (nearbyDebris.length > 0) {
                    actionsHtml += `<button data-action="recycle" data-ship-id="${ship.id}" data-target-id="${nearbyDebris[0].id}">Recycle Debris</button>`;
                }
            }
        }

        const radialTriggerHtml = isOwner ? `<button data-action="open-radial" data-ship-id="${ship.id}">Actions Menu</button>` : '';

        // This is where the context menu becomes a context panel.
        // We render buttons for actions.
        let html = `
            <h3>${ship.type}</h3>
            <p>Owner: ${owner?.factionName || 'Unknown'}</p>
            ${fleetInfoHtml}
            <p>Location: ${locationName}</p>
            <p>Hull: ${ship.hull} / ${ship.maxHull}</p>
            ${navHtml}
            <div class="context-actions" style="display: flex; gap: 10px; margin-top: 1rem; flex-wrap: wrap;">
                ${actionsHtml}
                ${radialTriggerHtml}
                <button data-action="ship-details" data-ship-id="${ship.id}">Details</button>
                <button data-action="ship-self-destruct" data-ship-id="${ship.id}" style="background-color: #c0392b;">Self-Destruct</button>
            </div>
        `;

        container.innerHTML = html;
        container.classList.remove('hidden');
    }

    _renderSelectedLocationUI() {
        const container = document.getElementById('selected-planet-info');
        this.selectedShipId = null; // Ensure no ship is selected
        if (!this.selectedLocationId) {
            container.classList.add('hidden');
            return;
        }

        // A "location" can be a system or a station.
        let location = this.state.systems.find(s => s.id === this.selectedLocationId);
        let builder = location; // The entity that can build. Initially the system itself.

        if (!location) {
            location = this.state.ships.find(s => s.id === this.selectedLocationId && s.isStation);
            builder = location; // If we selected a station directly, it's the builder.
            if (!location) {
                container.classList.add('hidden');
                return;
            }
        }

        const localPlayer = this.getLocalPlayer();
        
        // If a system is selected, check if there's a friendly station in it.
        // If so, that station becomes the primary builder for ships.
        if (location && !location.isStation) { // It's a system
            const myStationInSystem = this.state.ships.find(s => 
                s.owner === localPlayer.id && 
                s.isStation &&
                this._isShipInSystem(s, location)
            );
            if (myStationInSystem) {
                builder = myStationInSystem; // The station is the builder.
            }
        }

        const builderIsOwnedByMe = builder && builder.owner === localPlayer.id;

        // --- Check if we can do a partial update ---
        const isAlreadyRendered = container.dataset.renderedFor === builder.id;

        // --- Part 1: Generate dynamic HTML content (queues, timers, etc.) ---
        let buildQueueHtml = '';
        if (builderIsOwnedByMe && builder.buildQueue && builder.buildQueue.length > 0) {
            buildQueueHtml = '<h4>Build Queue</h4><ul class="build-queue-list">';

            const groupedQueue = [];
            if (builder.buildQueue.length > 0) {
                // Group consecutive items of the same type
                let lastGroup = null;
                for (const item of builder.buildQueue) {
                    if (lastGroup && lastGroup.shipType === item.shipType) {
                        lastGroup.count++;
                    } else {
                        lastGroup = {
                            shipType: item.shipType,
                            count: 1,
                            firstItem: item
                        };
                        groupedQueue.push(lastGroup);
                    }
                }
            }

            // Render the grouped queue
            groupedQueue.forEach(group => {
                const item = group.firstItem;
                const buildTime = SHIP_DATA[item.shipType].buildTime;
                let progressPercent = 0;
                let statusText = 'Waiting...';

                if (item.startTime) {
                    const remaining = item.remainingTime;
                    progressPercent = Math.min(100, ((buildTime - remaining) / buildTime) * 100);
                    statusText = `${Math.ceil(Math.max(0, remaining) / 1000)}s`;
                }

                const countBadge = group.count > 1 ? `<span class="queue-badge">${group.count}x</span>` : '';

                buildQueueHtml += `<li>
                    <span>${item.shipType}${countBadge} - ${statusText}</span>
                    <button class="cancel-build-btn" data-action="cancel-build" data-location-id="${builder.id}" data-item-id="${item.id}">×</button>
                    <div class="progress-bar-container"><div class="progress-bar" style="width: ${progressPercent}%"></div></div>
                </li>`;
            });

            buildQueueHtml += '</ul>';
        }

        let repairBayHtml = '';
        if (builderIsOwnedByMe && builder.isStation) {
            const systemContext = location.isStation 
                ? this.state.systems.find(sys => this._isShipInSystem(location, sys))
                : location;

            if (systemContext) {
                const dockedShips = this.state.ships.filter(s =>
                    s.owner === localPlayer.id && !s.isStation && !s.targetId && this._isShipInSystem(s, systemContext)
                );

                const groupedShips = {};
                dockedShips.forEach(ship => {
                    if (!groupedShips[ship.type]) {
                        groupedShips[ship.type] = { repairable: [], upgradable: [], servicing: [], ok: [] };
                    }
                    const needsRepair = ship.hull < ship.maxHull;
                    const canUpgrade = localPlayer.researchedTechs.length > (ship.vintageTechs?.length || 0);

                    if (ship.isRepairing) {
                        groupedShips[ship.type].servicing.push(ship);
                    } else if (canUpgrade) { // Upgrade takes precedence as it also repairs
                        groupedShips[ship.type].upgradable.push(ship);
                    } else if (needsRepair) {
                        groupedShips[ship.type].repairable.push(ship);
                    } else {
                        groupedShips[ship.type].ok.push(ship);
                    }
                });

                if (Object.keys(groupedShips).length > 0) {
                    repairBayHtml = '<h4>Repair Bay</h4><ul class="repair-bay-list">';
                    for (const shipType in groupedShips) {
                        const groups = groupedShips[shipType];

                        if (groups.upgradable.length > 0) {
                            const count = groups.upgradable.length;
                            const ship = groups.upgradable[0];
                            const badge = count > 1 ? `<span class="queue-badge">${count}x</span>` : '';
                            const buttonHtml = `<button data-action="repair-ship-group" data-ship-type="${shipType}" data-service-type="upgrade">Upgrade</button>`;
                            repairBayHtml += `<li><span>${shipType}${badge} (Hull: ${ship.hull}/${ship.maxHull})</span>${buttonHtml}</li>`;
                        }
                        if (groups.repairable.length > 0) {
                            const count = groups.repairable.length;
                            const ship = groups.repairable[0];
                            const badge = count > 1 ? `<span class="queue-badge">${count}x</span>` : '';
                            const buttonHtml = `<button data-action="repair-ship-group" data-ship-type="${shipType}" data-service-type="repair">Repair</button>`;
                            repairBayHtml += `<li><span>${shipType}${badge} (Hull: ${ship.hull}/${ship.maxHull})</span>${buttonHtml}</li>`;
                        }
                        if (groups.servicing.length > 0) {
                            const count = groups.servicing.length;
                            const badge = count > 1 ? `<span class="queue-badge">${count}x</span>` : '';
                            repairBayHtml += `<li><span>${shipType}${badge}</span><button disabled>Servicing...</button></li>`;
                        }
                        if (groups.ok.length > 0) {
                            const count = groups.ok.length;
                            const ship = groups.ok[0];
                            const badge = count > 1 ? `<span class="queue-badge">${count}x</span>` : '';
                            repairBayHtml += `<li><span>${shipType}${badge} (Hull: ${ship.hull}/${ship.maxHull})</span></li>`;
                        }
                    }
                    repairBayHtml += '</ul>';
                }
            }
        }

        // --- Part 2: Apply updates ---
        if (isAlreadyRendered) {
            // Partial update: Only refresh the dynamic parts
            const queueContainer = document.getElementById('build-queue-container');
            if (queueContainer) queueContainer.innerHTML = buildQueueHtml;
            
            const repairContainer = document.getElementById('repair-bay-container');
            if (repairContainer) repairContainer.innerHTML = repairBayHtml;
            
            return; // We are done, no full re-render needed.
        }

        // --- Part 3: Full Render (if selection changed) ---
        let html = `<h3>${location.name || builder.type}</h3>`;
        html += `<div style="margin-bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="context-open-tech-tree">Tech Tree</button>
                    <button id="context-open-fleet-manager">Fleets</button>
                 </div>`;

        if (builderIsOwnedByMe) {
            html += '<h4>Build Ships</h4>';
            html += '<div class="build-options">';
            
            Object.entries(SHIP_DATA).forEach(([shipType, shipData]) => {
                const canBuild = builder.isStation 
                    ? (SHIP_DATA[builder.type]?.buildCapabilities?.includes(shipType))
                    : shipData.builtBy.includes('Planet');

                const techRequirementMet = !shipData.requiresTech || localPlayer.researchedTechs.includes(shipData.requiresTech);

                if (canBuild) {
                    const cost = shipData.cost;
                    const disabled = !techRequirementMet ? 'disabled' : '';
                    const title = !techRequirementMet ? `Requires tech: ${shipData.requiresTech}` : `Queue ${shipType}`;

                    html += `<div class="build-item">
                                <span>${shipType} (IO: ${cost.credits || 0}, S: ${cost.scrap || 0})</span>
                                <div class="build-controls">
                                    <input type="number" id="build-count-${shipType}" value="1" min="1" max="100" style="width: 50px;" ${disabled}>
                                    <button data-action="queue-build" data-ship-type="${shipType}" ${disabled} title="${title}">Queue</button>
                                </div>
                             </div>`;
                }
            });
            html += '</div>';
        } else {
            html += '<p>This system is not under your control.</p>';
        }

        // Add Planet List with Capture Status
        if (location.planets && location.planets.length > 0) {
            html += '<h4>Planets</h4><ul class="planet-list">';
            location.planets.forEach(p => {
                const ownerName = p.owner ? this.state.players.find(pl => pl.id === p.owner)?.factionName : 'Neutral';
                let status = `<span style="color: ${p.owner ? (this.state.players.find(pl => pl.id === p.owner)?.color || '#fff') : '#aaa'}">${ownerName}</span>`;
                if (p.captureProgress > 0 && p.captureProgress < 100) {
                    status += ` <span style="color: orange;">(${Math.round(p.captureProgress)}%)</span>`;
                }
                html += `<li>${p.name}: ${status}</li>`;
            });
            html += '</ul>';
        }

        // Add containers for dynamic content
        html += `<div id="build-queue-container">${buildQueueHtml}</div>`;
        html += `<div id="repair-bay-container">${repairBayHtml}</div>`;

        container.innerHTML = html;
        container.dataset.renderedFor = builder.id; // Mark as rendered for this specific builder
        container.classList.remove('hidden');
    }

    _renderTechTreeProgress() {
        // This assumes the TechTreeModal has a root element with id="tech-tree-modal" and toggles a "hidden" class.
        const techTreeModal = document.getElementById('tech-tree-modal');
        if (!techTreeModal || techTreeModal.classList.contains('hidden')) {
            return; // Don't render if modal is not visible
        }

        const player = this.getLocalPlayer();
        const queueContainer = document.getElementById('research-queue-container');
        if (!queueContainer) return;

        if (!player || !player.researchQueue || player.researchQueue.length === 0) {
            queueContainer.innerHTML = ''; // Clear it if nothing is being researched
            return;
        }

        const techData = this._techData[player.team];
        if (!techData) return;

        let researchQueueHtml = '<h4>Research In Progress</h4><ul class="research-queue-list">';
        player.researchQueue.forEach(item => {
            const tech = techData[item.techId];
            if (!tech) return;

            const totalTime = item.totalTime || tech.researchTime;
            const remaining = item.remainingTime;
            const progressPercent = totalTime > 0 ? Math.min(100, ((totalTime - remaining) / totalTime) * 100) : 0;
            const statusText = `${Math.ceil(Math.max(0, remaining) / 1000)}s`;

            researchQueueHtml += `<li><span>${tech.name} - ${statusText}</span><div class="progress-bar-container"><div class="progress-bar" style="width: ${progressPercent}%"></div></div></li>`;
        });
        researchQueueHtml += '</ul>';
        queueContainer.innerHTML = researchQueueHtml;
    }
    
    moveShipToTarget(shipId, targetId) {
        return this.movementService.moveShipToTarget(shipId, targetId);
    }
}