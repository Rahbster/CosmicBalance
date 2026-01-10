export class ChatManager {
    constructor(peerAdapter, getIdentity, getTeam) {
        this.peerAdapter = peerAdapter;
        this.getIdentity = getIdentity;
        this.getTeam = getTeam;
        this.unreadMessages = 0;

        // DOM Elements
        this.modal = document.getElementById('chat-modal');
        this.btnOpen = document.getElementById('btn-open-chat');
        this.badge = document.getElementById('chat-badge');
        this.messagesContainer = document.getElementById('messages');
        this.input = document.getElementById('msg-input');
        this.btnSend = document.getElementById('btn-send');
        this.scopeSelect = document.getElementById('chat-scope');

        this._initListeners();
    }

    _initListeners() {
        if (this.btnSend) {
            this.btnSend.addEventListener('click', () => this.sendMessage());
        }
        
        if (this.input) {
            this.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
    }

    sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        const scope = this.scopeSelect ? this.scopeSelect.value : 'GLOBAL';
        const team = this.getTeam();

        const msg = {
            type: 'chat',
            scope: scope,
            team: team,
            content: text,
            sender: this.getIdentity().name
        };

        this.peerAdapter.send(msg);
        this.addMessage(text, 'local', this.getIdentity().name, scope);
        this.input.value = '';
    }

    handleIncomingMessage(data) {
        // Filter Logic:
        // If scope is TEAM, only show if my team matches sender's team
        if (data.scope === 'TEAM' && data.team !== this.getTeam()) {
            return; // Ignore message
        }

        this.addMessage(data.content, 'remote', data.sender, data.scope);
        
        // Check if modal is hidden to increment badge
        if (this.modal && this.modal.classList.contains('hidden')) {
            this.unreadMessages++;
            this.updateBadge();
        }
    }

    addMessage(text, type, senderName, scope = 'GLOBAL') {
        if (!this.messagesContainer) return;
        
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${type}`;

        const nameLabel = document.createElement('div');
        nameLabel.className = 'message-name';
        
        // Add tag for Team chat
        const scopeTag = scope === 'TEAM' ? '[TEAM] ' : '';
        nameLabel.textContent = `${scopeTag}${senderName}`;
        if (scope === 'TEAM') nameLabel.style.color = '#4c8c4a'; // Green tint for team

        const bubble = document.createElement('div');
        bubble.className = `message ${type}`;
        bubble.textContent = text;

        wrapper.appendChild(nameLabel);
        wrapper.appendChild(bubble);
        this.messagesContainer.appendChild(wrapper);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    updateBadge() {
        if (this.badge) {
            this.badge.textContent = this.unreadMessages;
            this.badge.classList.toggle('hidden', this.unreadMessages === 0);
        }
    }

    resetUnread() {
        this.unreadMessages = 0;
        this.updateBadge();
    }

    enable(isEnabled) {
        if (this.btnOpen) this.btnOpen.disabled = !isEnabled;
    }
}