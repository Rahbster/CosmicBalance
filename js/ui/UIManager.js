import { RESOURCE_TYPES, FACTION_COLORS } from '../cb_constants.js';

export class UIManager {
    constructor(gameEngine) {
        this.gameEngine = gameEngine;
        this.colorPicker = document.getElementById('faction-color-picker');
    }

    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.textContent = theme === 'dark' ? '☀️' : '🌓';
        }
    }

    formatNumber(num) {
        if (num === undefined || num === null) return '0';
        const n = Math.floor(num);
        if (n < 1000) return n.toString();
        if (n < 1000000) return (n / 1000).toFixed(2) + 'K';
        if (n < 1000000000) return (n / 1000000).toFixed(2) + 'M';
        return (n / 1000000000).toFixed(2) + 'B';
    }

    renderResourceHeader() {
        const container = document.getElementById('resource-list');
        if (!container) return;
        container.innerHTML = RESOURCE_TYPES.map(res => `
            <span title="${res.title}">
                <span class="res-label">${res.label}</span>
                <span class="res-value-group">
                    <strong id="${res.domId}">0</strong>
                    <i class="${res.cssClass}">${res.icon}</i>
                </span>
            </span>
        `).join('');
    }

    updateHeaderUI() {
        if (!this.gameEngine) return;
        
        let displayResources = { IO: 0, minerals: 0, food: 0, energy: 0, scrap: 0 };
        let showUI = true;

        if (this.gameEngine.isHost) {
            const { mode, faction: target } = this.gameEngine.hostView;
            if (mode === 'god') {
                this.gameEngine.state.players.forEach(p => {
                    Object.keys(displayResources).forEach(k => displayResources[k] += (p.resources[k] || 0));
                });
            } else if (mode === 'faction') {
                this.gameEngine.state.players.filter(p => p.team === target).forEach(p => {
                    Object.keys(displayResources).forEach(k => displayResources[k] += (p.resources[k] || 0));
                });
            } else {
                // Player view
                const p = this.gameEngine.state.players.find(pl => pl.id === target) || this.gameEngine.getLocalPlayer();
                if (p) displayResources = p.resources;
                else showUI = false;
            }
        } else {
            const localPlayer = this.gameEngine.getLocalPlayer();
            if (localPlayer) displayResources = localPlayer.resources;
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
        
        // Update System Counts by Participant
        const systemList = document.getElementById('system-list');
        if (systemList) {
            systemList.innerHTML = '';
            this.gameEngine.state.players.forEach(p => {
                const count = this.gameEngine.state.systems.filter(s => s.owner === p.id).length;
                
                const span = document.createElement('span');
                span.title = `${p.factionName} Controlled Systems`;
                span.style.setProperty('--player-color', p.color);
                span.style.cursor = 'help';

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
                span.innerHTML += `<span class="res-value-group"><strong>${count}</strong></span>`;
                span.querySelector('.res-value-group').appendChild(svg);

                systemList.appendChild(span);
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