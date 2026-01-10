/**
 * AppViewModel
 * Manages application state and business logic.
 * Implements a reactive pattern using Proxy.
 */
export class AppViewModel {
    constructor() {
        // 1. Load initial state from localStorage or defaults
        const savedState = JSON.parse(localStorage.getItem('pwa_state')) || {
            theme: 'light',
            items: [],
            currentView: 'view-home'
        };

        // 2. Create Reactive State
        this.state = new Proxy(savedState, {
            set: (target, property, value) => {
                target[property] = value;
                
                // Persist to storage
                this._saveState();
                
                // Notify UI
                this._notify(property, value);
                
                return true;
            }
        });

        // Event subscribers
        this.subscribers = [];
    }

    /**
     * Business Logic: Add a new item
     */
    addItem() {
        const newItem = { id: Date.now(), name: `Item ${this.state.items.length + 1}` };
        // We must re-assign the array to trigger the Proxy 'set' trap
        this.state.items = [...this.state.items, newItem];
    }

    /**
     * Business Logic: Toggle Theme
     */
    toggleTheme() {
        this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
    }

    /**
     * Business Logic: Navigation
     */
    navigate(viewId) {
        this.state.currentView = viewId;
    }

    // --- Internal Helpers ---

    _saveState() {
        localStorage.setItem('pwa_state', JSON.stringify(this.state));
    }

    subscribe(callback) {
        this.subscribers.push(callback);
    }

    _notify(property, value) {
        this.subscribers.forEach(callback => callback(property, value));
    }

    // Getters for computed values
    get itemCount() {
        return this.state.items.length;
    }
}