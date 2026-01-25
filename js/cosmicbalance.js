//==============================
// Cosmic Balance Game Logic
//==============================
import { dom, appState, dataChannels } from './scripts.js';
import { createTimerHTML, showToast } from './ui.js';
import { startTimer, stopTimer } from './timer.js';
import { loadDesignsFromStorage, showShipDesigner } from './modals/ShipDesignerModal.js';
import { showAboutModal } from './modals/AboutModal.js';
import { CombatLogModal } from './modals/CombatLogModal.js';
import { startCombat } from './features/TacticalCombat.js';
import { HULLS, COMPONENTS, DEFAULT_SHIP_DESIGNS, MAP_WIDTH, MAP_HEIGHT } from './cb_constants.js';

const NUM_SYSTEMS = 50;
const MIN_STAR_DISTANCE = 80;

let combatLogModal = null;

export function initialize() {
    // Set the button text and ensure it's visible for the host
    const newGameBtnText = dom.newPuzzleButton.querySelector('.text');
    if (newGameBtnText) newGameBtnText.textContent = 'Game';
    dom.newPuzzleButton.style.display = '';

    loadPuzzle();
}

export function cleanup() {
    stopTimer();
}

export function createGrid() {
    dom.gameBoardArea.innerHTML = `
        <section id="cosmic-balance-area">
            <div id="starmap-view">
                <!-- The star map will be rendered here by JS -->
            </div>
            <div id="info-panel">
                ${createTimerHTML()}
                <div id="info-panel-content"></div>
            </div>
            <div id="combat-scale-bar"></div>
            <div id="ship-designer-view" class="hidden">
                <!-- The ship designer interface will be rendered here -->
            </div>
            <div id="combat-map-view" class="hidden">
                <!-- The tactical combat map will be rendered here -->
            </div>
        </section>
    `;
    const starmapView = document.getElementById('starmap-view');
    const infoPanel = document.getElementById('info-panel');
    const shipDesignerView = document.getElementById('ship-designer-view');
    const infoPanelContent = document.getElementById('info-panel-content');

    const endTurnButton = document.createElement('button');
    endTurnButton.textContent = 'End Turn';
    endTurnButton.className = 'theme-button';
    endTurnButton.onclick = endPlayerTurn;
    infoPanel.appendChild(endTurnButton);

    starmapView.innerHTML = '';
    infoPanelContent.innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';

    starmapView.addEventListener('click', (event) => {
        if (event.target === starmapView) {
            infoPanelContent.innerHTML = '<h3>Sector Status</h3><p>Select a system to view details.</p>';
            const currentActive = starmapView.querySelector('.active-star');
            if (currentActive) {
                currentActive.classList.remove('active-star');
            }
        }
    });

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '5px';
    buttonContainer.style.marginTop = '5px';

    const designerButton = document.createElement('button');
    designerButton.textContent = 'Ship Designer';
    designerButton.id = 'ship-designer-btn-main'; // Give it an ID to be toggled
    designerButton.className = 'theme-button';
    designerButton.style.flex = '1';
    designerButton.onclick = showShipDesigner;
    buttonContainer.appendChild(designerButton);

    const logButton = document.createElement('button');
    logButton.textContent = 'Combat Log';
    logButton.className = 'theme-button';
    logButton.style.flex = '1';
    logButton.onclick = () => {
        if (!combatLogModal) combatLogModal = new CombatLogModal();
        combatLogModal.show(appState.soloGameState.combatLogHistory, appState.soloGameState.systems);
    };
    buttonContainer.appendChild(logButton);

    const aboutButton = document.createElement('button');
    aboutButton.textContent = 'About';
    aboutButton.id = 'about-btn-main'; // Give it an ID to be toggled
    aboutButton.className = 'theme-button';
    aboutButton.style.flex = '1';
    aboutButton.onclick = showAboutModal;
    buttonContainer.appendChild(aboutButton);

    infoPanel.appendChild(buttonContainer);

    const gameState = appState.soloGameState;

    gameState.systems.forEach(system => {
        const starDiv = document.createElement('div'); //NOSONAR
        starDiv.className = 'star-system';
        starDiv.style.left = `${(system.x / MAP_WIDTH) * 100}%`;
        starDiv.style.top = `${(system.y / MAP_HEIGHT) * 100}%`;
        starDiv.style.setProperty('--star-color', system.color);
        starDiv.title = system.name;

        starDiv.addEventListener('click', () => {
            const currentActive = starmapView.querySelector('.active-star');
            if (currentActive) {
                currentActive.classList.remove('active-star');
            }
            starDiv.classList.add('active-star');
            renderInfoPanelForStarmap(system);
        });

        // --- Drag and Drop for Fleet Movement ---
        starDiv.addEventListener('dragover', (e) => {
            e.preventDefault(); // Allow this element to be a drop target
            starDiv.classList.add('drag-over-star');
        });
        starDiv.addEventListener('dragleave', () => {
            starDiv.classList.remove('drag-over-star');
        });
        starDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            starDiv.classList.remove('drag-over-star');
            const fleetId = e.dataTransfer.getData('text/plain');
            const fleet = appState.soloGameState.fleets.find(f => f.id === fleetId);
            if (fleet) {
                moveFleet(fleet, system);
            }
        });

        starmapView.appendChild(starDiv);
    });

    // Render fleets on the starmap
    const fleetsBySystem = gameState.fleets.reduce((acc, fleet) => {
        if (!acc[fleet.locationId]) {
            acc[fleet.locationId] = [];
        }
        acc[fleet.locationId].push(fleet);
        return acc;
    }, {});

    Object.values(fleetsBySystem).forEach(fleetsInSystem => {
        const system = gameState.systems.find(s => s.id === fleetsInSystem[0].locationId);
        if (!system) return;

        fleetsInSystem.forEach((fleet, index) => {
            const angle = (index / fleetsInSystem.length) * 2 * Math.PI;
            const offset = 25; // pixels
            const offsetX = Math.cos(angle) * offset;
            const offsetY = Math.sin(angle) * offset;

            const fleetIcon = document.createElement('div');
            fleetIcon.draggable = true;
            fleetIcon.addEventListener('dragstart', (e) => {
                if (fleet.ownerId === 'player1') {
                    e.dataTransfer.setData('text/plain', fleet.id);
                    e.dataTransfer.effectAllowed = 'move';
                } else {
                    e.preventDefault();
                }
            });
            fleetIcon.addEventListener('drag', (e) => {
                let rangeLine = document.getElementById('fleet-range-line');
                if (!rangeLine) {
                    rangeLine = document.createElement('div');
                    rangeLine.id = 'fleet-range-line';
                    rangeLine.className = 'fleet-range-line';
                    starmapView.appendChild(rangeLine);
                    
                    const fleetRange = calculateFleetRange(fleet);
                    const maxDistance = fleetRange * 200; // 1 range unit = 200 map units
                    const mapRect = starmapView.getBoundingClientRect();
                    const maxDistancePixels = (maxDistance / MAP_WIDTH) * mapRect.width;
                    rangeLine.dataset.maxDistance = maxDistancePixels;

                    const startX = (system.x / MAP_WIDTH) * mapRect.width;
                    const startY = (system.y / MAP_HEIGHT) * mapRect.height;
                    rangeLine.style.left = `${startX}px`;
                    rangeLine.style.top = `${startY}px`;
                    rangeLine.dataset.startX = startX;
                    rangeLine.dataset.startY = startY;
                }

                const mapRect = starmapView.getBoundingClientRect();
                const currentX = e.clientX - mapRect.left;
                const currentY = e.clientY - mapRect.top;
                const dx = currentX - parseFloat(rangeLine.dataset.startX);
                const dy = currentY - parseFloat(rangeLine.dataset.startY);
                const distance = Math.min(Math.sqrt(dx * dx + dy * dy), parseFloat(rangeLine.dataset.maxDistance));
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                rangeLine.style.width = `${distance}px`;
                rangeLine.style.transform = `rotate(${angle}deg)`;
            });
            fleetIcon.addEventListener('dragend', () => {
                document.getElementById('fleet-range-line')?.remove();
            });
            fleetIcon.className = 'fleet-icon';
            fleetIcon.style.left = `calc(${(system.x / MAP_WIDTH) * 100}% + ${offsetX}px)`;
            fleetIcon.style.top = `calc(${(system.y / MAP_HEIGHT) * 100}% + ${offsetY}px)`;
            fleetIcon.style.borderColor = gameState.players.find(p => p.id === fleet.ownerId).color;
            if (fleet.id === gameState.selectedFleetId) {
                fleetIcon.classList.add('active-star');
            }

            fleetIcon.onclick = () => {
                if (fleet.ownerId === 'player1') {
                    handleFleetSelection(fleet);
                }
            };
            fleetIcon.title = `${fleet.name} (${fleet.ownerId})`;
            starmapView.appendChild(fleetIcon);
        });
    });
}

function renderInfoPanelForStarmap(system) {
    const owner = appState.soloGameState.players.find(p => p.id === system.ownerId);
    const ownerName = owner ? owner.name : 'Neutral';
    document.getElementById('info-panel-content').innerHTML = `
        <h3>${system.name}</h3>
        <p>Coordinates: (${system.x}, ${system.y})</p>
        <p>Owner: <span style="color: ${owner?.color || '#FFFFFF'}">${ownerName}</span></p>
        <p>Resources: TBD</p>`;
}

function handleFleetSelection(fleet) {
    appState.soloGameState.selectedFleetId = fleet.id;
    createGrid(); // Re-render to show selection
    renderInfoPanelForFleet(fleet);
}

function renderInfoPanelForFleet(fleet) {
    const owner = appState.soloGameState.players.find(p => p.id === fleet.ownerId);
    const location = appState.soloGameState.systems.find(s => s.id === fleet.locationId);
    const fleetRange = calculateFleetRange(fleet);

    const shipsList = fleet.ships.map(ship => `<li>${ship.designId}</li>`).join('');

    let organizeButton = '';
    if (fleet.ownerId === 'player1') {
        organizeButton = `<button id="organize-fleet-btn" class="theme-button">Organize Fleets</button>`;
    }

    document.getElementById('info-panel-content').innerHTML = `
        <h3>Fleet: ${fleet.name}</h3>
        <p>Owner: <span style="color: ${owner?.color || '#FFFFFF'}">${owner.name}</span></p>
        <p>Location: ${location.name}</p>
        <p><strong>Max Range:</strong> ${fleetRange}</p>
        <h4>Ships:</h4>
        <ul>${shipsList}</ul>
        ${organizeButton}
    `;

    if (fleet.ownerId === 'player1') {
        document.getElementById('organize-fleet-btn').onclick = () => showFleetEditor(location);
    }
}

function showFleetEditor(system) {
    const modal = document.createElement('div');
    modal.className = 'fleet-editor-modal';

    const playerFleetsInSystem = appState.soloGameState.fleets.filter(f => f.locationId === system.id && f.ownerId === 'player1');

    let fleetColumnsHTML = playerFleetsInSystem.map(fleet => `
        <div class="fleet-column">
            <h4>${fleet.name}</h4>
            <div class="ship-list" data-fleet-id="${fleet.id}">
                ${fleet.ships.map((ship, index) => `<div class="ship-list-item" draggable="true" data-ship-index="${index}" data-source-fleet="${fleet.id}">${ship.designId}</div>`).join('')}
            </div>
        </div>
    `).join('');

    modal.innerHTML = `
        <h3>Organize Fleets at ${system.name}</h3>
        <div class="fleet-editor-content">
            ${fleetColumnsHTML}
        </div>
        <div class="button-row" style="margin-top: 20px;">
            <button id="create-new-fleet-btn" class="theme-button">Create New Fleet</button>
            <button id="close-fleet-editor-btn" class="theme-button">Close</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('close-fleet-editor-btn').onclick = () => {
        modal.remove();
        createGrid(); // Re-render map to reflect any changes
    };

    document.getElementById('create-new-fleet-btn').onclick = () => {
        const newFleetName = prompt('Enter name for new fleet:', 'New Fleet');
        if (newFleetName) {
            const newFleet = {
                id: `fleet-${Date.now()}`,
                name: newFleetName,
                ownerId: 'player1',
                locationId: system.id,
                ships: []
            };
            appState.soloGameState.fleets.push(newFleet);
            modal.remove();
            showFleetEditor(system); // Re-open the editor with the new fleet
        }
    };

    // Drag and drop for ships
    modal.querySelectorAll('.ship-list-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                shipIndex: e.target.dataset.shipIndex,
                sourceFleetId: e.target.dataset.sourceFleet
            }));
        });
    });

    modal.querySelectorAll('.ship-list').forEach(list => {
        list.addEventListener('dragover', e => e.preventDefault());
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const sourceFleet = appState.soloGameState.fleets.find(f => f.id === data.sourceFleetId);
            const targetFleet = appState.soloGameState.fleets.find(f => f.id === list.dataset.fleetId);
            
            if (sourceFleet && targetFleet) {
                const [movedShip] = sourceFleet.ships.splice(data.shipIndex, 1);
                targetFleet.ships.push(movedShip);
                modal.remove();
                showFleetEditor(system); // Refresh editor view
            }
        });
    });
}

function moveFleet(fleet, destinationSystem) {
    const enemyFleet = appState.soloGameState.fleets.find(f => f.locationId === destinationSystem.id && f.ownerId !== fleet.ownerId);
    const startSystem = appState.soloGameState.systems.find(s => s.id === fleet.locationId);

    const distance = Math.sqrt(Math.pow(destinationSystem.x - startSystem.x, 2) + Math.pow(destinationSystem.y - startSystem.y, 2));
    const fleetRange = calculateFleetRange(fleet);
    const maxDistance = fleetRange * 200; // Let's define 1 range unit = 200 map units

    if (distance <= maxDistance) {
        if (enemyFleet) {
            // Initiate combat
            startCombat(fleet, enemyFleet);
        } else {
            // Move to the new system
            fleet.locationId = destinationSystem.id;
            createGrid(); // Re-render the map with the new fleet position
        }
    } else {
        showToast(`Move cancelled: Destination is out of range. (Range: ${maxDistance.toFixed(0)}, Required: ${distance.toFixed(0)})`, 'error');
        // No re-render needed, the fleet snaps back visually.
    }
}

function findDesignById(designId) {
    const allDesigns = [...DEFAULT_SHIP_DESIGNS, ...appState.soloGameState.shipDesigns];
    return allDesigns.find(d => d.id === designId);
}

function calculateShipRange(design) {
    if (!design || !design.components) return 0;
    const warpDrives = design.components.find(c => c.category === 'warp');
    return warpDrives ? warpDrives.count : 0;
}

function calculateFleetRange(fleet) {
    if (!fleet || fleet.ships.length === 0) return 0;

    let minRange = Infinity;
    fleet.ships.forEach(shipInfo => {
        const design = findDesignById(shipInfo.designId);
        if (design) {
            const shipRange = calculateShipRange(design);
            if (shipRange < minRange) {
                minRange = shipRange;
            }
        }
    });

    return minRange === Infinity ? 0 : minRange;
}

function endPlayerTurn() {
    processAiTurns();
    appState.soloGameState.turn++;
    createGrid(); // Re-render to show new state
    showToast(`Turn ${appState.soloGameState.turn} begins.`, 'info');
}

function processAiTurns() {
    const gameState = appState.soloGameState;
    const aiPlayers = gameState.players.filter(p => p.isAI);

    aiPlayers.forEach(aiPlayer => {
        const aiFleets = gameState.fleets.filter(f => f.ownerId === aiPlayer.id);
        if (aiFleets.length === 0) return;

        // Simple AI: Find a target and move one fleet towards it.
        const fleetToMove = aiFleets[0]; // For now, just move the first fleet

        // Find the closest system not owned by this AI
        const currentSystem = gameState.systems.find(s => s.id === fleetToMove.locationId);
        let closestSystem = null;
        let minDistance = Infinity;

        gameState.systems.forEach(targetSystem => {
            if (targetSystem.ownerId !== aiPlayer.id) {
                const distance = Math.sqrt(Math.pow(targetSystem.x - currentSystem.x, 2) + Math.pow(targetSystem.y - currentSystem.y, 2));
                if (distance < minDistance) {
                    minDistance = distance;
                    closestSystem = targetSystem;
                }
            }
        });

        if (closestSystem) moveFleet(fleetToMove, closestSystem);
    });
}

export function getInitialState() {
    const systems = [];
    for (let i = 0; i < NUM_SYSTEMS; i++) {
        let x, y, tooClose;
        do {
            tooClose = false;
            x = Math.floor(Math.random() * (MAP_WIDTH - 100)) + 50; // Add padding
            y = Math.floor(Math.random() * (MAP_HEIGHT - 100)) + 50;
            for (const otherSystem of systems) {
                const distance = Math.sqrt(Math.pow(otherSystem.x - x, 2) + Math.pow(otherSystem.y - y, 2));
                if (distance < MIN_STAR_DISTANCE) {
                    tooClose = true;
                    break;
                }
            }
        } while (tooClose);

        systems.push({ id: i, name: `System ${i + 1}`, x, y, owner: null, color: '#FFFFFF' });
    }

    // --- Create Players (Human and AI) ---
    const players = [{ id: 'player1', name: 'Human', color: '#00A0C0', isAI: false }];
    const aiCount = parseInt(dom.cbAiPlayerCountSelect.value, 10) || 1;
    const aiColors = ['#CC3333', '#EFB82A', '#33CC33'];
    for (let i = 0; i < aiCount; i++) {
        players.push({ id: `AI-${i + 1}`, name: `AI ${i + 1}`, color: aiColors[i % aiColors.length], isAI: true });
    }

    // --- Assign Home Systems ---
    const availableSystems = [...systems];
    players.forEach(player => {
        if (availableSystems.length > 0) {
            const homeSystemIndex = Math.floor(Math.random() * availableSystems.length);
            const homeSystem = availableSystems.splice(homeSystemIndex, 1)[0];
            homeSystem.ownerId = player.id;
            homeSystem.color = player.color; // Set star color to owner's color
        }
    });

    // --- Create Initial Fleets ---
    const fleets = [];
    players.forEach((player, index) => {
        const homeSystem = systems.find(s => s.ownerId === player.id);
        if (homeSystem) {
            fleets.push({
                id: `fleet-${player.id}-alpha`,
                name: `${player.name} Fleet Alpha`,
                ownerId: player.id,
                locationId: homeSystem.id,
                ships: [
                    { designId: 'default-enterprise' }, // Example starting ship
                    { designId: 'default-wasp' }
                ]
            });
        }
    });

    return {
        turn: 1,
        systems: systems,
        players: players,
        fleets: fleets,
        selectedFleetId: null,
        combat: {
            active: false,
            ships: [],
            projectiles: [], // To track missiles, etc.
            turn: 0,
            nextProjectileId: 0,
            effects: [] // For visual effects like explosions and beams
        },
        shipDesigns: loadDesignsFromStorage(), // Load custom designs
        currentDesign: null // To hold the ship being actively designed
    };
}

export function loadPuzzle() {
    appState.soloGameState = getInitialState();
    createGrid();
}