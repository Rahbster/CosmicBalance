export class CameraManager {
    constructor(engine, canvas) {
        this.engine = engine;
        this.canvas = canvas;
        this.pan = { x: 0, y: 0 };
        this.zoom = 1;

        // Animation state
        this.isAnimating = false;
        this.animationStartTime = 0;
        this.animationDuration = 700; // ms
        this.panStart = { x: 0, y: 0 };
        this.panEnd = { x: 0, y: 0 };
        this.zoomStart = 1;
        this.zoomEnd = 1;
    }

    centerOn(worldX, worldY, targetZoom) {
        // Stop any manual panning by the user
        if (this.engine.interactionService) {
            this.engine.interactionService.isPanning = false;
        }
        this.canvas.style.cursor = 'default';

        // If targetZoom is not provided, use the current zoom level.
        const finalZoom = targetZoom === undefined ? this.zoom : targetZoom;

        this.panStart = { ...this.pan };
        this.zoomStart = this.zoom;

        // Calculate the IDEAL target pan to center the view
        const idealPanEnd = {
            x: this.canvas.width / 2 - worldX * finalZoom,
            y: this.canvas.height / 2 - worldY * finalZoom
        };

        // Now, get the CONSTRAINED final position and animate to that
        this.panEnd = this._getConstrainedPan(idealPanEnd, finalZoom);
        this.zoomEnd = finalZoom;
        
        this.isAnimating = true;
        this.animationStartTime = performance.now();
    }

    updateAnimation(timestamp) {
        if (!this.isAnimating) return;

        const elapsed = timestamp - this.animationStartTime;
        let progress = Math.min(elapsed / this.animationDuration, 1);

        // Ease-out function for a smoother stop
        progress = 1 - Math.pow(1 - progress, 3);

        // Interpolate pan and zoom
        this.pan.x = this.panStart.x + (this.panEnd.x - this.panStart.x) * progress;
        this.pan.y = this.panStart.y + (this.panEnd.y - this.panStart.y) * progress;
        this.zoom = this.zoomStart + (this.zoomEnd - this.zoomStart) * progress;

        if (progress >= 1) {
            this.isAnimating = false;
            // Apply constraints only at the end of the animation
            this.constrainPanAndZoom();
        }
    }

    constrainPanAndZoom() {
        const allSystems = this.engine.state.systems;
        if (allSystems.length === 0) return;

        const padding = 100;
        // Use effective radius for a more accurate bounding box
        const minX = Math.min(...allSystems.map(s => s.x - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxX = Math.max(...allSystems.map(s => s.x + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;
        const minY = Math.min(...allSystems.map(s => s.y - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxY = Math.max(...allSystems.map(s => s.y + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        const minZoomX = this.canvas.width / contentWidth;
        const minZoomY = this.canvas.height / contentHeight;
        const minZoom = Math.min(minZoomX, minZoomY, 1);
        this.zoom = Math.max(this.zoom, minZoom);

        const constrained = this._getConstrainedPan(this.pan, this.zoom);
        this.pan.x = constrained.x;
        this.pan.y = constrained.y;
    }

    _getConstrainedPan(pan, zoom) {
        const allSystems = this.engine.state.systems;
        if (allSystems.length === 0) return pan;

        const padding = 100;
        const minX = Math.min(...allSystems.map(s => s.x - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxX = Math.max(...allSystems.map(s => s.x + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;
        const minY = Math.min(...allSystems.map(s => s.y - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxY = Math.max(...allSystems.map(s => s.y + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;

        // Calculate the two potential boundary points for the pan.
        const boundX1 = this.canvas.width - (maxX * zoom);
        const boundX2 = -(minX * zoom);
        const boundY1 = this.canvas.height - (maxY * zoom);
        const boundY2 = -(minY * zoom);

        const newPan = { x: pan.x, y: pan.y };

        // The valid range is always between the min and max of the two bounds.
        // This standard clamp function works regardless of which bound is smaller.
        newPan.x = Math.max(Math.min(boundX1, boundX2), Math.min(pan.x, Math.max(boundX1, boundX2)));
        newPan.y = Math.max(Math.min(boundY1, boundY2), Math.min(pan.y, Math.max(boundY1, boundY2)));

        return newPan;
    }
}