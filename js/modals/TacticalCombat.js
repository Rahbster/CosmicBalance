import { dom, appState, dataChannels } from '../scripts.js';
import { showToast } from '../ui.js';
import { HULLS, COMPONENTS, DEFAULT_SHIP_DESIGNS, MAP_WIDTH, MAP_HEIGHT } from '../cb_constants.js';

let currentZoom = 1.0; // Start with a default zoom level

export function startCombat(attackingFleet, defendingFleet) {
    injectCombatStyles(); // Inject the sci-fi HUD styles
    const gameState = appState.soloGameState;
    gameState.combat.active = true;
    gameState.combat.attackingFleetId = attackingFleet.id;
    gameState.combat.defendingFleetId = defendingFleet.id;
    gameState.combat.ships = [];

    const playerXBase = 200;
    const playerYBase = 500;
    const enemyXBase = 800;
    const enemyYBase = 500;
    const positionVariance = 50;
    const playerHeading = Math.random() * 45;
    const enemyHeading = 180 - (Math.random() * 45);

    // --- Add Attacking Fleet Ships ---
    attackingFleet.ships.forEach((shipInfo, index) => {
        const design = findDesignById(shipInfo.designId);
        if (design) {
            const shipStats = calculateShipStatsFromDesign(design);
            gameState.combat.ships.push({
                id: `player-${index + 1}`,
                ...createShipFromDesign(design, 'player1', true),
                aiAssisted: false,
                ...shipStats,
                x: playerXBase + (Math.random() * positionVariance * 2) - positionVariance,
                y: (playerYBase - 50) + (index * 100) + (Math.random() * positionVariance) - (positionVariance / 2),
                heading: playerHeading, speed: 0, orders: { targetSpeed: 0, targetHeading: playerHeading }, destroyed: false
            });
        }
    });

    // --- Add Defending Fleet Ships ---
    const difficulty = dom.difficultySelector.value;
    defendingFleet.ships.forEach((shipInfo, index) => {
        const design = findDesignById(shipInfo.designId);
        if (design) {
            const shipStats = calculateShipStatsFromDesign(design, difficulty);
            gameState.combat.ships.push({
                id: `enemy-${index + 1}`,
                ...createShipFromDesign(design, defendingFleet.ownerId, false),
                aiAssisted: true,
                ...shipStats,
                name: `${defendingFleet.ownerId} Ship ${index + 1}`,
                x: enemyXBase + (Math.random() * positionVariance * 2) - positionVariance,
                y: enemyYBase + (index * 100) - ((defendingFleet.ships.length - 1) * 50),
                heading: enemyHeading,
                speed: 0,
                orders: { targetSpeed: 50, targetHeading: enemyHeading },
                destroyed: false
            });
        }
    });

    gameState.combat.turn = 1;

    if (!gameState.combat.selectedShipId) {
        const playerShip = gameState.combat.ships.find(s => s.isPlayer);
        if (playerShip) {
            gameState.combat.selectedShipId = playerShip.id;
        }
    }

    document.getElementById('starmap-view').classList.add('hidden');
    document.getElementById('ship-designer-view').classList.add('hidden');
    document.getElementById('combat-map-view').classList.remove('hidden');

    // Hide the main ship designer button during combat
    document.getElementById('ship-designer-btn-main').classList.add('hidden');
    const aboutBtn = document.getElementById('about-btn-main');
    if (aboutBtn) aboutBtn.classList.add('hidden');

    renderCombatMap();
    renderCombatInfoPanel();
}

function findDesignById(designId) {
    const allDesigns = [...DEFAULT_SHIP_DESIGNS, ...appState.soloGameState.shipDesigns];
    return allDesigns.find(d => d.id === designId);
}

/**
 * Calculates the core combat stats for a ship based on its design.
 * @param {object} design - The ship design object.
 * @param {string} [difficulty='easy'] - AI difficulty for stat bonuses.
 * @returns {object} An object containing the calculated stats.
 */
function calculateShipStatsFromDesign(design, difficulty = 'easy') {
    const hull = HULLS.find(h => h.id === design.hull);
    const driveCount = design.components.filter(c => c.category === 'drives').reduce((sum, c) => sum + c.count, 0);
    const maxAccel = driveCount * 2;

    let powerBonus = 0;
    if (difficulty === 'medium') powerBonus = 1;
    if (difficulty === 'hard') powerBonus = 3;
    const powerPerEngine = 8 + powerBonus;
    const totalPower = design.components.filter(c => c.category === 'engines').reduce((sum, c) => sum + c.count, 0) * powerPerEngine;

    const hullSpace = design.components.filter(c => c.category === 'hull').reduce((sum, c) => sum + c.count, 0);
    const minHullSpace = hull.mass / 2;
    let efficiency = 1;
    if (hullSpace >= minHullSpace * 2) {
        efficiency = 3;
    } else if (hullSpace >= minHullSpace * 1.5) {
        efficiency = 2;
    }

    return {
        hp: hull.mass,
        maxHp: hull.mass,
        hullIntegrity: hull.mass, // Initial hull integrity is also based on mass
        maxHullIntegrity: hull.mass,
        acceleration: maxAccel,
        maxSpeed: maxAccel * 2,
        efficiency: efficiency,
        power: totalPower,
        maxPower: totalPower
    };
}

function createShipFromDesign(design, owner, isPlayerFlag) {
    const ship = { ...design };
    ship.weapons = [];
    ship.systems = []; // Use a new array for combat-specific component data
    ship.components.forEach(comp => {
        if (comp.category === 'weapons') {
            const weaponTemplate = COMPONENTS.weapons.find(w => w.id === comp.id);
            // Create a single weapon entry with a count, rather than multiple individual weapons
            ship.weapons.push({ ...weaponTemplate, count: comp.count, cooldownRemaining: 0, targetId: null, arcs: comp.arcs });
        } else {
            // Add other components with a status for damage tracking
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

export function endCombat() {
    const gameState = appState.soloGameState;
    const attackingFleet = gameState.fleets.find(f => f.id === gameState.combat.attackingFleetId);
    const defendingFleet = gameState.fleets.find(f => f.id === gameState.combat.defendingFleetId);
    const combatSystem = gameState.systems.find(s => s.id === defendingFleet.locationId);

    // Update fleets with surviving ships
    const survivingAttackers = gameState.combat.ships.filter(s => s.owner === attackingFleet.ownerId && !s.destroyed);
    const survivingDefenders = gameState.combat.ships.filter(s => s.owner === defendingFleet.ownerId && !s.destroyed);

    attackingFleet.ships = survivingAttackers.map(s => ({ designId: s.designId }));
    defendingFleet.ships = survivingDefenders.map(s => ({ designId: s.designId }));

    // Handle combat outcome
    if (survivingDefenders.length === 0 && survivingAttackers.length > 0) {
        // Attacker wins, takes control of the system
        showToast(`${attackingFleet.ownerId} has conquered ${combatSystem.name}!`, 'info');
        combatSystem.ownerId = attackingFleet.ownerId;
        combatSystem.color = gameState.players.find(p => p.id === attackingFleet.ownerId).color;
        attackingFleet.locationId = combatSystem.id; // Move the victorious fleet
    } else if (survivingAttackers.length === 0) {
        showToast(`The attack on ${combatSystem.name} was repelled!`, 'info');
        // Attacker is destroyed, defender holds.
    } else {
        showToast(`The battle for ${combatSystem.name} ends in a stalemate.`, 'info');
        // Both sides have survivors, attacker retreats to original location.
    }

    // Clean up destroyed fleets
    appState.soloGameState.fleets = gameState.fleets.filter(f => f.ships.length > 0);

    // Reset combat state
    gameState.combat.active = false;

    document.getElementById('combat-map-view').classList.add('hidden');
    document.getElementById('ship-designer-view').classList.add('hidden');
    document.getElementById('starmap-view').classList.remove('hidden');
    document.getElementById('ship-designer-btn-main').classList.remove('hidden');
    const aboutBtn = document.getElementById('about-btn-main');
    if (aboutBtn) aboutBtn.classList.remove('hidden');
    document.getElementById('info-panel-content').innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';
}

function runGameLoop() {
    executeTurn();
    requestAnimationFrame(renderCombatMap);
}

function createShieldOctagon(shields) {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute('class', 'ship-shield-octagon');
    svg.setAttribute('viewBox', '0 0 100 100');

    const points = [
        "50,0 65,15 35,15", "65,15 85,35 70.7,29.3", "85,35 100,50 85,65",
        "85,65 70.7,70.7 65,85", "65,85 50,100 35,85", "35,85 29.3,70.7 15,65",
        "15,65 0,50 15,35", "15,35 29.3,29.3 35,15"
    ];

    shields.forEach((strength, i) => {
        const polygon = document.createElementNS(svgNS, 'polygon');
        polygon.setAttribute('points', points[i]);
        polygon.setAttribute('fill-opacity', strength / 10);
        svg.appendChild(polygon);
    });

    return svg;
}

function renderCombatMap() {
    const combatMap = document.getElementById('combat-map-view');
    const scaleBar = document.getElementById('combat-scale-bar');
    combatMap.innerHTML = '';

    const ships = appState.soloGameState.combat.ships.filter(s => !s.destroyed);
    const projectiles = appState.soloGameState.combat.projectiles;
    const effects = appState.soloGameState.combat.effects;
    if (ships.length === 0) return;

    // --- Auto-Zoom Logic ---
    // Find the bounding box of all ships
    const minX = Math.min(...ships.map(s => s.x));
    const maxX = Math.max(...ships.map(s => s.x));
    const minY = Math.min(...ships.map(s => s.y));
    const maxY = Math.max(...ships.map(s => s.y));

    const fleetWidth = maxX - minX;
    const fleetHeight = maxY - minY;

    // Determine the appropriate zoom level. The goal is to fit the max distance within ~80% of the view.
    const zoomX = (MAP_WIDTH * 0.9) / (fleetWidth || MAP_WIDTH); // Use 90% of view for a tighter fit
    const zoomY = (MAP_HEIGHT * 0.9) / (fleetHeight || MAP_HEIGHT);
    const targetZoom = Math.min(zoomX, zoomY);

    // Snap to discrete zoom levels (e.g., 0.5, 1, 2, 4)
    const zoomLevels = [0.25, 0.5, 1, 2, 4, 8]; // Added more zoom levels
    currentZoom = zoomLevels.reduce((prev, curr) => {
        return (Math.abs(curr - targetZoom) < Math.abs(prev - targetZoom) ? curr : prev);
    });


    // Calculate a weighted center of gravity based on ship mass
    const { totalX, totalY, totalMass } = ships.reduce((acc, ship) => {
        const mass = ship.mass || 1; // Default to 1 if mass is not defined
        acc.totalX += ship.x * mass;
        acc.totalY += ship.y * mass;
        acc.totalMass += mass;
        return acc;
    }, { totalX: 0, totalY: 0, totalMass: 0 });
    const centerX = totalX / totalMass;
    const centerY = totalY / totalMass;

    const viewCenterX = MAP_WIDTH / 2;
    const viewCenterY = MAP_HEIGHT / 2;
    const offsetX = viewCenterX - centerX;
    const offsetY = viewCenterY - centerY;

    ships.forEach(ship => {
        const shipDiv = document.createElement('div');
        shipDiv.className = 'ship';
        shipDiv.id = `ship-${ship.id}`;
        if (!ship.isPlayer) shipDiv.classList.add('enemy');

        const shipVisual = document.createElement('div');
        shipVisual.className = 'ship-visual';
        const shieldOctagon = createShieldOctagon(ship.shields);
        const statusBarContainer = document.createElement('div');
        statusBarContainer.className = 'ship-status-bars';
        const hullPercentage = (ship.hp / ship.maxHp) * 100;
        const hullBar = document.createElement('div');
        hullBar.className = 'status-bar-container';
        hullBar.innerHTML = `<div class="status-bar" style="width: ${hullPercentage}%; background-color: #4CAF50;"></div>`;
        statusBarContainer.appendChild(hullBar);
        
        const displayX = ship.x + offsetX;
        const displayY = ship.y + offsetY;

        shipDiv.style.left = `${(viewCenterX + (displayX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
        shipDiv.style.top = `${(viewCenterY + (displayY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
        shipDiv.style.transform = `rotate(${ship.heading}deg)`;

        shipDiv.appendChild(shieldOctagon);
        shipDiv.appendChild(shipVisual);
        shipDiv.appendChild(statusBarContainer);

        if (ship.isPlayer) {
            const weaponArc = 120;
            const startAngle = -weaponArc / 2;
            ship.weapons.forEach((weapon, index) => {
                const weaponSelector = document.createElement('div');
                weaponSelector.className = 'weapon-selector';
                weaponSelector.style.backgroundColor = weapon.color;
                const angle = startAngle + (weaponArc / (ship.weapons.length -1 || 1)) * index;
                weaponSelector.style.transform = `rotate(${angle}deg) translate(25px) rotate(${-angle}deg)`;
                weaponSelector.addEventListener('mousedown', (e) => startDragTargeting(e, ship, index));
                shipDiv.appendChild(weaponSelector);
            });
        }
        shipDiv.addEventListener('click', () => {
            appState.soloGameState.combat.selectedShipId = ship.id;
            renderCombatInfoPanel();
        });

        const isMyShip = (appState.isInitiator && ship.owner === 'player1') || (!appState.isInitiator && ship.owner === 'player2');
        if (isMyShip) {
            shipDiv.style.cursor = 'crosshair';
            shipDiv.addEventListener('mousedown', (e) => startDragOrder(e, ship));
        }

        if (!ship.isPlayer) {
            shipDiv.addEventListener('dblclick', () => {
                const selectedPlayerShip = appState.soloGameState.combat.ships.find(s => s.id === appState.soloGameState.combat.selectedShipId && s.isPlayer);
                if (selectedPlayerShip) {
                    setTargetForAllWeapons(selectedPlayerShip, ship.id);
                }
            });
        }
        combatMap.appendChild(shipDiv);
    });

    projectiles.forEach(proj => {
        const projDiv = document.createElement('div');
        projDiv.className = 'projectile missile';
        const displayX = proj.x + offsetX;
        const displayY = proj.y + offsetY;
        projDiv.style.left = `${(viewCenterX + (displayX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
        projDiv.style.top = `${(viewCenterY + (displayY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
        projDiv.style.transform = `rotate(${proj.heading}deg)`;
        combatMap.appendChild(projDiv);
    });

    effects.forEach(effect => {
        if (effect.type === 'beam') {
            const source = ships.find(s => s.id === effect.sourceId);
            const target = ships.find(s => s.id === effect.targetId);
            if (source && target) {
                const startX = source.x + offsetX;
                const startY = source.y + offsetY;
                const endX = target.x + offsetX;
                const endY = target.y + offsetY;
                const beam = document.createElement('div'); //NOSONAR
                beam.className = 'weapon-fire';
                beam.style.background = `linear-gradient(90deg, rgba(255,0,0,0) 0%, ${effect.weapon.color} 50%, rgba(255,0,0,0) 100%)`;
                beam.style.boxShadow = `0 0 8px ${effect.weapon.color}`;
                beam.style.left = `${(viewCenterX + (startX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
                beam.style.top = `${(viewCenterY + (startY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
                const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)) * currentZoom;
                beam.style.width = `${distance}px`;
                beam.style.transform = `rotate(${Math.atan2(endY - startY, endX - startX) * 180 / Math.PI}deg)`;
                combatMap.appendChild(beam);
                setTimeout(() => beam.remove(), 300);
            }
        } else if (effect.type === 'impact') {
            const target = ships.find(s => s.id === effect.targetId);
            if (target) {
                const impactX = target.x + offsetX;
                const impactY = target.y + offsetY;
                const explosion = document.createElement('div');
                explosion.className = 'impact-explosion';
                explosion.style.left = `${(viewCenterX + (impactX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
                explosion.style.top = `${(viewCenterY + (impactY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
                combatMap.appendChild(explosion);
                setTimeout(() => explosion.remove(), 400);
            }
        }
    });

    appState.soloGameState.combat.effects = [];

    // --- Render Scale Bar ---
    scaleBar.innerHTML = '';
    const scaleWidth = scaleBar.offsetWidth;
    const mapUnitsPerPixel = (MAP_WIDTH / currentZoom) / scaleWidth;

    // Create a tick mark for every 100 map units
    const tickIntervalMapUnits = 100;
    const tickIntervalPixels = tickIntervalMapUnits / mapUnitsPerPixel;

    for (let i = 0; i * tickIntervalPixels < scaleWidth; i++) {
        const tick = document.createElement('div');
        tick.className = 'scale-tick';
        tick.style.left = `${i * tickIntervalPixels}px`;
        if (i > 0) {
            tick.dataset.label = `${i * tickIntervalMapUnits}`;
        }
        scaleBar.appendChild(tick);
    }
}

function injectCombatStyles() {
    if (document.getElementById('combat-styles')) return;
    const style = document.createElement('style');
    style.id = 'combat-styles';
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');

        :root {
            --space-blue: #0a1a2f;
            --cosmic-purple: #6c3fd1;
            --glass-accent: #aee1f9;
            --glass-bg: rgba(20, 30, 50, 0.75);
            --glass-border: 1px solid rgba(174, 225, 249, 0.3);
            --font-main: "Orbitron", Arial, sans-serif;
            --glow: 0 0 10px var(--glass-accent), 0 0 20px var(--cosmic-purple);
        }

        /* Override default info panel container for combat */
        #combat-map-view ~ #info-panel {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            pointer-events: none; /* Let clicks pass through to map */
        }

        /* The actual content box */
        #info-panel-content {
            pointer-events: auto;
            background: var(--glass-bg);
            border: var(--glass-border);
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), var(--glow);
            backdrop-filter: blur(8px);
            padding: 20px;
            color: #fff;
            font-family: var(--font-main);
            transition: all 0.3s ease;
        }

        #info-panel-content h3, #info-panel-content h4 {
            color: var(--glass-accent);
            text-shadow: 0 0 8px var(--cosmic-purple);
            letter-spacing: 2px;
            margin-top: 0;
            border-bottom: 1px solid rgba(174, 225, 249, 0.2);
            padding-bottom: 10px;
            margin-bottom: 15px;
            font-weight: 700;
        }

        .combat-btn {
            background: rgba(20, 30, 50, 0.6);
            color: var(--glass-accent);
            border: 1px solid var(--glass-accent);
            border-radius: 20px;
            padding: 8px 16px;
            font-family: var(--font-main);
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 8px;
            width: 100%;
            box-shadow: 0 0 5px rgba(174, 225, 249, 0.2);
        }

        .combat-btn:hover:not(:disabled) {
            background: var(--cosmic-purple);
            color: #fff;
            box-shadow: 0 0 15px var(--glass-accent);
            transform: scale(1.02);
        }

        .combat-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            border-color: #555;
            color: #888;
        }

        .combat-stat-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 6px;
            font-size: 0.9rem;
            color: #ddd;
        }

        .combat-input {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--glass-accent);
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: var(--font-main);
            width: 60px;
            text-align: center;
        }
        
        .combat-select {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--glass-accent);
            color: #fff;
            padding: 4px;
            border-radius: 4px;
            font-family: var(--font-main);
            width: 100%;
            margin-top: 2px;
        }

        .weapon-control {
            background: rgba(255, 255, 255, 0.05);
            padding: 8px;
            border-radius: 8px;
            margin-bottom: 8px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
    `;
    document.head.appendChild(style);
}

function renderCombatInfoPanel() {
    const infoPanelContent = document.getElementById('info-panel-content');
    const gameState = appState.soloGameState;
    const selectedShip = gameState.combat.ships.find(s => s.id === gameState.combat.selectedShipId);

    if (!selectedShip) {
        infoPanelContent.innerHTML = '<h3>No Ship Selected</h3>';
        return;
    }

    if (selectedShip.destroyed) {
        infoPanelContent.innerHTML = `<h3>Ship Destroyed</h3><p>${selectedShip.name} has been destroyed.</p>`;
        return;
    }

    const isMyShip = (appState.isInitiator && selectedShip.owner === 'player1') || (!appState.isInitiator && selectedShip.owner === 'player2');
    const isHost = appState.isInitiator;

    infoPanelContent.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3>Tactical HUD</h3>
            <span style="font-size:0.8em; color:var(--glass-accent);">TURN ${gameState.combat.turn}</span>
        </div>
        
        <div class="ai-assist-toggle" style="${!isMyShip ? 'display:none;' : ''}; margin-bottom: 10px;">
            <label for="ai-assist-checkbox" style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="ai-assist-checkbox" ${selectedShip.aiAssisted ? 'checked' : ''}>
                <span style="color:var(--glass-accent);">AI Assistant</span>
            </label>
        </div>

        <h4>${selectedShip.name}</h4>
        <div class="combat-stat-row">
            <span>Hull Integrity:</span>
            <span style="color:${selectedShip.hullIntegrity < selectedShip.maxHullIntegrity * 0.5 ? '#ff4444' : '#4caf50'}">
                ${selectedShip.hullIntegrity.toFixed(0)} / ${selectedShip.maxHullIntegrity}
            </span>
        </div>
        <div class="combat-stat-row">
            <span>Speed: ${selectedShip.speed.toFixed(0)}</span>
            <span>Hdg: ${selectedShip.heading.toFixed(0)}&deg;</span>
        </div>

        <div class="shields-display" style="margin: 10px 0;">
            ${selectedShip.shields.map((s, i) => `<div class="shield-arc" title="Shield ${i+1}">${s}</div>`).join('')}
        </div>

        ${isMyShip ? `
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <div style="flex:1;">
                <label style="font-size:0.8em; display:block; margin-bottom:2px;">Speed</label>
                <input type="number" id="speed-order" class="combat-input" value="${selectedShip.orders.targetSpeed}" min="0" max="${selectedShip.maxSpeed}" style="width:100%">
            </div>
            <div style="flex:1;">
                <label style="font-size:0.8em; display:block; margin-bottom:2px;">Heading</label>
                <input type="number" id="heading-order" class="combat-input" value="${selectedShip.orders.targetHeading}" min="0" max="359" style="width:100%">
            </div>
        </div>
        
        <h4>Weapons</h4>
        ${selectedShip.weapons.map((w, i) => `
            <div class="weapon-control">
                <div class="weapon-name" data-weapon-index="${i}" style="cursor: crosshair; color: ${w.color}; text-shadow: 0 0 5px ${w.color}; font-size:0.9em; margin-bottom:4px; display:flex; justify-content:space-between;">
                    <span>${w.name}</span>
                    <span>${w.cooldownRemaining > 0 ? `RELOAD ${w.cooldownRemaining}` : 'READY'}</span>
                </div>
                <select id="weapon-target-${i}" class="combat-select">
                    <option value="">-- Select Target --</option>
                    ${gameState.combat.ships.filter(t => t.owner !== selectedShip.owner && !t.destroyed).map(t => `<option value="${t.id}" ${w.targetId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
            </div>
        `).join('')}
        <button id="submit-orders-btn" class="combat-btn">Submit Orders</button>
        ` : ''}
        
        <div style="margin-top:20px; border-top: 1px solid rgba(174, 225, 249, 0.2); padding-top:10px;">
            <button id="end-turn-btn" class="combat-btn" ${!isHost ? 'disabled' : ''}>End Turn</button>
            <button id="leave-combat-btn" class="combat-btn" style="border-color:#ff4444; color:#ff4444;">Leave Combat</button>
        </div>
    `;

    document.getElementById('leave-combat-btn').onclick = endCombat;
    document.getElementById('end-turn-btn').onclick = runGameLoop;

    const aiAssistCheckbox = document.getElementById('ai-assist-checkbox');
    if (aiAssistCheckbox) {
        aiAssistCheckbox.onchange = (e) => {
            selectedShip.aiAssisted = e.target.checked;
            showToast(`AI Assistant for ${selectedShip.name} is now ${e.target.checked ? 'ON' : 'OFF'}.`, 'info');
            if (e.target.checked) aiGenerateOrders(); // Immediately generate orders if enabled
        };
    }

    if (isMyShip) {
        const submitBtn = document.getElementById('submit-orders-btn');
        if (isHost) {
            submitBtn.style.display = 'none';
        } else {
            submitBtn.onclick = () => {
                const movementOrders = {
                    targetSpeed: parseInt(document.getElementById('speed-order').value, 10),
                    targetHeading: parseInt(document.getElementById('heading-order').value, 10)
                };
                const weaponOrders = selectedShip.weapons.map((w, i) => ({
                    index: i,
                    targetId: document.getElementById(`weapon-target-${i}`).value
                }));
                const orderMessage = {
                    type: 'move', game: 'cosmicbalance', shipId: selectedShip.id,
                    orders: movementOrders, weaponOrders: weaponOrders
                };
                if (dataChannels.length > 0) {
                    dataChannels[0].send(JSON.stringify(orderMessage));
                    showToast(`All orders sent for ${selectedShip.name}.`, 'info');
                }
            };
        }
    }
}

function gatherHostOrders() {
    const combatState = appState.soloGameState.combat;
    const hostShips = combatState.ships.filter(s => s.owner === 'player1');

    hostShips.forEach(ship => {
        if (ship.id === combatState.selectedShipId) {
            const newOrders = {
                targetSpeed: parseInt(document.getElementById('speed-order').value, 10),
                targetHeading: parseInt(document.getElementById('heading-order').value, 10)
            };
            ship.orders = newOrders;

            ship.weapons.forEach((weapon, i) => {
                weapon.targetId = document.getElementById(`weapon-target-${i}`).value;
            });
        }
    });
}

function executeTurn() {
    const combatState = appState.soloGameState.combat;

    if (appState.isInitiator) {
        gatherHostOrders();
        if (dataChannels.length === 0) {
            aiGenerateOrders();
        }
    }
    
    combatState.ships.filter(s => !s.destroyed).forEach(ship => {
        // --- Power Regeneration Phase ---
        ship.power = Math.min(ship.maxPower, ship.power + ship.maxPower); // Regenerate power from all engines

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
            // Enforce the ship's maximum speed
            ship.speed = Math.max(0, Math.min(ship.speed, ship.maxSpeed));
        }

        const radians = (ship.heading - 90) * (Math.PI / 180);
        ship.x += ship.speed * Math.cos(radians) * 0.1;
        ship.y += ship.speed * Math.sin(radians) * 0.1;

        ship.x = Math.max(0, Math.min(MAP_WIDTH, ship.x));
        ship.y = Math.max(0, Math.min(MAP_HEIGHT, ship.y));

        ship.weapons.forEach(weapon => {
            if (weapon.cooldownRemaining > 0) weapon.cooldownRemaining--;

            if (weapon.targetId && weapon.cooldownRemaining === 0 && ship.power >= weapon.powerCost) {
                const target = combatState.ships.find(s => s.id === weapon.targetId);
                if (target) {
                    const distance = Math.sqrt(Math.pow(target.x - ship.x, 2) + Math.pow(target.y - ship.y, 2));
                    if (distance <= weapon.range) {
                        weapon.cooldownRemaining = weapon.cooldown;
                        ship.power -= weapon.powerCost;
                        if (weapon.type === 'beam') {
                            combatState.effects.push({ type: 'beam', sourceId: ship.id, targetId: target.id, weapon: weapon });
                            applyDamage(ship, target, weapon);
                        } else if (weapon.type === 'projectile') {
                            combatState.projectiles.push({
                                id: `proj-${combatState.nextProjectileId++}`, ownerId: ship.id, targetId: target.id,
                                x: ship.x, y: ship.y, heading: ship.heading, speed: weapon.speed,
                                damage: weapon.damage, weapon: weapon,
                            });
                            showToast(`${ship.name} launches a missile at ${target.name}!`, 'info');
                        }
                    }
                }
            } else if (weapon.targetId && ship.power < weapon.powerCost) {
                if (ship.isPlayer) showToast(`${ship.name}: Insufficient power to fire ${weapon.name}!`, 'error');
            }
        });
    });

    combatState.turn++;

    const newProjectiles = [];
    combatState.projectiles.forEach(proj => {
        const target = combatState.ships.find(s => s.id === proj.targetId);
        if (!target || target.destroyed) return;

        const dx = target.x - proj.x;
        const dy = target.y - proj.y;
        const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
        proj.heading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

        if (distanceToTarget <= proj.speed) {
            applyDamage(combatState.ships.find(s => s.id === proj.ownerId), target, proj.weapon);
        } else {
            const radians = (proj.heading - 90) * (Math.PI / 180);
            proj.x += proj.speed * Math.cos(radians);
            proj.y += proj.speed * Math.sin(radians);
            newProjectiles.push(proj);
        }
    });
    combatState.projectiles = newProjectiles;

    const remainingPlayerShips = combatState.ships.filter(s => s.isPlayer && !s.destroyed).length;
    const remainingEnemyShips = combatState.ships.filter(s => !s.isPlayer && !s.destroyed).length;

    if (remainingPlayerShips === 0) showToast('All player ships have been destroyed! You lose.', 'error');
    if (remainingEnemyShips === 0) showToast('All enemy ships have been destroyed! You win!', 'info');

    if (appState.isInitiator && dataChannels.length > 0) {
        const turnUpdate = { type: 'move-update', game: 'cosmicbalance', combatState: combatState };
        dataChannels.forEach(channel => channel.send(JSON.stringify(turnUpdate)));
    }

    renderCombatInfoPanel();
}

function applyDamage(attacker, target, weapon) {
    if (target.destroyed) return;

    appState.soloGameState.combat.effects.push({ type: 'impact', targetId: target.id });
    const dx = attacker.x - target.x;
    const dy = attacker.y - target.y;
    
    let attackAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    let relativeAngle = (attackAngle - target.heading + 360 + 90) % 360;
    const shieldIndex = Math.round(relativeAngle / 45) % 8;

    let damage = weapon.damage;
    const shieldValue = target.shields[shieldIndex];
    if (shieldValue > 0) {
        const damageAbsorbed = Math.min(shieldValue, damage);
        target.shields[shieldIndex] -= damageAbsorbed;
        damage -= damageAbsorbed;
        showToast(`Shield arc ${shieldIndex + 1} on ${target.name} absorbed ${damageAbsorbed} damage!`, 'info');
    }

    if (damage > 0) {
        // Armor reduces incoming hull damage
        const armorLayers = target.components.find(c => c.category === 'armor')?.count || 0;
        const damageAfterArmor = Math.max(0, damage - armorLayers);

        if (damageAfterArmor > 0) {
            // Damage is first applied to hull integrity
            if (target.hullIntegrity > 0) {
                const integrityDamage = Math.min(target.hullIntegrity, damageAfterArmor);
                target.hullIntegrity -= integrityDamage;
                showToast(`${target.name} hull integrity damaged for ${integrityDamage.toFixed(0)}!`, 'error');
            }

            // Any remaining damage causes system hits
            const systemDamage = damageAfterArmor - (target.hullIntegrity > 0 ? 0 : target.hullIntegrity);
            if (systemDamage > 0) {
                // For every 5 points of system damage, a component is hit
                const hits = Math.floor(systemDamage / 5) + 1;
                for (let i = 0; i < hits; i++) {
                    applySystemHit(target);
                }
            }
        } else {
            showToast(`${target.name}'s armor absorbed the hit!`, 'info');
        }
    }

    if ((target.criticalHits || 0) >= target.maxHp) {
        target.destroyed = true;
        showToast(`${target.name} has been destroyed!`, 'error');
    }
}

function applySystemHit(target) {
    const activeComponents = target.components.filter(c => c.status !== 'destroyed');
    if (activeComponents.length === 0) return;

    const hitComponent = activeComponents[Math.floor(Math.random() * activeComponents.length)];
    hitComponent.status = 'destroyed'; // For now, all hits are destructive
    showToast(`${target.name} takes a component hit! ${hitComponent.name} destroyed!`, 'error');

    // Check if it was a critical component
    if (['drives', 'engines', 'warp'].includes(hitComponent.category)) {
        target.criticalHits = (target.criticalHits || 0) + 1;
        showToast(`${target.name} suffers a Critical Hit!`, 'error');
    }
}

function startDragOrder(event, ship) {
    event.preventDefault();
    const combatMap = document.getElementById('combat-map-view');
    const mapRect = combatMap.getBoundingClientRect();

    const orderLine = document.createElement('div');
    orderLine.className = 'order-line';
    combatMap.appendChild(orderLine);

    const shipElement = document.getElementById(`ship-${ship.id}`);
    const startX = shipElement.offsetLeft + shipElement.offsetWidth / 2;
    const startY = shipElement.offsetTop + shipElement.offsetHeight / 2;

    const MAX_ORDER_SPEED = 700;
    const ORDER_DISTANCE_SCALE = 2;
    const MAX_ORDER_DISTANCE = MAX_ORDER_SPEED / ORDER_DISTANCE_SCALE;

    const onMouseMove = (moveEvent) => {
        const currentX = moveEvent.clientX - mapRect.left;
        const currentY = moveEvent.clientY - mapRect.top;
        const dx = currentX - startX;
        const dy = currentY - startY;
        const distance = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_ORDER_DISTANCE);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        orderLine.style.left = `${startX}px`;
        orderLine.style.top = `${startY}px`;
        orderLine.style.width = `${distance}px`;
        orderLine.style.transform = `rotate(${angle}deg)`;
    };

    const onMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        combatMap.removeChild(orderLine);

        const endX = upEvent.clientX - mapRect.left;
        const endY = upEvent.clientY - mapRect.top;
        const dx = endX - startX;
        const dy = endY - startY;

        const speed = Math.min(MAX_ORDER_SPEED, Math.round(Math.sqrt(dx * dx + dy * dy) * ORDER_DISTANCE_SCALE));
        let heading = Math.round(Math.atan2(dy, dx) * (180 / Math.PI) + 90);
        if (heading < 0) heading += 360;

        const speedInput = document.getElementById('speed-order');
        const headingInput = document.getElementById('heading-order');
        if (speedInput) speedInput.value = speed;
        if (headingInput) headingInput.value = heading;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function startDragTargeting(event, ship, weaponIndex) {
    event.preventDefault();
    const combatMap = document.getElementById('combat-map-view');
    const mapRect = combatMap.getBoundingClientRect();

    const targetingLine = document.createElement('div');
    targetingLine.className = 'targeting-line';
    combatMap.appendChild(targetingLine);
    
    const weapon = ship.weapons[weaponIndex];
    targetingLine.style.backgroundColor = weapon.color || '#CC3333';
    targetingLine.style.boxShadow = `0 0 5px ${weapon.color || '#CC3333'}`;

    const shipElement = document.getElementById(`ship-${ship.id}`);
    const startX = shipElement.offsetLeft + shipElement.offsetWidth / 2;
    const startY = shipElement.offsetTop + shipElement.offsetHeight / 2;
    
    const maxRangeInPixels = (weapon.range / MAP_WIDTH) * mapRect.width;
    const onMouseMove = (moveEvent) => {
        const currentX = moveEvent.clientX - mapRect.left;
        const currentY = moveEvent.clientY - mapRect.top;
        const dx = currentX - startX;
        const dy = currentY - startY;
        const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxRangeInPixels);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        targetingLine.style.left = `${startX}px`;
        targetingLine.style.top = `${startY}px`;
        targetingLine.style.width = `${distance}px`;
        targetingLine.style.transform = `rotate(${angle}deg)`;
    };

    const onMouseUp = (upEvent) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        combatMap.removeChild(targetingLine);

        const targetElement = upEvent.target.closest('.ship');
        if (targetElement && targetElement.classList.contains('enemy')) {
            const targetId = targetElement.id.replace('ship-', '');
            const weapon = ship.weapons[weaponIndex];
            if (weapon) {
                weapon.targetId = targetId;
                const targetSelect = document.getElementById(`weapon-target-${weaponIndex}`);
                if (targetSelect) targetSelect.value = targetId;
                showToast(`${weapon.type} is now targeting ${appState.soloGameState.combat.ships.find(s => s.id === targetId)?.name}.`, 'info');
            }
        } else {
            const weapon = ship.weapons[weaponIndex];
            weapon.targetId = '';
            const targetSelect = document.getElementById(`weapon-target-${weaponIndex}`);
            if (targetSelect) targetSelect.value = '';
        }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function setTargetForAllWeapons(ship, targetId) {
    if (!ship || !ship.weapons) return;

    ship.weapons.forEach(weapon => {
        weapon.targetId = targetId;
    });

    renderCombatInfoPanel();
    const targetName = appState.soloGameState.combat.ships.find(s => s.id === targetId)?.name || 'Unknown';
    showToast(`All weapons on ${ship.name} targeting ${targetName}.`, 'info');
}

function aiGenerateOrders() {
    const combatState = appState.soloGameState.combat;
    const allShips = combatState.ships.filter(s => !s.destroyed);    
    const shipsToControl = allShips.filter(s => s.aiAssisted);
    
    shipsToControl.forEach(aiShip => {
        // Determine this ship's enemies
        const enemies = allShips.filter(s => s.owner !== aiShip.owner);
        if (enemies.length === 0) return;

        // --- Target Selection Logic ---
        // 1. Does any weapon already have a valid target? If so, that's our primary target.
        let primaryTarget = null;
        const existingTargetId = aiShip.weapons.find(w => w.targetId && enemies.some(e => e.id === w.targetId))?.targetId;
        if (existingTargetId) {
            primaryTarget = enemies.find(e => e.id === existingTargetId);
        }

        // 2. If no valid target is set, find the closest enemy.
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
            // --- Set Orders based on the primary target ---
            const dx = primaryTarget.x - aiShip.x;
            const dy = primaryY - aiShip.y;
            const distance = Math.sqrt(dx*dx + dy*dy);

            // 1. Set heading towards the enemy
            let targetHeading = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            if (targetHeading < 0) targetHeading += 360;
            aiShip.orders.targetHeading = Math.round(targetHeading);

            // 2. Set speed: close distance if far, maintain if close
            aiShip.orders.targetSpeed = (distance > 400) ? 100 : 50;

            // 3. Target all weapons on that enemy
            aiShip.weapons.forEach(w => w.targetId = primaryTarget.id);
        }
    });

    // If the currently selected ship was AI assisted, we need to re-render the info panel
    // to show the orders the AI just set.
    const selectedShip = combatState.ships.find(s => s.id === combatState.selectedShipId);
    if (selectedShip && selectedShip.aiAssisted) {
        renderCombatInfoPanel();
    }
}

export function processMove(moveData) {
    if (!appState.isInitiator || moveData.game !== 'cosmicbalance') return;

    const ship = appState.soloGameState.combat.ships.find(s => s.id === moveData.shipId);
    if (ship) {
        if (moveData.orders) {
            ship.orders = moveData.orders;
            console.log(`Received move orders for ${ship.name} from joiner.`);
        }
        if (moveData.weaponOrders) {
            moveData.weaponOrders.forEach(order => {
                if (ship.weapons[order.index]) {
                    ship.weapons[order.index].targetId = order.targetId;
                }
            });
            console.log(`Received fire orders for ${ship.name} from joiner.`);
        }
    }
}

export function processUIUpdate(data) {
    if (appState.isInitiator || data.game !== 'cosmicbalance') return;

    appState.soloGameState.combat = data.combatState;

    renderCombatMap();
    renderCombatInfoPanel();
}