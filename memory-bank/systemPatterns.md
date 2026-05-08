# System Patterns: CosmicBalance

## Project Structure
```
CosmicBalance/
├── css/              # Styling (modular by component)
├── assets/           # Visual assets (sprites, icons)
├── data/             # Static data models (JSON)
├── js/               # Application logic
│   ├── combat/       # Tactical combat engine
│   ├── components/   # UI components
│   ├── modals/       # Dialogs and menus
│   ├── services/     # Core logic and state managers
│   └── ui/           # Generic UI utilities
├── index.html        # Main entry point
└── memory-bank/      # Documentation and context
```

## Key Patterns
- **Service-Oriented**: Core logic is encapsulated in services (e.g., `GalaxyService`) that manage their own slice of state.
- **Singleton Managers**: Utility classes like `ChatManager` and `ToastManager` provide global access to UI notifications.
- **Event-Driven**: Communication between services often happens via custom events or direct method calls mediated by the `app.js` hub.
- **State-Driven Rendering**: The `RenderService` draws the world based on the current state stored in services, decoupling logic from visuals.
- **P2P Synchronization**: `peer.js` acts as the network layer. Unlike PeerSudoku, state is not automatically flooded; the Host manages the authoritative state and handles "Host Migration" via explicit state transfer if the host changes.
- **3D UI Engine (`js/ui/StellarNavigator.js`)**: 
    - Uses CSS transforms for a 3D carousel effect.
    - Employs `translateZ(-500px)` and `scale(0.85)` for depth-stacking inactive panels (optimized for mobile/iPhone/iPad).
    - Supports dynamic slide visibility for runtime mode switching.
- **Host Spectator Mode**: The host can choose to be a spectator, gaining "God Mode" visibility (seeing all player resources and movements) while peers remain restricted to their own faction's view.
- **Host Migration**: Supports voluntary host transfer. The game pauses, the current host transmits the full authoritative engine state to a designated peer, and that peer resumes as the new server.

## Core Logic Flows
1. **Initialization**: `app.js` loads, initializes all services, and starts the `RenderService` loop.
2. **Game Tick**: `game-engine.js` processes production, travel, and combat calculations at regular intervals.
3. **Input Handling**: `InteractionService` captures user events, determines their context (e.g., clicking a ship), and issues commands to relevant services.
4. **Networking**: PeerJS events (connection, data) are handled by `peer.js`, which updates local services based on remote input.

## Data Models
- **Planet**: Type, Alignment, Tech Level, Resource Output.
- **Ship**: Hull, Components, Fleet Assignment, Stats (Range, Speed, Weapons).
- **Galaxy**: Star Systems, Warp Lane connections, Fog of War state.
