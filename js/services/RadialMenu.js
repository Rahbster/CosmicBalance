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
                // Dispatch an event for the UI layer to handle
                if (ship) this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                    detail: { entity: ship, x: e.clientX, y: e.clientY } 
                }));
            }, 500); // 500ms for long press

            const coords = this.getMousePos(e);

            // Logging moved to only fire when a pan starts
            const { x, y } = coords;

            // --- Updated Selection Logic ---
            // Find all potential targets under the mouse click to select the closest one.
            const SHIP_CLICK_RADIUS_SQ = 15 * 15; // Squared click radius for ships (15px)

            const clickedShips = this.state.ships.filter(s => {
                const dx = s.x - x;
                const dy = s.y - y;
                return (dx * dx + dy * dy) < SHIP_CLICK_RADIUS_SQ;
            });

            const clickedSystems = this.state.systems.filter(p => {
                const dx = p.x - x;
                const dy = p.y - y;
                return (dx * dx + dy * dy) < (p.r * p.r);
            });

            let closestEntity = null;
            let minDistanceSq = Infinity;

            const allTargets = [
                ...clickedShips.map(s => ({ type: 'ship', entity: s })),
                ...clickedSystems.map(s => ({ type: 'system', entity: s }))
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
                if (closestEntity.type === 'ship') {
                    const isOwner = closestEntity.entity.owner === this.engine.getIdentity().guid;
                    const isGod = this.engine.isHost && this.engine.hostView.mode === 'god';
                    
                    if (isOwner || isGod) {
                        this.engine.setSelectedShip(closestEntity.entity.id);
                    }
                } else if (closestEntity.type === 'system') {
                    const system = closestEntity.entity;
                    let moveSuccessful = false;

                    if (this.engine.selectedShipId) {
                        const ship = this.state.ships.find(s => s.id === this.engine.selectedShipId);
                        // Don't try to move stations (hex structures)
                        if (ship && !ship.isStation) {
                            moveSuccessful = this.engine.moveShipToSystem(this.engine.selectedShipId, system.id);
                        }
                    }

                    if (!moveSuccessful) {
                        this.engine.setSelectedLocation(system.id);
                    }
                }
                return;
            }

            this.engine.isAnimating = false; // Stop any ongoing animation if user starts panning
            this.isPanning = true;
            this.panStart = { x: this.engine.pan.x, y: this.engine.pan.y };
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
                this.engine.pan.x = this.panStart.x + dx;
                this.engine.pan.y = this.panStart.y + dy;
                this.engine.constrainPanAndZoom();
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
            const oldZoom = this.engine.zoom;

            const pointBeforeZoom = {
                x: (e.clientX - this.canvas.getBoundingClientRect().left - this.engine.pan.x) / oldZoom,
                y: (e.clientY - this.canvas.getBoundingClientRect().top - this.engine.pan.y) / oldZoom
            };

            if (e.deltaY < 0) {
                this.engine.zoom *= zoomFactor;
            } else {
                this.engine.zoom /= zoomFactor;
            }

            this.engine.zoom = Math.max(0.1, Math.min(this.engine.zoom, 20));

            this.engine.pan.x = (e.clientX - this.canvas.getBoundingClientRect().left) - pointBeforeZoom.x * this.engine.zoom;
            this.engine.pan.y = (e.clientY - this.canvas.getBoundingClientRect().top) - pointBeforeZoom.y * this.engine.zoom;

            this.engine.constrainPanAndZoom();

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
            x: (e.clientX - rect.left - this.engine.pan.x) / this.engine.zoom,
            y: (e.clientY - rect.top - this.engine.pan.y) / this.engine.zoom
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