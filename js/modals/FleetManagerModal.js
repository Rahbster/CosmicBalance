export class FleetManagerModal {
    constructor(engine) {
        this.engine = engine;
        this._injectHTML();
        this._injectCSS();

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
            }
        });
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

    render() {
        const player = this.engine.state.players.find(p => p.id === this.engine.getIdentity().guid);
        if (!player) {
            this.contentContainer.innerHTML = '<p>Loading player data...</p>';
            return;
        }

        const { ships, systems } = this.engine.state;
        const myShips = ships.filter(s => s.owner === player.id);

        // Group unassigned ships by system
        const unassignedShips = myShips.filter(s => !s.fleetId);
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
                html += `<div class="fleet-group">
                    <h4>${fleet.name} (${fleetShips.length} ships)</h4>
                    <div class="fleet-actions">
                        <button data-action="move-fleet" data-fleet-id="${fleet.id}">Move</button>
                        <button data-action="disband-fleet" data-fleet-id="${fleet.id}" class="destructive">Disband</button>
                    </div>
                    <ul>${fleetShips.map(s => `<li>${s.type} (H: ${Math.round(s.hull)}/${Math.round(s.maxHull)})</li>`).join('')}</ul>
                </div>`;
            });
        } else {
            html += '<p>No fleets created.</p>';
        }

        html += '<h3>Unassigned Ships</h3>';
        if (unassignedShips.length > 0) {
            html += '<ul>';
            for (const systemName in shipsBySystem) {
                html += `<li><strong>${systemName}</strong><ul>`;
                shipsBySystem[systemName].forEach(ship => {
                    html += `<li><label><input type="checkbox" class="unassigned-ship-checkbox" value="${ship.id}"> ${ship.type} (H: ${Math.round(ship.hull)}/${Math.round(ship.maxHull)})</label></li>`;
                });
                html += '</ul></li>';
            }
            html += '</ul>';
            html += `<div class="fleet-actions"><button id="btn-create-fleet">Create Fleet from Selected</button></div>`;
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
            .fleet-group h4 { margin: 0 0 0.5rem 0; }
            .fleet-actions { margin-top: 0.5rem; display: flex; gap: 0.5rem; }
            .fleet-actions .destructive { background-color: #c0392b; }
            body[data-theme="dark"] .fleet-group { background: rgba(255,255,255,0.05); }
        `;
        const style = document.createElement('style');
        style.id = 'fleet-manager-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}