# Active Context: CosmicBalance

## Current Focus
The project is currently in **Phase 1 (The Hybrid Economy)** and moving into **Phase 2 (Universe & Exploration)**. The primary goal is to reconcile resource models between Trade Wars and Cosmic Balance and implement the tiered galaxy structure.

## Recent Changes
- Initial project structure established with core services (Galaxy, Render, Sprite).
- Tech tree definition in `tech-tree.json` created.
- P2P connectivity baseline implemented via `peer.js`.
- Basic Canvas rendering loop set up in `app.js`.
- UI modules for Chat and Toasts added.

## Immediate Next Steps
1. **Stellar Navigator Enhancements**: Port dynamic visibility and mobile depth effects from PeerSudoku to the CB navigator.
2. **Host Migration & Spectator Mode**: Implement voluntary host transfer and God Mode visibility for host-spectators.
3. **Interactive Map UI**: Develop the procedural generation for star systems and planets within the 3-tier zoomable interface.
4. **Mobile Optimization**: Ensure iPhone/iPad display stability for the lobby and tactical views.

## Active Risks
- **Performance**: Ensuring smooth rendering of many entities (ships, planets) on the Canvas.
- **Sync Latency**: Managing real-time state synchronization over P2P WebRTC.
- **Complexity**: Balancing the micro-management of Tier 1 with the abstraction required for Tier 3.
