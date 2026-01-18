import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';
import { AIEconomyManager } from './ai/AIEconomyManager.js';
import { AIFleetManager } from './ai/AIFleetManager.js';

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
            }
        }
    }
}
