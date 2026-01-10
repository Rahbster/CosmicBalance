# CosmicBalance

A Peer-to-Peer (P2P) Real-Time Strategy (RTS) space game built with HTML5 Canvas and JavaScript.

## Overview

Cosmic Balance is a web-based RTS where players command factions (UNSC or Covenant), manage resources, research technologies, build fleets, and conquer star systems. The game features a peer-to-peer multiplayer architecture allowing for serverless matches between players.

## Features

*   **P2P Multiplayer**: Connect directly with other players using PeerJS.
*   **Procedural Galaxy**: Randomly generated star systems, planets, and debris fields.
*   **Economy**: Manage resources like IO Credits, Minerals, Energy, Food, and Scrap.
*   **Combat & Fleets**: Build various ship types (Fighters, Frigates, Capital Ships), form fleets, and engage in combat.
*   **Tech Tree**: Research new technologies to unlock upgrades and new units.
*   **AI Opponents**: Play against AI-controlled factions.
*   **Save System**: Game state is persisted locally.

## Getting Started

1.  Clone the repository.
2.  Serve the root directory using a local web server (e.g., Live Server, Python `http.server`, or `http-server`).
    *   *Note: P2P features require a secure context (HTTPS) or localhost.*
3.  Open `index.html` in your browser.

## How to Play

*   **Navigation**: Pan with mouse drag, Zoom with scroll wheel.
*   **Selection**: Click to select ships or systems.
*   **Commands**: Use the radial menu (right-click or context button) or the UI panel to issue commands like Move, Patrol, Scout, or Colonize.
*   **Building**: Select a planet or station you control to access the build queue.
*   **Research**: Open the Tech Tree to unlock new capabilities.

## Project Structure

See Directory_Structure.md for a detailed breakdown of the file organization.

## Technologies

*   HTML5 Canvas for rendering.
*   Vanilla JavaScript (ES Modules).
*   PeerJS for WebRTC networking.
