import { SHIP_DATA } from './GalaxyService.js';
import { SHIP_STATE } from '../cb_constants.js';

export class UnitService {
    constructor(engine) {
        this.engine = engine;
    }

    spawnShip(owner, type, position, spawnInSystem = null, overrides = {}) {
        const id = crypto.randomUUID();
        const baseData = { ...SHIP_DATA[type] }; // Create a mutable copy
        const ownerPlayer = this.engine.state.players.find(p => p.id === owner.id);

        const modifiedData = this.engine.techService.applyTechToShipData(baseData, ownerPlayer);
        
        // Calculate position
        let x = position.x;
        let y = position.y;

        if (spawnInSystem && type !== 'SpaceStation') {
            // Spawn radially around the star to avoid clutter
            const angle = Math.random() * 2 * Math.PI;
            const minSpawnDist = spawnInSystem.r + 25; // Star radius + buffer
            const maxSpawnDist = this.engine.spatialService.getSystemEffectiveRadius(spawnInSystem) * 0.6;
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
            const maxDist = this.engine.spatialService.getSystemEffectiveRadius(spawnInSystem) - 5; // 5px buffer

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
        
        this.engine.broadcast({ type: 'GAME_SPAWN', ship });

        // Set initial system after broadcasting spawn so clients can do the same
        if (spawnInSystem) {
            ship.currentSystemId = spawnInSystem.id;
        } else {
            const detectedSystem = this.engine.state.systems.find(s => {
                const dx = s.x - ship.x;
                const dy = s.y - ship.y;
                return (dx * dx + dy * dy) <= (this.engine.spatialService.getSystemEffectiveRadius(s) ** 2);
            });
            if (detectedSystem) ship.currentSystemId = detectedSystem.id;
        }
        return ship;
    }
}
