/**
 * WebRTC Peer Connection Manager
 * Adapted from TeamSudoku logic (Native WebRTC)
 */
import { getIdentity } from './app.js';

export class PeerManager {
    constructor() {
        this.connection = null;
        this.dataChannel = null;
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
    }

    // Initializes the WebRTC PeerConnection
    // Corresponds to initializeWebRTC in TeamSudoku
    _initializeWebRTC() {
        const config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };

        const connection = new RTCPeerConnection(config);

        connection.onicecandidate = event => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate);
            }
        };

        connection.onconnectionstatechange = () => {
            console.log(`WebRTC Connection State: ${connection.connectionState}`);
            if (this.onStatusChangeCallback) {
                this.onStatusChangeCallback(connection.connectionState);
            }
        };

        connection.ondatachannel = event => {
            this._setupDataChannel(event.channel);
        };

        return connection;
    }

    // Sets up event handlers for the data channel
    // Corresponds to setupDataChannel in TeamSudoku
    _setupDataChannel(channel) {
        this.dataChannel = channel;

        channel.onopen = () => {
            console.log('Data Channel is open!');
            if (this.onStatusChangeCallback) this.onStatusChangeCallback('datachannelopen');
            // Once the data channel is open, exchange identities
            this.sendIdentity();
        };

        channel.onmessage = (event) => {
            this._handleIncomingMessage(event);
        };
    }

    // Handles incoming messages
    // Corresponds to handleIncomingMessage in TeamSudoku
    _handleIncomingMessage(event) {
        try {
            const data = JSON.parse(event.data);
            if (this.onMessageCallback) {
                this.onMessageCallback(data);
            }
        } catch (e) {
            console.error("Error parsing incoming message:", e);
        }
    }

    // Creates an offer and waits for ICE gathering
    // Corresponds to createOffer in TeamSudoku
    async createOffer() {
        this.connection = this._initializeWebRTC();
        const channel = this.connection.createDataChannel('pwa-data-channel');
        this._setupDataChannel(channel);

        const offer = await this.connection.createOffer();
        await this.connection.setLocalDescription(offer);
        
        // Wait until ICE gathering is complete before returning
        await this._waitForIceGathering();
        
        // Return the full SDP (including candidates) as a string
        return JSON.stringify(this.connection.localDescription);
    }

    // Creates an answer given an offer string
    // Corresponds to createAnswer in TeamSudoku
    async createAnswer(offerStr) {
        this.connection = this._initializeWebRTC();
        
        const offer = JSON.parse(offerStr);
        await this.connection.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await this.connection.createAnswer();
        await this.connection.setLocalDescription(answer);
        
        // Wait until ICE gathering is complete
        await this._waitForIceGathering();
        
        return JSON.stringify(this.connection.localDescription);
    }

    // Accepts an answer to establish the connection (Host side)
    async acceptAnswer(answerStr) {
        if (!this.connection) throw new Error("No connection initialized");
        const answer = JSON.parse(answerStr);
        await this.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    // Helper to ensure ICE gathering is complete
    // Corresponds to waitForIceGathering in TeamSudoku
    _waitForIceGathering() {
        return new Promise(resolve => {
            if (this.connection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (this.connection.iceGatheringState === 'complete') {
                        this.connection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                this.connection.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }

    // Public API to send data
    send(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(data));
        } else {
            console.warn("Data channel not open");
        }
    }

    // Sends this user's identity to the connected peer
    sendIdentity() {
        const identity = getIdentity();
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