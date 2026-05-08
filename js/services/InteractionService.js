import { SHIP_STATE } from '../cb_constants.js';
import { PLANET_TYPES } from './GalaxyService.js';

export class InteractionService {
    constructor(canvas, engine) {
        this.canvas = canvas;
        this.engine = engine;
        this.state = engine.state;

        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.mouseStart = { x: 0, y: 0 };
        this.dragDistance = 0;

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
            this.dragDistance = 0;

            this.engine.camera.stopAnimation(true);
            this.isPanning = true;
            this.panStart = { x: this.engine.camera.pan.x, y: this.engine.camera.pan.y };
            this.mouseStart = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
        });

        this.canvas.addEventListener('mousemove', (e) => {
            this.lastMouseEvent = e;
            if (this.isPanning) {
                const dx = e.clientX - this.mouseStart.x;
                const dy = e.clientY - this.mouseStart.y;
                // Track total movement to distinguish clicks from drags
                this.dragDistance += Math.sqrt(dx * dx + dy * dy);
                
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) clearTimeout(this.pressTimer);
                
                this.engine.camera.pan.x = this.panStart.x + dx;
                this.engine.camera.pan.y = this.panStart.y + dy;
                this.engine.camera.constrainPanAndZoom();
            }
        });

        const endPan = (e) => {
            clearTimeout(this.pressTimer);
            if (this.isLongPress) {
                e.preventDefault();
                return;
            }

            if (this.isPanning) {
                const dx = e.clientX - this.mouseStart.x;
                const dy = e.clientY - this.mouseStart.y;
                const totalDist = Math.sqrt(dx * dx + dy * dy);

                // If we didn't drag much, treat it as a click/interaction
                if (totalDist < 5) {
                    this.handleInteraction(e);
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
                const coordsAfter = this.getMousePos(this.lastMouseEvent);
                this.engine.logDiagnostics('zoom end', this.lastMouseEvent, coordsAfter);
            }, 200);
        });

        this.canvas.addEventListener('contextmenu', e => e.preventDefault());

        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    }

    handleInteraction(e) {
        const coords = this.getMousePos(e);
        const { x, y } = coords;

        const minScreenRadius = 15;
        const worldClickRadius = Math.max(15, minScreenRadius / this.engine.camera.zoom);
        const SHIP_CLICK_RADIUS_SQ = worldClickRadius * worldClickRadius;

        const viewingPlayerIds = this.engine.getViewingCommanderIds();
        const isHostGodView = this.engine.isHost && this.engine.hostView.mode === 'god';

        // --- Fleet Detection ---
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
            let tx = 0, ty = 0;
            ships.forEach(s => { tx += s.x; ty += s.y; });
            const cx = tx / ships.length;
            const cy = ty / ships.length;
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

        const clickedDebris = this.state.debrisFields.filter(d => {
            const isVisible = isHostGodView || this.state.systems.some(sys => {
                const visibility = viewingPlayerIds.some(id => sys.visibility[id] === 'explored' || sys.visibility[id] === 'scouted') ? 'explored' : 'unexplored';
                if (!visibility || visibility === 'unexplored') return false;
                const dx = sys.x - d.x;
                const dy = sys.y - d.y;
                return (dx * dx + dy * dy) < (200 * 200);
            });
            if (!isVisible) return false;
            const dx = d.x - x;
            const dy = d.y - y;
            return (dx * dx + dy * dy) < SHIP_CLICK_RADIUS_SQ;
        });

        const clickedPlanets = [];
        this.state.systems.forEach(sys => {
            const visibility = viewingPlayerIds.some(id => sys.visibility[id] === 'explored' || sys.visibility[id] === 'scouted') ? 'explored' : 'unexplored';
            if (!isHostGodView && (!visibility || visibility === 'unexplored')) return;

            const effRadius = this.engine.spatialService.getSystemEffectiveRadius(sys);
            const dx = sys.x - x;
            const dy = sys.y - y;
            if (dx*dx + dy*dy > effRadius * effRadius) return;

            if (sys.planets) {
                const r = sys.r;
                const orbitBase = r + 10;
                const planetGap = 8;
                sys.planets.forEach((planet, i) => {
                    const angle = (this.engine.state.gameTime / 10000 + i) % (Math.PI * 2);
                    const semiMajor = orbitBase + (i * planetGap);
                    const semiMinor = semiMajor * 0.65;
                    const tilt = ((sys.x + sys.y) % 360) * (Math.PI / 180);
                    const px = sys.x + (Math.cos(angle) * semiMajor * Math.cos(tilt) - Math.sin(angle) * semiMinor * Math.sin(tilt));
                    const py = sys.y + (Math.cos(angle) * semiMajor * Math.sin(tilt) + Math.sin(angle) * semiMinor * Math.cos(tilt));
                    const pRadius = (PLANET_TYPES[planet.type]?.radius || 3);
                    const hitRadius = Math.max(pRadius + 2, 10 / this.engine.camera.zoom); 
                    const clickDistSq = (px - x)**2 + (py - y)**2;
                    if (clickDistSq <= hitRadius * hitRadius) {
                        clickedPlanets.push({ type: 'planet', entity: planet });
                    }
                });
            }
        });

        const allTargets = [
            ...clickedFleets.map(f => ({ type: 'fleet', entity: f })),
            ...clickedShips.map(s => ({ type: 'ship', entity: s })),
            ...clickedPlanets.map(p => ({ type: 'planet', entity: p.entity })),
            ...clickedSystems.map(s => ({ type: 'system', entity: s })),
            ...clickedDebris.map(d => ({ type: 'debris', entity: d }))
        ];

        allTargets.forEach(target => {
            const dx = target.entity.x - x;
            const dy = target.entity.y - y;
            target.distSq = dx * dx + dy * dy;
        });
        
        allTargets.sort((a, b) => a.distSq - b.distSq);

        for (const target of allTargets) {
            const selectedShipId = this.engine.selectionManager.selectedShipId;
            const clickedShipIsSelected = selectedShipId && target.type === 'ship' && target.entity.id === selectedShipId;

            if (clickedShipIsSelected) {
                const systemUnderneath = clickedSystems.find(s => s.id !== target.entity.currentSystemId);
                if (systemUnderneath) {
                    this.engine.selectionManager.setSelectedLocation(systemUnderneath.id);
                    return;
                }
            }

            if (target.type === 'fleet') {
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
                        this.engine.selectionManager.setSelectedLocation(ship.id);
                    } else {
                        this.engine.selectionManager.setSelectedShip(ship.id);
                    }
                }
                this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                    detail: { entity: ship, x: e.clientX, y: e.clientY } 
                }));
                return;
            } else if (target.type === 'system') {
                const system = target.entity;
                let moveSuccessful = false;
                if (selectedShipId) {
                    const ship = this.state.ships.find(s => s.id === selectedShipId);
                    if (ship && !ship.isStation) {
                        moveSuccessful = this.engine.moveShipToTarget(selectedShipId, system.id);
                    }
                }
                if (!moveSuccessful) {
                    this.engine.selectionManager.setSelectedLocation(system.id);
                    const dx = system.x - x;
                    const dy = system.y - y;
                    if ((dx * dx + dy * dy) <= (system.r + 5) * (system.r + 5)) {
                        this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                            detail: { entity: system, x: e.clientX, y: e.clientY } 
                        }));
                    }
                }
                return;
            } else if (target.type === 'planet') {
                const planet = target.entity;
                this.engine.selectionManager.setSelectedLocation(planet.id);
                this.canvas.dispatchEvent(new CustomEvent('showradialmenu', { 
                    detail: { entity: planet, x: e.clientX, y: e.clientY } 
                }));
                return;
            } else if (target.type === 'debris') {
                const debris = target.entity;
                if (selectedShipId) {
                    const moveSuccess = this.engine.moveShipToTarget(selectedShipId, debris.id);
                    if (moveSuccess) return;
                }
            }
        }

        // If nothing was clicked, clear selection
        this.engine.selectionManager.setSelectedShip(null);
        this.engine.selectionManager.setSelectedLocation(null);
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

        const currentSelectionId = this.engine.selectionManager.selectedShipId || this.engine.selectionManager.selectedLocationId;
        if (currentSelectionId) {
            const selected = shipsUnderCursor.find(s => s.id === currentSelectionId);
            if (selected) return selected;
        }

        return shipsUnderCursor.reduce((closest, current) => {
            const dx = current.x - worldX;
            const dy = current.y - worldY;
            const distSq = dx * dx + dy * dy;
            if (!closest || distSq < closest.distSq) return { ship: current, distSq };
            return closest;
        }, null).ship;
    }
}