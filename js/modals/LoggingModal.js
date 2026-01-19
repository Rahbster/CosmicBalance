import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

export class LoggingModal {
    constructor(engine) {
        this.engine = engine;
        this._injectHTML();
        this._injectCSS();

        this.modal = document.getElementById('logging-modal');
        this.closeBtn = document.getElementById('close-logging-modal');
        this.contentContainer = document.getElementById('logging-content');
        this.perfContainer = document.getElementById('performance-content');

        this.closeBtn.onclick = () => this.hide();
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        };
        
        this.updateTimer = null;
    }

    show() {
        this.render();
        this.modal.classList.remove('hidden');
        if (this.engine.performanceMonitor) this.engine.performanceMonitor.enable();
        
        if (this.updateTimer) clearInterval(this.updateTimer);
        this.updateTimer = setInterval(() => this.renderPerformance(), 500);
    }

    hide() {
        this.modal.classList.add('hidden');
        if (this.updateTimer) clearInterval(this.updateTimer);
        this.updateTimer = null;
        if (this.engine.performanceMonitor) this.engine.performanceMonitor.disable();
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

    renderPerformance() {
        if (!this.engine.performanceMonitor || !this.perfContainer) return;
        
        const snapshot = this.engine.performanceMonitor.snapshot();
        let html = '<div class="perf-grid">';
        
        for (const [label, data] of Object.entries(snapshot)) {
            // Color code based on time: <5ms green, <16ms yellow, >16ms red
            const color = data.avg < 5 ? '#4caf50' : (data.avg < 16 ? '#ffc107' : '#f44336');
            html += `
                <div class="perf-item">
                    <span class="perf-label">${label}</span>
                    <span class="perf-value" style="color: ${color}">${data.avg.toFixed(2)} ms (Max: ${data.max.toFixed(2)})</span>
                </div>
            `;
        }
        html += '</div>';
        this.perfContainer.innerHTML = html;
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
                    <h3 style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">Performance Monitor</h3>
                    <div id="performance-content"></div>
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
            .perf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .perf-item { display: flex; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px; }
        `;
        const style = document.createElement('style');
        style.id = 'logging-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}