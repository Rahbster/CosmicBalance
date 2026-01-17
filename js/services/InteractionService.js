import { SHIP_STATE } from '../cb_constants.js';

export class InteractionService {
    constructor(canvas, engine) {
        this.canvas = canvas;
        this.engine = engine;
        this.state = engine.state;

        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.mouseStart = { x: 0, y: 0 };

        this.pressTimer = null;
        this.isLongPress = false;

        this.isZooming = false;
        this.zoomEndTimeout = null;
        this.lastMouseEvent = null;

        this.attachInput();
    }

    attachInput() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.lastMouseEvent = e;
            this.isLongPress = false;

            const coords = this.getMousePos(e);
            // Logging moved to only fire when a pan starts
            const { x, y } = coords;

            // --- Updated Selection Logic ---
            // Find all potential targets under the mouse click to select the closest one.
            // Scale click radius by zoom to ensure ships are clickable when zoomed out
            const minScreenRadius = 15;
            const worldClickRadius = Math.max(15, minScreenRadius / this.engine.camera.zoom);
            const SHIP_CLICK_RADIUS_SQ = worldClickRadius * worldClickRadius;

            const viewingPlayerIds = this.engine.getViewingPlayerIds();
            const isHostGodView = this.engine.isHost && this.engine.hostView.mode === 'god';

            // --- Fleet Detection ---
            // Group ships by fleet to calculate centroids (matching RenderService logic)
            const fleets = {};
            this.state.ships.forEach(s => {
                if (s.fleetId && (isHostGodView || viewingPlayerIds.includes(s.owner))) {
                    if (!fleets[s.fleetId]) fleets[s.fleetId] = [];
                    fleets[s.fleetId].push(s);
                }
            });

            const clickedFleets = [];
            Object.values(fleets).forEach(ships => {
                if (ships.length === 0) return;
                
                let cx, cy;
                const firstShip = ships[0];
                const system = firstShip.currentSystemId ? this.state.systems.find(s => s.id === firstShip.currentSystemId) : null;

                if (system && firstShip.moveState === SHIP_STATE.IDLE) {
                    const orbitRadius = system.r + 25;
                    let hash = 0;
                    for (let i = 0; i < ships[0].fleetId.length; i++) {
                        hash = ((hash << 5) - hash) + ships[0].fleetId.charCodeAt(i);
                        hash |= 0;
                    }
                    const angleOffset = (Math.abs(hash) % 360) * (Math.PI / 180);
                    const speed = 0.0002;
                    const angle = (this.engine.state.gameTime * speed) + angleOffset;
                    cx = system.x + Math.cos(angle) * orbitRadius;
                    cy = system.y + Math.sin(angle) * orbitRadius;
                } else {
                    let tx = 0, ty = 0;
                    ships.forEach(s => { tx += s.x; ty += s.y; });
                    cx = tx / ships.length;
                    cy = ty / ships.length;
                }
                
                const dx = cx - x;
                const dy = cy - y;
                if ((dx*dx + dy*dy) < SHIP_CLICK_RADIUS_SQ) {
                    clickedFleets.push({ id: ships[0].fleetId, ships: ships, x: cx, y: cy });
                }
            });

            const clickedShips = this.state.ships.filter(s => {
                if (!isHostGodView && !viewingPlayerIds.includes(s.owner)) return false;
                const dx = s.x - x;
                const dy = s.y - y;
                return (dx * dx + dy * dy) < SHIP_CLICK_RADIUS_SQ;
            });

            const clickedSystems = this.state.systems.filter(p => {
                const visibility = viewingPlayerIds.some(id => p.visibility[id] === 'explored' || p.visibility[id] === 'scouted') ? 'explored' : 'unexplored';
                if (!isHostGodView && (!visibility || visibility === 'unexplored')) return false;
                const dx = p.x - x;
                const dy = p.y - y;
                const clickRadius = this.engine.spatialService.getSystemEffectiveRadius(p);
                return (dx * dx + dy * dy) < (clickRadius * clickRadius);
            });

            const clickedDebris = this.state.debrisFields.filter(d => { // NEW
                // Visibility check for debris
                const isVisible = isHostGodView || this.state.systems.some(sys => {
                    const visibility = viewingPlayerIds.some(id => sys.visibility[id] === 'explored' || sys.visibility[id] === 'scouted') ? 'explored' : 'unexplored';
                    if (!visibility || visibility === 'unexplored') return false;
                    const dx = sys.x - d.x;
                    const dy = sys.y - d.y;
                    return (dx * dx + dy * dy) < (200 * 200); // Generous visibility radius
                });
                if (!isVisible) return false;

                const dx = d.x - x;
                const dy = d.y - y;
                return (dx * dx + dy * dy) < SHIP_CLICK_RADIUS_SQ; // Use same scaled radius for debris
            });

            const allTargets = [
                ...clickedFleets.map(f => ({ type: 'fleet', entity: f })),
                ...clickedShips.map(s => ({ type: 'ship', entity: s })),
                ...clickedSystems.map(s => ({ type: 'system', entity: s })),
                ...clickedDebris.map(d => ({ type: 'debris', entity: d }))
            ];

            allTargets.forEach(target => {
                const dx = target.entity.x - x;
                const dy = target.entity.y - y;
                target.distSq = dx * dx + dy * dy;
            });
            
            // Sort by distance to find the best target, but allow fall-through
            allTargets.sort((a, b) => a.distSq - b.distSq);

            for (const target of allTargets) {
                const selectedShipId = this.engine.selectionManager.selectedShipId;
                const clickedShipIsSelected = selectedShipId && target.type === 'ship' && target.entity.id === selectedShipId;

                // If a ship is already selected and we click on that *same* ship,
                // check if there's a system underneath it that we should prioritize instead (de-selection).
                if (clickedShipIsSelected) {
                    const systemUnderneath = clickedSystems.find(s => s.id !== target.entity.currentSystemId); // Try to find a system
                    if (systemUnderneath) {
                        // We clicked the selected ship, but there's a system here.
                        // Treat this click as a click on the system.
                        this.engine.selectionManager.setSelectedLocation(systemUnderneath.id);
                        return;
                    }
                }

                if (target.type === 'fleet') {
                    // If a fleet is clicked, select the first ship to trigger fleet-wide logic
                    const fleetObj = target.entity;
                    const ship = fleetObj.ships[0];
                    
                    this.engine.selectionManager.setSelectedShip(ship.id);
                    this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                        detail: { entity: ship, x: e.clientX, y: e.clientY } 
                    }));
                    return;
                } else if (target.type === 'ship') {
                    const ship = target.entity;
                    const isOwner = ship.owner === this.engine.getIdentity().guid;
                    const isGod = this.engine.isHost && this.engine.hostView.mode === 'god';
                    
                    if (isOwner || isGod) {
                        if (ship.isStation) {
                            // If it's a station, treat it as a location to show build menus etc.
                            this.engine.selectionManager.setSelectedLocation(ship.id);
                        } else {
                            this.engine.selectionManager.setSelectedShip(ship.id);
                        }
                    }
                    this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                        detail: { entity: ship, x: e.clientX, y: e.clientY } 
                    }));
                    return; // Stop processing if we handled a ship
                } else if (target.type === 'system') {
                    const system = target.entity;
                    let moveSuccessful = false;

                    if (selectedShipId) {
                        const ship = this.state.ships.find(s => s.id === selectedShipId);
                        // Don't try to move stations (hex structures)
                        if (ship && !ship.isStation) {
                            moveSuccessful = this.engine.moveShipToTarget(selectedShipId, system.id);
                        }
                    }

                    if (!moveSuccessful) {
                        this.engine.selectionManager.setSelectedLocation(system.id);
                        
                        // Only show radial menu if clicking the star itself
                        const dx = system.x - x;
                        const dy = system.y - y;
                        if ((dx * dx + dy * dy) <= (system.r + 5) * (system.r + 5)) {
                            this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                                detail: { entity: system, x: e.clientX, y: e.clientY } 
                            }));
                        }
                    }
                    return; // Stop processing if we handled a system
                } else if (target.type === 'debris') {
                    const debris = target.entity;
                    if (selectedShipId) {
                        // moveShipToTarget will validate if the ship is a salvager
                        const moveSuccess = this.engine.moveShipToTarget(selectedShipId, debris.id);
                        if (moveSuccess) return; // Only stop if the move command was valid (i.e., it was a Salvager)
                    }
                    // If not a salvager, or no ship selected, fall through to the next target (e.g., the system underneath)
                }
            }

            this.engine.isAnimating = false; // Stop any ongoing animation if user starts panning
            this.isPanning = true;
            this.panStart = { x: this.engine.camera.pan.x, y: this.engine.camera.pan.y };
            this.mouseStart = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
            this.engine.logDiagnostics('pan start', e, coords);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            this.lastMouseEvent = e;
            if (this.isPanning) {
                // Logging removed from mousemove to avoid spam
                const dx = e.clientX - this.mouseStart.x;
                const dy = e.clientY - this.mouseStart.y;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) clearTimeout(this.pressTimer); // Cancel long press if panning
                this.engine.camera.pan.x = this.panStart.x + dx;
                this.engine.camera.pan.y = this.panStart.y + dy;
                this.engine.camera.constrainPanAndZoom();
            }
        });

        const endPan = (e) => {
            clearTimeout(this.pressTimer);
            if (this.isLongPress) {
                e.preventDefault(); // Prevent the click from also selecting/moving
                return;
            }

            if (this.isPanning) {
                const coords = this.getMousePos(e);
                this.engine.logDiagnostics('pan end', e, coords);

                const dx = e.clientX - this.mouseStart.x;
                const dy = e.clientY - this.mouseStart.y;
                if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
                    this.engine.selectionManager.setSelectedShip(null);
                    this.engine.selectionManager.setSelectedLocation(null);
                }

                this.isPanning = false;
                this.canvas.style.cursor = 'default';
            }
        };

        this.canvas.addEventListener('mouseup', endPan);
        this.canvas.addEventListener('mouseleave', endPan);

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.lastMouseEvent = e;

            if (!this.isZooming) {
                this.isZooming = true;
                const coordsBefore = this.getMousePos(e);
                this.engine.logDiagnostics('zoom start', e, coordsBefore);
            }

            clearTimeout(this.zoomEndTimeout);

            const zoomFactor = 1.1;
            const oldZoom = this.engine.camera.zoom;

            const pointBeforeZoom = {
                x: (e.clientX - this.canvas.getBoundingClientRect().left - this.engine.camera.pan.x) / oldZoom,
                y: (e.clientY - this.canvas.getBoundingClientRect().top - this.engine.camera.pan.y) / oldZoom
            };

            if (e.deltaY < 0) {
                this.engine.camera.zoom *= zoomFactor;
            } else {
                this.engine.camera.zoom /= zoomFactor;
            }

            this.engine.camera.zoom = Math.max(0.1, Math.min(this.engine.camera.zoom, 20));

            this.engine.camera.pan.x = (e.clientX - this.canvas.getBoundingClientRect().left) - pointBeforeZoom.x * this.engine.camera.zoom;
            this.engine.camera.pan.y = (e.clientY - this.canvas.getBoundingClientRect().top) - pointBeforeZoom.y * this.engine.camera.zoom;

            this.engine.camera.constrainPanAndZoom();

            this.zoomEndTimeout = setTimeout(() => {
                this.isZooming = false;
                // Use the last known mouse event for coordinates
                const coordsAfter = this.getMousePos(this.lastMouseEvent);
                this.engine.logDiagnostics('zoom end', this.lastMouseEvent, coordsAfter);
            }, 200); // 200ms delay to consider the zoom action ended
        });

        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        // Touch handling
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    }

    handleTouchStart(e) {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.canvas.dispatchEvent(new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            }));
        } else if (e.touches.length === 2) {
            this.isPanning = false;
            this.isZooming = true;
            this.lastTouchDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }

    handleTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 1 && !this.isZooming) {
            const touch = e.touches[0];
            this.canvas.dispatchEvent(new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            }));
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            
            if (this.lastTouchDistance) {
                const zoomFactor = dist / this.lastTouchDistance;
                const oldZoom = this.engine.camera.zoom;
                this.engine.camera.zoom = Math.max(0.1, Math.min(this.engine.camera.zoom * zoomFactor, 20));
                
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = this.canvas.getBoundingClientRect();
                
                const worldX = (midX - rect.left - this.engine.camera.pan.x) / oldZoom;
                const worldY = (midY - rect.top - this.engine.camera.pan.y) / oldZoom;
                
                this.engine.camera.pan.x = (midX - rect.left) - worldX * this.engine.camera.zoom;
                this.engine.camera.pan.y = (midY - rect.top) - worldY * this.engine.camera.zoom;
                
                this.engine.camera.constrainPanAndZoom();
            }
            this.lastTouchDistance = dist;
        }
    }

    handleTouchEnd(e) {
        if (e.cancelable) e.preventDefault();
        if (this.isZooming && e.touches.length < 2) {
            this.isZooming = false;
            this.lastTouchDistance = 0;
        } else if (e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            this.canvas.dispatchEvent(new MouseEvent('mouseup', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                button: 0
            }));
        }
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.engine.camera.pan.x) / this.engine.camera.zoom,
            y: (e.clientY - rect.top - this.engine.camera.pan.y) / this.engine.camera.zoom
        };
    }

    findShipAt(worldX, worldY) {
        const minScreenRadius = 15;
        const worldClickRadius = Math.max(15, minScreenRadius / this.engine.camera.zoom);
        const SHIP_CLICK_RADIUS_SQ = worldClickRadius * worldClickRadius;

        const shipsUnderCursor = this.state.ships.filter(s => {
            const dx = s.x - worldX;
            const dy = s.y - worldY;
            return (dx * dx + dy * dy) < SHIP_CLICK_RADIUS_SQ;
        });

        if (shipsUnderCursor.length === 0) return null;

        // 1. Prioritize currently selected ship/station to ensure menu matches selection
        const currentSelectionId = this.engine.selectionManager.selectedShipId || this.engine.selectionManager.selectedLocationId;
        if (currentSelectionId) {
            const selected = shipsUnderCursor.find(s => s.id === currentSelectionId);
            if (selected) return selected;
        }

        // 2. Otherwise return the closest one (closest to the center of the click)
        return shipsUnderCursor.reduce((closest, current) => {
            const dx = current.x - worldX;
            const dy = current.y - worldY;
            const distSq = dx * dx + dy * dy;
            if (!closest || distSq < closest.distSq) return { ship: current, distSq };
            return closest;
        }, null).ship;
    }
}