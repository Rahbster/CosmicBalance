export class ProfileService {
    constructor(storageService) {
        this.storageService = storageService;
        this.appPrefix = 'pwa';
    }

    getIdentity() {
        const _read = (key) => {
            const val = this.storageService ? this.storageService.getItem(key) : localStorage.getItem(key);
            if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
                try { return JSON.parse(val); } catch(e) { return val.slice(1, -1); }
            }
            return val;
        };

        let guid = _read(`${this.appPrefix}_user_guid`);
        if (!guid) {
            guid = crypto.randomUUID();
            if (this.storageService) this.storageService.setItem(`${this.appPrefix}_user_guid`, guid);
            else localStorage.setItem(`${this.appPrefix}_user_guid`, guid);
        }
        const name = _read(`${this.appPrefix}_display_name`) || 'Anonymous';
        const factionName = _read('cosmicBalance_factionName') || 'Solaris Vanguard';
        const factionColor = _read('cosmicBalance_factionColor') || '#00f2ff';
        
        return { 
            id: guid, 
            guid, 
            name, 
            factionName, 
            color: factionColor 
        };
    }

    saveIdentity(name) {
        if (this.storageService) this.storageService.setItem(`${this.appPrefix}_display_name`, name);
    }

    savePeer(guid, name, team) {
        if (this.getIdentity().id === guid) return; // Don't save self
        let peers = this.getPeers();
        peers[guid] = { name, team, lastSeen: Date.now() };
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
        const val = this.storageService ? this.storageService.getItem(`${this.appPrefix}_team`) : localStorage.getItem(`${this.appPrefix}_team`);
        if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
            try { return JSON.parse(val); } catch(e) { return val.slice(1, -1); }
        }
        return val || 'Solaris';
    }

    saveTeam(team) {
        if (this.storageService) this.storageService.setItem(`${this.appPrefix}_team`, team);
        else localStorage.setItem(`${this.appPrefix}_team`, team);
    }
}