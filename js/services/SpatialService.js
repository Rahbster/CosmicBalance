import { SHIP_STATE, LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class SpatialService {
    constructor(engine) {
        this.engine = engine;
        this._systemMap = null;
        this._cachedSystemsRef = null;
    }

    getSystemEffectiveRadius(system) {
        if (system.isStation) {
            return 50; // Default radius for a station context
        }
        // A system must have a radius `r` and a `planets` array.
        if (!system || typeof system.r === 'undefined' || !Array.isArray(system.planets)) {
            return 0;
        }
        const r = system.r;
        const orbitBase = r + 10;
        const planetGap = 8;
        const planetCount = system.planets.length;
        const maxOrbitDist = planetCount > 0 ? orbitBase + ((planetCount - 1) * planetGap) : r;
        
        // Ensure radius is at least enough to cover the "parking" zone (r + 30) plus some buffer
        return Math.max(maxOrbitDist + 5, r + 60);
    }

    isShipInSystem(ship, system) {
        const dx = system.x - ship.x;
        const dy = system.y - ship.y;
        return (dx * dx + dy * dy) <= (this.getSystemEffectiveRadius(system) ** 2);
    }

    getCurrentSystem(ship) {
        if (ship.targetId) {
            return null;
        }

        if (ship.moveState === SHIP_STATE.MOVING && !ship.arrivalPoint) {
            this.engine.loggingService.log(LOG_CATEGORIES.MOVEMENT, LOG_LEVELS.WARNING, `Correcting stuck 'MOVING' state for idle ship ${ship.id}`);
            ship.moveState = SHIP_STATE.IDLE;
        }
    
        if (ship.currentSystemId) {
            const lastSystem = this.engine.state.systems.find(s => s.id === ship.currentSystemId);
            if (lastSystem && this.isShipInSystem(ship, lastSystem)) {
                return lastSystem;
            }
        }
    
        let bestSystem = null;
        let minDistSq = Infinity;
    
        for (const system of this.engine.state.systems) {
            if (this.isShipInSystem(ship, system)) {
                const dx = system.x - ship.x;
                const dy = system.y - ship.y;
                const distSq = dx * dx + dy * dy;
                
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    bestSystem = system;
                }
            }
        }
        
        ship.currentSystemId = bestSystem ? bestSystem.id : null;
        return bestSystem;
    }

    getClosestSystem(entity) {
        let closestSystem = null;
        let minDistanceSq = Infinity;

        for (const system of this.engine.state.systems) {
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

    getSystemMap() {
        if (this._cachedSystemsRef !== this.engine.state.systems) {
            this._cachedSystemsRef = this.engine.state.systems;
            this._systemMap = new Map();
            this._cachedSystemsRef.forEach(s => this._systemMap.set(s.id, s));
        }
        return this._systemMap;
    }
}