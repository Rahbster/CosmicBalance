export function showGameSetupModal(storageService) {
    // 1. Inject HTML if not present
    if (!document.getElementById('game-setup-modal')) {
        const modalHTML = `
        <div id="game-setup-modal" class="modal">
            <div class="modal-content">
                <span id="close-game-setup-modal" class="close-modal">&times;</span>
                <h2>Game Setup</h2>
                <div id="game-setup-controls" style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label for="galaxy-size" style="margin-right: 10px;">Number of Systems:</label>
                        <input type="number" id="galaxy-size" value="15" min="5" max="1000" style="width: 80px;">
                    </div>
                    <div>
                        <label for="ai-opponents" style="margin-right: 10px;">AI Opponents:</label>
                        <input type="number" id="ai-opponents" value="1" min="0" max="7" style="width: 80px;">
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label for="resource-rate">Resource Rate:</label>
                        <input type="range" id="resource-rate" min="10" max="1000" value="100" step="10" style="flex-grow: 1;">
                        <span id="resource-rate-value">100%</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label for="ship-speed-rate">Ship Speed:</label>
                        <input type="range" id="ship-speed-rate" min="10" max="1000" value="100" step="10" style="flex-grow: 1;">
                        <span id="ship-speed-rate-value">100%</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label for="two-way-density">2-Way Warps (30%):</label>
                        <input type="range" id="two-way-density" min="10" max="100" value="30" style="flex-grow: 1;">
                        <span id="two-way-density-value">30%</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label for="one-way-density">1-Way Warps (3%):</label>
                        <input type="range" id="one-way-density" min="0" max="50" value="3" style="flex-grow: 1;">
                        <span id="one-way-density-value">3%</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                        <input type="checkbox" id="symmetric-map" style="width: 20px; height: 20px;">
                        <label for="symmetric-map" style="cursor: pointer;">Symmetric Map (Fair Start)</label>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                        <input type="checkbox" id="spectator-mode" style="width: 20px; height: 20px;">
                        <label for="spectator-mode" style="cursor: pointer;">Spectator Mode (AI vs AI)</label>
                    </div>
                    <button id="btn-reset-game" style="background-color: var(--error-red); margin-top: 1rem;">Reset Saved Game</button>
                    <button id="btn-create-game">Create Game</button>
                    <p><small>Only one player should create the game. This player will be the host.</small></p>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // 2. DOM Elements
    const modal = document.getElementById('game-setup-modal');
    const closeBtn = document.getElementById('close-game-setup-modal');
    
    // Sliders
    const twoWaySlider = document.getElementById('two-way-density');
    const twoWayValue = document.getElementById('two-way-density-value');
    const oneWaySlider = document.getElementById('one-way-density');
    const oneWayValue = document.getElementById('one-way-density-value');
    const resourceRateSlider = document.getElementById('resource-rate');
    const resourceRateValue = document.getElementById('resource-rate-value');
    const shipSpeedSlider = document.getElementById('ship-speed-rate');
    const shipSpeedValue = document.getElementById('ship-speed-rate-value');

    // 3. Helper Functions
    function closeModal() {
        modal.classList.add('hidden');
    }

    // 4. Event Listeners
    closeBtn.onclick = closeModal;
    window.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    if (twoWaySlider) twoWaySlider.addEventListener('input', () => twoWayValue.textContent = `${twoWaySlider.value}%`);
    if (oneWaySlider) oneWaySlider.addEventListener('input', () => oneWayValue.textContent = `${oneWaySlider.value}%`);
    if (resourceRateSlider) resourceRateSlider.addEventListener('input', () => resourceRateValue.textContent = `${resourceRateSlider.value}%`);
    if (shipSpeedSlider) shipSpeedSlider.addEventListener('input', () => shipSpeedValue.textContent = `${shipSpeedSlider.value}%`);

    // 5. Load saved settings
    const config = storageService ? storageService.getSetupConfig() : null;
    if (config) {
        try {
            if (config.numSystems) document.getElementById('galaxy-size').value = config.numSystems;
            if (config.numAI !== undefined) document.getElementById('ai-opponents').value = config.numAI;
            
            if (config.resourceRateVal) {
                document.getElementById('resource-rate').value = config.resourceRateVal;
                if (resourceRateValue) resourceRateValue.textContent = `${config.resourceRateVal}%`;
            }
            if (config.shipSpeedRateVal) {
                document.getElementById('ship-speed-rate').value = config.shipSpeedRateVal;
                if (shipSpeedValue) shipSpeedValue.textContent = `${config.shipSpeedRateVal}%`;
            }
            if (config.twoWayDensity) {
                document.getElementById('two-way-density').value = config.twoWayDensity;
                if (twoWayValue) twoWayValue.textContent = `${config.twoWayDensity}%`;
            }
            if (config.oneWayDensity) {
                document.getElementById('one-way-density').value = config.oneWayDensity;
                if (oneWayValue) oneWayValue.textContent = `${config.oneWayDensity}%`;
            }
            if (config.isSymmetric !== undefined) document.getElementById('symmetric-map').checked = config.isSymmetric;
            if (config.isSpectator !== undefined) document.getElementById('spectator-mode').checked = config.isSpectator;
        } catch (e) {
            console.error("Failed to load saved setup config", e);
        }
    }

    // 6. Show the modal
    modal.classList.remove('hidden');
}