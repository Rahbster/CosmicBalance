export class TechService {
    constructor(engine) {
        this.engine = engine;
        this.techData = null;
    }

    async loadTechData() {
        if (!this.techData) {
            try {
                const response = await fetch('./data/tech-tree.json');
                this.techData = await response.json();
            } catch (e) {
                console.error("Failed to load tech tree:", e);
            }
        }
        return this.techData;
    }

    getTechData() {
        return this.techData;
    }

    applyTechToShipData(baseData, ownerPlayer) {
        const modifiedData = { ...baseData };
        if (this.techData && ownerPlayer && ownerPlayer.researchedTechs.length > 0) {
            ownerPlayer.researchedTechs.forEach(techId => {
                const tech = this.techData[ownerPlayer.techBase]?.[techId];
                if (tech && tech.effects) {
                    tech.effects.forEach(effect => {
                        if (effect.target === 'ALL_SHIPS') {
                            if (effect.type === 'HULL_MODIFIER') modifiedData.maxHull *= effect.value;
                            else if (effect.type === 'SHIELD_MODIFIER') modifiedData.maxShield *= effect.value;
                            else if (effect.type === 'DAMAGE_MODIFIER') modifiedData.damage *= effect.value;
                            else if (effect.type === 'SUBLIGHT_MODIFIER') modifiedData.sublight *= effect.value;
                            else if (effect.type === 'WARP_MODIFIER') modifiedData.warp *= effect.value;
                        }
                    });
                }
            });
        }
        return modifiedData;
    }
}