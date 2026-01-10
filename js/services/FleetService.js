import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class FleetService {
    constructor(gameEngine) {
        this.engine = gameEngine;
    }

    handleCreateFleetRequest({ senderId, name, shipIds }) {
        if (!this.engine.isHost) return;
        const player = this.engine.state.players.find(p => p.id === senderId);
        if (!player) return;

        // Remove these ships from any existing fleets to prevent duplicates (Ghost Fleets)
        player.fleets.forEach(f => {
            f.shipIds = f.shipIds.filter(id => !shipIds.includes(id));
        });
        // Remove empty fleets resulting from this operation
        player.fleets = player.fleets.filter(f => f.shipIds.length > 0);

        // Determine initial location from the first ship
        let locationId = null;
        if (shipIds.length > 0) {
            const firstShip = this.engine.state.ships.find(s => s.id === shipIds[0]);
            const system = this.engine.getCurrentSystem(firstShip);
            if (system) locationId = system.id;
        }

        const newFleet = { id: `fleet-${crypto.randomUUID()}`, name, shipIds, locationId };
        player.fleets.push(newFleet);

        shipIds.forEach(shipId => {
            const ship = this.engine.state.ships.find(s => s.id === shipId);
            if (ship && ship.owner === senderId) ship.fleetId = newFleet.id;
        });

        this.engine.broadcast({ type: 'GAME_FLEET_UPDATE', playerId: senderId, fleets: player.fleets, updatedShips: shipIds.map(id => ({ id, fleetId: newFleet.id })) });
    }

    handleDisbandFleetRequest({ senderId, fleetId }) {
        if (!this.engine.isHost) return;
        const player = this.engine.state.players.find(p => p.id === senderId);
        const fleet = player?.fleets.find(f => f.id === fleetId);
        if (!player || !fleet) return;

        const shipIds = fleet.shipIds;
        shipIds.forEach(shipId => {
            const ship = this.engine.state.ships.find(s => s.id === shipId);
            if (ship) ship.fleetId = null;
        });

        player.fleets = player.fleets.filter(f => f.id !== fleetId);

        this.engine.broadcast({ type: 'GAME_FLEET_UPDATE', playerId: senderId, fleets: player.fleets, updatedShips: shipIds.map(id => ({ id, fleetId: null })) });
    }

    handleMoveFleetRequest({ senderId, fleetId, targetSystemId }) {
        this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.INFO, `[FleetService] Move request for fleet ${fleetId} to ${targetSystemId}`);
        if (!this.engine.isHost) return;
        const player = this.engine.state.players.find(p => p.id === senderId);
        const fleet = player?.fleets.find(f => f.id === fleetId);
        if (!player || !fleet) return;

        // Host re-validates that all ships can move
        fleet.shipIds.forEach(shipId => {
            this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.DEBUG, `[FleetService] Moving ship ${shipId} in fleet ${fleetId} to ${targetSystemId}`);
            // This re-uses the existing moveShip logic, which already broadcasts the update
            this.engine.moveShip(shipId, targetSystemId);
        });
    }
}