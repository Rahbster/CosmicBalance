const UNSC_NAMES = [
    "Reach", "Tribute", "Harvest", "Arcadia", "Jericho VII", "Mars", "Earth",
    "Sigma Octanus IV", "Coral", "New Alexandria", "Aszod", "Fumirole",
    "Madrigal", "Eridanus II", "Chi Ceti IV", "Kilo-Five", "Onyx", "Ghibalb"
];
const COVENANT_NAMES = [
    "High Charity", "Sanghelios", "Doisac", "Balaho", "Eayn", "Te", "Kig-Yar",
    "Oth Sonin", "Malurok", "Hesduros", "Glyke", "Uso", "Rahnelo", "Sunaion"
];

export const PLANET_NAMES = {
    UNSC: UNSC_NAMES,
    COVENANT: COVENANT_NAMES,
};

export const PLANET_TYPES = {
    Terran: {
        color: '#0080FF',
        yields: { IO: 10, minerals: 5, food: 20, energy: 5, scrap: 2 }
    },
    Industrial: {
        color: '#A9A9A9',
        yields: { IO: 25, minerals: 10, food: 5, energy: 10, scrap: 5 }
    },
    Mining: {
        color: '#8B4513',
        yields: { IO: 5, minerals: 50, food: 2, energy: 2, scrap: 10 }
    },
    Farming: {
        color: '#228B22',
        yields: { IO: 5, minerals: 2, food: 100, energy: 2, scrap: 1 }
    },
};

export const SHIP_DATA = {
    Fighter: {
        cost: { credits: 100, scrap: 25, energy: 10 },
        maxHull: 100,
        maxShield: 50,
        damage: 10, // dps
        sublight: 5,
        warp: 2,
        buildTime: 10000, // 10 seconds
        builtBy: ['Planet', 'SpaceStation'],
    },
    Salvager: {
        cost: { credits: 75, scrap: 10, energy: 5 },
        maxHull: 50,
        maxShield: 25,
        damage: 1,
        sublight: 3,
        warp: 1.5,
        buildTime: 8000, // 8 seconds
        builtBy: ['Planet', 'SpaceStation'],
    },
    Scout: {
        cost: { credits: 50, scrap: 5, energy: 5 },
        maxHull: 30,
        maxShield: 10,
        damage: 2,
        sublight: 10,
        warp: 3,
        buildTime: 5000, // 5 seconds
        builtBy: ['Planet', 'SpaceStation'],
    },
    TroopTransport: {
        cost: { credits: 150, scrap: 50, energy: 20 },
        maxHull: 200,
        maxShield: 50,
        damage: 3,
        sublight: 2,
        warp: 1,
        buildTime: 15000, // 15 seconds
        builtBy: ['Planet', 'SpaceStation'],
    },
    SpaceStation: {
        cost: { credits: 1000, scrap: 500, energy: 100 },
        maxHull: 5000,
        maxShield: 1000,
        damage: 25, // Defensive turrets
        sublight: 0,
        warp: 0,
        buildTime: 120000, // 2 minutes
        isStation: true, // Special flag
        builtBy: ['Planet'], // Only planets can build the first station
        buildCapabilities: ['Fighter', 'Salvager', 'Scout', 'TroopTransport', 'Frigate'] // Stations can build other ships
    },
    Frigate: {
        cost: { credits: 400, minerals: 150, energy: 50 },
        maxHull: 500,
        maxShield: 200,
        damage: 25,
        sublight: 3,
        warp: 1.8,
        buildTime: 60000, // 1 minute
        builtBy: ['SpaceStation'],
        requiresTech: 'frigate_construction'
    }
};

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export class GalaxyService {
    constructor(canvas) {
        this.canvas = canvas;
    }

    generateGalaxyMap(numSystems, twoWayDensity = 30, oneWayDensity = 3) {
        console.log(`[GalaxyGen] Starting generation for ${numSystems} systems.`);
        console.time('[GalaxyGen] Total Time');

        const systems = [];
        if (numSystems <= 0) return;

        const canvasWidth = this.canvas.parentElement.clientWidth;
        const canvasHeight = 600;
        const padding = 50;
        const zones = Math.max(1, numSystems * 3 / 45); // Ensure at least 1x canvas size

        // Scale down star sizes and distances for denser galaxies to improve layout and visuals.
        // This creates a curve where the scaling effect is minor for few systems but significant for many.
        const scaleFactor = Math.max(0.25, 1 - (numSystems / 1500));
        const minStarDist = 150 * scaleFactor;

        console.time('[GalaxyGen] 1. Place Systems');
        // 1. Place all systems randomly, avoiding overlap
        for (let i = 0; i < numSystems; i++) {
            let x, y, validPosition, attempts = 0;
            const maxAttempts = 2000; // Prevent infinite loops
            do {
                validPosition = true;
                x = Math.random() * (canvasWidth*zones - padding * 2) + padding;
                y = Math.random() * (canvasHeight*zones - padding * 2) + padding;
                for (const p of systems) {
                    const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
                    if (dist < minStarDist) { // Use dynamic minimum distance
                        validPosition = false;
                        break;
                    }
                }
                attempts++;
            } while (!validPosition && attempts < maxAttempts);

            if (!validPosition) {
                console.warn(`[GalaxyGen] Could not find a valid position for system ${i + 1} after ${maxAttempts} attempts. The galaxy might be too crowded.`);
            }

            const systemId = `sys-${i}`;
            systems.push({
                id: systemId,
                x, y,
                r: (Math.random() * 10 + 15) * scaleFactor, // Scale star radius
                name: `System ${i}`, // Default generic name
                links: [],
                owner: null,
                visibility: {},
                planets: this._generatePlanetsForSystem(systemId),
                buildQueue: [],
            });
        }
        console.timeEnd('[GalaxyGen] 1. Place Systems');

        console.time('[GalaxyGen] 2. Create MST');
        // 2. Create a Minimum Spanning Tree (MST) to guarantee connectivity using Prim's algorithm.
        if (systems.length > 0) {
            const systemMap = new Map(systems.map(s => [s.id, s]));
            const connected = new Set();
            const minDists = new Map(); // Maps unconnected node ID to { dist, fromNodeId }

            const startNode = systems[0];
            connected.add(startNode.id);

            // Initialize minDists for all other nodes from the startNode
            for (let i = 1; i < systems.length; i++) {
                const node = systems[i];
                const dist = Math.sqrt((startNode.x - node.x) ** 2 + (startNode.y - node.y) ** 2);
                minDists.set(node.id, { dist, fromNodeId: startNode.id });
            }

            while (connected.size < systems.length && minDists.size > 0) {
                // Find the unconnected node with the smallest distance to the tree
                let closestNodeId = null;
                let minEdge = { dist: Infinity };

                for (const [nodeId, edge] of minDists.entries()) {
                    if (edge.dist < minEdge.dist) {
                        minEdge = edge;
                        closestNodeId = nodeId;
                    }
                }

                if (!closestNodeId) break; // Should not happen if there are unconnected nodes

                const toNode = systemMap.get(closestNodeId);
                const fromNode = systemMap.get(minEdge.fromNodeId);

                fromNode.links.push({ targetId: toNode.id, type: 'two-way' });
                toNode.links.push({ targetId: fromNode.id, type: 'two-way' });

                connected.add(toNode.id);
                minDists.delete(toNode.id);

                for (const [unconnectedId, edge] of minDists.entries()) {
                    const unconnectedNode = systemMap.get(unconnectedId);
                    const newDist = Math.sqrt((toNode.x - unconnectedNode.x) ** 2 + (toNode.y - unconnectedNode.y) ** 2);
                    if (newDist < edge.dist) {
                        minDists.set(unconnectedId, { dist: newDist, fromNodeId: toNode.id });
                    }
                }
            }
        }
        console.timeEnd('[GalaxyGen] 2. Create MST');

        console.time('[GalaxyGen] 3. Add Two-Way Warps');
        // 3. Add additional two-way warps based on density
        const numTwoWay = Math.floor((numSystems * (twoWayDensity / 100)) - (numSystems - 1));
        for (let i = 0; i < numTwoWay; i++) {
            const p1 = systems[Math.floor(Math.random() * numSystems)];
            const p2 = systems[Math.floor(Math.random() * numSystems)];
            if (p1.id !== p2.id && !p1.links.some(l => l.targetId === p2.id)) {
                p1.links.push({ targetId: p2.id, type: 'two-way' });
                p2.links.push({ targetId: p1.id, type: 'two-way' });
            }
        }
        console.timeEnd('[GalaxyGen] 3. Add Two-Way Warps');

        console.time('[GalaxyGen] 4. Add One-Way Warps');
        // 4. Add one-way warps based on density
        const numOneWay = Math.floor(numSystems * (oneWayDensity / 100));
        for (let i = 0; i < numOneWay; i++) {
            const p1 = systems[Math.floor(Math.random() * numSystems)];
            const p2 = systems[Math.floor(Math.random() * numSystems)];
            if (p1.id !== p2.id && !p1.links.some(l => l.targetId === p2.id) && !p2.links.some(l => l.targetId === p1.id)) {
                p1.links.push({ targetId: p2.id, type: 'one-way' });
            }
        }
        console.timeEnd('[GalaxyGen] 4. Add One-Way Warps');

        console.timeEnd('[GalaxyGen] Total Time');
        console.log(`[GalaxyGen] Generation complete.`);
        return systems;
    }

    _getPlanetCount() {
        const rand = Math.random();
        if (rand < 0.05) return 1; if (rand < 0.15) return 2; if (rand < 0.30) return 3;
        if (rand < 0.50) return 4; if (rand < 0.70) return 5; if (rand < 0.85) return 6;
        if (rand < 0.95) return 7; if (rand < 0.99) return 8;
        return 9;
    }

    _generatePlanetsForSystem(systemId) {
        const planetCount = this._getPlanetCount();
        const planets = [];
        for (let i = 0; i < planetCount; i++) {
            let planetType;
            const rand = Math.random();
            if (rand < 0.1) { planetType = 'Industrial'; } else if (rand < 0.3) { planetType = 'Mining'; } else if (rand < 0.6) { planetType = 'Farming'; } else { planetType = 'Terran'; }
            const typeData = PLANET_TYPES[planetType];
            planets.push({ id: `${systemId}-p${i}`, systemId, name: `${planetType} Planet ${i + 1}`, type: planetType, size: Math.random() * 10 + 5, owner: null, captureProgress: 0, capturingTeam: null });
        }
        return planets;
    }
}