export class ProfileService {
    constructor() {
        this.appPrefix = 'pwa';
    }

    getIdentity() {
        let guid = localStorage.getItem(`${this.appPrefix}_user_guid`);
        if (!guid) {
            guid = crypto.randomUUID();
            localStorage.setItem(`${this.appPrefix}_user_guid`, guid);
        }
        const name = localStorage.getItem(`${this.appPrefix}_display_name`) || 'Anonymous';
        return { guid, name };
    }

    saveIdentity(name) {
        localStorage.setItem(`${this.appPrefix}_display_name`, name);
    }

    savePeer(guid, name) {
        if (this.getIdentity().guid === guid) return; // Don't save self
        let peers = this.getPeers();
        peers[guid] = { name, lastSeen: Date.now() };
        localStorage.setItem(`${this.appPrefix}_peers`, JSON.stringify(peers));
    }

    getPeers() {
        return JSON.parse(localStorage.getItem(`${this.appPrefix}_peers`) || '{}');
    }

    removePeer(guid) {
        let peers = this.getPeers();
        delete peers[guid];
        localStorage.setItem(`${this.appPrefix}_peers`, JSON.stringify(peers));
    }

    getTeam() {
        return localStorage.getItem(`${this.appPrefix}_team`) || 'UNSC';
    }

    saveTeam(team) {
        localStorage.setItem(`${this.appPrefix}_team`, team);
    }
}