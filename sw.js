const CACHE_NAME = 'cosmic-balance-v19';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/styles.css',
    './css/peer.css',
    './css/peer_connection_modal.css',
    './js/app.js',
    './js/peer.js',
    './js/game-engine.js',
    './js/services/GalaxyService.js',
    './js/services/GameMessageHandler.js',
    './js/services/GameSetupService.js',
    './js/services/InteractionService.js',
    './js/services/RenderService.js',
    './js/services/renderers/ShipRenderer.js',
    './js/services/AIService.js',
    './js/services/ai/AIEconomyManager.js',
    './js/services/ai/AIFleetManager.js',
    './js/services/ai/AIProfiles.js',
    './js/services/CombatService.js',
    './js/services/EconomyService.js',
    './js/services/MovementService.js',
    './js/services/LoggingService.js',
    './js/services/TechService.js',
    './js/services/SpatialService.js',
    './js/services/CameraManager.js',
    './js/services/SelectionManager.js',
    './js/services/SpriteService.js',
    './js/services/FleetService.js',
    './js/services/ProfileService.js',
    './js/services/StorageService.js',
    './js/services/UnitService.js',
    './js/services/PerformanceMonitor.js',
    './js/modals/FleetManagerModal.js',
    './js/modals/TechTreeModal.js',
    './js/modals/LoggingModal.js',
    './js/ui/RadialMenu.js',
    './js/ui/StellarNavigator.js',
    './js/ui/UIManager.js',
    './js/modals/GameSetupModal.js',
    './js/modals/AboutModal.js',
    './js/modals/GameStatusModal.js',
    './js/modals/ShipDesignerModal.js',
    './js/ToastManager.js',
    './js/ChatManager.js',
    './js/cb_constants.js',
    './js/modals/peer_connection_modal.js',
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
    './manifest.json',
    './data/tech-tree.json',    
    './assets/sprites/solaris_fighter.png',
    './assets/sprites/solaris_scout.png',
    './assets/sprites/solaris_transport.png',
    './assets/sprites/solaris_salvager.png',
    './assets/sprites/solaris_frigate.png',
    './assets/sprites/solaris_station.png',
    './assets/sprites/syndicate_fighter.png',
    './assets/sprites/syndicate_scout.png',
    './assets/sprites/syndicate_transport.png',
    './assets/sprites/syndicate_salvager.png',
    './assets/sprites/syndicate_frigate.png',
    './assets/sprites/syndicate_station.png',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force the waiting service worker to become the active service worker
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            console.log('Opened cache');
            
            // Use a more robust caching method that doesn't fail if one file is missing.
            const cachePromises = ASSETS_TO_CACHE.map(async (url) => {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        await cache.put(url, response);
                    } else {
                        console.warn(`Failed to cache ${url}: ${response.status} ${response.statusText}`);
                    }
                } catch (error) {
                    console.warn(`Failed to cache ${url}:`, error);
                }
            });
            await Promise.all(cachePromises);
        })()
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(self.clients.claim()); // Take control of all clients immediately
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});