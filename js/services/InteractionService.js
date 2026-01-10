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

            // Start a timer for long press
            this.pressTimer = setTimeout(() => {
                this.isLongPress = true;
                const coords = this.getMousePos(e);
                const ship = this.findShipAt(coords.x, coords.y);
                if (ship) {
                    // Dispatch an event for the UI layer to handle
                    this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { detail: { entity: ship, x: e.clientX, y: e.clientY } }));
                }
            }, 500); // 500ms for long press

            const coords = this.getMousePos(e);
            // Logging moved to only fire when a pan starts
            const { x, y } = coords;

            // --- Updated Selection Logic ---
            // Find all potential targets under the mouse click to select the closest one.
            const SHIP_CLICK_RADIUS_SQ = 15 * 15; // Squared click radius for ships (15px)

            const viewingPlayerId = this.engine.getViewingPlayerId();
            const isHostGodView = this.engine.isHost && this.engine.hostView.mode === 'god';

            const clickedShips = this.state.ships.filter(s => {
                if (!isHostGodView && s.owner !== viewingPlayerId) return false;
                const dx = s.x - x;
                const dy = s.y - y;
                return (dx * dx + dy * dy) < SHIP_CLICK_RADIUS_SQ;
            });

            const clickedSystems = this.state.systems.filter(p => {
                const visibility = p.visibility[viewingPlayerId];
                if (!isHostGodView && (!visibility || visibility === 'unexplored')) return false;
                const dx = p.x - x;
                const dy = p.y - y;
                const clickRadius = this.engine.getSystemEffectiveRadius(p);
                return (dx * dx + dy * dy) < (clickRadius * clickRadius);
            });

            const clickedDebris = this.state.debrisFields.filter(d => { // NEW
                // Visibility check for debris
                const isVisible = isHostGodView || this.state.systems.some(sys => {
                    const visibility = sys.visibility[viewingPlayerId];
                    if (!visibility || visibility === 'unexplored') return false;
                    const dx = sys.x - d.x;
                    const dy = sys.y - d.y;
                    return (dx * dx + dy * dy) < (200 * 200); // Generous visibility radius
                });
                if (!isVisible) return false;

                const dx = d.x - x;
                const dy = d.y - y;
                return (dx * dx + dy * dy) < (15 * 15); // 15px click radius for debris
            });

            let closestEntity = null;
            let minDistanceSq = Infinity;

            const allTargets = [
                ...clickedShips.map(s => ({ type: 'ship', entity: s })),
                ...clickedSystems.map(s => ({ type: 'system', entity: s })),
                ...clickedDebris.map(d => ({ type: 'debris', entity: d }))
            ];

            allTargets.forEach(target => {
                const dx = target.entity.x - x;
                const dy = target.entity.y - y;
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestEntity = target;
                }
            });

            // Handle the closest entity found
            if (closestEntity) {
                const selectedShipId = this.engine.selectionManager.selectedShipId;
                const clickedShipIsSelected = selectedShipId && closestEntity.type === 'ship' && closestEntity.entity.id === selectedShipId;

                // If a ship is already selected and we click on that *same* ship,
                // check if there's a system underneath it that we should prioritize instead (de-selection).
                if (clickedShipIsSelected) {
                    const systemUnderneath = clickedSystems[0]; // clickedSystems should only have one at most
                    if (systemUnderneath) {
                        // We clicked the selected ship, but there's a system here.
                        // Treat this click as a click on the system.
                        this.engine.selectionManager.setSelectedLocation(systemUnderneath.id);
                        return;
                    }
                }

                if (closestEntity.type === 'ship') {
                    const ship = closestEntity.entity;
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
                } else if (closestEntity.type === 'system') {
                    const system = closestEntity.entity;
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
                    }
                } else if (closestEntity.type === 'debris') {
                    const debris = closestEntity.entity;
                    if (selectedShipId) {
                        // moveShipToTarget will validate if the ship is a salvager
                        this.engine.moveShipToTarget(selectedShipId, debris.id);
                    }
                    return; // Don't fall through to panning
                }
                return;
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
        const SHIP_CLICK_RADIUS_SQ = 15 * 15;
        return this.state.ships.find(s => {
            const dx = s.x - worldX;
            const dy = s.y - worldY;
            return (dx * dx + dy * dy) < SHIP_CLICK_RADIUS_SQ;
        });
    }
}