# Tech Context: CosmicBalance

## Tech Stack
- **Frontend**: Vanilla JavaScript (ES Modules), HTML5 Canvas for high-performance rendering.
- **Styling**: Vanilla CSS for layout and aesthetics.
- **Networking**: PeerJS (WebRTC) for serverless P2P multiplayer. Features advanced signaling for "Presence" (friends network) and Host Migration protocols.
- **State Management**: Service-based architecture with centralized state objects.
- **UI Framework**: Stellar Navigator (3D carousel) for navigation, optimized for mobile (iPhone/iPad) with depth-stacking and touch support.
- **Assets**: PNG sprites and JSON-based data files (e.g., `tech-tree.json`).

## Core Services
- **GalaxyService**: Handles procedural universe generation and map state.
- **RenderService**: Manages the Canvas drawing loop and sprite rendering.
- **InteractionService**: Processes user input (mouse, keyboard, touch).
- **SpriteService**: Efficiently manages and caches game assets.
- **ChatManager / ToastManager**: Handle communication and UI notifications.

## Architecture
The project follows a modular, service-oriented architecture:
- `app.js`: Entry point, initializes services and the main game loop.
- `game-engine.js`: Core logic for ticks, production, and combat resolution.
- `peer.js`: Manages P2P connections and data synchronization.
- `modals/`: UI components for specific features (Tech Tree, Fleet Manager).

## Development Requirements
- **Local Server**: Requires a secure context (HTTPS) or localhost for PeerJS/WebRTC to function.
- **Performance**: High frame rate targeting (60fps) for the Canvas renderer.
- **Responsiveness**: Support for various screen sizes, especially for the multi-tier map view.
