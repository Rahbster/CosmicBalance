import { HULLS, COMPONENTS, DEFAULT_SHIP_DESIGNS, MAP_WIDTH, MAP_HEIGHT } from '../cb_constants.js';
import { PLANET_TYPES } from '../services/GalaxyService.js';

export class TacticalCombatSimulator {
    constructor(callbacks = {}) {
        this.state = null;
        this.random = null;
        this.localPlayerId = null;
        this.isReplay = false;
        this.initialConfig = null;
        this.playbackSpeed = 1;
        this.callbacks = callbacks; // { onToast: (msg, type) => {}, onLog: (msg) => {} }
    }

    createInstance({ system, entities, localPlayerId, seed, shipDesigns, playerNames }) {
        this.localPlayerId = localPlayerId;
        this.seed = seed || Date.now();
        this.random = this._seededRandom(this.seed);

        // Deep copy entities for replay preservation
        this.initialConfig = {
            system: JSON.parse(JSON.stringify(system)),
            entities: JSON.parse(JSON.stringify(entities)),
            localPlayerId,
            seed: this.seed,
            shipDesigns // Store designs for replay consistency if needed
        };

        this.state = {
            system: system,
            ships: [],
            projectiles: [],
            effects: [],
            battleLog: [`Battle for ${system.name} begins. Seed: ${this.seed}`],
            turn: 1,
            nextId: 0,
            nextProjectileId: 0,
            commandHistory: []
        };

        // Group entities by owner to place them on opposite sides
        const teams = new Map();
        entities.forEach(e => {
            if (!teams.has(e.owner)) {
                teams.set(e.owner, []);
            }
            teams.get(e.owner).push(e);
        });

        const teamIds = Array.from(teams.keys());
        const angleStep = 360 / teamIds.length;

        const shipCounts = {}; // Track counts for naming: "PlayerName Type N"

        teamIds.forEach((teamId, teamIndex) => {
            const angle = angleStep * teamIndex;
            const radians = angle * (Math.PI / 180);
            const placementRadius = MAP_WIDTH * 0.35;

            const teamXBase = (MAP_WIDTH / 2) + Math.cos(radians) * placementRadius;
            const teamYBase = (MAP_HEIGHT / 2) + Math.sin(radians) * placementRadius;
            const heading = (angle + 180) % 360;

            const teamShips = teams.get(teamId);
            teamShips.forEach((ship, shipIndex) => {
                let design = ship.design;
                if (!design) {
                    if (ship.designId) {
                        design = this._findDesignById(ship.designId, shipDesigns);
                    }
                    if (!design && ship.type) {
                         const map = {
                             'Fighter': 'default-wasp', 
                             'Scout': 'default-wasp',
                             'Frigate': 'default-unsc-paris',
                             'Destroyer': 'default-longbow',
                             'Cruiser': 'default-enterprise',
                             'SpaceStation': 'default-forerunner-bastion',
                             'Salvager': 'default-wasp',
                             'TroopTransport': 'default-wasp'
                         };
                         const mappedId = map[ship.type];
                         if (mappedId) design = this._findDesignById(mappedId, shipDesigns);
                    }
                }

                if (design) {
                    const shipStats = this._calculateShipStatsFromDesign(design);
                    const isPlayer = ship.owner === this.localPlayerId;

                    const typeKey = `${ship.owner}-${ship.type}`;
                    shipCounts[typeKey] = (shipCounts[typeKey] || 0) + 1;
                    const count = shipCounts[typeKey];
                    const ownerName = playerNames && playerNames[ship.owner] ? playerNames[ship.owner] : (ship.owner || 'Unknown');
                    
                    const simShip = {
                        id: `ship-${this.state.nextId++}`,
                        ...this._createShipFromDesign(design, ship.owner, isPlayer),
                        aiAssisted: !isPlayer,
                        ...shipStats,
                        name: `${ownerName} ${ship.type} ${count}`,
                        color: ship.color,
                        x: teamXBase + (this.random() * 100) - 50,
                        y: teamYBase + (shipIndex * 100) - ((teamShips.length - 1) * 50),
                        heading: heading,
                        speed: 0,
                        orders: { targetSpeed: 0, targetHeading: heading },
                        destroyed: false
                    };

                    if (ship.hull !== undefined && ship.maxHull) {
                        const healthPct = ship.hull / ship.maxHull;
                        simShip.hullIntegrity = simShip.maxHullIntegrity * healthPct;
                    }

                    this.state.ships.push(simShip);
                }
            });
        });

        // Add planets as static, targetable entities
        if (system.planets) {
            system.planets.forEach((planet, i) => {
                const typeInfo = PLANET_TYPES[planet.type];
                const planetRadius = (typeInfo?.radius || 3) * 10;
                this.state.ships.push({
                    id: `planet-${this.state.nextId++}`,
                    name: planet.name,
                    type: planet.type,
                    color: typeInfo ? typeInfo.color : '#888',
                    owner: planet.owner,
                    isPlanet: true,
                    x: (MAP_WIDTH / 2) + (i % 2 === 0 ? 200 : -200) * (Math.floor(i/2)+1),
                    y: (MAP_HEIGHT / 2) + (i % 3 === 0 ? 150 : -150) * (Math.floor(i/2)+1),
                    radius: planetRadius,
                    hp: 10000, maxHp: 10000,
                    shields: [100,100,100,100,100,100,100,100],
                    destroyed: false,
                    heading: 0, speed: 0, orders: {}, weapons: []
                });
            });
        }
    }

    getState() {
        return this.state;
    }

    executeTurn(suppressUI = false) {
        if (this.isReplay) {
            this.applyTurnOrders(this.state.turn - 1);
        }
        
        this.state.ships.filter(s => !s.destroyed).forEach(ship => {
            // --- Power Regeneration Phase ---
            ship.power = Math.min(ship.maxPower, ship.power + ship.maxPower);
            this._updateShipMovement(ship);
            this._updateShipWeapons(ship, suppressUI);
        });

        if (!this.isReplay) this.recordTurn();

        this.state.turn++;
        this._updateProjectiles(suppressUI);
    }

    aiGenerateOrders() {
        const allShips = this.state.ships.filter(s => !s.destroyed && !s.isPlanet);    
        const shipsToControl = allShips.filter(s => s.aiAssisted);
        
        shipsToControl.forEach(aiShip => {
            const enemies = allShips.filter(s => s.owner !== aiShip.owner);
            if (enemies.length === 0) return;

            let primaryTarget = null;
            const existingTargetId = aiShip.weapons.find(w => w.targetId && enemies.some(e => e.id === w.targetId))?.targetId;
            if (existingTargetId) {
                primaryTarget = enemies.find(e => e.id === existingTargetId);
            }

            if (!primaryTarget) {
                let closestEnemy = null;
                let minDistance = Infinity;
                enemies.forEach(potentialTarget => {
                    const d = Math.sqrt(Math.pow(potentialTarget.x - aiShip.x, 2) + Math.pow(potentialTarget.y - aiShip.y, 2));
                    if (d < minDistance) {
                        minDistance = d;
                        closestEnemy = potentialTarget;
                    }
                });
                primaryTarget = closestEnemy;
            }

            if (primaryTarget) {
                const dx = primaryTarget.x - aiShip.x;
                const dy = primaryTarget.y - aiShip.y;
                const distance = Math.sqrt(dx*dx + dy*dy);

                let targetHeading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
                if (targetHeading < 0) targetHeading += 360;
                aiShip.orders.targetHeading = Math.round(targetHeading);
                aiShip.orders.targetSpeed = (distance > 400) ? 100 : 50;
                aiShip.weapons.forEach(w => w.targetId = primaryTarget.id);
            }
        });
    }

    recordTurn() {
        if (this.isReplay) return;
        const turnOrders = this.state.ships.map(ship => ({
            id: ship.id,
            orders: { ...ship.orders },
            weaponTargets: ship.weapons.map(w => w.targetId)
        }));
        this.state.commandHistory.push(turnOrders);
    }

    applyTurnOrders(turnIndex) {
        if (!this.state.commandHistory[turnIndex]) return;
        const turnOrders = this.state.commandHistory[turnIndex];
        
        turnOrders.forEach(orderData => {
            const ship = this.state.ships.find(s => s.id === orderData.id);
            if (ship) {
                ship.orders = orderData.orders;
                if (orderData.weaponTargets) {
                    ship.weapons.forEach((w, i) => {
                        w.targetId = orderData.weaponTargets[i] || null;
                    });
                }
            }
        });
    }

    _seededRandom(seed) {
        let s = seed;
        return function() {
            s = Math.sin(s) * 10000;
            return s - Math.floor(s);
        };
    }

    _findDesignById(designId, shipDesigns) {
        const allDesigns = [...DEFAULT_SHIP_DESIGNS, ...(shipDesigns || [])];
        return allDesigns.find(d => d.id === designId);
    }

    _calculateShipStatsFromDesign(design, difficulty = 'easy') {
        let hull = HULLS.find(h => h.id === design.hull);
        if (!hull) {
            console.warn(`[TacticalCombat] Hull definition not found for design: ${design.name}. Using default.`);
            hull = { id: 'default', name: 'Unknown Hull', mass: 10, size: 1 };
        }

        const driveCount = design.components.filter(c => c.category === 'drives').reduce((sum, c) => sum + c.count, 0);
        const maxAccel = driveCount * 2;
        const powerPerEngine = 8 + (difficulty === 'medium' ? 1 : (difficulty === 'hard' ? 3 : 0));
        const totalPower = design.components.filter(c => c.category === 'engines').reduce((sum, c) => sum + c.count, 0) * powerPerEngine;

        const hullSpace = design.components.filter(c => c.category === 'hull').reduce((sum, c) => sum + c.count, 0);
        const minHullSpace = hull.mass / 2;
        let efficiency = 1;
        if (hullSpace >= minHullSpace * 2) efficiency = 3;
        else if (hullSpace >= minHullSpace * 1.5) efficiency = 2;

        return {
            hp: hull.mass,
            maxHp: hull.mass,
            hullIntegrity: hull.mass,
            maxHullIntegrity: hull.mass,
            acceleration: maxAccel,
            maxSpeed: maxAccel * 2,
            efficiency: efficiency,
            power: totalPower,
            maxPower: totalPower
        };
    }

    _createShipFromDesign(design, owner, isPlayerFlag) {
        const ship = { ...design };
        ship.weapons = [];
        ship.systems = [];
        ship.components.forEach(comp => {
            if (comp.category === 'weapons') {
                const weaponTemplate = COMPONENTS.weapons.find(w => w.id === comp.id);
                ship.weapons.push({ ...weaponTemplate, count: comp.count, cooldownRemaining: 0, targetId: null, arcs: comp.arcs });
            } else {
                const componentTemplate = COMPONENTS[comp.category].find(c => c.id === comp.id);
                if (componentTemplate) {
                    ship.systems.push({ ...componentTemplate, status: 'active', ...comp });
                }
            }
        });
        ship.owner = owner;
        ship.isPlayer = isPlayerFlag;
        return ship;
    }

    _updateShipMovement(ship) {
        const headingDiff = (ship.orders.targetHeading - ship.heading + 360) % 360;
        const turnRate = ship.acceleration * 10;
        if (headingDiff !== 0) {
            const turnDirection = (headingDiff > 180) ? -1 : 1;
            const turnAmount = Math.min(turnRate, Math.abs(headingDiff <= 180 ? headingDiff : 360 - headingDiff));
            ship.heading = (ship.heading + turnAmount * turnDirection + 360) % 360;
        }

        const speedDiff = ship.orders.targetSpeed - ship.speed;
        if (speedDiff !== 0) {
            const accelAmount = Math.min(ship.acceleration, Math.abs(speedDiff));
            ship.speed += Math.sign(speedDiff) * accelAmount;
            ship.speed = Math.max(0, Math.min(ship.speed, ship.maxSpeed));
        }

        const radians = (ship.heading - 90) * (Math.PI / 180);
        ship.x += ship.speed * Math.cos(radians) * 0.1;
        ship.y += ship.speed * Math.sin(radians) * 0.1;

        ship.x = Math.max(0, Math.min(MAP_WIDTH, ship.x));
        ship.y = Math.max(0, Math.min(MAP_HEIGHT, ship.y));
    }

    _updateShipWeapons(ship, suppressUI) {
        ship.weapons.forEach(weapon => {
            if (weapon.cooldownRemaining > 0) weapon.cooldownRemaining--;

            if (weapon.targetId && weapon.cooldownRemaining === 0 && ship.power >= weapon.powerCost) {
                const target = this.state.ships.find(s => s.id === weapon.targetId);
                if (target) {
                    const distance = Math.sqrt(Math.pow(target.x - ship.x, 2) + Math.pow(target.y - ship.y, 2));
                    if (distance <= weapon.range) {
                        weapon.cooldownRemaining = weapon.cooldown;
                        ship.power -= weapon.powerCost;
                        if (weapon.type === 'beam' && !target.isPlanet) {
                            this.state.effects.push({ type: 'beam', sourceId: ship.id, targetId: target.id, weapon: weapon });
                            this._applyDamage(ship, target, weapon, suppressUI);
                        } else if (weapon.type === 'projectile') {
                            this.state.projectiles.push({
                                id: `proj-${this.state.nextProjectileId++}`, ownerId: ship.id, targetId: target.id,
                                x: ship.x, y: ship.y, heading: ship.heading, speed: weapon.speed,
                                damage: weapon.damage, weapon: weapon,
                            });
                            this.state.battleLog.push(`${ship.name} launches a missile at ${target.name}.`);
                            if (!suppressUI && this.callbacks.onToast) this.callbacks.onToast(`${ship.name} launches a missile at ${target.name}!`, 'info');
                        }
                    }
                }
            } else if (weapon.targetId && ship.power < weapon.powerCost) {
                if (ship.isPlayer && !suppressUI && this.callbacks.onToast) this.callbacks.onToast(`${ship.name}: Insufficient power to fire ${weapon.name}!`, 'error');
            }
        });
    }

    _updateProjectiles(suppressUI) {
        const newProjectiles = [];
        this.state.projectiles.forEach(proj => {
            const target = this.state.ships.find(s => s.id === proj.targetId);
            if (!target || target.destroyed) return;

            const dx = target.x - proj.x;
            const dy = target.y - proj.y;
            const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
            proj.heading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

            if (distanceToTarget <= proj.speed) {
                this._applyDamage(proj, target, proj.weapon, suppressUI);
            } else {
                const radians = (proj.heading - 90) * (Math.PI / 180);
                proj.x += proj.speed * Math.cos(radians);
                proj.y += proj.speed * Math.sin(radians);
                newProjectiles.push(proj);
            }
        });
        this.state.projectiles = newProjectiles;
    }

    _applyDamage(source, target, weapon, suppressUI) {
        if (target.destroyed) return;

        this.state.effects.push({ type: 'impact', targetId: target.id });
        
        const dx = source.x - target.x;
        const dy = source.y - target.y;
        
        let attackAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        let relativeAngle = (attackAngle - target.heading + 360 + 90) % 360;
        const shieldIndex = Math.round(relativeAngle / 45) % 8;

        let damage = weapon.damage;
        const shieldValue = target.shields[shieldIndex];
        if (shieldValue > 0) {
            const damageAbsorbed = Math.min(shieldValue, damage);
            target.shields[shieldIndex] -= damageAbsorbed;
            damage -= damageAbsorbed;
            this.state.effects.push({
                type: 'text',
                text: `(${damageAbsorbed.toFixed(0)})`,
                x: target.x,
                y: target.y - 15,
                color: '#00ffff' // Cyan for shields
            });
            if (!suppressUI && this.callbacks.onToast) this.callbacks.onToast(`Shield arc ${shieldIndex + 1} on ${target.name} absorbed ${damageAbsorbed} damage!`, 'info');
        }

        if (damage > 0) {
            const armorLayers = target.components.find(c => c.category === 'armor')?.count || 0;
            if (armorLayers > 0) this.state.battleLog.push(`${target.name}'s armor absorbs ${Math.min(damage, armorLayers)} damage.`);
            damage = Math.max(0, damage - armorLayers);

            if (damage > 0) {
                if (target.hullIntegrity > 0) {
                    const absorbed = Math.min(target.hullIntegrity, damage);
                    target.hullIntegrity -= absorbed;
                    damage -= absorbed;
                    this.state.effects.push({
                        type: 'text',
                        text: `-${absorbed.toFixed(0)}`,
                        x: target.x,
                        y: target.y,
                        color: '#ff4444' // Red for hull
                    });
                    this.state.battleLog.push(`${target.name} takes ${absorbed.toFixed(0)} hull damage.`);
                    if (!suppressUI && this.callbacks.onToast) this.callbacks.onToast(`${target.name} hull integrity damaged for ${absorbed.toFixed(0)}!`, 'error');
                }

                const systemDamage = damage;
                if (systemDamage > 0) {
                    const hits = Math.floor(systemDamage / 5) + 1;
                    for (let i = 0; i < hits; i++) {
                        this._applySystemHit(target, suppressUI);
                    }
                }
            } else {
                if (!suppressUI && this.callbacks.onToast) this.callbacks.onToast(`${target.name}'s armor absorbed the hit!`, 'info');
                this.state.battleLog.push(`${target.name}'s armor absorbed the hit.`);
            }
        }

        if (target.hullIntegrity <= 0 || (target.criticalHits || 0) >= target.maxHp) {
            target.destroyed = true;
            if (!suppressUI && this.callbacks.onToast) this.callbacks.onToast(`${target.name} has been destroyed!`, 'error');
            this.state.battleLog.push(`${target.name} has been destroyed!`);
        }
    }

    _applySystemHit(target, suppressUI) {
        const activeComponents = target.components.filter(c => c.status !== 'destroyed');
        if (activeComponents.length === 0) return;

        const hitComponent = activeComponents[Math.floor(Math.random() * activeComponents.length)];
        hitComponent.status = 'destroyed';
        this.state.battleLog.push(`${target.name} takes a component hit! ${hitComponent.name} destroyed.`);
        if (!suppressUI && this.callbacks.onToast) this.callbacks.onToast(`${target.name} takes a component hit! ${hitComponent.name} destroyed!`, 'error');

        if (['drives', 'engines', 'warp'].includes(hitComponent.category)) {
            target.criticalHits = (target.criticalHits || 0) + 1;
            if (!suppressUI && this.callbacks.onToast) this.callbacks.onToast(`${target.name} suffers a Critical Hit!`, 'error');
        }
    }
}