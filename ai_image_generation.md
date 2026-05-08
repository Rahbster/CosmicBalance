# Cosmic Balance: AI Image Generation Guide

This document outlines the standard procedure and prompt templates for generating game assets. The goal is to ensure visual consistency across different ship classes and factions while supporting the game's "Paint Replacement" and "Transparency" logic.

## 1. The Workflow: Portrait-First
To maintain consistency, always generate the **Portrait** version of a ship before the **Sprite**.
1.  **Portrait**: Define the silhouette, hull texture, and lighting in an action perspective.
2.  **Sprite**: Use the Portrait as a reference image to generate the top-down orthographic view, ensuring the design translates correctly.

---

## 2. Technical Constraints

### A. Paint Replacement Color: Magenta (#FF00FF)
-   **Rule**: Use **Pure Magenta (#FF00FF)** for all stripes, logos, and accents that the game should replace with a faction color.
-   **Forbidden**: Do not use Magenta anywhere else in the image (e.g., in lighting, glow, or background).

### B. Transparency Color: Bright Green (#00FF00)
-   **Rule (Sprites Only)**: Use **Bright Green (#00FF00)** for the background of all unit sprites.
-   **Forbidden**: Do not use this green anywhere in the actual ship design.

### C. No Engine Thrust (Sprites)
-   **Rule**: Unit sprites must **not** show engine flames, thrust, or exhaust glow. The game engine layers these effects dynamically.

---

## 3. Prompt Templates

### A. Unit Portrait
> **Prompt**: `Cinematic perspective view of a single [FACTION] [SHIP_TYPE], [SILHOUETTE_DESC] silver and metallic hull, NO engine thrust or flames, distinct Magenta (#FF00FF) stripes and accents for paint replacement, [ADDITIONAL_DETAIL: e.g. visible weapon turrets, hangar bays], cinematic space background with stars and nebulae, photorealistic digital art style, high resolution.`

### B. Unit Sprite (Using Portrait as Reference)
> **Prompt**: `Top-down orthographic view of the [FACTION] [SHIP_TYPE] from the reference image, [SILHOUETTE_DESC] silver and metallic hull, NO engine thrust or flames, distinct Magenta (#FF00FF) stripes and accents for paint replacement, isolated on a bright neon green background (#00FF00), high resolution, game asset style.`

---

## 4. Faction Silhouettes
-   **Solaris Alliance**: Sleek, curved, white/silver metallic, high-tech.
-   **Syndicate**: Brutalist, angular, dark obsidian/gray, aggressive.
-   **Pirate Raiders**: Asymmetrical, scavenged, weathered/rusty, industrial.
