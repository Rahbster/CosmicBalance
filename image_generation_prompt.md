# Cosmic Balance: Fleet Asset Design Guide

This document defines the prompt architecture for generating high-fidelity PNG ship assets (Sprites and Portraits) for the Cosmic Balance engine.

## 1. Faction Design DNA

| Faction | Primary Colors | Aesthetics | Keywords | Material Profile |
| :--- | :--- | :--- | :--- | :--- |
| **Solaris Alliance** | Gunmetal, Orange | Industrial, Heavy Armor | Brutalist, slabs, hazard stripes | Matte steel, weathered iron, thermal heat-tiles |
| **Void Syndicate** | Obsidian, Magenta | Sleek, Needle-like | Iridescent, sharp, glowing veins | Polished obsidian, crystalline glass, neon conduits |
| **Pirate Scavengers** | Rusted Iron, Grey | Asymmetrical, Bolted | Junk, scavenged, rusted | Corroded metal, exposed wiring, mismatched plating |

- **Resolution**: 1024x1024 (generated), 2D Orthographic view for Sprites.

## 2.2. Signature Color Standardization (Recolor Mapping)
To ensure the dynamic "Faction Color" system works, assets must use these specific hex-ranges for "Paint" or "Glow" zones:
- **Solaris**: Use **Industrial Orange (#FF8800)** for all stripes and hazard markings.
- **Void Syndicate**: Use **Vibrant Magenta (#FF00FF)** for all bio-luminescent conduits and needle-tips.
- **Pirate Scavengers**: Use **Burnt Sienna / Rust (#8B4513)** for the primary armor plating highlights.

## 2.3. Color Swap Optimization
When generating ships, the goal is to allow the player to swap the "Signature Color" (e.g., Orange) for a custom Faction Color (e.g., Red or Yellow).
- **Technique**: Use flat, high-saturation colors for branding zones. Avoid complex gradients or "weathering" that blends the signature color into the grey hull metal.
- **Goal**: Clear separation between "Paint" and "Metal" to facilitate clean pixel-replacement at runtime.

---

## 3. Ship Classification (8 Types)

1.  **Fighter**: Small, agile, twin-engine.
2.  **Scout**: Thin, long-range sensors, light frame.
3.  **TroopTransport**: Bulky, internal bays, heavy shielding.
4.  **Salvager**: Utility arms/claws, industrial cargo pods.
5.  **Frigate**: Mid-size, multiple gun batteries, tactical profile.
6.  **Destroyer**: Long, narrow, heavy forward-facing weaponry.
7.  **Cruiser**: Massive, command bridge, broadside cannons.
8.  **SpaceStation**: Large-scale structures (Outposts, Bastions, Shipyards).

---

## 4. Style Variations (Tiers)

-   **Tier 1 (Scavenged/Basic)**: Visible wiring, matte finishes, exposed components.
-   **Tier 2 (Standard/Refined)**: Unified hull plating, glowing decals, integrated systems.
-   **Tier 3 (Advanced/Elite)**: Energy shields, specialized geometry, premium finishes (chrome/obsidian).

---

## 5. Prompt Templates

### A. Tactical Sprite (Green Screen)
Used for the in-game 2D engine.
> **Prompt:** `Top-down view of a [Faction] [Type], [Variation Details]. Facing directly NORTH (upwards). Cold engines (no fire, no glow). Isolated on a solid flat bright green background (#00FF00). No stars, no shadow. 2D game asset style, high-tech space geometry.`

### B. Artistic Portrait (Cinematic)
Used for UI panels and ship details.
> **Prompt:** `Artistic concept art of a [Faction] [Type], [Variation Details]. Cold engines (no glow). Atmospheric space background [Optional: Nebula/Debris]. High-fidelity cinematic detail, 2D game portrait, realistic materials.`

---

## 6. Asset Registry (V3 Generation Status)

| Unit | Solaris | Syndicate | Pirate |
| :--- | :--- | :--- | :--- |
| **Fighter** | [x] V3_PNG | [x] V3_PNG | [x] V3_PNG |
| **Scout** | [ ] Pending | [ ] Pending | [ ] Pending |
| **Transport** | [ ] Pending | [ ] Pending | [ ] Pending |
| **Salvager** | [ ] Pending | [ ] Pending | [ ] Pending |
| **Frigate** | [ ] Pending | [ ] Pending | [ ] Pending |
| **Destroyer** | [ ] Pending | [ ] Pending | [ ] Pending |
| **Cruiser** | [ ] Pending | [ ] Pending | [ ] Pending |
| **SpaceStation**| [ ] Pending | [ ] Pending | [ ] Pending |
