//==============================
// UI Logic
//==============================

export function createTimerHTML() {
    return `<div id="timer-area" class="glass-panel">
                <h2>Time: <span id="timer-display">00:00</span></h2>
            </div>`;
}

export function showToast(message, type = 'info') {
    // Delegate to the global ToastManager instance if it exists (initialized in app.js)
    if (window.toastManager) {
        window.toastManager.show(message, type);
    } else {
        console.log(`[Toast] ${type}: ${message}`);
    }
}