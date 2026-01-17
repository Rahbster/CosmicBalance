export class ProfileService {
    constructor(storageService) {
        this.storageService = storageService;
        this.appPrefix = 'pwa';
    }

    getIdentity() {
        let guid = this.storageService ? this.storageService.getItem(`${this.appPrefix}_user_guid`) : localStorage.getItem(`${this.appPrefix}_user_guid`);
        if (!guid) {
            guid = crypto.randomUUID();
            if (this.storageService) this.storageService.setItem(`${this.appPrefix}_user_guid`, guid);
            else localStorage.setItem(`${this.appPrefix}_user_guid`, guid);
        }
        const name = (this.storageService ? this.storageService.getItem(`${this.appPrefix}_display_name`) : localStorage.getItem(`${this.appPrefix}_display_name`)) || 'Anonymous';
        return { id: guid, guid, name }; // Added id alias for consistency
    }

    saveIdentity(name) {
        if (this.storageService) this.storageService.setItem(`${this.appPrefix}_display_name`, name);
    }

    savePeer(guid, name) {
        if (this.getIdentity().id === guid) return; // Don't save self
        let peers = this.getPeers();
        peers[guid] = { name, lastSeen: Date.now() };
        if (this.storageService) this.storageService.setItem(`${this.appPrefix}_peers`, peers);
    }

    getPeers() {
        return this.storageService ? this.storageService.getItem(`${this.appPrefix}_peers`, {}) : {};
    }

    removePeer(guid) {
        let peers = this.getPeers();
        delete peers[guid];
        if (this.storageService) this.storageService.setItem(`${this.appPrefix}_peers`, peers);
    }

    getTeam() {
        return (this.storageService ? this.storageService.getItem(`${this.appPrefix}_team`) : localStorage.getItem(`${this.appPrefix}_team`)) || 'UNSC';
    }

    saveTeam(team) {
        if (this.storageService) this.storageService.setItem(`${this.appPrefix}_team`, team);
    }
}