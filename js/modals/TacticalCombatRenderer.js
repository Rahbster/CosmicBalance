import { MAP_WIDTH, MAP_HEIGHT, LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';
import { StellarNavigator } from '../ui/StellarNavigator.js';

let backgroundStars = [];
let textureCache = new Map();
let shipNavigator = null;
let floatingTexts = [];
let lastRenderTime = 0;

export function initRenderer() {
    initBackgroundStars();
    injectCombatStyles();
}

export function resetRenderer() {
    textureCache.clear();
    initBackgroundStars();
    shipNavigator = null;
    floatingTexts = [];
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

        #combat-map-view {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 100;
            pointer-events: auto;
        }

        body.combat-mode #resource-display {
            display: none !important;
        }

        /* Override default info panel container for combat */
        body.combat-mode #info-panel {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 101;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            pointer-events: none; /* Allow clicks to pass through container */
            display: flex;
            flex-direction: column;
            justify-content: space-between; /* Nav at top, Details at bottom/center */
        }

        body.combat-mode #info-panel-nav {
            pointer-events: auto;
            width: 100%;
            height: 120px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }

        body.combat-mode #info-panel-nav .stellar-carousel {
            width: 100%;
            height: 100%;
        }

        body.combat-mode #info-panel-nav .carousel-slide {
            width: 160px;
            height: 100px;
            background: rgba(20, 30, 50, 0.85);
            border: 1px solid var(--glass-accent);
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 10px;
            font-size: 0.8em;
            color: #fff;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        body.combat-mode #info-panel-nav .carousel-slide.active {
            background: var(--cosmic-purple);
            transform: scale(1.2);
            box-shadow: 0 0 15px var(--glass-accent);
            z-index: 10;
        }

        body.combat-mode #info-panel-content {
            position: relative;
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
            z-index: 102; /* Ensure HUD is above the map overlay */
            margin: 20px;
            max-height: 60%;
            overflow-y: auto;
        }

        body.combat-mode #info-panel-content h3, body.combat-mode #info-panel-content h4 {
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

        .weapon-control.ready {
            border-color: var(--glass-accent);
            box-shadow: 0 0 5px var(--glass-accent);
        }

        .small-btn {
            padding: 4px 8px;
            font-size: 0.8rem;
            width: auto;
            flex: 1;
            margin-top: 0;
        }
        .speed-btn.active {
            background: var(--glass-accent);
            color: var(--space-blue);
            font-weight: bold;
            box-shadow: 0 0 10px var(--glass-accent);
        }

        .ship-shield-octagon {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
            fill: #2196F3;
            transition: fill-opacity 0.3s ease;
        }

        .ship {
            position: absolute;
            width: 40px;
            height: 40px;
            transform-origin: center;
            z-index: 10;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            pointer-events: auto;
        }

        .ship-visual {
            width: 100%;
            height: 100%;
            background-color: #fff;
            clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
            z-index: 2;
        }
        
        .ship.enemy .ship-visual {
            background-color: #ff4444;
        }

        .ship-status-bars {
            position: absolute;
            bottom: -10px;
            left: 0;
            width: 100%;
            height: 4px;
            z-index: 3;
        }

        .status-bar-container {
            width: 100%;
            height: 100%;
            background-color: #333;
        }

        .status-bar {
            height: 100%;
            transition: width 0.2s;
        }

        .projectile {
            position: absolute;
            width: 6px;
            height: 6px;
            background-color: #ffff00;
            border-radius: 50%;
            z-index: 5;
            box-shadow: 0 0 5px #ffff00;
        }

        .weapon-fire {
            position: absolute;
            height: 2px;
            transform-origin: 0 50%;
            z-index: 4;
        }

        .impact-explosion {
            position: absolute;
            width: 20px;
            height: 20px;
            background-color: orange;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            animation: explode 0.4s ease-out forwards;
            z-index: 20;
        }

        @keyframes explode {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }

        .order-line, .targeting-line {
            position: absolute;
            height: 1px;
            background-color: #00ff00;
            transform-origin: 0 50%;
            z-index: 1;
            pointer-events: none;
        }
        
        .weapon-selector {
            position: absolute;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            cursor: crosshair;
            z-index: 20;
        }

        #combat-scale-bar {
            position: absolute;
            bottom: 10px;
            right: 10px;
            width: 200px;
            height: 10px;
            border-bottom: 2px solid rgba(255, 255, 255, 0.5);
            pointer-events: none;
            z-index: 100;
        }

        .scale-tick {
            position: absolute;
            bottom: 0;
            width: 1px;
            height: 5px;
            background-color: rgba(255, 255, 255, 0.5);
        }

        .scale-tick::after {
            content: attr(data-label);
            position: absolute;
            bottom: 8px;
            left: -10px;
            width: 20px;
            text-align: center;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.5);
        }

        .combat-star {
            position: absolute;
            background: white;
            border-radius: 50%;
            z-index: 0;
            transform: translate(-50%, -50%);
        }
        .combat-sun {
            position: absolute;
            border-radius: 50%;
            z-index: 1;
            transform: translate(-50%, -50%);
        }
        .planet-visual {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            box-shadow: inset -5px -5px 10px rgba(0,0,0,0.5);
            z-index: 2;
        }
        .planet-shadow {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            border-radius: 50%;
            background: radial-gradient(circle at 100% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.8) 100%);
            z-index: 3;
            pointer-events: none;
        }

        .battle-intro-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: var(--font-main);
            opacity: 1;
            transition: opacity 0.5s ease;
        }
        .battle-intro-overlay.fade-out { opacity: 0; }
        .battle-intro-content {
            text-align: center;
            width: 80%;
            max-width: 800px;
            background: linear-gradient(135deg, rgba(20,30,50,0.9) 0%, rgba(10,10,20,0.95) 100%);
            border: 2px solid var(--glass-accent);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 0 50px rgba(174, 225, 249, 0.2);
            position: relative;
            overflow: hidden;
        }
        .battle-alert {
            color: #ff4444;
            font-size: 3rem;
            margin: 0 0 10px 0;
            text-shadow: 0 0 20px #ff0000;
            letter-spacing: 5px;
            animation: pulse-alert 1s infinite alternate;
        }
        @keyframes pulse-alert { from { text-shadow: 0 0 10px #ff0000; } to { text-shadow: 0 0 30px #ff0000; } }
        .system-name {
            color: var(--glass-accent);
            font-size: 2rem;
            margin: 0 0 30px 0;
        }
        .battle-matchup {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 30px;
            margin-bottom: 30px;
        }
        .battle-side {
            flex: 1;
            text-align: center;
        }
        .battle-vs {
            font-size: 2rem;
            font-weight: 900;
            color: #fff;
            background: #333;
            padding: 10px 20px;
            border-radius: 50%;
            border: 2px solid #555;
        }
        .loading-bar {
            width: 100%;
            height: 4px;
            background: #333;
            border-radius: 2px;
            overflow: hidden;
        }
        .bar-fill {
            width: 0%;
            height: 100%;
            background: var(--glass-accent);
            box-shadow: 0 0 10px var(--glass-accent);
            transition: width 2.5s linear;
        }

        .battle-summary-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 2001;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: var(--font-main);
        }
        .battle-summary-content {
            background: var(--space-blue);
            border: 2px solid var(--glass-accent);
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 0 40px var(--cosmic-purple);
            max-width: 500px;
            width: 90%;
        }
        .summary-stat-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 5px;
        }
    `;
    document.head.appendChild(style);
}

function initBackgroundStars() {
    backgroundStars = [];
    const spectralColors = [
        '#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', 
        '#fff4ea', '#ffd2a1', '#ffcc6f', '#ff4500'
    ];
    // Generate stars over a wider area to cover zoom-out (approx -5000 to 6000 for 0.1x zoom)
    const range = 12000;
    const offset = (range - MAP_WIDTH) / 2;

    for (let i = 0; i < 500; i++) {
        backgroundStars.push({
            x: (Math.random() * range) - offset,
            y: (Math.random() * range) - offset,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.8 + 0.2,
            color: spectralColors[Math.floor(Math.random() * spectralColors.length)]
        });
    }
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

export function renderCombatMap(combatState, viewState, gameEngine, simulator, callbacks) {
    const combatMap = document.getElementById('combat-map-view');
    const scaleBar = document.getElementById('combat-scale-bar');
    const now = performance.now();
    const dt = (now - lastRenderTime) / 1000; // Delta time in seconds
    lastRenderTime = now;

    if (!combatMap || !scaleBar) return;
    combatMap.innerHTML = '';

    const ships = combatState.ships.filter(s => !s.destroyed);
    const projectiles = combatState.projectiles;
    const effects = combatState.effects;
    if (ships.length === 0) return;

    if (viewState.isAutoZoom) {
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
        viewState.zoom = zoomLevels.reduce((prev, curr) => {
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
        
        viewState.panX = (MAP_WIDTH / 2) - centerX;
        viewState.panY = (MAP_HEIGHT / 2) - centerY;
        viewState.isAutoZoom = false;
    }

    const viewCenterX = MAP_WIDTH / 2;
    const viewCenterY = MAP_HEIGHT / 2;
    const offsetX = viewState.panX;
    const offsetY = viewState.panY;
    const currentZoom = viewState.zoom;

    // --- Draw Background Elements ---
    
    // Draw Sun (if in a system)
    if (simulator && simulator.state.system) {
        const sys = simulator.state.system;
        const sunDiv = document.createElement('div');
        sunDiv.className = 'combat-sun';
        const sunR = (sys.r || 20) * 8 * currentZoom;
        sunDiv.style.width = `${sunR}px`;
        sunDiv.style.height = `${sunR}px`;
        
        let sunColor = sys.color;
        if (!sunColor) {
             const spectralColors = ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffd2a1', '#ffcc6f', '#ff4500'];
             const seed = sys.id ? sys.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0) : 0;
             sunColor = spectralColors[Math.abs(seed) % spectralColors.length];
             sys.color = sunColor;
        }

        // Use CSS Gradient for the sun to avoid texture artifacts
        sunDiv.style.background = `radial-gradient(circle, #FFFFFF 20%, ${sunColor} 60%, transparent 70%)`;
        sunDiv.style.boxShadow = `0 0 ${sunR/3}px ${sunColor}`;
        
        const sunX = MAP_WIDTH / 2;
        const sunY = MAP_HEIGHT / 2;
        const displayX = sunX + offsetX;
        const displayY = sunY + offsetY;
        
        sunDiv.style.left = `${(viewCenterX + (displayX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
        sunDiv.style.top = `${(viewCenterY + (displayY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
        
        combatMap.appendChild(sunDiv);
    }

    // Draw Stars
    backgroundStars.forEach(star => {
        const starDiv = document.createElement('div');
        starDiv.className = 'combat-star';
        starDiv.style.width = `${star.size}px`;
        starDiv.style.height = `${star.size}px`;
        starDiv.style.opacity = star.opacity;
        starDiv.style.backgroundColor = star.color;
        
        const displayX = star.x + offsetX;
        const displayY = star.y + offsetY;
        
        starDiv.style.left = `${(viewCenterX + (displayX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
        starDiv.style.top = `${(viewCenterY + (displayY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
        
        combatMap.appendChild(starDiv);
    });

    ships.forEach(ship => {
        const shipDiv = document.createElement('div');
        shipDiv.className = 'ship';
        shipDiv.id = `ship-${ship.id}`;
        if (!ship.isPlayer) shipDiv.classList.add('enemy');

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

        if (ship.isPlanet) {
            shipDiv.style.width = `${ship.radius * 2 * currentZoom}px`;
            shipDiv.style.height = `${ship.radius * 2 * currentZoom}px`;
            
            const planetVisual = document.createElement('div');
            planetVisual.className = 'planet-visual';
            
            let planetTexture = textureCache.get(ship.id);
            if (!planetTexture && gameEngine && gameEngine.renderService) {
                planetTexture = gameEngine.renderService.createPlanetTexture({ id: ship.id, type: ship.type }).toDataURL();
                textureCache.set(ship.id, planetTexture);
            }

            planetVisual.style.backgroundImage = planetTexture ? `url(${planetTexture})` : 'none';
            planetVisual.style.backgroundSize = 'contain';
            planetVisual.style.backgroundRepeat = 'no-repeat';
            planetVisual.style.backgroundColor = planetTexture ? 'transparent' : (ship.color || '#888');
            if (planetTexture) planetVisual.style.boxShadow = 'none';
            
            shipDiv.appendChild(planetVisual);

            // Add shadow overlay for lighting direction
            const shadow = document.createElement('div');
            shadow.className = 'planet-shadow';
            const angleToSun = Math.atan2(MAP_HEIGHT/2 - ship.y, MAP_WIDTH/2 - ship.x);
            shadow.style.transform = `rotate(${angleToSun}rad)`;
            shipDiv.appendChild(shadow);
            // Planets don't rotate or show shields/status bars in the same way
        } else {
            shipDiv.style.transform = `rotate(${ship.heading}deg)`;
            const shipVisual = document.createElement('div');
            shipVisual.className = 'ship-visual';
            if (ship.color) {
                shipVisual.style.backgroundColor = ship.color;
            }
            const shieldOctagon = createShieldOctagon(ship.shields);
            shipDiv.appendChild(shieldOctagon);
            shipDiv.appendChild(shipVisual);
            shipDiv.appendChild(statusBarContainer);
        }

        if (ship.isPlayer) {
            const weaponArc = 120;
            const startAngle = -weaponArc / 2;
            ship.weapons.forEach((weapon, index) => {
                const weaponSelector = document.createElement('div');
                weaponSelector.className = 'weapon-selector';
                weaponSelector.style.backgroundColor = weapon.color;
                const angle = startAngle + (weaponArc / (Math.max(1, ship.weapons.length - 1))) * index;
                weaponSelector.style.transform = `rotate(${angle}deg) translate(25px) rotate(${-angle}deg)`;
                weaponSelector.addEventListener('mousedown', (e) => startDragTargeting(e, ship, index, combatState));
                shipDiv.appendChild(weaponSelector);
            });
        }
        shipDiv.addEventListener('click', () => {
            combatState.selectedShipId = ship.id;
            renderCombatInfoPanel(combatState, viewState, gameEngine, simulator, callbacks);
        });

        const isMyShip = (gameEngine.isHost && ship.owner === 'player1') || (!gameEngine.isHost && ship.owner === 'player2');
        if (isMyShip) {
            if (!ship.isPlanet) shipDiv.style.cursor = 'crosshair';
            shipDiv.addEventListener('mousedown', (e) => startDragOrder(e, ship));
        }

        if (!ship.isPlayer) {
            shipDiv.addEventListener('dblclick', () => {
                const selectedPlayerShip = combatState.ships.find(s => s.id === combatState.selectedShipId && s.isPlayer);
                if (selectedPlayerShip) {
                    setTargetForAllWeapons(selectedPlayerShip, ship.id, combatState, callbacks);
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
                const beam = document.createElement('div');
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
        } else if (effect.type === 'text') {
            floatingTexts.push({
                x: effect.x,
                y: effect.y,
                text: effect.text,
                color: effect.color,
                life: 1.5, // 1.5 seconds duration
                maxLife: 1.5,
                vy: -30 // Move up 30px/sec
            });
        }
    });

    // --- Render Floating Texts ---
    // Update and filter
    floatingTexts.forEach(ft => {
        ft.life -= dt;
        ft.y += ft.vy * dt;
    });
    floatingTexts = floatingTexts.filter(ft => ft.life > 0);

    floatingTexts.forEach(ft => {
        const el = document.createElement('div');
        el.textContent = ft.text;
        el.style.position = 'absolute';
        el.style.color = ft.color;
        el.style.fontWeight = 'bold';
        el.style.fontSize = `${Math.max(12, 16 * currentZoom)}px`;
        el.style.textShadow = '0 0 2px black';
        el.style.pointerEvents = 'none';
        el.style.opacity = ft.life / ft.maxLife;
        el.style.zIndex = 100;
        
        const displayX = ft.x + offsetX;
        const displayY = ft.y + offsetY;
        el.style.left = `${(viewCenterX + (displayX - viewCenterX) * currentZoom) / MAP_WIDTH * 100}%`;
        el.style.top = `${(viewCenterY + (displayY - viewCenterY) * currentZoom) / MAP_HEIGHT * 100}%`;
        
        combatMap.appendChild(el);
    });

    combatState.effects = [];

    scaleBar.innerHTML = '';
    const scaleWidth = scaleBar.offsetWidth;
    const containerWidth = combatMap.offsetWidth;
    const visibleMapUnits = MAP_WIDTH / currentZoom;
    const unitsPerPixel = visibleMapUnits / containerWidth;
    
    // Calculate dynamic tick interval to avoid overlap (aim for ~50px per tick)
    const targetPixelInterval = 50;
    const targetMapUnitInterval = targetPixelInterval * unitsPerPixel;
    const magnitude = Math.pow(10, Math.floor(Math.log10(targetMapUnitInterval)));
    const residual = targetMapUnitInterval / magnitude;
    let tickIntervalMapUnits;
    if (residual > 5) tickIntervalMapUnits = 10 * magnitude;
    else if (residual > 2) tickIntervalMapUnits = 5 * magnitude;
    else if (residual > 1) tickIntervalMapUnits = 2 * magnitude;
    else tickIntervalMapUnits = magnitude;

    const tickIntervalPixels = tickIntervalMapUnits / unitsPerPixel;

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

export function renderCombatInfoPanel(combatState, viewState, gameEngine, simulator, callbacks) {
    const infoPanelContent = document.getElementById('info-panel-content');
    if (!infoPanelContent) return;
    const selectedShip = combatState.ships.find(s => s.id === combatState.selectedShipId);

    // Determine context variables
    const isMyShip = selectedShip && simulator && selectedShip.owner === simulator.localPlayerId;
    const isHost = gameEngine.isHost;
    const isSpectator = !combatState.ships.some(s => s.owner === simulator.localPlayerId);
    const isAiVsAi = isHost && combatState.ships.every(s => s.aiAssisted);
    const isReplay = simulator.isReplay;
    const totalTurns = isReplay ? simulator.state.commandHistory.length + 1 : 0;
    const playbackSpeed = simulator.playbackSpeed || 1;

    updateShipNavigator(combatState, simulator);

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3>${isReplay ? 'Replay Mode' : 'Tactical HUD'}</h3>
            ${selectedShip ? `<button id="close-details-btn" class="combat-btn small-btn" style="width:auto; margin:0;">X</button>` : ''}
            <span style="font-size:0.8em; color:var(--glass-accent);">TURN ${combatState.turn}</span>
        </div>
        
        ${isSpectator && !isReplay ? '<div style="background: rgba(255, 255, 255, 0.1); color: #aaa; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; text-align: center; margin-bottom: 10px; border: 1px solid rgba(255, 255, 255, 0.2);">SPECTATOR MODE</div>' : ''}

    `;

    if (selectedShip) {
        if (selectedShip.destroyed || selectedShip.retreated) {
            html += `<h3>Ship Destroyed/Retreated</h3><p>${selectedShip.name} is no longer in combat.</p>`;
        } else {
            html += `
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

            ${isMyShip && !isReplay ? `
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
                <div class="weapon-control ${w.cooldownRemaining === 0 ? 'ready' : ''}">
                    <div class="weapon-name" data-weapon-index="${i}" style="cursor: crosshair; color: ${w.color}; text-shadow: 0 0 5px ${w.color}; font-size:0.9em; margin-bottom:4px; display:flex; justify-content:space-between;">
                        <span>${w.name}</span>
                        <span>${w.cooldownRemaining > 0 ? `RELOAD ${w.cooldownRemaining}` : 'READY'}</span>
                    </div>
                    <select id="weapon-target-${i}" class="combat-select">
                        <option value="">-- Select Target --</option>
                        ${combatState.ships.filter(t => t.owner !== selectedShip.owner && !t.destroyed && !t.retreated).map(t => `<option value="${t.id}" ${w.targetId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                    </select>
                </div>
            `).join('')}
            <button id="submit-orders-btn" class="combat-btn">Submit Orders</button>
            <button id="retreat-btn" class="combat-btn" style="border-color: #e67e22; color: #e67e22; margin-top: 10px;">Retreat Ship</button>
            ` : ''}
            `;
        }
    } else {
        html += `
            <div style="padding: 20px 0; text-align: center; color: #aaa;">
                <p>No ship selected.</p>
                <p style="font-size: 0.8em;">Click on a ship to view details or give orders.</p>
            </div>
        `;
    }

    html += `
        <div style="margin-top:20px; border-top: 1px solid rgba(174, 225, 249, 0.2); padding-top:10px;">
            ${isReplay ? `
                <div style="margin-bottom: 10px; padding: 0 5px;">
                    <input type="range" id="replay-scrubber" min="1" max="${totalTurns}" value="${combatState.turn}" style="width: 100%; cursor: pointer;">
                    <div style="text-align: center; font-size: 0.8em; color: #aaa; margin-top: 2px;">Turn ${combatState.turn} / ${totalTurns}</div>
                </div>
                <div style="display:flex; gap:5px; margin-bottom: 10px; justify-content: center; align-items: center;">
                    <span style="font-size: 0.8em; color: #aaa; margin-right: 5px;">Speed:</span>
                    <button class="combat-btn small-btn speed-btn ${playbackSpeed === 1 ? 'active' : ''}" data-speed="1">1x</button>
                    <button class="combat-btn small-btn speed-btn ${playbackSpeed === 2 ? 'active' : ''}" data-speed="2">2x</button>
                    <button class="combat-btn small-btn speed-btn ${playbackSpeed === 4 ? 'active' : ''}" data-speed="4">4x</button>
                </div>
                <div style="display:flex; gap:5px; margin-bottom: 5px;">
                    <button id="replay-restart-btn" class="combat-btn">Restart</button>
                    <button id="replay-next-turn-btn" class="combat-btn">Next Turn</button>
                    <button id="replay-auto-play-btn" class="combat-btn" style="${simulator.autoPlayTimer ? 'border-color:#ff4444; color:#ff4444;' : ''}">${simulator.autoPlayTimer ? 'Stop' : 'Auto Play'}</button>
                </div>
                <button id="leave-combat-btn" class="combat-btn" style="border-color:#aee1f9; color:#aee1f9;">Exit Replay</button>
            ` : `
                <div style="display:flex; gap:5px; margin-bottom: 5px;">
                     <button id="auto-play-btn" class="combat-btn" ${!isHost ? 'disabled' : ''} style="${simulator.autoPlayTimer ? 'border-color:#ff4444; color:#ff4444;' : ''}">${simulator.autoPlayTimer ? 'Stop Auto' : 'Auto Play'}</button>
                </div>
                <button id="end-turn-btn" class="combat-btn" ${!isHost ? 'disabled' : ''}>End Turn</button>
                <button id="leave-combat-btn" class="combat-btn" style="border-color:#ff4444; color:#ff4444;">
                    ${isSpectator ? 'Stop Watching' : (isAiVsAi ? 'Finish Simulation' : 'Leave Combat')}
                </button>
            `}
        </div>
    `;

    infoPanelContent.innerHTML = html;

    const closeBtn = document.getElementById('close-details-btn');
    if (closeBtn) {
        closeBtn.onclick = callbacks.onCloseDetails;
    }

    if (isReplay) {
        const scrubber = document.getElementById('replay-scrubber');
        if (scrubber) {
            scrubber.oninput = (e) => callbacks.onJumpToTurn(parseInt(e.target.value, 10));
        }
        
        infoPanelContent.querySelectorAll('.speed-btn').forEach(btn => {
            btn.onclick = (e) => callbacks.onSetSpeed(parseInt(e.target.dataset.speed, 10));
        });

        document.getElementById('replay-restart-btn').onclick = () => callbacks.onJumpToTurn(1);
        document.getElementById('replay-next-turn-btn').onclick = () => callbacks.onRunGameLoop();
        document.getElementById('replay-auto-play-btn').onclick = () => callbacks.onToggleAutoPlay();
        document.getElementById('leave-combat-btn').onclick = callbacks.onEndCombat;
    } else {
        document.getElementById('auto-play-btn').onclick = callbacks.onToggleAutoPlay;
        document.getElementById('leave-combat-btn').onclick = callbacks.onEndCombat;
        document.getElementById('end-turn-btn').onclick = callbacks.onRunGameLoop;
    }

    if (selectedShip && !selectedShip.destroyed && !selectedShip.retreated) {
        const aiAssistCheckbox = document.getElementById('ai-assist-checkbox');
        if (aiAssistCheckbox) {
            aiAssistCheckbox.onchange = (e) => callbacks.onAiAssistToggle(e.target.checked);
        }

        if (isMyShip && !isReplay) {
            const submitBtn = document.getElementById('submit-orders-btn');
            if (isHost) {
                submitBtn.style.display = 'none';
            } else {
                submitBtn.onclick = callbacks.onSubmitOrders;
            }

            const retreatBtn = document.getElementById('retreat-btn');
            if (retreatBtn) {
                retreatBtn.onclick = callbacks.onRetreat;
            }
        }
    }
}

function updateShipNavigator(combatState, simulator) {
    const navContainer = document.getElementById('info-panel-nav');
    if (!navContainer) return;

    const ships = combatState.ships.filter(s => !s.destroyed && !s.isPlanet);
    if (ships.length === 0) {
        navContainer.innerHTML = '';
        return;
    }

    const selectedIndex = ships.findIndex(s => s.id === combatState.selectedShipId);
    const initialIdx = selectedIndex >= 0 ? selectedIndex : 0;

    // If navigator doesn't exist or ship count changed significantly, recreate
    // For smoother updates, we could diff, but recreation is safer for now.
    if (!shipNavigator || shipNavigator.slideCount !== ships.length) {
        navContainer.innerHTML = '<div id="combat-ship-carousel" class="stellar-carousel"></div>';
        const carouselEl = document.getElementById('combat-ship-carousel');
        
        const slides = ships.map(ship => ({
            title: ship.name,
            icon: getShipIcon(ship.type),
            id: ship.id,
            action: () => {
                if (combatState.selectedShipId !== ship.id) {
                    const mapShip = document.getElementById(`ship-${ship.id}`);
                    if (mapShip) mapShip.click();
                }
            }
        }));

        shipNavigator = new StellarNavigator(slides, carouselEl, null, {}, {
            radius: 400, 
            slideWidth: 180,
            slideGap: 20,
            startIdx: initialIdx,
            onChange: (index) => {
                const ship = ships[index];
                if (ship && combatState.selectedShipId !== ship.id) {
                    const mapShip = document.getElementById(`ship-${ship.id}`);
                    if (mapShip) mapShip.click();
                }
            }
        });
    }
    
    // Sync active index
    if (selectedIndex >= 0 && shipNavigator && shipNavigator.activeIdx !== selectedIndex) {
        shipNavigator.goTo(selectedIndex);
    }
}

function getShipIcon(type) {
    const icons = {
        'Fighter': '✈️',
        'Scout': '🛸',
        'Frigate': '🚀',
        'Destroyer': '🛳️',
        'Cruiser': '⚔️',
        'SpaceStation': '🛰️',
        'TroopTransport': '🚌'
    };
    return icons[type] || '🚀';
}

export function showBattleSummary(summaryData, onDismiss) {
    const overlay = document.createElement('div');
    overlay.className = 'battle-summary-overlay';
    
    let statsHtml = '';
    if (summaryData.stats) {
        statsHtml = Object.entries(summaryData.stats).map(([faction, count]) => `
            <div class="summary-stat-row">
                <span>${faction}</span>
                <span>${count} Ships Lost</span>
            </div>
        `).join('');
    }

    overlay.innerHTML = `
        <div class="battle-summary-content">
            <h2 style="color: var(--glass-accent); margin-top: 0;">Battle Report</h2>
            <h3 style="color: ${summaryData.winnerColor || '#fff'}">${summaryData.winner} Victory</h3>
            <div style="margin: 20px 0; text-align: left;">
                ${statsHtml}
            </div>
            <button id="close-summary-btn" class="combat-btn">Close Report</button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('close-summary-btn').onclick = () => {
        overlay.remove();
        if (onDismiss) onDismiss();
    };
}

function startDragOrder(event, ship) {
    event.preventDefault();
    event.stopPropagation();
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

function startDragTargeting(event, ship, weaponIndex, combatState) {
    event.preventDefault();
    event.stopPropagation();
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
                const targetName = combatState ? combatState.ships.find(s => s.id === targetId)?.name : 'Target';
                if (window.toastManager) window.toastManager.show(`${weapon.type} is now targeting ${targetName}.`, 'info');
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

function setTargetForAllWeapons(ship, targetId, combatState, callbacks) {
    if (!ship || !ship.weapons) return;

    ship.weapons.forEach(weapon => {
        weapon.targetId = targetId;
    });

    // Re-render to update UI
    // We need to call the callback to re-render, or just let the next frame handle it?
    // Better to re-render immediately for feedback.
    // But we don't have direct access to renderCombatInfoPanel here easily without passing everything again.
    // However, the UI select boxes will update on next render.
    // We can show a toast.
    const targetName = combatState.ships.find(s => s.id === targetId)?.name || 'Unknown';
    if (window.toastManager) window.toastManager.show(`All weapons on ${ship.name} targeting ${targetName}.`, 'info');
}

export function showBattleIntro(system, entities, gameEngine, onComplete) {
    const overlay = document.createElement('div');
    overlay.className = 'battle-intro-overlay';
    
    // Identify factions
    const ownerIds = [...new Set(entities.map(e => e.owner))];
    const factions = ownerIds.map(id => {
        const p = gameEngine.state.players.find(p => p.id === id);
        return p ? { name: p.factionName, color: p.color, team: p.team } : { name: 'Unknown', color: '#fff', team: 'Unknown' };
    });

    // Group by team if possible
    const uniqueTeams = [...new Set(factions.map(f => f.team))];
    
    let vsHTML = '';
    if (uniqueTeams.length === 2) {
        const team1 = factions.filter(f => f.team === uniqueTeams[0]);
        const team2 = factions.filter(f => f.team === uniqueTeams[1]);
        
        const renderSide = (team) => team.map(f => `<div style="color:${f.color}; font-size: 1.5em; font-weight: bold; text-shadow: 0 0 5px ${f.color};">${f.name}</div>`).join('');
        
        vsHTML = `
            <div class="battle-side left">${renderSide(team1)}</div>
            <div class="battle-vs">VS</div>
            <div class="battle-side right">${renderSide(team2)}</div>
        `;
    } else {
        vsHTML = `<div class="battle-list">
            ${factions.map(f => `<div style="color:${f.color}; font-size: 1.5em; margin: 10px; font-weight: bold;">${f.name}</div>`).join('')}
        </div>`;
    }

    overlay.innerHTML = `
        <div class="battle-intro-content">
            <h1 class="battle-alert">COMBAT DETECTED</h1>
            <h2 class="system-name">System: ${system.name}</h2>
            <div class="battle-matchup">${vsHTML}</div>
            <div class="loading-bar"><div class="bar-fill"></div></div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Animate bar
    requestAnimationFrame(() => { overlay.querySelector('.bar-fill').style.width = '100%'; });

    setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
            if (onComplete) onComplete();
        }, 500);
    }, 3000);
}
