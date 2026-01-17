export class FleetManagerModal {
    constructor(engine) {
        this.engine = engine;
        this._injectHTML();
        this._injectCSS();
        this.filterType = 'ALL';
        this.collapsedSystems = new Set();

        this.modal = document.getElementById('fleet-manager-modal');
        this.closeBtn = document.getElementById('close-fleet-manager-modal');
        this.contentContainer = document.getElementById('fleet-manager-content');

        this.closeBtn.onclick = () => this.hide();
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        };

        // Use event delegation for all actions
        this.contentContainer.addEventListener('click', (e) => {
            const target = e.target;
            if (target.id === 'btn-create-fleet') {
                this._handleCreateFleet();
            } else if (target.dataset.action === 'disband-fleet') {
                this._handleDisbandFleet(target.dataset.fleetId);
            } else if (target.dataset.action === 'move-fleet') {
                this._handleMoveFleet(target.dataset.fleetId);
            } else if (target.dataset.action === 'rename-fleet') {
                this._handleRenameFleet(target.dataset.fleetId);
            } else if (target.closest('.system-header')) {
                const header = target.closest('.system-header');
                const systemName = header.dataset.system;
                if (this.collapsedSystems.has(systemName)) {
                    this.collapsedSystems.delete(systemName);
                } else {
                    this.collapsedSystems.add(systemName);
                }
                this.render();
            }
        });

        // Checkbox delegation
        this.contentContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('system-checkbox')) {
                const systemName = e.target.dataset.system;
                const isChecked = e.target.checked;
                const checkboxes = this.contentContainer.querySelectorAll(`.unassigned-ship-checkbox[data-system="${systemName}"]`);
                checkboxes.forEach(cb => cb.checked = isChecked);
            } else if (e.target.id === 'ship-type-filter') {
                this.filterType = e.target.value;
                this.render();
            }
        });

        // Drag and Drop delegation
        this.contentContainer.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('draggable-ship')) {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    shipId: e.target.dataset.shipId,
                    sourceFleetId: e.target.dataset.fleetId || null
                }));
                e.target.classList.add('dragging');
            }
        });

        this.contentContainer.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('draggable-ship')) {
                e.target.classList.remove('dragging');
            }
        });

        this.contentContainer.addEventListener('dragover', (e) => {
            e.preventDefault(); // Allow drop
            const fleetGroup = e.target.closest('.fleet-group');
            const unassignedGroup = e.target.closest('.unassigned-group');
            
            document.querySelectorAll('.drag-target-active').forEach(el => el.classList.remove('drag-target-active'));

            if (fleetGroup) {
                fleetGroup.classList.add('drag-target-active');
            } else if (unassignedGroup) {
                unassignedGroup.classList.add('drag-target-active');
            }
        });

        this.contentContainer.addEventListener('drop', (e) => this._handleDrop(e));
    }

    _handleDrop(e) {
        e.preventDefault();
        document.querySelectorAll('.drag-target-active').forEach(el => el.classList.remove('drag-target-active'));
        
        const rawData = e.dataTransfer.getData('text/plain');
        if (!rawData) return;
        let data;
        try { data = JSON.parse(rawData); } catch(err) { return; }
        
        const { shipId, sourceFleetId } = data;
        
        const fleetGroup = e.target.closest('.fleet-group');
        const unassignedGroup = e.target.closest('.unassigned-group');

        if (fleetGroup) {
            const targetFleetId = fleetGroup.dataset.fleetId;
            if (targetFleetId !== sourceFleetId) {
                this.engine.requestUpdateFleetShips(targetFleetId, [shipId], []);
            }
        } else if (unassignedGroup) {
            if (sourceFleetId) {
                this.engine.requestUpdateFleetShips(sourceFleetId, [], [shipId]);
            }
        }
    }

    show() {
        this.render();
        this.modal.classList.remove('hidden');
    }

    hide() {
        this.modal.classList.add('hidden');
    }

    _handleCreateFleet() {
        const selectedShipIds = Array.from(this.contentContainer.querySelectorAll('.unassigned-ship-checkbox:checked')).map(cb => cb.value);
        if (selectedShipIds.length === 0) {
            alert('Please select at least one unassigned ship to form a fleet.');
            return;
        }
        const fleetName = prompt('Enter a name for the new fleet:', `Fleet ${this.engine.state.players.find(p => p.id === this.engine.getIdentity().guid).fleets.length + 1}`);
        if (fleetName) {
            this.engine.requestCreateFleet(fleetName, selectedShipIds);
            this.render(); // Re-render immediately for responsiveness
        }
    }

    _handleDisbandFleet(fleetId) {
        if (confirm('Are you sure you want to disband this fleet? The ships will become unassigned.')) {
            this.engine.requestDisbandFleet(fleetId);
            this.render();
        }
    }

    _handleMoveFleet(fleetId) {
        const fleet = this.engine.state.players.find(p => p.id === this.engine.getIdentity().guid).fleets.find(f => f.id === fleetId);
        if (!fleet) return;

        const fleetShips = this.engine.state.ships.filter(s => fleet.shipIds.includes(s.id));
        if (fleetShips.length === 0) {
            alert('This fleet has no ships to move.');
            return;
        }

        // Find the current system of the fleet. All ships must be in the same system.
        let currentSystemId = null;
        let allInSameSystem = true;
        for (const ship of fleetShips) {
            const shipSystem = this.engine.spatialService.getCurrentSystem(ship);

            if (!shipSystem) {
                allInSameSystem = false;
                break;
            }
            if (currentSystemId === null) {
                currentSystemId = shipSystem.id;
            } else if (currentSystemId !== shipSystem.id) {
                allInSameSystem = false;
                break;
            }
        }

        if (!allInSameSystem || !currentSystemId) {
            alert('All ships in the fleet must be stationary in the same star system to issue a move order.');
            return;
        }

        const currentSystem = this.engine.state.systems.find(s => s.id === currentSystemId);
        const adjacentSystems = currentSystem.links.map(link => this.engine.state.systems.find(s => s.id === link.targetId)).filter(Boolean);

        if (adjacentSystems.length === 0) {
            alert('There are no adjacent systems to move to.');
            return;
        }

        const destinationId = prompt(`Move '${fleet.name}' to which adjacent system?\n\n` + adjacentSystems.map((s, i) => `${i + 1}: ${s.name}`).join('\n'));
        if (destinationId) {
            const choice = parseInt(destinationId, 10) - 1;
            if (choice >= 0 && choice < adjacentSystems.length) {
                this.engine.requestMoveFleet(fleetId, adjacentSystems[choice].id);
                this.hide();
            } else {
                alert('Invalid selection.');
            }
        }
    }

    _handleRenameFleet(fleetId) {
        const fleet = this.engine.state.players.find(p => p.id === this.engine.getIdentity().guid).fleets.find(f => f.id === fleetId);
        if (!fleet) return;
        const newName = prompt('Enter new name for fleet:', fleet.name);
        if (newName && newName !== fleet.name) {
            this.engine.requestRenameFleet(fleetId, newName);
            if (this.engine.isHost) this.render();
        }
    }

    render() {
        const player = this.engine.state.players.find(p => p.id === this.engine.getIdentity().guid);
        if (!player) {
            this.contentContainer.innerHTML = '<p>Loading player data...</p>';
            return;
        }

        const { ships, systems } = this.engine.state;
        const myShips = ships.filter(s => s.owner === player.id && !s.isStation);

        // Filter unassigned ships
        const allUnassigned = myShips.filter(s => !s.fleetId);
        const unassignedShips = this.filterType === 'ALL' ? allUnassigned : allUnassigned.filter(s => s.type === this.filterType);

        // Group by system
        const shipsBySystem = unassignedShips.reduce((acc, ship) => {
            const system = this.engine.spatialService.getCurrentSystem(ship);
            const location = system ? system.name : 'In Transit';
            if (!acc[location]) acc[location] = [];
            acc[location].push(ship);
            return acc;
        }, {});

        let html = '<h3>Fleets</h3>';
        if (player.fleets.length > 0) {
            player.fleets.forEach(fleet => {
                const fleetShips = myShips.filter(s => fleet.shipIds.includes(s.id));
                
                // Calculate composition summary
                const composition = fleetShips.reduce((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc; }, {});
                const compStr = Object.entries(composition).map(([t, c]) => `${c} ${t}`).join(', ');

                html += `<div class="fleet-group" data-fleet-id="${fleet.id}">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                        <h4 style="margin:0;">${fleet.name} <small style="font-weight:normal; font-size:0.8em; color:#aaa;">(${compStr || 'Empty'})</small></h4>
                        <button data-action="rename-fleet" data-fleet-id="${fleet.id}" class="icon-btn" title="Rename">✏️</button>
                    </div>
                    <div class="fleet-actions">
                        <button data-action="move-fleet" data-fleet-id="${fleet.id}">Move</button>
                        <button data-action="disband-fleet" data-fleet-id="${fleet.id}" class="destructive">Disband</button>
                    </div>
                    <ul>${fleetShips.map(s => `<li><span draggable="true" class="draggable-ship" data-ship-id="${s.id}" data-fleet-id="${fleet.id}">${s.type} (H: ${Math.round(s.hull)}/${Math.round(s.maxHull)})</span></li>`).join('')}</ul>
                </div>`;
            });
        } else {
            html += '<p>No fleets created.</p>';
        }

        // Filter Controls
        const uniqueTypes = ['ALL', ...new Set(allUnassigned.map(s => s.type))].sort();
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-top: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            <h3 style="margin:0; border:none;">Unassigned Ships</h3>
            <select id="ship-type-filter" style="padding: 4px;">
                ${uniqueTypes.map(t => `<option value="${t}" ${this.filterType === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
        </div>`;

        if (Object.keys(shipsBySystem).length > 0) {
            html += '<div class="unassigned-group"><ul>';
            for (const systemName in shipsBySystem) {
                const isCollapsed = this.collapsedSystems.has(systemName);
                const count = shipsBySystem[systemName].length;
                html += `<li>
                    <div class="system-header" data-system="${systemName}">
                        <span style="width:15px; display:inline-block; font-size: 0.8em;">${isCollapsed ? '►' : '▼'}</span>
                        <input type="checkbox" class="system-checkbox" data-system="${systemName}" onclick="event.stopPropagation()">
                        <strong>${systemName} (${count})</strong>
                    </div>
                    <ul class="${isCollapsed ? 'hidden' : ''}">`;
                shipsBySystem[systemName].forEach(ship => {
                    html += `<li><label><input type="checkbox" class="unassigned-ship-checkbox" value="${ship.id}" data-system="${systemName}"> <span draggable="true" class="draggable-ship" data-ship-id="${ship.id}">${ship.type} (H: ${Math.round(ship.hull)}/${Math.round(ship.maxHull)})</span></label></li>`;
                });
                html += '</ul></li>';
            }
            html += '</ul></div>';
            html += `<div class="fleet-actions" style="margin-top:10px;"><button id="btn-create-fleet">Create Fleet from Selected</button></div>`;
        } else {
            html += '<p>No unassigned ships available.</p>';
        }

        this.contentContainer.innerHTML = html;
    }

    _injectHTML() {
        if (document.getElementById('fleet-manager-modal')) return;
        const html = `
            <div id="fleet-manager-modal" class="modal hidden">
                <div class="modal-content">
                    <span id="close-fleet-manager-modal" class="close-modal">&times;</span>
                    <h2>Fleet Management</h2>
                    <div id="fleet-manager-content"></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _injectCSS() {
        if (document.getElementById('fleet-manager-css')) return;
        const css = `
            #fleet-manager-modal .modal-content { max-width: 700px; }
            #fleet-manager-content h3 { border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-top: 1.5rem; }
            .fleet-group { background: rgba(0,0,0,0.05); padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
            .unassigned-group { background: rgba(0,0,0,0.02); padding: 1rem; border-radius: 8px; }
            .fleet-group h4 { margin: 0 0 0.5rem 0; }
            .system-header { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 5px; margin-bottom: 5px; background: rgba(0,0,0,0.05); padding: 5px; border-radius: 4px; }
            .system-header:hover { background: rgba(0,0,0,0.1); }
            .fleet-actions { margin-top: 0.5rem; display: flex; gap: 0.5rem; }
            .fleet-actions .destructive { background-color: #c0392b; }
            body[data-theme="dark"] .fleet-group { background: rgba(255,255,255,0.05); }
            .draggable-ship { cursor: grab; }
            .draggable-ship.dragging { opacity: 0.5; }
            .drag-target-active { border: 2px dashed var(--primary-color); background: rgba(var(--primary-rgb), 0.1); }
            .icon-btn { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 0 5px; }
            .icon-btn:hover { transform: scale(1.1); }
        `;
        const style = document.createElement('style');
        style.id = 'fleet-manager-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}