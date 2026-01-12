import { LOG_CATEGORIES, LOG_LEVELS } from '../cb_constants.js';

const UNSC_NAMES = [
    "Reach", "Tribute", "Harvest", "Arcadia", "Jericho {ROMANNUMBER}", "Mars", "Earth",
    "{GREEKNAME} Octanus {ROMANNUMBER}", "Coral", "New Alexandria", "Aszod", "Fumirole",
    "Madrigal", "Eridanus {ROMANNUMBER}", "{GREEKNAME} Ceti {ROMANNUMBER}", "Kilo-{NUMBER}", "Onyx", "Ghibalb",
    "Actium", "Algolis", "Alluvion", "Aleria", "Andesia", "Circinius", "Draco {ROMANNUMBER}",
    "Emerald Cove", "Estuary", "Far Isle", "Gannick {NUMBER}", "Hestia {ROMANNUMBER}", "Hunters Ridge",
    "Mamore", "Minab", "Nova Austin", "New Constantinople", "New Harmony", "New Jerusalem",
    "New Llanelli", "New Tyne", "Paris {ROMANNUMBER}", "Sansar", "Sedra", "Tantalus", "Troy", "Victoria"
];
const COVENANT_NAMES = [
    "High Charity", "Sanghelios", "Doisac", "Balaho", "Eayn", "Te", "Kig-Yar",
    "Oth Sonin", "Malurok", "Hesduros", "Glyke", "Uso", "Rahnelo", "Sunaion",
    "Joyous Exultation", "Suban", "Qikost", "Warial", "Ulgethon", "Saepon'kal",
    "Zhoist", "Decided Heart", "Sacred Promissory", "Truth and Reconciliation",
    "Pious Inquisitor", "Long Night of Solace", "Shadow of Intent", "Seeker of Truth"
];

const UNSC_PREFIXES = ["New", "Fort", "Port", "Mount", "Camp", "Base", "Outpost", "Station", "Colony"];
const UNSC_SUFFIXES = ["Prime", "Major", "Minor", "Secundus", "Tertius", "{ROMANNUMBER}", "{LETTER}"];
const COVENANT_PREFIXES = ["High", "Holy", "Sacred", "Divine", "Blessed", "Glorious", "Prophet's"];
const COVENANT_SUFFIXES = ["Keep", "Spire", "Covenant", "Refuge", "Shrine", "Altar", "Redoubt"];

const GREEK_NAMES = [
    "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa",
    "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"
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
        cost: { credits: 1000, scrap: 200, energy: 100 },
        maxHull: 5000,
        maxShield: 1000,
        damage: 25, // Defensive turrets
        sublight: 0,
        warp: 0,
        buildTime: 120000, // 2 minutes
        isStation: true, // Special flag
        builtBy: ['Planet'], // Only planets can build the first station
        buildCapabilities: ['Fighter', 'Salvager', 'Scout', 'TroopTransport', 'Frigate', 'Destroyer', 'Cruiser'] // Stations can build other ships
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
    },
    Destroyer: {
        cost: { credits: 1200, minerals: 400, energy: 150 },
        maxHull: 1500,
        maxShield: 500,
        damage: 60,
        sublight: 2.5,
        warp: 1.6,
        buildTime: 120000, // 2 minutes
        builtBy: ['SpaceStation'],
        requiresTech: 'destroyer_construction'
    },
    Cruiser: {
        cost: { credits: 3000, minerals: 1000, energy: 400 },
        maxHull: 4000,
        maxShield: 1200,
        damage: 150,
        sublight: 2,
        warp: 1.5,
        buildTime: 240000, // 4 minutes
        builtBy: ['SpaceStation'],
        requiresTech: 'cruiser_construction'
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
    constructor(canvas, loggingService) {
        this.canvas = canvas;
        this.loggingService = loggingService;
    }

    generateGalaxyMap(numSystems, twoWayDensity = 30, oneWayDensity = 3, isSymmetric = false, playerCount = 1) {
        if (isSymmetric && playerCount > 1) {
            return this.generateSymmetricMap(numSystems, twoWayDensity, oneWayDensity, playerCount);
        }

        if (this.loggingService) this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `[GalaxyGen] Starting generation for ${numSystems} systems.`);

        const systems = [];
        if (numSystems <= 0) return;

        const canvasWidth = this.canvas.parentElement.clientWidth;
        const canvasHeight = 600;
        const padding = 50;
        const zones = Math.max(1, numSystems * 3 / 45); // Ensure at least 1x canvas size

        // Scale down star sizes and distances for denser galaxies to improve layout and visuals.
        // This creates a curve where the scaling effect is minor for few systems but significant for many.
        const scaleFactor = Math.max(0.25, 1 - (numSystems / 1500));
        const minStarDist = 200 * scaleFactor;

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
                if (this.loggingService) this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.WARNING, `[GalaxyGen] Could not find a valid position for system ${i + 1} after ${maxAttempts} attempts. The galaxy might be too crowded.`);
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

        // 4. Add one-way warps based on density
        const numOneWay = Math.floor(numSystems * (oneWayDensity / 100));
        for (let i = 0; i < numOneWay; i++) {
            const p1 = systems[Math.floor(Math.random() * numSystems)];
            const p2 = systems[Math.floor(Math.random() * numSystems)];
            if (p1.id !== p2.id && !p1.links.some(l => l.targetId === p2.id) && !p2.links.some(l => l.targetId === p1.id)) {
                p1.links.push({ targetId: p2.id, type: 'one-way' });
            }
        }

        if (this.loggingService) this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `[GalaxyGen] Generation complete.`);
        return systems;
    }

    generateSymmetricMap(totalSystems, twoWayDensity, oneWayDensity, playerCount) {
        if (this.loggingService) this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `[GalaxyGen] Starting SYMMETRIC generation for ${playerCount} players.`);
        
        const systems = [];
        const systemsPerSlice = Math.floor(totalSystems / playerCount);
        const canvasWidth = this.canvas.width || window.innerWidth;
        const canvasHeight = this.canvas.height || window.innerHeight;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        let maxRadius = Math.min(canvasWidth, canvasHeight) * 0.45;
        const minRadius = 80; // Increased inner radius to avoid center clustering

        // Dynamic minimum distance based on density
        const scaleFactor = Math.max(0.4, 1 - (totalSystems / 500));
        const minStarDist = 200 * scaleFactor; // Increased to prevent clustering and overlap
        const minStarDistSq = minStarDist * minStarDist;

        // --- Expand Universe if needed ---
        // Calculate required area with a packing factor to ensure stars fit comfortably
        const areaPerStar = minStarDist * minStarDist;
        const requiredArea = totalSystems * areaPerStar * 1.5; // 1.5 packing factor
        const currentArea = Math.PI * (maxRadius * maxRadius - minRadius * minRadius);

        if (requiredArea > currentArea) {
            const newMaxRadiusSq = (requiredArea / Math.PI) + (minRadius * minRadius);
            maxRadius = Math.sqrt(newMaxRadiusSq);
            if (this.loggingService) this.loggingService.log(LOG_CATEGORIES.SYSTEM, LOG_LEVELS.INFO, `[GalaxyGen] Expanded universe radius to ${Math.round(maxRadius)} to fit ${totalSystems} stars.`);
        }

        // 1. Generate Slice 0 (The Template)
        const slice0 = [];
        const wedgeAngle = (2 * Math.PI) / playerCount;
        
        // Ensure the first system is a good "Home" system (somewhat central in the wedge)
        // Randomize home position slightly to avoid exact same map every time
        const homeR = minRadius + (maxRadius - minRadius) * (0.75 + Math.random() * 0.2); // 0.75 to 0.95
        const homeTheta = wedgeAngle * (0.3 + Math.random() * 0.4); // 0.3 to 0.7
        slice0.push({ r: homeR, theta: homeTheta, isHome: true, planetConfig: this._generatePlanetConfig() });

        for (let i = 1; i < systemsPerSlice; i++) {
            let r, theta, valid;
            let attempts = 0;
            const maxAttempts = 200;

            do {
                valid = true;
                r = minRadius + Math.random() * (maxRadius - minRadius);
                theta = Math.random() * wedgeAngle;

                // Check collision with existing stars in this slice AND potential neighbors
                for (const other of slice0) {
                    if (!other) continue;
                    // 1. Distance within the slice
                    const d2 = r*r + other.r*other.r - 2*r*other.r*Math.cos(theta - other.theta);
                    if (d2 < minStarDistSq) { valid = false; break; }

                    // 2. Distance to neighbor slice (virtual position at theta + wedgeAngle)
                    const d2Next = r*r + other.r*other.r - 2*r*other.r*Math.cos(theta - (other.theta + wedgeAngle));
                    if (d2Next < minStarDistSq) { valid = false; break; }

                    // 3. Distance to previous slice (virtual position at theta - wedgeAngle)
                    const d2Prev = r*r + other.r*other.r - 2*r*other.r*Math.cos(theta - (other.theta - wedgeAngle));
                    if (d2Prev < minStarDistSq) { valid = false; break; }
                }
                attempts++;
            } while (!valid && attempts < maxAttempts);

            if (valid) {
                slice0.push({ r, theta, isHome: false, planetConfig: this._generatePlanetConfig() });
            }
        }

        // 2. Replicate Slices
        for (let p = 0; p < playerCount; p++) {
            const rotation = p * wedgeAngle;
            
            slice0.forEach((template, idx) => {
                const r = template.r;
                const theta = template.theta + rotation;
                
                const x = centerX + r * Math.cos(theta);
                const y = centerY + r * Math.sin(theta);
                
                const systemId = `sys-p${p}-${idx}`;
                systems.push({
                    id: systemId,
                    x, y,
                    r: (Math.random() * 10 + 15), // Visual radius can vary slightly
                    name: `System ${p}-${idx}`,
                    links: [],
                    owner: null,
                    visibility: {},
                    planets: this._instantiatePlanets(systemId, template.planetConfig),
                    buildQueue: [],
                    sliceIndex: idx, // Track original index for linking
                    slice: p
                });
            });
        }

        // 3. Generate Links for Slice 0 (MST to ensure connectivity)
        // We define connections based on indices in slice 0, then replicate
        const slice0Links = [];
        
        if (slice0.length > 0) {
            const connected = new Set([0]); // Start with index 0
            const unconnected = new Set();
            for (let i = 1; i < slice0.length; i++) unconnected.add(i);

            while (unconnected.size > 0) {
                let bestDistSq = Infinity;
                let bestU = -1;
                let bestC = -1;

                for (const c of connected) {
                    const s1 = slice0[c];
                    for (const u of unconnected) {
                        const s2 = slice0[u];
                        const d2 = s1.r*s1.r + s2.r*s2.r - 2*s1.r*s2.r*Math.cos(s1.theta - s2.theta);
                        if (d2 < bestDistSq) {
                            bestDistSq = d2;
                            bestU = u;
                            bestC = c;
                        }
                    }
                }

                if (bestU !== -1) {
                    const link = [bestC, bestU].sort().join('-');
                    if (!slice0Links.includes(link)) slice0Links.push(link);
                    connected.add(bestU);
                    unconnected.delete(bestU);
                } else {
                    break;
                }
            }
        }

        // Add extra links based on density
        const extraLinks = Math.floor(slice0.length * (twoWayDensity / 100));
        for (let k = 0; k < extraLinks; k++) {
            const i = Math.floor(Math.random() * slice0.length);
            const j = Math.floor(Math.random() * slice0.length);
            if (i !== j) {
                const link = [i, j].sort().join('-');
                if (!slice0Links.includes(link)) slice0Links.push(link);
            }
        }

        // 4. Apply Links to all Slices
        systems.forEach(sys => {
            const p = sys.slice;
            const idx = sys.sliceIndex;

            // Internal Slice Links
            slice0Links.forEach(linkStr => {
                const [a, b] = linkStr.split('-').map(Number);
                if (idx === a) {
                    const targetId = `sys-p${p}-${b}`;
                    sys.links.push({ targetId, type: 'two-way' });
                } else if (idx === b) {
                    const targetId = `sys-p${p}-${a}`;
                    sys.links.push({ targetId, type: 'two-way' });
                }
            });

            // Inter-Slice Links (Ring Connection)
            // Connect the home system (idx 0) to the home system of the next slice
            // Or connect systems near the boundary.
            // Simple approach: Connect Home (0) to Home of next slice (p+1)
            if (idx === 0) {
                const nextP = (p + 1) % playerCount;
                const targetId = `sys-p${nextP}-0`;
                sys.links.push({ targetId, type: 'two-way' });
                
                const prevP = (p - 1 + playerCount) % playerCount;
                const prevTargetId = `sys-p${prevP}-0`;
                sys.links.push({ targetId: prevTargetId, type: 'two-way' });
            }

            // Connect the outer rim system (last index) to the next slice's outer rim
            // This creates a "ring road" around the galaxy, preventing the center from being the only choke point
            if (idx === systemsPerSlice - 1) {
                const nextP = (p + 1) % playerCount;
                const targetId = `sys-p${nextP}-${idx}`;
                sys.links.push({ targetId, type: 'two-way' });
                
                const prevP = (p - 1 + playerCount) % playerCount;
                const prevTargetId = `sys-p${prevP}-${idx}`;
                sys.links.push({ targetId: prevTargetId, type: 'two-way' });
            }
        });

        return systems;
    }

    generateSystemName(faction) {
        const names = PLANET_NAMES[faction] || PLANET_NAMES['UNSC'];
        const baseName = names[Math.floor(Math.random() * names.length)];
        let finalName = baseName;
        
        const roll = Math.random();
        if (roll < 0.15) {
            // Prefix
            const prefixes = faction === 'COVENANT' ? COVENANT_PREFIXES : UNSC_PREFIXES;
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            finalName = `${prefix} ${baseName}`;
        } else if (roll < 0.30) {
            // Suffix
            const suffixes = faction === 'COVENANT' ? COVENANT_SUFFIXES : UNSC_SUFFIXES;
            const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
            finalName = `${baseName} ${suffix}`;
        } else if (roll < 0.40) {
            // Number
            finalName = `${baseName} ${Math.floor(Math.random() * 100) + 1}`;
        }
        
        return this.resolvePlaceholders(finalName);
    }

    resolvePlaceholders(name) {
        return name.replace(/{(\w+)}/g, (match, type) => {
            switch (type) {
                case 'NUMBER': return Math.floor(Math.random() * 100) + 1;
                case 'ROMANNUMBER': return this._generateRoman();
                case 'LETTER': return String.fromCharCode(65 + Math.floor(Math.random() * 26));
                case 'GREEKNAME': return GREEK_NAMES[Math.floor(Math.random() * GREEK_NAMES.length)];
                default: return match;
            }
        });
    }

    _generateRoman() {
        const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
        return numerals[Math.floor(Math.random() * numerals.length)];
    }

    _getPlanetCount() {
        const rand = Math.random();
        if (rand < 0.05) return 1; if (rand < 0.15) return 2; if (rand < 0.30) return 3;
        if (rand < 0.50) return 4; if (rand < 0.70) return 5; if (rand < 0.85) return 6;
        if (rand < 0.95) return 7; if (rand < 0.99) return 8;
        return 9;
    }

    _generatePlanetsForSystem(systemId) {
        const config = this._generatePlanetConfig();
        return this._instantiatePlanets(systemId, config);
    }

    _generatePlanetConfig() {
        const planetCount = this._getPlanetCount();
        const planets = [];
        for (let i = 0; i < planetCount; i++) {
            let planetType;
            const rand = Math.random();
            if (rand < 0.1) { planetType = 'Industrial'; } else if (rand < 0.3) { planetType = 'Mining'; } else if (rand < 0.6) { planetType = 'Farming'; } else { planetType = 'Terran'; }
            planets.push({ type: planetType, size: Math.random() * 10 + 5 });
        }
        return planets;
    }

    _instantiatePlanets(systemId, config) {
        return config.map((p, i) => ({ id: `${systemId}-p${i}`, systemId, name: `${p.type} Planet ${i + 1}`, type: p.type, size: p.size, owner: null, captureProgress: 0, capturingTeam: null }));
    }
}