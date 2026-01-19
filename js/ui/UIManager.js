import { RESOURCE_TYPES, FACTION_COLORS } from '../cb_constants.js';

export class UIManager {
    constructor(gameEngine, storageService) {
        this.gameEngine = gameEngine;
        this.storageService = storageService;
        this.colorPicker = document.getElementById('faction-color-picker'); // This element is bound in app.js
        this.systemListContainer = document.getElementById('system-list'); // Cache this element
    }

    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        if (this.storageService) this.storageService.saveTheme(theme);
        else localStorage.setItem('theme', theme);
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '☀️' : '🌓';
        }
    }

    formatNumber(num) {
        if (num === undefined || num === null) return '0';
        const n = Math.floor(num);
        if (n < 1000) return n.toString();
        if (n < 1000000) return parseFloat((n / 1000).toFixed(2)) + 'K';
        if (n < 1000000000) return parseFloat((n / 1000000).toFixed(2)) + 'M';
        return parseFloat((n / 1000000000).toFixed(2)) + 'B';
    }

    renderResourceHeader() {
        const container = document.getElementById('resource-list');
        if (!container) return;
        
        let html = RESOURCE_TYPES.map(res => `
            <span title="${res.title}">
                <span class="res-label">${res.label}</span>
                <span class="res-value-group">
                    <strong id="${res.domId}">0</strong>
                    <i class="${res.cssClass}">${res.icon}</i>
                </span>
            </span>
        `).join('');

        // Add Ship Summary Section
        html += `<div class="resource-separator" style="width: 100%; height: 1px; background: rgba(0, 242, 255, 0.3); margin: 5px 0;"></div>`;
        html += `<div id="ship-summary-list" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap: 2px 8px; width: 100%;"></div>`;

        container.innerHTML = html;
    }

    updateHeaderUI() {
        if (!this.gameEngine) return;
        
        let displayResources = { IO: 0, minerals: 0, energy: 0, scrap: 0 };
        let showUI = true;
        let viewingPlayerIds = [];

        if (this.gameEngine.isHost) {
            const { mode, faction: target, selectedPlayerIds } = this.gameEngine.hostView;
            let playersToSum = [];

            if (mode === 'god') {
                playersToSum = this.gameEngine.state.players;
            } else if (mode === 'filtered') {
                playersToSum = this.gameEngine.state.players.filter(p => selectedPlayerIds.includes(p.id));
            } else if (mode === 'faction') {
                playersToSum = this.gameEngine.state.players.filter(p => p.team === target);
            } else {
                const p = this.gameEngine.state.players.find(pl => pl.id === target) || this.gameEngine.getLocalPlayer();
                if (p) playersToSum = [p];
            }

            if (playersToSum.length > 0) {
                playersToSum.forEach(p => {
                    Object.keys(displayResources).forEach(k => displayResources[k] += (p.resources[k] || 0));
                });
                viewingPlayerIds = playersToSum.map(p => p.id);
            } else if (mode !== 'god') {
                showUI = false;
            }
        } else {
            const localPlayer = this.gameEngine.getLocalPlayer();
            if (localPlayer) {
                displayResources = localPlayer.resources;
                viewingPlayerIds = [localPlayer.id];
            }
            else showUI = false;
        }

        const resourceDisplay = document.getElementById('resource-display');
        if (!showUI) {
            if (resourceDisplay) resourceDisplay.style.display = 'none';
            return;
        }
        if (resourceDisplay) resourceDisplay.style.display = 'flex';

        const updateResource = (id, value, threshold = 0) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = this.formatNumber(value);
                if (value <= threshold) el.classList.add('low-resource');
                else el.classList.remove('low-resource');
            }
        };

        RESOURCE_TYPES.forEach(res => {
            updateResource(res.domId, displayResources[res.key], res.threshold || 0);
        });

        // Update Ship Summary
        const shipSummaryList = document.getElementById('ship-summary-list');
        if (shipSummaryList) {
            const shipCounts = {};
            const relevantShips = this.gameEngine.state.ships.filter(s => viewingPlayerIds.includes(s.owner) && s.hull > 0);
            
            relevantShips.forEach(s => {
                let type = s.type;
                if (type === 'TroopTransport') type = 'Transport';
                if (type === 'SpaceStation') type = 'Station';
                shipCounts[type] = (shipCounts[type] || 0) + 1;
            });

            const sortedTypes = Object.keys(shipCounts).sort();
            
            if (sortedTypes.length > 0) {
                shipSummaryList.innerHTML = sortedTypes.map(type => {
                    return `<span style="font-size: 0.75rem; white-space: nowrap; display: flex; justify-content: space-between;" title="${type}"><span>${type}:</span> <strong style="color: #00f2ff;">${this.formatNumber(shipCounts[type])}</strong></span>`;
                }).join('');
            } else {
                shipSummaryList.innerHTML = '<span style="font-size: 0.75rem; color: #888;">No Ships</span>';
            }
        }
        
        // Update System Counts by Participant
        if (this.systemListContainer) {
            this.systemListContainer.innerHTML = '';
            
            // Optimization: Count systems in one pass to avoid O(Players * Systems) complexity
            const systemCounts = {};
            this.gameEngine.state.systems.forEach(s => {
                if (s.owner) {
                    systemCounts[s.owner] = (systemCounts[s.owner] || 0) + 1;
                }
            });

            this.gameEngine.state.players.forEach(p => {
                const count = systemCounts[p.id] || 0;
                
                const span = document.createElement('span');
                span.title = `${p.factionName} Controlled Systems`;
                span.style.setProperty('--player-color', p.color);
                
                if (this.gameEngine.isHost) {
                    span.style.cursor = 'pointer';
                    span.onclick = (e) => {
                        e.stopPropagation();
                        let mode = this.gameEngine.hostView.mode;
                        let selected = this.gameEngine.hostView.selectedPlayerIds || [];

                        if (mode === 'god') {
                            // Transition from God to Filtered (Single Select)
                            this.gameEngine.hostView.mode = 'filtered';
                            this.gameEngine.hostView.selectedPlayerIds = [p.id];
                        } else {
                            // Toggle selection
                            const currentIds = this.gameEngine.getViewingPlayerIds();
                            if (currentIds.includes(p.id)) {
                                selected = currentIds.filter(id => id !== p.id);
                            } else {
                                selected = [...currentIds, p.id];
                            }
                            
                            if (selected.length === 0) {
                                this.gameEngine.hostView.mode = 'god';
                            } else {
                                this.gameEngine.hostView.mode = 'filtered';
                                this.gameEngine.hostView.selectedPlayerIds = selected;
                            }
                        }
                        
                        this.updateHeaderUI();
                        window.dispatchEvent(new CustomEvent('host-view-changed'));
                    };
                } else {
                    span.style.cursor = 'help';
                }

                const isGodMode = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';
                const isSelected = isGodMode || (this.gameEngine.isHost && this.gameEngine.getViewingPlayerIds().includes(p.id));

                if (isSelected) {
                    span.style.opacity = '1';
                    span.style.border = `1px solid ${p.color}`;
                    span.style.borderRadius = '4px';
                    span.style.padding = '2px 4px';
                    span.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                } else {
                    span.style.opacity = '0.5';
                    span.style.padding = '2px 4px';
                    span.style.border = '1px solid transparent';
                }

                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.classList.add("icon-svg", "system-flag");
                svg.setAttribute("viewBox", "0 0 24 24");
                
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", "M12.45 4L12 2H4v18h2v-7h5.55l.45 2h8V4h-7.55z");
                svg.appendChild(path);

                // Create label
                const label = document.createElement('span');
                label.className = 'res-label';
                label.textContent = p.factionName;
                span.appendChild(label);

                // Create value group
                const valueGroup = document.createElement('span');
                valueGroup.className = 'res-value-group';
                valueGroup.innerHTML = `<strong>${count}</strong>`;
                valueGroup.appendChild(svg);
                span.appendChild(valueGroup);

                this.systemListContainer.appendChild(span);
            });
        }
    }

    updateColorPickerUI() {
        if (!this.colorPicker || !this.gameEngine) return;
        this.colorPicker.innerHTML = '';

        const localPlayer = this.gameEngine.getLocalPlayer();
        const takenColors = this.gameEngine.state.players
            .filter(p => p.id !== localPlayer?.id)
            .map(p => p.color);

        FACTION_COLORS.forEach(color => {
            const isMyColor = localPlayer && localPlayer.color === color;
            const isTakenByOther = takenColors.includes(color);

            if (isMyColor || !isTakenByOther) {
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.style.backgroundColor = color;
                swatch.dataset.color = color;

                if (isMyColor) {
                    swatch.classList.add('selected');
                } else {
                    swatch.addEventListener('click', () => this.gameEngine.requestPlayerUpdate({ color: color }));
                }
                this.colorPicker.appendChild(swatch);
            }
        });
    }
}