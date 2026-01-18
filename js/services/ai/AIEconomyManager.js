import { SHIP_DATA } from '../GalaxyService.js';
import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS } from '../../cb_constants.js';
import { AI_PROFILES } from './AIProfiles.js';

export class AIEconomyManager {
    constructor(engine) {
        this.engine = engine;
    }

    update(aiPlayer, techData) {
        this._manageProduction(aiPlayer, techData);
        this._manageResearch(aiPlayer, techData);
    }

    _manageProduction(aiPlayer, techData) {
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;
        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        const mySystems = this.engine.state.systems.filter(s => s.owner === aiPlayer.id);
        const contestedSystems = this.engine.state.systems.filter(s => s.owner !== aiPlayer.id && s.planets.some(p => p.owner === aiPlayer.id));
        const myStations = myShips.filter(s => s.isStation);
        const allBuilders = [...mySystems, ...contestedSystems, ...myStations];
        
        const countShips = (type) => {
            const inSpace = myShips.filter(s => s.type === type && !s.isBuilding).length;
            let inQueue = 0;
            allBuilders.forEach(b => { if (b.buildQueue) inQueue += b.buildQueue.filter(q => q.shipType === type).length; });
            return inSpace + inQueue;
        };

        aiPlayer.aiGoal = 'Idle';

        if (mySystems.length === 0 && contestedSystems.length === 0 && myStations.length === 0) {
            aiPlayer.aiGoal = 'Survival (No Systems)';
            return;
        }

        const resources = aiPlayer.resources;
        const combatShipCount = countShips('Fighter') + countShips('Frigate') + countShips('Destroyer') + countShips('Cruiser');

        const buildShip = (shipType, goalMessage) => {
            const shipInfo = SHIP_DATA[shipType];
            if (!shipInfo) return false;

            const capableBuilders = allBuilders.filter(b => {
                if (b.buildQueue && b.buildQueue.length >= 5) return false;
                if (b.isStation) {
                    return SHIP_DATA[b.type]?.buildCapabilities?.includes(shipType);
                } else {
                    return shipInfo.builtBy.includes('Planet');
                }
            });

            if (capableBuilders.length === 0) return false;

            capableBuilders.sort((a, b) => {
                const sysA = a.isStation ? this.engine.spatialService.getCurrentSystem(a) : a;
                const sysB = b.isStation ? this.engine.spatialService.getCurrentSystem(b) : b;
                
                const aSafe = sysA ? this._isSystemSafe(sysA, aiPlayer.id) : true;
                const bSafe = sysB ? this._isSystemSafe(sysB, aiPlayer.id) : true;

                if (aSafe && !bSafe) return -1;
                if (!aSafe && bSafe) return 1;

                return (a.buildQueue?.length || 0) - (b.buildQueue?.length || 0);
            });
            const bestBuilder = capableBuilders[0];

            this.engine.economyService.handleBuildRequest({ 
                senderId: aiPlayer.id, 
                shipType: shipType, 
                locationId: bestBuilder.id, 
                count: 1 
            });
            aiPlayer.aiGoal = goalMessage;
            return true;
        };

        const knownUnownedNeighbors = mySystems.flatMap(sys => 
            sys.links.map(l => this.engine.state.systems.find(s => s.id === l.targetId))
        ).filter(n => 
            n && !n.owner && 
            (n.visibility[aiPlayer.id] === 'explored' || n.visibility[aiPlayer.id] === 'scouted') &&
            this._isSystemSafe(n, aiPlayer.id)
        );
        
        const hasExpansionTarget = knownUnownedNeighbors.length > 0;
        const transportCount = countShips('TroopTransport');

        if (combatShipCount === 0) {
             if (hasExpansionTarget && transportCount === 0) {
                 if (this._canAfford(resources, 'TroopTransport')) {
                     if (buildShip('TroopTransport', 'Desperate Expansion')) return;
                 } else {
                     aiPlayer.aiGoal = 'Saving for Expansion';
                     return;
                 }
             }

             if (this._canAfford(resources, 'Fighter')) {
                 if (buildShip('Fighter', 'Emergency Defense')) return;
             } else {
                 aiPlayer.aiGoal = 'Saving for Defense';
                 return;
             }
        }

        if (resources.IO > 1200 && resources.scrap > 250) {
             const systemsWithoutStations = mySystems.filter(sys => 
                !myStations.some(station => this.engine.spatialService.isShipInSystem(station, sys)) &&
                (!sys.buildQueue || !sys.buildQueue.some(q => q.shipType === 'SpaceStation'))
            );
            
            if (systemsWithoutStations.length > 0) {
                const target = systemsWithoutStations.reduce((prev, curr) => (prev.planets.length > curr.planets.length) ? prev : curr);
                this.engine.economyService.handleBuildRequest({ senderId: aiPlayer.id, shipType: 'SpaceStation', locationId: target.id, count: 1 });
                aiPlayer.aiGoal = 'Expanding Infrastructure';
                return;
            }
        }
        
        if (profile.name === 'Economist') {
            const salvagerCount = countShips('Salvager');
            if (salvagerCount < profile.salvagerCap && this._canAfford(resources, 'Salvager')) {
                if (buildShip('Salvager', 'Building Economy (Salvager)')) return;
            }
        }

        if (hasExpansionTarget && transportCount === 0 && combatShipCount >= profile.minCombatForTransport) {
             if (this._canAfford(resources, 'TroopTransport')) {
                 if (buildShip('TroopTransport', 'Expanding Territory')) return;
             } else {
                 aiPlayer.aiGoal = 'Saving for Expansion';
                 return;
             }
        }

        const dynamicScoutCap = Math.max(profile.scoutCap, Math.floor(mySystems.length / 5));
        const scoutCount = countShips('Scout');
        if (scoutCount < dynamicScoutCap && this._canAfford(resources, 'Scout')) {
            if (buildShip('Scout', 'Building Scout')) return;
        }

        const salvagerCount = countShips('Salvager');
        if (salvagerCount < profile.salvagerCap && this._canAfford(resources, 'Salvager')) {
            if (buildShip('Salvager', 'Building Salvager')) return;
        }

        const maxTransports = 15;
        const desiredTransports = combatShipCount > 0 ? Math.min(maxTransports, Math.max(1, Math.ceil(combatShipCount / profile.transportRatio))) : 0;

        if (transportCount < desiredTransports) {
            if (this._canAfford(resources, 'TroopTransport')) {
                if (buildShip('TroopTransport', 'Building Transport')) return;
            } else if (combatShipCount >= profile.minCombatForTransport) {
                aiPlayer.aiGoal = 'Saving for Expansion';
                return;
            }
        }

        const baseCap = profile.name === 'Swarm' ? 120 : 80;
        const territoryBonus = mySystems.length * 8;
        let shipCap = baseCap + territoryBonus;

        if (resources.IO > 50000) shipCap += 50;
        if (resources.IO > 200000) shipCap += 100;
        if (resources.IO > 1000000) shipCap += 400;
        if (resources.IO > 5000000) shipCap += 1000;
        
        let totalQueued = 0;
        allBuilders.forEach(b => { if (b.buildQueue) totalQueued += b.buildQueue.length; });

        if (myShips.length + totalQueued < shipCap) {
                let wantedHeavyButBusy = false;

                for (const type of profile.shipPreference) {
                    const isHeavy = ['Frigate', 'Destroyer', 'Cruiser'].includes(type);
                    if (this._canAfford(resources, type) && this._hasTech(aiPlayer, type)) {
                        if (buildShip(type, `Building Fleet`)) return;
                        if (isHeavy) wantedHeavyButBusy = true;
                    }
                }

                const isRich = resources.IO > 3000;
                const shouldKeepBuilding = myShips.length < (shipCap * 0.8);
                
                if (!wantedHeavyButBusy || !isRich || shouldKeepBuilding) {
                    if (this._canAfford(resources, 'Fighter')) buildShip('Fighter', 'Building Fleet (Fighter)');
                } else {
                    aiPlayer.aiGoal = 'Waiting for Shipyards';
                }
        } else {
            aiPlayer.aiGoal = 'Fleet Cap Reached';

            if (resources.IO > 5000 && resources.scrap > 1000) {
                const fighters = myShips.filter(s => s.type === 'Fighter' && s.moveState === SHIP_STATE.IDLE);
                if (fighters.length > 10) {
                    const heavyShips = ['Cruiser', 'Destroyer', 'Frigate'];
                    const canBuildHeavy = heavyShips.some(type => this._canAfford(resources, type) && this._hasTech(aiPlayer, type));
                    
                    if (canBuildHeavy) {
                        const sacrifice = fighters[0];
                        this.engine.loggingService.log(LOG_CATEGORIES.AI, LOG_LEVELS.INFO, `AI ${aiPlayer.factionName} scuttling Fighter ${sacrifice.id} to make room for heavy ships.`);
                        this.engine.combatService.handleSelfDestructRequest({ senderId: aiPlayer.id, shipId: sacrifice.id });
                        aiPlayer.aiGoal = 'Modernizing Fleet';
                    }
                }
            }
        }
    }

    _manageResearch(aiPlayer, techData) {
        const profile = AI_PROFILES[aiPlayer.aiProfile] || AI_PROFILES.BALANCED;
        if (aiPlayer.researchQueue.length > 0) return;

        if (aiPlayer.aiGoal && aiPlayer.aiGoal.startsWith('Saving')) return;

        const aiTechs = techData[aiPlayer.techBase];
        if (!aiTechs) return;

        const myShips = this.engine.state.ships.filter(s => s.owner === aiPlayer.id && s.hull > 0);
        const mySystems = this.engine.state.systems.filter(s => s.owner === aiPlayer.id);
        
        if (mySystems.length < 2 && myShips.length < 5 && profile.name !== 'Technologist') return;

        const availableTechs = Object.keys(aiTechs).filter(techId => {
            const tech = aiTechs[techId];
            const isResearched = aiPlayer.researchedTechs.includes(techId);
            const dependenciesMet = tech.dependencies.every(dep => aiPlayer.researchedTechs.includes(dep));
            
            const bufferIO = 300;
            const canAfford = (aiPlayer.resources.IO - bufferIO) >= (tech.cost.IO || 0) && 
                              aiPlayer.resources.minerals >= (tech.cost.minerals || 0);
            
            return !isResearched && dependenciesMet && canAfford;
        });

        if (availableTechs.length > 0 && Math.random() < profile.researchPriority) {
            const techToResearch = availableTechs[Math.floor(Math.random() * availableTechs.length)];
            this.engine.economyService.handleResearchRequest({ senderId: aiPlayer.id, techId: techToResearch });
        }
    }

    _canAfford(resources, shipType) {
        const cost = SHIP_DATA[shipType].cost;
        return resources.IO >= (cost.credits || 0) && 
               resources.scrap >= (cost.scrap || 0) && 
               resources.energy >= (cost.energy || 0);
    }

    _hasTech(aiPlayer, shipType) {
        const requiredTech = SHIP_DATA[shipType].requiresTech;
        return !requiredTech || aiPlayer.researchedTechs.includes(requiredTech);
    }

    _isSystemSafe(system, aiPlayerId) {
        return !this.engine.state.ships.some(s => 
            s.owner !== aiPlayerId && 
            s.damage > 0 && 
            this.engine.spatialService.isShipInSystem(s, system)
        );
    }
}
