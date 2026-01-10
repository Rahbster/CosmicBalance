export class SignalingChannel {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.onConnected = null;
        this.onMessage = null;
    }

    async _createPeer(id) {
        if (!window.Peer) {
            throw new Error("PeerJS library not found");
        }

        return new Promise((resolve, reject) => {
            const peer = new window.Peer(id, { debug: 2 });
            peer.on('open', (id) => {
                resolve({ peer, id });
            });
            peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    reject(new Error(`ID "${id}" is already taken. Please try again.`));
                } else {
                    reject(err);
                }
            });
        });
    }

    async initHost(hostId = null) {
        if (this.peer && !this.peer.destroyed) this.peer.destroy();
        
        const idToUse = hostId || Math.floor(100000 + Math.random() * 900000).toString();
        const { peer, id } = await this._createPeer(idToUse);
        this.peer = peer;

        this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.setupConnection();
        });
        return id;
    }

    async initJoiner(hostId) {
        if (this.peer && !this.peer.destroyed) this.peer.destroy();

        // Joiner uses a server-assigned ID by passing undefined
        const { peer } = await this._createPeer(undefined);
        this.peer = peer;

        this.conn = this.peer.connect(hostId);
        this.setupConnection();
    }

    setupConnection() {
        this.conn.on('open', () => {
            console.log("Signaling Channel Open");
            if (this.onConnected) this.onConnected();
        });
        this.conn.on('data', (data) => {
            if (this.onMessage) this.onMessage(data);
        });
    }

    send(data) {
        if (this.conn && this.conn.open) this.conn.send(data);
    }
}