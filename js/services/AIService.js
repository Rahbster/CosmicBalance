import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';
import { AIEconomyManager } from './ai/AIEconomyManager.js';
import { AIFleetManager } from './ai/AIFleetManager.js';

const CITADEL_COSTS = [
    { io: 500, min: 100 },   // Lvl 1
    { io: 1000, min: 300 },  // Lvl 2
    { io: 2500, min: 800 },  // Lvl 3
    { io: 5000, min: 1500 }, // Lvl 4
    { io: 10000, min: 3000 } // Lvl 5
];

export class AIService {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.economyManager = new AIEconomyManager(gameEngine);
        this.fleetManager = new AIFleetManager(gameEngine);
        this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, 'AIService Initialized');
    }

    run(dt) {
        if (!this.engine.isHost || !this.engine.state.players || !this.engine.techService.getTechData()) return;

        const aiPlayers = this.engine.state.players.filter(p => p.isAI && !p.isDead);
        const techData = this.engine.techService.getTechData();

        for (const aiPlayer of aiPlayers) {
            if (aiPlayer.isDead) continue;

            aiPlayer.actionTimer = (aiPlayer.actionTimer || 0) + dt;

            // Run AI logic roughly every 1 second, staggered
            if (aiPlayer.actionTimer > 1000 + (Math.random() * 500)) { 
                this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.DEBUG, `Running logic for player ${aiPlayer.id}`);
                aiPlayer.actionTimer = 0;
                
                this.economyManager.update(aiPlayer, techData);
                this.fleetManager.update(aiPlayer);
                this._processCitadelUpgrades(aiPlayer);
            }
        }
    }

    _processCitadelUpgrades(player) {
        // Find all planets owned by this player
        const myPlanets = [];
        this.engine.state.systems.forEach(sys => {
            if (sys.planets) {
                sys.planets.forEach(p => {
                    if (p.owner === player.id) myPlanets.push(p);
                });
            }
        });

        if (myPlanets.length === 0) return;

        // Pick a random planet to attempt upgrade (simple stochastic strategy)
        const targetPlanet = myPlanets[Math.floor(Math.random() * myPlanets.length)];
        const currentLevel = targetPlanet.citadelLevel || 0;
        if (currentLevel >= 5) return;

        const cost = CITADEL_COSTS[currentLevel];
        // Maintain a resource buffer so we don't starve ship production
        const buffer = { io: 1000, min: 500 };

        if (player.resources.IO >= cost.io + buffer.io && player.resources.minerals >= cost.min + buffer.min) {
            // Use the economy service to handle the upgrade logic (deduct resources, update state)
            this.engine.economyService.handleUpgradeCitadelRequest({ senderId: player.id, planetId: targetPlanet.id });
        }
    }
}
