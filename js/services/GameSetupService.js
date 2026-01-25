import { AI_PROFILES } from './ai/AIProfiles.js';
import { FACTION_COLORS, LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class GameSetupService {
    constructor(engine) {
        this.engine = engine;
    }

    async createNewGame(config) {
        const { numSystems, aiPlayers, humanPlayers, twoWayDensity, oneWayDensity, resourceRate, shipSpeedRate, isSpectator, isSymmetric, hazardDensity } = config;
    
        this.engine.isHost = true;
        this.engine.paused = false; 
        this.engine.timeScale = 1.0;
        this.engine.state.gameConfig = config;

        const availableColors = [...FACTION_COLORS];
        
        this.engine.state.players = [];
        this.engine.state.gameTime = 0;

        if (humanPlayers && humanPlayers.length > 0) {
            humanPlayers.forEach(human => {
                const humanColor = availableColors.splice(0, 1)[0];
                this.engine.state.players.push({
                    id: human.guid,
                    factionName: human.name,
                    team: human.name,
                    techBase: human.team || 'UNSC', 
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
            this.engine.hostView.mode = 'god';
            this.engine.hostView.selectedPlayerIds = [];
        } else {
            this.engine.hostView.mode = 'player';
            this.engine.hostView.selectedPlayerIds = [this.engine.getIdentity().guid];
        }

        // Add resources to AI players
        const profileKeys = Object.keys(AI_PROFILES);
        
        // Shuffle profiles
        for (let i = profileKeys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [profileKeys[i], profileKeys[j]] = [profileKeys[j], profileKeys[i]];
        }

        this.engine.state.players.push(...aiPlayers.map((p, i) => {
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

        // Add Pirate Faction
        this.engine.state.players.push({
            id: 'pirates',
            factionName: 'Space Raiders',
            team: 'Pirates',
            techBase: 'UNSC', // Uses standard tech for now
            color: '#666666', // Dark Grey
            isAI: true,
            aiProfile: 'PIRATE',
            resources: { IO: 0, minerals: 0, scrap: 0, energy: 0 },
            totalResources: { IO: 0, minerals: 0, scrap: 0, energy: 0 },
            researchedTechs: [],
            researchQueue: [],
            fleets: [],
            designs: []
        });

        this.engine.state.systems = this.engine.galaxyService.generateGalaxyMap(numSystems, twoWayDensity, oneWayDensity, isSymmetric, this.engine.state.players.length);
        const hazardCount = Math.floor(numSystems * ((hazardDensity !== undefined ? hazardDensity : 33) / 100));
        this.engine.state.hazards = this.engine.galaxyService.generateHazards(hazardCount);
        this.engine.state.ships = [];
        this.engine.state.debrisFields = [];
        this.engine.selectedLocationId = null;
        this.engine.selectedShipId = null;
        this.engine.reportHistory = [];
        if (this.engine.storageService) this.engine.storageService.saveReports([]); 
        this.engine.state.settings = {
            resourceRate: resourceRate || 1.0,
            shipSpeedRate: shipSpeedRate || 1.0
        };
        
        this.engine.state.combat = {
            active: false,
            ships: [],
            projectiles: [],
            turn: 0,
            nextProjectileId: 0,
            effects: []
        };

        await this.engine.techService.loadTechData(); 
        await this.engine.spriteService.loadSprites(); 

        // --- Assign Home Systems ---
        const availableSystems = [...this.engine.state.systems];
        
        const stride = isSymmetric ? Math.floor(this.engine.state.systems.length / this.engine.state.players.length) : 0;

        this.engine.state.players.forEach((player, i) => {
            if (availableSystems.length > 0) {
                let homeSystem;
                
                if (isSymmetric) {
                    homeSystem = this.engine.state.systems[i * stride];
                } else {
                    const index = Math.floor(Math.random() * availableSystems.length);
                    homeSystem = availableSystems.splice(index, 1)[0];
                }

                if (!homeSystem) return;

                homeSystem.owner = player.id; 

                if (homeSystem.planets && homeSystem.planets.length > 0) {
                    const homePlanet = homeSystem.planets[0];
                    homePlanet.owner = player.id;
                    homePlanet.captureProgress = 100;
                    homePlanet.type = 'Terran'; 
                }

                if (!homeSystem.visibility) homeSystem.visibility = {};
                homeSystem.visibility[player.id] = 'explored';

                this.engine.unitService.spawnShip(player, 'SpaceStation', { x: homeSystem.x, y: homeSystem.y }, homeSystem);
                this.engine.unitService.spawnShip(player, 'Scout', { x: homeSystem.x + 30, y: homeSystem.y + 30 }, homeSystem);
            }
        });

        this.engine._saveState();

        const localPlayer = this.engine.getLocalPlayer();
        if (localPlayer) {
            const homeSystem = this.engine.state.systems.find(s => s.owner === localPlayer.id);
            if (homeSystem) {
                this.engine.camera.centerOn(homeSystem.x, homeSystem.y, 1);
            }
        } else if (this.engine.state.systems.length > 0) {
            const firstSystem = this.engine.state.systems[0];
            this.engine.camera.centerOn(firstSystem.x, firstSystem.y, 0.5);
        }

        return this.engine.state;
    }

    addPlayer(id, name, role = 'player') {
        if (!this.engine.isHost) return;

        let player = this.engine.state.players.find(p => p.id === id);
        if (player) {
            this.engine.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `Player ${name} re-joined.`);
            player.factionName = name; 
            this.engine.peerManager.send({ type: 'GAME_SET_STATE', state: this.engine.state });
            return;
        }

        if (role === 'spectator') {
            this.engine.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `User ${name} joined as Spectator.`);
            this.engine.broadcast({ type: 'GAME_TOAST', message: `${name} joined as spectator.`, toastType: 'info' });
            this.engine.peerManager.send({ type: 'GAME_SET_STATE', state: this.engine.state });
            return;
        }

        const aiPlayer = this.engine.state.players.find(p => p.isAI && !p.isDead);
        if (aiPlayer) {
            this.engine.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `Converting AI ${aiPlayer.factionName} to Human Player ${name}`);
            
            aiPlayer.id = id;
            aiPlayer.factionName = name;
            aiPlayer.isAI = false;
            delete aiPlayer.aiProfile; 
            delete aiPlayer.aiGoal;

            this.engine.broadcast({ type: 'GAME_PLAYER_UPDATE', playerId: id, update: aiPlayer });
            this.engine.broadcast({ type: 'GAME_TOAST', message: `${name} has joined the game!`, toastType: 'success' });
            
            this.engine.peerManager.send({ type: 'GAME_SET_STATE', state: this.engine.state });
            return;
        }

        // Note: Spawning new players mid-game if no AI slots are available is complex and currently handled by the engine's original logic falling through to spectator if map is full.
        // For this refactor, we assume the AI replacement path is the primary join method for active games.
        // If we want to support dynamic spawning, we'd need to find an unowned system here similar to the original code.
        
        const unownedSystem = this.engine.state.systems.find(s => !s.owner && (!s.planets || !s.planets.some(p => p.owner)));
        
        if (unownedSystem) {
            const availableColors = FACTION_COLORS.filter(c => !this.engine.state.players.some(p => p.color === c));
            const color = availableColors.length > 0 ? availableColors[0] : '#FFFFFF';

            const newPlayer = {
                id: id, factionName: name, team: name, techBase: 'UNSC', color: color, isAI: false,
                resources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
                totalResources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
                researchedTechs: [], researchQueue: [], fleets: [], designs: []
            };

            this.engine.state.players.push(newPlayer);
            this.engine.unitService.spawnShip(newPlayer, 'SpaceStation', { x: unownedSystem.x, y: unownedSystem.y }, unownedSystem);
            this.engine.unitService.spawnShip(newPlayer, 'Scout', { x: unownedSystem.x + 30, y: unownedSystem.y + 30 }, unownedSystem);
            
            unownedSystem.owner = newPlayer.id;
            unownedSystem.visibility[newPlayer.id] = 'explored';
            
            this.engine.peerManager.send({ type: 'GAME_SET_STATE', state: this.engine.state });
        } else {
            this.engine.peerManager.send({ type: 'GAME_SET_STATE', state: this.engine.state });
            if (window.toastManager) window.toastManager.show(`Game full! ${name} joined as spectator.`, 'warning');
        }
    }

    replaceAIPlayer(deadPlayer) {
        const unownedSystems = this.engine.state.systems.filter(s => !s.owner && (!s.planets || !s.planets.some(pl => pl.owner)));
        
        if (unownedSystems.length === 0) {
            this.engine.state.players = this.engine.state.players.filter(p => p.id !== deadPlayer.id);
            this.engine.broadcast({ type: 'GAME_SET_STATE', state: this.engine.state });
            return;
        }

        const unownedSystem = unownedSystems[Math.floor(Math.random() * unownedSystems.length)];
        
        const profileKeys = Object.keys(AI_PROFILES);
        let newProfileKey = profileKeys[Math.floor(Math.random() * profileKeys.length)];
        if (profileKeys.length > 1 && newProfileKey === deadPlayer.aiProfile) {
             const otherKeys = profileKeys.filter(k => k !== deadPlayer.aiProfile);
             if (otherKeys.length > 0) {
                 newProfileKey = otherKeys[Math.floor(Math.random() * otherKeys.length)];
             }
        }
        const profileName = AI_PROFILES[newProfileKey].name;

        const newId = `AI_${crypto.randomUUID().split('-')[0]}`;
        let nameSuffix = 1;
        let newName = `${profileName} AI ${nameSuffix}`;
        while (this.engine.state.players.some(p => p.factionName === newName)) {
            nameSuffix++;
            newName = `${profileName} AI ${nameSuffix}`;
        }

        const newPlayer = {
            id: newId,
            factionName: newName,
            team: newName,
            techBase: 'COVENANT', 
            color: deadPlayer.color, 
            isAI: true,
            aiProfile: newProfileKey,
            resources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
            totalResources: { IO: 500, minerals: 200, scrap: 200, energy: 200 },
            researchedTechs: [],
            researchQueue: [],
            fleets: [],
            designs: []
        };

        this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `Replacing ${deadPlayer.factionName} with ${newPlayer.factionName} in ${unownedSystem.name}`);

        const idx = this.engine.state.players.indexOf(deadPlayer);
        if (idx !== -1) {
            this.engine.state.players[idx] = newPlayer;
        } else {
            this.engine.state.players.push(newPlayer);
        }

        unownedSystem.owner = newPlayer.id;
        unownedSystem.visibility[newPlayer.id] = 'explored';
        
        if (unownedSystem.planets && unownedSystem.planets.length > 0) {
            const homePlanet = unownedSystem.planets[0];
            homePlanet.owner = newPlayer.id;
            homePlanet.captureProgress = 100;
        }

        this.engine.unitService.spawnShip(newPlayer, 'SpaceStation', { x: unownedSystem.x, y: unownedSystem.y }, unownedSystem);
        this.engine.unitService.spawnShip(newPlayer, 'Scout', { x: unownedSystem.x + 30, y: unownedSystem.y + 30 }, unownedSystem);

        this.engine.broadcast({ 
            type: 'GAME_TOAST', 
            message: `A new faction, ${newPlayer.factionName}, has entered the galaxy!`, 
            toastType: 'info' 
        });
        
        this.engine.broadcast({ type: 'GAME_SET_STATE', state: this.engine.state });
    }
}