import { SHIP_STATE } from '../cb_constants.js';

export class GameMessageHandler {
    constructor(engine) {
        this.engine = engine;
    }

    handle(data) {
        if (data.type === 'GAME_SPAWN') {
            this.engine.state.ships.push(data.ship);
        } else if (data.type === 'GAME_SET_PAUSE') {
            console.log(`[GameEngine] Handling GAME_SET_PAUSE. Paused: ${data.paused}`);
            this.engine.paused = data.paused;
            if (window.toastManager) {
                window.toastManager.show(this.engine.paused ? "Game Paused" : "Game Resumed", 'info');
            }
            if (this.engine.isHost) this.engine._saveState();
        } else if (data.type === 'GAME_SET_SPEED') {
            this.engine.timeScale = data.speed;
        } else if (data.type === 'GAME_MOVE') {
            const ship = this.engine.state.ships.find(s => s.id === data.shipId);
            if (ship) {
                ship.moveState = data.moveState;
                ship.targetId = data.targetId;
                ship.arrivalPoint = data.arrivalPoint;
                ship.currentSystemId = null;
                if (data.navigationPath) ship.navigationPath = data.navigationPath;
                if (data.lastSystemId) ship.lastSystemId = data.lastSystemId;
                if (ship.patrolSystemId) delete ship.patrolSystemId;
                if (ship.patrolTarget) delete ship.patrolTarget;
            }
        } else if (data.type === 'GAME_SHIP_UPDATE') {
            const ship = this.engine.state.ships.find(s => s.id === data.shipId);
            if (ship) {
                Object.keys(data).forEach(key => {
                    if (key !== 'type' && key !== 'shipId') {
                        if (key === 'isRepairing' && data[key] === false) {
                            delete ship.isRepairing; delete ship.repairTimer; delete ship.totalRepairTime;
                        } else if (key === 'patrolSystemId' && data[key] === null) {
                            delete ship.patrolSystemId;
                            delete ship.patrolTarget;
                        } else if (key === 'scoutMission' && data[key] === null) {
                            delete ship.scoutMission;
                        } else if (key === 'exploreMission' && data[key] === null) {
                            delete ship.exploreMission;
                        } else if (key === 'salvageMission' && data[key] === null) {
                            delete ship.salvageMission;
                        } else {
                            ship[key] = data[key];
                        }
                    }
                });
            }
        } else if (data.type === 'GAME_SHIPS_DESTROYED') {
            this.engine.state.ships = this.engine.state.ships.filter(s => !data.shipIds.includes(s.id));
            if (this.engine.selectionManager.selectedShipId && data.shipIds.includes(this.engine.selectionManager.selectedShipId)) {
                this.engine.selectionManager.selectedShipId = null;
                this.engine.selectionManager.renderSelectedUI();
            }
        } else if (data.type === 'GAME_DEBRIS_CREATED') {
            this.engine.state.debrisFields.push(data.debris);
        } else if (data.type === 'GAME_DEBRIS_REMOVED') {
            this.engine.state.debrisFields = this.engine.state.debrisFields.filter(d => !data.debrisIds.includes(d.id));
        } else if (data.type === 'GAME_PLAYER_UPDATE') {
            const player = this.engine.state.players.find(p => p.id === data.playerId);
            if (player) {
                if (data.resources) player.resources = data.resources;
                if (data.researchQueue) player.researchQueue = data.researchQueue;
                if (data.update) {
                    if (data.update.designs) player.designs = data.update.designs;
                    Object.assign(player, data.update);
                }
            }
        } else if (data.type === 'GAME_REQUEST_BUILD') {
            this.engine.economyService.handleBuildRequest(data);
        } else if (data.type === 'GAME_BUILD_QUEUE_UPDATE') {
            let location = this.engine.state.systems.find(sys => sys.id === data.locationId);
            if (!location) location = this.engine.state.ships.find(s => s.id === data.locationId);
            if (location) {
                location.buildQueue = data.queue;
                if (this.engine.selectionManager.selectedLocationId === location.id) this.engine.selectionManager.renderSelectedUI();
            }
        } else if (data.type === 'GAME_SCOUT_REPORT') {
            const system = this.engine.state.systems.find(sys => sys.id === data.systemId);
            if (system && data.team === this.engine.getTeam()) {
                system.scoutReport = data;
                if (this.engine.selectionManager.selectedLocationId === system.id) this.engine.selectionManager.renderSelectedUI();
            }
            if (data.playerId === this.engine.getIdentity().guid) {
                if (window.showScoutReport) {
                    window.showScoutReport(data.report);
                }
            }
        } else if (data.type === 'GAME_REQUEST_RESEARCH') {
            this.engine.economyService.handleResearchRequest(data);
        } else if (data.type === 'GAME_REQUEST_PLAYER_UPDATE') {
            this.engine.handlePlayerUpdateRequest(data);
        } else if (data.type === 'GAME_REQUEST_SCOUT_MISSION') {
            this.engine.movementService.handleScoutMissionRequest(data);
        } else if (data.type === 'GAME_REQUEST_EXPLORE_MISSION') {
            this.engine.movementService.handleExploreMissionRequest(data);
        } else if (data.type === 'GAME_REQUEST_SALVAGE_MISSION') {
            this.engine.movementService.handleSalvageMissionRequest(data);
        } else if (data.type === 'GAME_REQUEST_CANCEL_BUILD') {
            this.engine.economyService.handleCancelBuildRequest(data);
        } else if (data.type === 'GAME_REQUEST_PATROL') {
            this.engine.movementService.handlePatrolRequest(data);
        } else if (data.type === 'GAME_REQUEST_STOP_PATROL') {
            this.engine.movementService.handleStopPatrolRequest(data);
        } else if (data.type === 'GAME_REQUEST_REPAIR_SHIP') {
            this.engine.economyService.handleRepairShipRequest(data);
        } else if (data.type === 'GAME_REQUEST_REPAIR_FLEET') {
            this.engine.economyService.handleRepairFleetRequest(data);
        } else if (data.type === 'GAME_TECH_RESEARCHED') {
            const player = this.engine.state.players.find(p => p.id === data.playerId);
            if (player && !player.researchedTechs.includes(data.techId)) {
                player.researchedTechs.push(data.techId);
            }
        } else if (data.type === 'GAME_REQUEST_CREATE_FLEET') {
            this.engine.fleetService.handleCreateFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_UPDATE_FLEET_SHIPS') {
            this.engine.fleetService.handleUpdateFleetShipsRequest(data);
        } else if (data.type === 'GAME_REQUEST_DISBAND_FLEET') {
            this.engine.fleetService.handleDisbandFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_MOVE_FLEET') {
            this.engine.fleetService.handleMoveFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_RENAME_FLEET') {
            this.engine.fleetService.handleRenameFleetRequest(data);
        } else if (data.type === 'GAME_REQUEST_SELF_DESTRUCT') {
            this.engine.combatService.handleSelfDestructRequest(data);
        } else if (data.type === 'GAME_FLEET_UPDATE') {
            const player = this.engine.state.players.find(p => p.id === data.playerId);
            if (player) player.fleets = data.fleets;
            if (data.updatedShips) {
                data.updatedShips.forEach(shipUpdate => {
                    const ship = this.engine.state.ships.find(s => s.id === shipUpdate.id);
                    if (ship) ship.fleetId = shipUpdate.fleetId;
                });
            }
        } else if (data.type === 'GAME_PLANET_UPDATE') {
            for (const system of this.engine.state.systems) {
                const planet = system.planets.find(p => p.id === data.planetId);
                if (planet) {
                    if (data.owner !== undefined) planet.owner = data.owner;
                    if (data.captureProgress !== undefined) planet.captureProgress = data.captureProgress;
                    if (data.capturingTeam !== undefined) planet.capturingTeam = data.capturingTeam;
                    if (data.systemOwner !== undefined && (!data.systemId || data.systemId === system.id)) {
                        system.owner = data.systemOwner;
                    }
                    if (data.citadelLevel !== undefined) planet.citadelLevel = data.citadelLevel;
                    if (data.maxShield !== undefined) planet.maxShield = data.maxShield;
                    if (data.shield !== undefined) planet.shield = data.shield;
                    break;
                }
            }
        } else if (data.type === 'GAME_MINE_DEPLOYED') {
            if (!this.engine.state.mines) this.engine.state.mines = [];
            this.engine.state.mines.push(data.mine);
        } else if (data.type === 'GAME_MINES_REMOVED') {
            if (this.engine.state.mines) {
                this.engine.state.mines = this.engine.state.mines.filter(m => !data.mineIds.includes(m.id));
            }
        } else if (data.type === 'GAME_SYSTEM_RENAMED' || data.type === 'GAME_PLANET_RENAMED') {
            const system = this.engine.state.systems.find(sys => sys.id === data.systemId);
            if (system) {
                system.name = data.newName;
            }
        } else if (data.type === 'GAME_REVEAL') {
            const system = this.engine.state.systems.find(sys => sys.id === data.systemId);
            if (system && data.playerId === this.engine.getIdentity().guid) {
                system.visibility[data.playerId] = data.visibility;
                if (data.neighbors) {
                    data.neighbors.forEach(linkTargetId => {
                        const neighbor = this.engine.state.systems.find(sys => sys.id === linkTargetId);
                        if (neighbor && !neighbor.visibility[data.playerId]) neighbor.visibility[data.playerId] = 'scouted';
                    });
                }
            }
        } else if (data.type === 'GAME_TOAST') {
            if (data.playerId === this.engine.getIdentity().guid) {
                if (window.toastManager) {
                    window.toastManager.show(data.message, data.toastType || 'info');
                }
            }
        }
    }
}
