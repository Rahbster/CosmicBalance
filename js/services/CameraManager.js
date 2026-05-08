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
        this.onAnimationComplete = null;
        this.panStart = { x: 0, y: 0 };
        this.panEnd = { x: 0, y: 0 };
        this.zoomStart = 1;
        this.zoomEnd = 1;
    }

    stopAnimation(triggerCallback = true) {
        this.isAnimating = false;
        if (triggerCallback && this.onAnimationComplete) {
            this.onAnimationComplete();
            this.onAnimationComplete = null;
        }
    }

    centerOn(worldX, worldY, targetZoom, duration = 700, onComplete = null) {
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
        
        this.animationDuration = duration;
        this.onAnimationComplete = onComplete;
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
            if (this.onAnimationComplete) {
                const callback = this.onAnimationComplete;
                this.onAnimationComplete = null;
                callback();
            }
        }
    }

    getMinZoom() {
        const allSystems = this.engine.state.systems;
        if (allSystems.length === 0) return 0.1;

        const padding = 200;
        // Use effective radius for a more accurate bounding box
        const minX = Math.min(...allSystems.map(s => s.x - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxX = Math.max(...allSystems.map(s => s.x + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;
        const minY = Math.min(...allSystems.map(s => s.y - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxY = Math.max(...allSystems.map(s => s.y + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        const minZoomX = this.canvas.width / contentWidth;
        const minZoomY = this.canvas.height / contentHeight;
        return Math.min(minZoomX, minZoomY, 1);
    }

    constrainPanAndZoom() {
        const minZoom = this.getMinZoom();
        this.zoom = Math.max(this.zoom, minZoom);

        const constrained = this._getConstrainedPan(this.pan, this.zoom);
        this.pan.x = constrained.x;
        this.pan.y = constrained.y;
    }

    _getConstrainedPan(pan, zoom) {
        const allSystems = this.engine.state.systems;
        if (allSystems.length === 0) return pan;

        const padding = 200; // Increased padding for planets
        const minX = Math.min(...allSystems.map(s => s.x - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxX = Math.max(...allSystems.map(s => s.x + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;
        const minY = Math.min(...allSystems.map(s => s.y - this.engine.spatialService.getSystemEffectiveRadius(s))) - padding;
        const maxY = Math.max(...allSystems.map(s => s.y + this.engine.spatialService.getSystemEffectiveRadius(s))) + padding;

        // Calculate boundaries that allow the center of the viewport to reach any part of the world
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        const boundX1 = centerX - (maxX * zoom);
        const boundX2 = centerX - (minX * zoom);
        const boundY1 = centerY - (maxY * zoom);
        const boundY2 = centerY - (minY * zoom);

        const newPan = { x: pan.x, y: pan.y };

        // Clamp pan so the world center stays within the viewport's allowed range
        newPan.x = Math.max(Math.min(boundX1, boundX2), Math.min(pan.x, Math.max(boundX1, boundX2)));
        newPan.y = Math.max(Math.min(boundY1, boundY2), Math.min(pan.y, Math.max(boundY1, boundY2)));

        return newPan;
    }
}