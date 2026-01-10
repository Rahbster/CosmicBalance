const CACHE_NAME = 'cosmic-balance-v3';
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
    './js/services/InteractionService.js',
    './js/services/RenderService.js',
    './js/services/AIService.js',
    './js/services/SpriteService.js',
    './js/services/FleetService.js',
    './js/modals/FleetManagerModal.js',
    './js/modals/TechTreeModal.js',
    './js/ui/RadialMenu.js',
    './js/modals/GameSetupModal.js',
    './js/ToastManager.js',
    './js/ChatManager.js',
    './js/signaling-service.js',
    './js/modals/peer_connection_modal.js',
    './js/peerjs.min.js',
    './manifest.json',
    './data/tech-tree.json',    
    './assets/sprites/unsc_fighter.png',
    './assets/sprites/unsc_scout.png',
    './assets/sprites/unsc_transport.png',
    './assets/sprites/unsc_salvager.png',
    './assets/sprites/unsc_frigate.png',
    './assets/sprites/unsc_station.png',
    './assets/sprites/cov_fighter.png',
    './assets/sprites/cov_scout.png',
    './assets/sprites/cov_transport.png',
    './assets/sprites/cov_salvager.png',
    './assets/sprites/cov_frigate.png',
    './assets/sprites/cov_station.png',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap'
];

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force the waiting service worker to become the active service worker
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
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