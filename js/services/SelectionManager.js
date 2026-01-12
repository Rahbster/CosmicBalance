import { SHIP_DATA } from './GalaxyService.js';

export class SelectionManager {
    constructor(engine) {
        this.engine = engine;
        this.selectedShipId = null;
        this.selectedLocationId = null;
        this.isSelectionPanelOpen = false;
    }

    setSelectedShip(shipId, openPanel = false) {
        // Force a full re-render by clearing the 'renderedFor' cache on the panel
        const container = document.getElementById('selected-planet-info');
        if (container) delete container.dataset.renderedFor;
        this.selectedLocationId = null;
        this.selectedShipId = shipId;
        this.isSelectionPanelOpen = openPanel;
        this.renderSelectedUI();
    }

    setSelectedLocation(locationId, openPanel = false) {
        // Force a full re-render by clearing the 'renderedFor' cache on the panel
        const container = document.getElementById('selected-planet-info');
        if (container) delete container.dataset.renderedFor;
        this.selectedShipId = null;
        this.selectedLocationId = locationId;
        this.isSelectionPanelOpen = openPanel;
        this.renderSelectedUI();
    }

    openSelectionPanel() {
        this.isSelectionPanelOpen = true;
        this.renderSelectedUI();
    }

    closeSelectionPanel() {
        this.isSelectionPanelOpen = false;
        this.renderSelectedUI();
    }

    renderSelectedUI() {
        if (this.isSelectionPanelOpen && this.selectedShipId) {
            this._renderSelectedShipUI();
        } else if (this.selectedLocationId) {
            this._renderSelectedLocationUI();
        } else {
            const container = document.getElementById('selected-planet-info');
            if (container) container.classList.add('hidden');
        }
    }

    _renderSelectedShipUI() {
        const container = document.getElementById('selected-planet-info');
        const ship = this.engine.state.ships.find(s => s.id === this.selectedShipId);
        if (!ship) {
            container.classList.add('hidden');
            return;
        }

        const owner = this.engine.state.players.find(p => p.id === ship.owner);
        const isOwner = owner && owner.id === this.engine.getIdentity().guid;

        const currentSystem = this.engine.spatialService.getCurrentSystem(ship);
        const locationName = currentSystem ? currentSystem.name : 'Deep Space';

        // --- Fleet Info ---
        let fleetInfoHtml = '';
        if (ship.fleetId && owner && owner.fleets) {
            const fleet = owner.fleets.find(f => f.id === ship.fleetId);
            if (fleet) {
                fleetInfoHtml = `<p>Fleet: <strong>${fleet.name}</strong></p>`;
            }
        }

        // --- Next/Prev Logic ---
        let navHtml = '';
        if (isOwner) {
            // Find ships in the same system or general vicinity
            let siblings = [];
            if (currentSystem) {
                siblings = this.engine.state.ships.filter(s => s.owner === ship.owner && this.engine.spatialService.isShipInSystem(s, currentSystem));
            } else {
                // Deep space: use all owned ships
                siblings = this.engine.state.ships.filter(s => s.owner === ship.owner);
            }
            
            // Sort by ID to ensure stable order
            siblings.sort((a, b) => a.id.localeCompare(b.id));

            if (siblings.length > 1) {
                const currentIndex = siblings.findIndex(s => s.id === ship.id);
                
                const prevIndex = currentIndex - 1;
                const nextIndex = currentIndex + 1;

                const prevShip = prevIndex >= 0 ? siblings[prevIndex] : null;
                const nextShip = nextIndex < siblings.length ? siblings[nextIndex] : null;

                const prevDisabled = !prevShip ? 'disabled' : '';
                const nextDisabled = !nextShip ? 'disabled' : '';

                navHtml = `
                    <div class="ship-nav" style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <button data-action="select-ship" data-ship-id="${prevShip ? prevShip.id : ''}" ${prevDisabled}>&lt; Prev</button>
                        <button data-action="select-ship" data-ship-id="${nextShip ? nextShip.id : ''}" ${nextDisabled}>Next &gt;</button>
                    </div>
                `;
            }
        }

        // --- Actions Logic ---
        let actionsHtml = '';
        if (isOwner) {
            if (!currentSystem) { // Ship is in Deep Space
                const closestSystem = this.engine.spatialService.getClosestSystem(ship);
                if (closestSystem) {
                    // This button uses the existing 'move-ship' action handler
                    actionsHtml += `<button data-action="move-ship" data-ship-id="${ship.id}" data-target-id="${closestSystem.id}">Move to Nearest System (${closestSystem.name})</button>`;
                }
            }

            if (ship.patrolSystemId) {
                actionsHtml += `<button data-action="stop-patrol" data-ship-id="${ship.id}">Stop Patrol</button>`;
            }

            if (currentSystem) {
                if (ship.type === 'Scout' && currentSystem.owner === ship.owner && !ship.patrolSystemId) {
                     actionsHtml += `<button data-action="patrol" data-ship-id="${ship.id}" data-target-id="${currentSystem.id}">Patrol System</button>`;
                }

                const viewingPlayerId = this.engine.getIdentity().guid;
                
                if (ship.type === 'Scout') {
                     const neighborsToScout = currentSystem.links
                        .map(link => this.engine.state.systems.find(s => s.id === link.targetId))
                        .filter(neighbor => {
                            if (!neighbor) return false;
                            return neighbor.owner !== viewingPlayerId;
                        });
                    
                    neighborsToScout.forEach(n => {
                        actionsHtml += `<button data-action="scout" data-ship-id="${ship.id}" data-target-id="${n.id}">Scout ${n.name}</button>`;
                    });
                }

                if (ship.type === 'TroopTransport') {
                     const visibleNeighbors = currentSystem.links
                        .map(link => this.engine.state.systems.find(s => s.id === link.targetId))
                        .filter(neighbor => {
                            if (!neighbor) return false;
                            const visibility = neighbor.visibility[viewingPlayerId];
                            return visibility === 'explored' || visibility === 'scouted';
                        });

                    visibleNeighbors.forEach(n => {
                        const hasTargets = n.planets.some(p => p.owner !== viewingPlayerId);
                        if (hasTargets) {
                            actionsHtml += `<button data-action="colonize" data-ship-id="${ship.id}" data-target-id="${n.id}">Colonize ${n.name}</button>`;
                        }
                    });
                }
            }

            // Standard Navigation Options (Always available if in a system)
            if (currentSystem) {
                const neighbors = currentSystem.links.map(link => this.engine.state.systems.find(s => s.id === link.targetId));
                if (neighbors.length > 0) {
                    actionsHtml += `<div style="width: 100%; margin-top: 10px; border-top: 1px solid #444; padding-top: 5px;"><strong>Navigation:</strong><div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">`;
                    neighbors.forEach(n => actionsHtml += `<button data-action="move-ship" data-ship-id="${ship.id}" data-target-id="${n.id}" style="font-size: 0.8em; padding: 2px 6px;">Go to ${n.name}</button>`);
                    actionsHtml += `</div></div>`;
                }
            }

            if (ship.type === 'Salvager') {
                const nearbyDebris = this.engine.state.debrisFields.filter(d => {
                    const dx = d.x - ship.x;
                    const dy = d.y - ship.y;
                    return (dx * dx + dy * dy) < (400 * 400);
                });
                if (nearbyDebris.length > 0) {
                    actionsHtml += `<button data-action="recycle" data-ship-id="${ship.id}" data-target-id="${nearbyDebris[0].id}">Recycle Debris</button>`;
                }
            }
        }

        const radialTriggerHtml = isOwner ? `<button data-action="open-radial" data-ship-id="${ship.id}">Actions Menu</button>` : '';

        // This is where the context menu becomes a context panel.
        // We render buttons for actions.
        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">${ship.type}</h3>
                <button data-action="hide-panel" style="background:none;border:none;color:inherit;cursor:pointer;font-size:1.2em;" title="Hide Panel">▼</button>
            </div>
            <p>Owner: ${owner?.factionName || 'Unknown'}</p>
            ${fleetInfoHtml}
            <p>Location: ${locationName}</p>
            <p>Hull: ${ship.hull} / ${ship.maxHull}</p>
            ${this._renderRepairProgress(ship)}
            ${navHtml}
            <div class="context-actions" style="display: flex; gap: 10px; margin-top: 1rem; flex-wrap: wrap;">
                ${actionsHtml}
                ${radialTriggerHtml}
                <button data-action="ship-details" data-ship-id="${ship.id}">Details</button>
                <button data-action="ship-self-destruct" data-ship-id="${ship.id}" style="background-color: #c0392b;">Self-Destruct</button>
            </div>
        `;

        container.innerHTML = html;
        container.classList.remove('hidden');
    }

    _renderRepairProgress(ship) {
        if (!ship.isRepairing) return '';
        const total = ship.totalRepairTime || 15000;
        const current = ship.repairTimer || 0;
        const pct = Math.max(0, Math.min(100, 100 - (current / total * 100)));
        return `
            <div style="margin-bottom: 10px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8em; margin-bottom:2px;">
                    <span>Repairing...</span>
                    <span>${Math.ceil(current/1000)}s</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }

    _renderSelectedLocationUI() {
        // For locations, we generally want the panel open to build/manage, but we respect the flag if set explicitly.
        if (!this.isSelectionPanelOpen) {
            document.getElementById('selected-planet-info').classList.add('hidden');
            return;
        }
        const container = document.getElementById('selected-planet-info');
        this.selectedShipId = null; // Ensure no ship is selected
        if (!this.selectedLocationId) {
            container.classList.add('hidden');
            return;
        }

        // A "location" can be a system or a station.
        let location = this.engine.state.systems.find(s => s.id === this.selectedLocationId);
        let builder = location; // The entity that can build. Initially the system itself.

        if (!location) {
            location = this.engine.state.ships.find(s => s.id === this.selectedLocationId && s.isStation);
            builder = location; // If we selected a station directly, it's the builder.
            if (!location) {
                container.classList.add('hidden');
                return;
            }
        }

        const localPlayer = this.engine.getLocalPlayer();
        
        // If a system is selected, check if there's a friendly station in it.
        // If so, that station becomes the primary builder for ships.
        if (location && !location.isStation) { // It's a system
            const myStationInSystem = this.engine.state.ships.find(s => 
                s.owner === localPlayer?.id && 
                s.isStation &&
                this.engine.spatialService.isShipInSystem(s, location)
            );
            if (myStationInSystem) {
                builder = myStationInSystem; // The station is the builder.
            }
        }

        const builderIsOwnedByMe = builder && localPlayer && builder.owner === localPlayer.id;

        // --- Check if we can do a partial update ---
        const isAlreadyRendered = container.dataset.renderedFor === builder.id;

        // --- Part 1: Generate dynamic HTML content (queues, timers, etc.) ---
        let buildQueueHtml = '';
        if (builderIsOwnedByMe && builder.buildQueue && builder.buildQueue.length > 0) {
            buildQueueHtml = '<h4>Build Queue</h4><ul class="build-queue-list">';

            const groupedQueue = [];
            if (builder.buildQueue.length > 0) {
                // Group consecutive items of the same type
                let lastGroup = null;
                for (const item of builder.buildQueue) {
                    if (lastGroup && lastGroup.shipType === item.shipType) {
                        lastGroup.count++;
                    } else {
                        lastGroup = {
                            shipType: item.shipType,
                            count: 1,
                            firstItem: item
                        };
                        groupedQueue.push(lastGroup);
                    }
                }
            }

            // Render the grouped queue
            groupedQueue.forEach(group => {
                const item = group.firstItem;
                const buildTime = SHIP_DATA[item.shipType].buildTime;
                let progressPercent = 0;
                let statusText = 'Waiting...';

                if (item.startTime) {
                    const remaining = item.remainingTime;
                    progressPercent = Math.min(100, ((buildTime - remaining) / buildTime) * 100);
                    statusText = `${Math.ceil(Math.max(0, remaining) / 1000)}s`;
                }

                const countBadge = group.count > 1 ? `<span class="queue-badge">${group.count}x</span>` : '';

                buildQueueHtml += `<li>
                    <span>${item.shipType}${countBadge} - ${statusText}</span>
                    <button class="cancel-build-btn" data-action="cancel-build" data-location-id="${builder.id}" data-item-id="${item.id}">×</button>
                    <div class="progress-bar-container"><div class="progress-bar" style="width: ${progressPercent}%"></div></div>
                </li>`;
            });

            buildQueueHtml += '</ul>';
        }

        let repairBayHtml = '';
        if (builderIsOwnedByMe && builder.isStation) {
            const systemContext = location.isStation 
                ? this.engine.state.systems.find(sys => this.engine.spatialService.isShipInSystem(location, sys))
                : location;

            if (systemContext) {
                const dockedShips = this.engine.state.ships.filter(s =>
                    s.owner === localPlayer.id && (!s.isStation || s.id === builder.id) && !s.targetId && this.engine.spatialService.isShipInSystem(s, systemContext)
                );

                const groupedShips = {};
                dockedShips.forEach(ship => {
                    if (!groupedShips[ship.type]) {
                        groupedShips[ship.type] = { repairable: [], upgradable: [], servicing: [], ok: [] };
                    }
                    const needsRepair = ship.hull < ship.maxHull;
                    const canUpgrade = localPlayer.researchedTechs.length > (ship.vintageTechs?.length || 0);

                    if (ship.isRepairing) {
                        groupedShips[ship.type].servicing.push(ship);
                    } else if (canUpgrade) { // Upgrade takes precedence as it also repairs
                        groupedShips[ship.type].upgradable.push(ship);
                    } else if (needsRepair) {
                        groupedShips[ship.type].repairable.push(ship);
                    } else {
                        groupedShips[ship.type].ok.push(ship);
                    }
                });

                let listContent = '';
                for (const shipType in groupedShips) {
                    const groups = groupedShips[shipType];

                    if (groups.upgradable.length > 0) {
                        const count = groups.upgradable.length;
                        const ship = groups.upgradable[0];
                        const badge = count > 1 ? `<span class="queue-badge">${count}x</span>` : '';
                        const buttonHtml = `<button data-action="repair-ship-group" data-ship-type="${shipType}" data-service-type="upgrade">Upgrade</button>`;
                        listContent += `<li><span>${shipType}${badge} (Hull: ${ship.hull}/${ship.maxHull})</span>${buttonHtml}</li>`;
                    }
                    if (groups.repairable.length > 0) {
                        const count = groups.repairable.length;
                        const ship = groups.repairable[0];
                        const badge = count > 1 ? `<span class="queue-badge">${count}x</span>` : '';
                        const buttonHtml = `<button data-action="repair-ship-group" data-ship-type="${shipType}" data-service-type="repair">Repair</button>`;
                        listContent += `<li><span>${shipType}${badge} (Hull: ${ship.hull}/${ship.maxHull})</span>${buttonHtml}</li>`;
                    }
                    if (groups.servicing.length > 0) {
                        const count = groups.servicing.length;
                        const badge = count > 1 ? `<span class="queue-badge">${count}x</span>` : '';
                        listContent += `<li><span>${shipType}${badge}</span><button disabled>Servicing...</button></li>`;
                    }
                    // "OK" ships are hidden to declutter the Repair Bay
                }

                if (listContent) {
                    repairBayHtml = `<h4>Repair Bay</h4><ul class="repair-bay-list">${listContent}</ul>`;
                }
            }
        }

        // --- Part 2: Apply updates ---
        if (isAlreadyRendered) {
            // Partial update: Only refresh the dynamic parts
            const queueContainer = document.getElementById('build-queue-container');
            if (queueContainer) queueContainer.innerHTML = buildQueueHtml;
            
            const repairContainer = document.getElementById('repair-bay-container');
            if (repairContainer) repairContainer.innerHTML = repairBayHtml;
            
            container.classList.remove('hidden');
            return; // We are done, no full re-render needed.
        }

        // --- Part 3: Full Render (if selection changed) ---
        let nameHtml = `<h3 style="margin:0;">${location.name || builder.type}</h3>`;
        if (builderIsOwnedByMe && !location.isStation) {
             nameHtml = `
                <div style="display:flex; align-items:center; gap: 8px;">
                    <h3 style="margin:0;">${location.name}</h3>
                    <button class="rename-btn" data-action="rename-system" data-system-id="${location.id}" title="Rename System" style="background:none; border:none; cursor:pointer; font-size:1rem;">✏️</button>
                </div>
             `;
        }

        let html = `<div style="display:flex; justify-content:space-between; align-items:center;">
            ${nameHtml}
            <button data-action="hide-panel" style="background:none;border:none;color:inherit;cursor:pointer;font-size:1.2em;" title="Hide Panel">▼</button>
        </div>`;
        html += `<div style="margin-bottom: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="context-open-tech-tree">Tech Tree</button>
                    <button id="context-open-fleet-manager">Fleets</button>
                 </div>`;

        if (builderIsOwnedByMe) {
            html += '<h4>Build Ships</h4>';
            html += '<div class="build-options">';
            
            Object.entries(SHIP_DATA).forEach(([shipType, shipData]) => {
                const canBuild = builder.isStation 
                    ? (SHIP_DATA[builder.type]?.buildCapabilities?.includes(shipType))
                    : shipData.builtBy.includes('Planet');

                const techRequirementMet = !shipData.requiresTech || localPlayer.researchedTechs.includes(shipData.requiresTech);

                if (canBuild) {
                    const cost = shipData.cost;
                    const disabled = !techRequirementMet ? 'disabled' : '';
                    const title = !techRequirementMet ? `Requires tech: ${shipData.requiresTech}` : `Queue ${shipType}`;

                    html += `<div class="build-item">
                                <span>${shipType} (IO: ${cost.credits || 0}, S: ${cost.scrap || 0})</span>
                                <div class="build-controls">
                                    <input type="number" id="build-count-${shipType}" value="1" min="1" max="100" style="width: 50px;" ${disabled}>
                                    <button data-action="queue-build" data-ship-type="${shipType}" ${disabled} title="${title}">Queue</button>
                                </div>
                             </div>`;
                }
            });
            html += '</div>';
        } else {
            html += '<p>This system is not under your control.</p>';
        }

        // Add Planet List with Capture Status
        if (location.planets && location.planets.length > 0) {
            html += '<h4>Planets</h4><ul class="planet-list">';
            location.planets.forEach(p => {
                const ownerName = p.owner ? this.engine.state.players.find(pl => pl.id === p.owner)?.factionName : 'Neutral';
                let status = `<span style="color: ${p.owner ? (this.engine.state.players.find(pl => pl.id === p.owner)?.color || '#fff') : '#aaa'}">${ownerName}</span>`;
                if (p.captureProgress > 0 && p.captureProgress < 100) {
                    status += ` <span style="color: orange;">(${Math.round(p.captureProgress)}%)</span>`;
                }
                html += `<li>${p.name}: ${status}</li>`;
            });
            html += '</ul>';
        }

        // Add containers for dynamic content
        html += `<div id="build-queue-container">${buildQueueHtml}</div>`;
        html += `<div id="repair-bay-container">${repairBayHtml}</div>`;

        container.innerHTML = html;
        container.dataset.renderedFor = builder.id; // Mark as rendered for this specific builder
        container.classList.remove('hidden');
    }

    renderTechTreeProgress() {
        // This assumes the TechTreeModal has a root element with id="tech-tree-modal" and toggles a "hidden" class.
        const techTreeModal = document.getElementById('tech-tree-modal');
        if (!techTreeModal || techTreeModal.classList.contains('hidden')) {
            return; // Don't render if modal is not visible
        }

        const player = this.engine.getLocalPlayer();
        const queueContainer = document.getElementById('research-queue-container');
        if (!queueContainer) return;

        if (!player || !player.researchQueue || player.researchQueue.length === 0) {
            queueContainer.innerHTML = ''; // Clear it if nothing is being researched
            return;
        }

        const techData = this.engine.techService.getTechData()?.[player.team];
        if (!techData) return;

        let researchQueueHtml = '<h4>Research In Progress</h4><ul class="research-queue-list">';
        player.researchQueue.forEach(item => {
            const tech = techData[item.techId];
            if (!tech) return;

            const totalTime = item.totalTime || tech.researchTime;
            const remaining = item.remainingTime;
            const progressPercent = totalTime > 0 ? Math.min(100, ((totalTime - remaining) / totalTime) * 100) : 0;
            const statusText = `${Math.ceil(Math.max(0, remaining) / 1000)}s`;

            researchQueueHtml += `<li><span>${tech.name} - ${statusText}</span><div class="progress-bar-container"><div class="progress-bar" style="width: ${progressPercent}%"></div></div></li>`;
        });
        researchQueueHtml += '</ul>';
        queueContainer.innerHTML = researchQueueHtml;
    }
}