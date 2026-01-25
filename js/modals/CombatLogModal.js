import { startReplay } from './TacticalCombat.js';

export class CombatLogModal {
    constructor() {
        this._injectHTML();
        this._injectCSS();
        this.modal = document.getElementById('combat-log-modal');
        this.closeBtn = document.getElementById('close-combat-log-modal');
        this.content = document.getElementById('combat-log-content');
        this.details = document.getElementById('combat-log-details');
        this.backBtn = document.getElementById('combat-log-back-btn');
        
        this.closeBtn.onclick = () => this.hide();
        this.backBtn.onclick = () => this.showList();
        window.onclick = (e) => {
            if (e.target === this.modal) this.hide();
        };
    }

    show(history, systems) {
        this.history = history || [];
        this.systems = systems || [];
        this.showList();
        this.modal.classList.remove('hidden');
    }

    hide() {
        this.modal.classList.add('hidden');
    }

    showList() {
        this.content.classList.remove('hidden');
        this.details.classList.add('hidden');
        this.backBtn.classList.add('hidden');
        
        const listContainer = document.getElementById('combat-log-list');
        listContainer.innerHTML = '';

        if (this.history.length === 0) {
            listContainer.innerHTML = '<p style="padding: 10px; color: #aaa;">No combat history available.</p>';
            return;
        }

        // Sort by timestamp descending
        const sortedHistory = [...this.history].sort((a, b) => b.timestamp - a.timestamp);

        sortedHistory.forEach((entry) => {
            const system = this.systems.find(s => s.id === entry.systemId);
            const systemName = system ? system.name : (entry.systemId || 'Unknown System');
            const date = new Date(entry.timestamp).toLocaleString();
            
            const item = document.createElement('div');
            item.className = 'combat-log-item';
            item.innerHTML = `
                <div class="log-summary">
                    <strong>${systemName}</strong>
                    <span class="log-date"></span>
                </div>
                <div class="log-preview">${entry.log.length} events recorded</div>
            `;
            
            // Add click listener for details
            item.addEventListener('click', (e) => {
                // Prevent triggering if a button inside is clicked (future proofing)
                if (e.target.tagName !== 'BUTTON') {
                    this.showDetails(entry, systemName, date);
                }
            });
            listContainer.appendChild(item);
        });
    }

    showDetails(entry, systemName, date) {
        this.content.classList.add('hidden');
        this.details.classList.remove('hidden');
        this.backBtn.classList.remove('hidden');

        const canReplay = entry.initialConfig && entry.commandHistory;

        const detailsContainer = document.getElementById('combat-log-details-content');
        detailsContainer.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 10px;">
                <h3 style="margin: 0;"> <small style="font-weight: normal; font-size: 0.7em; color: #aaa;">()</small></h3>
                ${canReplay ? `<button id="btn-replay-battle" class="theme-button small">Watch Replay</button>` : ''}
            </div>
            <div class="log-entries">
                ${entry.log.map(line => `<div class="log-line"></div>`).join('')}
            </div>
        `;

        if (canReplay) {
            document.getElementById('btn-replay-battle').onclick = () => {
                this.hide();
                startReplay(entry);
            };
        }
    }

    _injectHTML() {
        if (document.getElementById('combat-log-modal')) return;
        const html = `
            <div id="combat-log-modal" class="modal hidden">
                <div class="modal-content">
                    <span id="close-combat-log-modal" class="close-modal">&times;</span>
                    <div class="modal-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <button id="combat-log-back-btn" class="theme-button small hidden" style="padding: 5px 10px;">&lt; Back</button>
                        <h2 style="margin: 0;">Combat Log</h2>
                    </div>
                    <div id="combat-log-content" style="flex: 1; overflow-y: auto;">
                        <div id="combat-log-list"></div>
                    </div>
                    <div id="combat-log-details" class="hidden" style="flex: 1; overflow-y: auto;">
                        <div id="combat-log-details-content"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _injectCSS() {
        if (document.getElementById('combat-log-css')) return;
        const css = `
            #combat-log-modal .modal-content { max-width: 600px; height: 80vh; display: flex; flex-direction: column; }
            .combat-log-item { background: rgba(255,255,255,0.05); padding: 12px; margin-bottom: 8px; cursor: pointer; border-radius: 4px; transition: background 0.2s; border: 1px solid transparent; }
            .combat-log-item:hover { background: rgba(255,255,255,0.1); border-color: var(--primary-color); }
            .log-summary { display: flex; justify-content: space-between; margin-bottom: 5px; color: #fff; }
            .log-date { font-size: 0.8em; color: #aaa; }
            .log-preview { font-size: 0.9em; color: #888; }
            .log-entries { font-family: monospace; font-size: 0.9em; line-height: 1.5; color: #ddd; }
            .log-line { padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
            .log-line:last-child { border-bottom: none; }
        `;
        const style = document.createElement('style');
        style.id = 'combat-log-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}
