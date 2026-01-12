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

                if (target.type === 'ship') {
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
                        this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                            detail: { entity: system, x: e.clientX, y: e.clientY } 
                        }));
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