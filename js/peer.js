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
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.peerPrefix = 'cb-'; // Cosmic Balance prefix
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
     */
    async join(hostId) {
        this.cleanup();
        
        return new Promise((resolve, reject) => {
            // Joiner gets a random ID
            this.peer = new window.Peer(undefined, PEER_CONFIG);

            this.peer.on('open', (peerId) => {
                this._log(LOG_LEVELS.INFO, `Joiner Peer opened with ID: ${peerId}`);
                const fullHostId = `${this.peerPrefix}${hostId}`;
                this._log(LOG_LEVELS.INFO, `Attempting to connect to Host ID: ${fullHostId}`);
                const conn = this.peer.connect(fullHostId, { reliable: true });
                // Pass resolve and reject to the setup function to wait for 'open' event
                this._setupConnection(conn, resolve, reject);
            });

            this.peer.on('error', (err) => this._handleError(err, reject));
            
            this.peer.on('close', () => {
                this._log(LOG_LEVELS.WARNING, 'Joiner Peer closed.');
            });
        });
    }

    _setupConnection(conn, resolve = null, reject = null) {
        this.conn = conn;
        this._log(LOG_LEVELS.INFO, `Setting up connection listeners for peer: ${conn.peer}`);

        conn.on('open', () => {
            this._log(LOG_LEVELS.INFO, `Data connection established with ${conn.peer}`);
            if (this.onStatusChangeCallback) this.onStatusChangeCallback('connected');
            this.sendIdentity();
            if (resolve) resolve(); // Resolve the promise on successful connection
        });

        conn.on('data', (data) => {
            if (this.onMessageCallback) this.onMessageCallback(data);
        });

        conn.on('close', () => {
            this._log(LOG_LEVELS.WARNING, `Connection closed with ${conn.peer}`);
            this.conn = null;
            if (this.onStatusChangeCallback) this.onStatusChangeCallback('disconnected');
        });

        conn.on('error', (err) => {
            this._log(LOG_LEVELS.ERROR, `Connection error with ${conn.peer}:`, err);
            if (reject) reject(err); // Reject the promise on connection error
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
    }

    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        } else {
            this._log(LOG_LEVELS.WARNING, "Cannot send data, connection not open.");
        }
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
        this.send({
            type: 'identity',
            guid: identity.guid,
            name: identity.name
        });
    }

    // Register callbacks
    onMessage(cb) { this.onMessageCallback = cb; }
    onStatusChange(cb) { this.onStatusChangeCallback = cb; }
}