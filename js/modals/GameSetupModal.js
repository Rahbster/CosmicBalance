export function showGameSetupModal() {
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
                        <label for="two-way-density">2-Way Warps (30%):</label>
                        <input type="range" id="two-way-density" min="10" max="100" value="30" style="flex-grow: 1;">
                        <span id="two-way-density-value">30%</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label for="one-way-density">1-Way Warps (3%):</label>
                        <input type="range" id="one-way-density" min="0" max="50" value="3" style="flex-grow: 1;">
                        <span id="one-way-density-value">3%</span>
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

    // 5. Show the modal
    modal.classList.remove('hidden');
}