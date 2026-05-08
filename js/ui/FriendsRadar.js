import { appState, logger, STORAGE_KEYS } from '../state.js';

export class FriendsRadar {
    constructor(peerManager, toastManager, joinCallback) {
        this.peerManager = peerManager;
        this.toastManager = toastManager;
        this.joinCallback = joinCallback;
        this.modal = null;
        this.listEl = null;
    }

    /**
     * Initializes the Radar UI and event listeners
     */
    init() {
        // Inject Modal if not present
        if (!document.getElementById('friends-radar-modal')) {
            const modalHTML = `
                <div id="friends-radar-modal" class="modal hidden">
                    <div class="modal-content">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h2 style="margin: 0; color: var(--primary-color);">Friends Radar</h2>
                            <button id="btn-close-radar" class="icon-btn" style="font-size: 2rem;">&times;</button>
                        </div>
                        <div id="friends-radar-list">
                            <!-- Friends will be injected here -->
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }

        this.modal = document.getElementById('friends-radar-modal');
        this.listEl = document.getElementById('friends-radar-list');

        const closeBtn = document.getElementById('btn-close-radar');
        if (closeBtn) closeBtn.onclick = () => this.hide();
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });
    }

    show() {
        if (!this.modal) this.init();
        this.modal.classList.remove('hidden');
        this.refresh();
    }

    hide() {
        if (this.modal) this.modal.classList.add('hidden');
    }

    async refresh() {
        if (!this.listEl) return;

        if (appState.friends.length === 0) {
            this.listEl.innerHTML = `
                <div style="text-align: center; opacity: 0.7; padding: 40px 20px;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🛰️</div>
                    <p>No friends in your database yet.</p>
                    <p style="font-size: 0.8rem;">Add friends from the player list during a mission!</p>
                </div>
            `;
            return;
        }

        this.listEl.innerHTML = `<div style="text-align: center; padding: 20px;">📡 Scanning hyperspace for signatures...</div>`;

        // Ping all friends in parallel
        const results = await Promise.all(appState.friends.map(async (friend) => {
            try {
                const response = await this.peerManager.pingFriend(friend.playerId);
                return { friend, ...response };
            } catch (err) {
                return { friend, status: 'offline' };
            }
        }));

        this.render(results);
    }

    render(results) {
        this.listEl.innerHTML = '';
        
        // Sort online/hosting friends to the top
        results.sort((a, b) => {
            if (a.status === 'online' && b.status === 'offline') return -1;
            if (a.status === 'offline' && b.status === 'online') return 1;
            return 0;
        });

        results.forEach(res => {
            const item = document.createElement('div');
            item.className = 'radar-item';
            
            let statusText = 'Offline';
            let statusClass = 'offline';
            let detailsText = 'Last seen: Deep Space';

            if (res.status === 'online') {
                const data = res.data || {};
                if (data.isHost && data.roomCode) {
                    statusText = 'Hosting Mission';
                    statusClass = 'hosting';
                    detailsText = `${data.factionName || 'Unknown Fleet'} - ${data.roomCode}`;
                } else if (data.gameActive) {
                    statusText = 'In Mission';
                    statusClass = 'online';
                    detailsText = data.factionName || 'Engaged in combat';
                } else {
                    statusText = 'Stationary';
                    statusClass = 'online';
                    detailsText = 'In Lobby';
                }
            }

            item.innerHTML = `
                <div class="radar-header">
                    <div class="radar-name">${res.friend.name}</div>
                    <div class="radar-status ${statusClass}">
                        <div class="status-dot ${statusClass}"></div>
                        ${statusText}
                    </div>
                </div>
                <div style="font-size: 0.8rem; opacity: 0.7;">${detailsText}</div>
            `;

            // If hosting, show Join button
            if (res.status === 'online' && res.data && res.data.isHost && res.data.roomCode) {
                const joinBtn = document.createElement('button');
                joinBtn.className = 'radar-join-btn primary-btn';
                joinBtn.textContent = `Connect to ${res.friend.name}'s Fleet`;
                joinBtn.onclick = () => {
                    this.hide();
                    if (this.joinCallback) this.joinCallback(res.data.roomCode);
                };
                item.appendChild(joinBtn);
            }

            this.listEl.appendChild(item);
        });
    }

    /**
     * Adds a friend to the local database
     */
    addFriend(playerId, name) {
        if (playerId === appState.playerId) return;
        
        const existing = appState.friends.find(f => f.playerId === playerId);
        if (existing) {
            this.toastManager.show(`${name} is already in your radar.`, 'info');
            return;
        }

        appState.friends.push({ playerId, name });
        localStorage.setItem(STORAGE_KEYS.FRIENDS, JSON.stringify(appState.friends));
        this.toastManager.show(`Added ${name} to Friends Radar! ⭐️`, 'success');
        
        // Notify them if we have an active game connection
        // (This would be handled via the primary game data channel)
    }

    /**
     * Removes a friend from the local database
     */
    removeFriend(playerId) {
        const friend = appState.friends.find(f => f.playerId === playerId);
        if (!friend) return;

        appState.friends = appState.friends.filter(f => f.playerId !== playerId);
        localStorage.setItem(STORAGE_KEYS.FRIENDS, JSON.stringify(appState.friends));
        this.toastManager.show(`Removed ${friend.name} from radar.`, 'info');
    }
}
