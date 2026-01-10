import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class LoggingModal {
    constructor(engine) {
        this.engine = engine;
        this._injectHTML();
        this._injectCSS();

        this.modal = document.getElementById('logging-modal');
        this.closeBtn = document.getElementById('close-logging-modal');
        this.contentContainer = document.getElementById('logging-content');

        this.closeBtn.onclick = () => this.hide();
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        };
    }

    show() {
        this.render();
        this.modal.classList.remove('hidden');
    }

    hide() {
        this.modal.classList.add('hidden');
    }

    render() {
        const config = this.engine.loggingService.config;
        let html = '<div class="logging-grid">';
        
        // Helper to get level name
        const getLevelName = (val) => Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === val) || 'UNKNOWN';

        Object.keys(LOG_CATEGORIES).forEach(key => {
            const category = LOG_CATEGORIES[key];
            const currentLevel = config[category];
            
            html += `
                <div class="logging-item">
                    <label>${category}</label>
                    <div class="slider-container">
                        <input type="range" min="0" max="5" value="${currentLevel}" data-category="${category}" class="logging-slider">
                        <span class="level-display">${getLevelName(currentLevel)} (${currentLevel})</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        this.contentContainer.innerHTML = html;

        // Attach listeners
        this.contentContainer.querySelectorAll('.logging-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const category = e.target.dataset.category;
                const val = parseInt(e.target.value, 10);
                e.target.nextElementSibling.textContent = `${getLevelName(val)} (${val})`;
                this.engine.loggingService.setCategoryLevel(category, val);
            });
        });
    }

    _injectHTML() {
        if (document.getElementById('logging-modal')) return;
        const html = `
            <div id="logging-modal" class="modal hidden">
                <div class="modal-content">
                    <span id="close-logging-modal" class="close-modal">&times;</span>
                    <h2>Logging Configuration</h2>
                    <p>Set verbosity levels (0=Critical, 5=Trace)</p>
                    <div id="logging-content"></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _injectCSS() {
        if (document.getElementById('logging-css')) return;
        const css = `
            .logging-grid { display: flex; flex-direction: column; gap: 15px; }
            .logging-item { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 10px; }
            .slider-container { display: flex; align-items: center; gap: 10px; width: 60%; }
            .logging-slider { flex-grow: 1; }
            .level-display { width: 100px; text-align: right; font-family: monospace; }
        `;
        const style = document.createElement('style');
        style.id = 'logging-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}