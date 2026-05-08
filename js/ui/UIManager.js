import { RESOURCE_TYPES, FACTION_COLORS } from '../cb_constants.js';
import { appState, updateState } from '../state.js';

export class UIManager {
    constructor(gameEngine, storageService) {
        this.gameEngine = gameEngine;
        this.storageService = storageService;
        this.targetCommander = null;
        this.colorPicker = null; 
        this.systemListContainer = document.getElementById('system-list'); 
    }

    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        document.body.className = theme; 
        if (this.storageService) this.storageService.saveTheme(theme);
        else localStorage.setItem('theme', theme);
        
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
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

        html += `<div class="resource-separator" style="width: 100%; height: 1px; background: rgba(0, 242, 255, 0.3); margin: 5px 0;"></div>`;
        html += `<div id="ship-summary-list" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap: 2px 8px; width: 100%;"></div>`;

        container.innerHTML = html;
    }

    updateHeaderUI() {
        if (!this.gameEngine) return;
        
        let displayResources = { IO: 0, minerals: 0, energy: 0, scrap: 0 };
        let showUI = true;
        let viewingCommanderIds = [];

        if (this.gameEngine.isHost) {
            const { mode, faction: target, selectedCommanderIds } = this.gameEngine.hostView;
            let commandersToSum = [];

            if (mode === 'god') {
                commandersToSum = this.gameEngine.state.players;
            } else if (mode === 'filtered') {
                commandersToSum = this.gameEngine.state.players.filter(p => selectedCommanderIds.includes(p.id));
            } else if (mode === 'faction') {
                commandersToSum = this.gameEngine.state.players.filter(p => p.team === target);
            } else {
                const p = this.gameEngine.state.players.find(pl => pl.id === target) || this.gameEngine.getLocalPlayer();
                if (p) commandersToSum = [p];
            }

            if (commandersToSum.length > 0) {
                commandersToSum.forEach(p => {
                    Object.keys(displayResources).forEach(k => displayResources[k] += (p.resources[k] || 0));
                });
                viewingCommanderIds = commandersToSum.map(p => p.id);
            } else if (mode !== 'god') {
                showUI = false;
            } else {
                showUI = true;
            }
        } else {
            const localPlayer = this.gameEngine.getLocalPlayer();
            if (localPlayer) {
                displayResources = localPlayer.resources;
                viewingCommanderIds = [localPlayer.id];
            } else {
                showUI = false;
            }
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

        const shipSummaryList = document.getElementById('ship-summary-list');
        if (shipSummaryList) {
            const shipCounts = {};
            const relevantShips = this.gameEngine.state.ships.filter(s => viewingCommanderIds.includes(s.owner) && s.hull > 0);
            
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
        
        if (this.systemListContainer) {
            this.systemListContainer.innerHTML = '';
            
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
                    const localPlayer = this.gameEngine.getLocalPlayer();
                    const isGodMode = this.gameEngine.hostView.mode === 'god';
                    const isSpectator = !localPlayer; 
                    const isSameFaction = localPlayer && p.team === localPlayer.team;
                    
                    const canSelect = isGodMode || isSpectator || isSameFaction || p.id === localPlayer?.id;
                    
                    if (canSelect) {
                        span.style.cursor = 'pointer';
                        span.onclick = (e) => {
                            e.stopPropagation();
                            let mode = this.gameEngine.hostView.mode;
                            let selected = this.gameEngine.hostView.selectedCommanderIds || [];

                            if (mode === 'god') {
                                this.gameEngine.hostView.mode = 'filtered';
                                this.gameEngine.hostView.selectedCommanderIds = [p.id];
                            } else {
                                const currentIds = this.gameEngine.getViewingCommanderIds();
                                if (currentIds.includes(p.id)) {
                                    if (!isSpectator && !isGodMode && p.id === localPlayer?.id && currentIds.length === 1) {
                                        return;
                                    }
                                    this.gameEngine.hostView.selectedCommanderIds = selected.filter(id => id !== p.id);
                                } else {
                                    this.gameEngine.hostView.selectedCommanderIds.push(p.id);
                                }
                                
                                if (this.gameEngine.hostView.selectedCommanderIds.length === 0) {
                                    this.gameEngine.hostView.mode = isSpectator ? 'god' : 'player';
                                } else {
                                    this.gameEngine.hostView.mode = 'filtered';
                                }
                            }
                            
                            this.updateHeaderUI();
                            this.gameEngine.renderService.draw(); 
                        };
                    }
                }

                const isGodMode = this.gameEngine.isHost && this.gameEngine.hostView.mode === 'god';
                const isSelected = isGodMode || (this.gameEngine.isHost && this.gameEngine.getViewingCommanderIds().includes(p.id));

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

                const localPlayerId = this.gameEngine.getLocalPlayer()?.id;
                if (p.id !== localPlayerId) {
                    const isFriend = (window.appState?.friends || []).some(f => f.playerId === p.id);
                    const friendBtn = document.createElement('span');
                    friendBtn.className = `friend-star ${isFriend ? 'is-friend' : ''}`;
                    friendBtn.innerHTML = isFriend ? '★' : '☆';
                    friendBtn.style.cursor = 'pointer';
                    friendBtn.style.marginLeft = '4px';
                    friendBtn.style.color = isFriend ? '#ffcc00' : 'rgba(255,255,255,0.4)';
                    friendBtn.title = isFriend ? 'Remove from Radar' : 'Add to Radar';
                    friendBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (window.friendsRadar) {
                            if (isFriend) window.friendsRadar.removeFriend(p.id);
                            else window.friendsRadar.addFriend(p.id, p.factionName);
                            this.updateHeaderUI(); 
                            this.renderSidenavFriends(); 
                        }
                    };
                    span.appendChild(friendBtn);
                }

                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.classList.add("icon-svg", "system-flag");
                svg.setAttribute("viewBox", "0 0 24 24");
                
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", "M12.45 4L12 2H4v18h2v-7h5.55l.45 2h8V4h-7.55z");
                svg.appendChild(path);

                const label = document.createElement('div');
                label.className = 'commander-status-label';
                label.style.color = p.color;
                label.textContent = p.name || p.factionName;
                span.appendChild(label);

                const valueGroup = document.createElement('span');
                valueGroup.className = 'res-value-group';
                valueGroup.innerHTML = `<strong>${count}</strong>`;
                valueGroup.appendChild(svg);
                span.appendChild(valueGroup);

                this.systemListContainer.appendChild(span);
            });
        }
    }

    renderSidenavFriends() {
        const listEl = document.getElementById('sidenav-friends-list');
        if (!listEl) return;

        const friends = window.appState?.friends || [];
        if (friends.length === 0) {
            listEl.innerHTML = '<li style="opacity: 0.5; font-style: italic; padding: 5px;">Radar is empty.</li>';
            return;
        }

        listEl.innerHTML = friends.map(f => `
            <li style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--primary-color);">${f.name}</span>
                <button class="icon-btn" style="color: var(--error-red); padding: 2px;" onclick="window.friendsRadar.removeFriend('${f.playerId}'); window.uiManager.renderSidenavFriends(); window.uiManager.updateHeaderUI();">
                    &times;
                </button>
            </li>
        `).join('');
    }

    updateColorPickerUI(containerId = null) {
        const target = containerId ? document.getElementById(containerId) : this.colorPicker;
        if (!target) return;
        target.innerHTML = '';

        const localPlayer = this.gameEngine.getLocalPlayer();

        // 1-7: Preset Colors
        const presets = FACTION_COLORS.slice(0, 7);
        presets.forEach((color, index) => {
            const isMyColor = (localPlayer && localPlayer.color === color) || (!localPlayer && appState.factionColor === color);

            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.title = `Preset ${index + 1}`;
            
            if (isMyColor) swatch.classList.add('selected');
            
            swatch.onclick = () => {
                const selectedColor = color;
                updateState({ factionColor: selectedColor });
                
                if (localPlayer) {
                    localPlayer.color = selectedColor;
                    this.gameEngine.requestPlayerUpdate({ color: selectedColor });
                }

                // Force immediate flag update for snappy UI feedback
                const flagPreview = document.getElementById('lobby-faction-flag');
                if (flagPreview) {
                    flagPreview.style.setProperty('--faction-color', selectedColor);
                }
                
                this.updateColorPickerUI(containerId);
            };
            target.appendChild(swatch);
        });

        // 8: Custom Color Selector (Prismatic)
        const currentColor = localPlayer ? localPlayer.color : appState.factionColor;
        const isCustom = !presets.includes(currentColor);

        const customBtn = document.createElement('div');
        customBtn.className = 'color-swatch custom-picker-btn';
        customBtn.title = 'Custom Color';
        if (isCustom) customBtn.classList.add('selected');

        customBtn.onclick = () => {
            const colorInput = document.getElementById('hidden-custom-color');
            if (colorInput) {
                colorInput.value = currentColor;
                const onColorChange = (e) => {
                    const val = e.target.value;
                    updateState({ factionColor: val });
                    if (localPlayer) {
                        localPlayer.color = val;
                        this.gameEngine.requestPlayerUpdate({ color: val });
                    }
                    
                    // Force immediate flag update
                    const flagPreview = document.getElementById('lobby-faction-flag');
                    if (flagPreview) {
                        flagPreview.style.setProperty('--faction-color', val);
                    }
                    
                    this.updateColorPickerUI(containerId);
                    colorInput.removeEventListener('change', onColorChange);
                };
                colorInput.addEventListener('change', onColorChange);
                colorInput.click();
            }
        };
        target.appendChild(customBtn);

        // Update the Faction Flag Preview at the top of the slide
        const flagPreview = document.getElementById('lobby-faction-flag');
        if (flagPreview) {
            flagPreview.style.setProperty('--faction-color', currentColor);
        }

        // Cleanup legacy elements
        const oldTrigger = target.parentElement.querySelector('.custom-color-trigger');
        if (oldTrigger) oldTrigger.remove();
        const oldPanel = target.querySelector('.color-selection-panel');
        if (oldPanel) oldPanel.remove();
    }
}