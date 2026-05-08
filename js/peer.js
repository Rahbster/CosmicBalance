/**
 * WebRTC Peer Connection Manager
 * Wrapper around PeerJS for game networking
 */
import { LOG_CATEGORIES, LOG_LEVELS } from './cb_constants.js';
 
const PEER_CONFIG = {
    debug: 2,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ]
    }
};

export class PeerManager {
    constructor(profileService, loggingService) {
        this.profileService = profileService;
        this.loggingService = loggingService;
        this.peer = null;
        this.conn = null;
        this.presencePeer = null;
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.peerPrefix = 'cb-'; // Cosmic Balance prefix
        this.presencePrefix = 'cb-user-';
        this.dataChannels = []; // List of all open connections if hosting
    }

    /**
     * Promotes an existing Joiner connection to a Host connection.
     * Re-wires listeners to accept incoming game data.
     */
    promoteToHost(onDataConnHost) {
        if (!this.peer) return;
        
        // Remove existing listeners
        this.peer.removeAllListeners('connection');
        
        this.peer.on('connection', (conn) => {
            this._log(LOG_LEVELS.INFO, `New connection accepted during migration from ${conn.peer}`);
            this.dataChannels.push(conn);
            this._setupConnection(conn);
            if (onDataConnHost) onDataConnHost(conn);
            conn.on('close', () => { this.dataChannels = this.dataChannels.filter(c => c !== conn); });
        });
    }

    /**
     * Re-wires the presencePeer to accept full game data connections.
     * Called when a Joiner is promoted to Host.
     */
    acceptMigrationConnections(onDataConnHost) {
        if (!this.presencePeer) return;
        this.presencePeer.removeAllListeners('connection');
        this.presencePeer.on('connection', (conn) => {
            this._log(LOG_LEVELS.INFO, `Incoming migration connection on Presence Peer from ${conn.peer}`);
            this.dataChannels.push(conn);
            this._setupConnection(conn);
            if (onDataConnHost) onDataConnHost(conn);
            conn.on('close', () => { this.dataChannels = this.dataChannels.filter(c => c !== conn); });
        });
    }

    /**
     * Initializes a secondary background connection for the Serverless Friend Network.
     */
    async setupPresence(playerId, onStatusRequest, onInviteReceived) {
        const fullId = `${this.presencePrefix}${playerId}`;
        
        if (this.presencePeer && !this.presencePeer.destroyed) {
            this.presencePeer.destroy();
        }

        return new Promise((resolve) => {
            this.presencePeer = new window.Peer(fullId, PEER_CONFIG);

            this.presencePeer.on('open', (id) => {
                this._log(LOG_LEVELS.INFO, `Presence Peer opened with ID: ${id}`);
                resolve(id);
            });

            this.presencePeer.on('connection', (conn) => {
                conn.on('data', (data) => {
                    if (data.type === 'ping-status') {
                        const status = onStatusRequest();
                        conn.send({ type: 'status-response', status });
                    } else if (data.type === 'game-invite') {
                        if (onInviteReceived) onInviteReceived(data);
                    }
                });
            });

            this.presencePeer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    this._log(LOG_LEVELS.WARNING, '[Presence] ID taken, likely another tab. Silence presence.');
                } else {
                    this._log(LOG_LEVELS.ERROR, `Presence PeerJS error: ${err.type}`, err);
                }
            });

            this.presencePeer.on('disconnected', () => {
                if (this.presencePeer.destroyed) return;
                this._log(LOG_LEVELS.WARNING, 'Presence Peer disconnected. Reconnecting...');
                this.presencePeer.reconnect();
            });
        });
    }

    /**
     * Pings a friend's presence listener to check their status.
     */
    async pingFriend(friendPlayerId) {
        return new Promise((resolve) => {
            if (!this.presencePeer || this.presencePeer.disconnected) return resolve({ status: 'offline' });
            
            const targetId = `${this.presencePrefix}${friendPlayerId}`;
            const conn = this.presencePeer.connect(targetId, { reliable: true });
            
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve({ status: 'offline' });
                }
            }, 5000);

            conn.on('open', () => {
                conn.send({ type: 'ping-status' });
            });

            conn.on('data', (data) => {
                if (data.type === 'status-response' && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ status: 'online', data: data.status });
                    setTimeout(() => conn.close(), 500);
                }
            });

            conn.on('error', () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ status: 'offline' });
                }
            });
        });
    }

    /**
     * Sends a direct game invite to a specific friend.
     */
    sendInvite(friendPlayerId, hostId, senderName) {
        if (!this.presencePeer || this.presencePeer.disconnected) return;
        const targetId = `${this.presencePrefix}${friendPlayerId}`;
        const conn = this.presencePeer.connect(targetId, { reliable: true });
        
        conn.on('open', () => {
            conn.send({ type: 'game-invite', hostId, senderName });
            setTimeout(() => conn.close(), 500);
        });
    }

    /**
     * Starts hosting a session.
     * @param {string} [customId] Optional custom ID (without prefix)
     * @returns {Promise<string>} The full peer ID
     */
    async host(customId = null) {
        this.cleanup();
        
        const id = customId ? `${this.peerPrefix}${customId}` : `${this.peerPrefix}${Math.floor(100000 + Math.random() * 900000)}`;
        
        return new Promise((resolve, reject) => {
            this.peer = new window.Peer(id, PEER_CONFIG);

            this.peer.on('open', (peerId) => {
                this._log(LOG_LEVELS.INFO, `Host Peer opened with ID: ${peerId}`);
                resolve(peerId.replace(this.peerPrefix, ''));
            });

            this.peer.on('connection', (conn) => {
                this._log(LOG_LEVELS.INFO, `Incoming connection from ${conn.peer}`);
                this._setupConnection(conn);
            });

            this.peer.on('error', (err) => this._handleError(err, reject));
            
            this.peer.on('disconnected', () => {
                this._log(LOG_LEVELS.WARNING, 'Host Peer disconnected from signaling server. Attempting reconnect...');
                this.peer.reconnect();
            });

            this.peer.on('close', () => {
                this._log(LOG_LEVELS.WARNING, 'Host Peer closed.');
            });
        });
    }

    /**
     * Joins a session hosted by another peer.
     * @param {string} hostId The host's ID (without prefix)
     * @param {string} role The role of the joiner ('player' or 'spectator')
     */
    async join(hostId, role = 'player') {
        this.cleanup();
        this.joinRole = role;
        
        return new Promise((resolve, reject) => {
            // Joiner gets a random ID
            this.peer = new window.Peer(undefined, PEER_CONFIG);

            this.peer.on('open', (peerId) => {
                this._log(LOG_LEVELS.INFO, `Joiner Peer opened with ID: ${peerId}`);
                const fullHostId = `${this.peerPrefix}${hostId}`;
                this._log(LOG_LEVELS.INFO, `Attempting to connect to Host ID: ${fullHostId}`);
                const conn = this.peer.connect(fullHostId, { reliable: true });
                
                // Store resolve/reject to trigger after vetting
                this._pendingJoin = { resolve, reject };
                this._setupConnection(conn);
            });

            this.peer.on('error', (err) => this._handleError(err, reject));
            
            this.peer.on('close', () => {
                this._log(LOG_LEVELS.WARNING, 'Joiner Peer closed.');
            });
        });
    }

    _setupConnection(conn) {
        this.conn = conn;
        this._log(LOG_LEVELS.INFO, `Setting up connection listeners for peer: ${conn.peer}`);

        conn.on('open', () => {
            this._log(LOG_LEVELS.INFO, `Data connection established with ${conn.peer}`);
            
            // If we are joining, send a request instead of identity
            if (this._pendingJoin) {
                const identity = this.profileService.getIdentity();
                const team = this.profileService.getTeam();
                conn.send({
                    type: 'join-request',
                    guid: identity.guid,
                    name: identity.name,
                    techBase: team,
                    role: this.joinRole || 'player'
                });
                this._log(LOG_LEVELS.INFO, "Join request sent. Waiting for host approval...");
            }
        });

        conn.on('data', (data) => {
            if (data.type === 'join-request') {
                this._log(LOG_LEVELS.INFO, `Received join request from ${data.name}`);
                if (this.onJoinRequestCallback) {
                    this.onJoinRequestCallback(data, conn);
                } else {
                    // Auto-approve if no vetting callback (legacy or solo test)
                    conn.send({ type: 'join-approved' });
                }
            } else if (data.type === 'join-approved') {
                this._log(LOG_LEVELS.INFO, "Join approved by host!");
                if (this.onStatusChangeCallback) this.onStatusChangeCallback('connected');
                this.sendIdentity();
                if (this._pendingJoin) {
                    this._pendingJoin.resolve();
                    this._pendingJoin = null;
                }
            } else if (data.type === 'join-denied') {
                this._log(LOG_LEVELS.WARNING, "Join denied by host.");
                if (this._pendingJoin) {
                    this._pendingJoin.reject(new Error(data.reason || "Join denied by host."));
                    this._pendingJoin = null;
                }
                conn.close();
            } else {
                if (this.onMessageCallback) this.onMessageCallback(data);
            }
        });

        conn.on('close', () => {
            this._log(LOG_LEVELS.WARNING, `Connection closed with ${conn.peer}`);
            this.conn = null;
            if (this.onStatusChangeCallback) this.onStatusChangeCallback('disconnected');
            if (this._pendingJoin) {
                this._pendingJoin.reject(new Error("Connection closed."));
                this._pendingJoin = null;
            }
        });

        conn.on('error', (err) => {
            this._log(LOG_LEVELS.ERROR, `Connection error with ${conn.peer}:`, err);
            if (this._pendingJoin) {
                this._pendingJoin.reject(err);
                this._pendingJoin = null;
            }
        });
    }

    _handleError(err, reject) {
        this._log(LOG_LEVELS.ERROR, `PeerJS Error: ${err.type}`, err);
        if (reject) reject(err);
    }

    cleanup() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
            if (this.onStatusChangeCallback) this.onStatusChangeCallback('disconnected');
        }
        this._pendingJoin = null;
    }

    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        } else if (this.dataChannels.length > 0) {
            // If hosting, broadcast to all channels
            this.broadcast(data);
        } else {
            this._log(LOG_LEVELS.WARNING, "Cannot send data, no open connections.");
        }
    }

    sendToPeer(peerId, data) {
        // If we are a joiner, we might be using presence ID for migration
        const target = this.dataChannels.find(c => c.peer === peerId || c.peer === this.peerPrefix + peerId || c.peer === this.presencePrefix + peerId);
        if (target && target.open) {
            target.send(data);
        } else if (this.conn && (this.conn.peer === peerId || this.conn.peer === this.peerPrefix + peerId)) {
            this.conn.send(data);
        } else {
            this._log(LOG_LEVELS.WARNING, `Target peer ${peerId} not found or not open.`);
        }
    }

    broadcast(data) {
        this.dataChannels.forEach(conn => {
            if (conn.open) {
                conn.send(data);
            }
        });
    }

    relay(data, excludePeerId) {
        this.dataChannels.forEach(conn => {
            if (conn.open && conn.peer !== excludePeerId) {
                conn.send(data);
            }
        });
    }

    _log(level, message, ...args) {
        if (this.loggingService) {
            this.loggingService.log(LOG_CATEGORIES.PEER, level, message, ...args);
        } else {
            console.log(`[NETWORK] ${message}`, ...args);
        }
    }

    // Sends this user's identity to the connected peer
    sendIdentity() {
        const identity = this.profileService.getIdentity();
        const team = this.profileService.getTeam(); // Get the team
        this.send({
            type: 'identity',
            guid: identity.guid,
            name: identity.name,
            team: team,
            role: this.joinRole || 'player'
        });
    }

    // Register callbacks
    onMessage(cb) { this.onMessageCallback = cb; }
    onStatusChange(cb) { this.onStatusChangeCallback = cb; }
    onJoinRequest(cb) { this.onJoinRequestCallback = cb; }
}