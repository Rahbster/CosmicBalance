export class PerformanceMonitor {
    constructor() {
        this.enabled = false;
        this.metrics = {};
        this.history = {};
        this.historyLength = 60; // Keep 60 frames of history
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    start(label) {
        if (!this.enabled) return;
        if (!this.metrics[label]) {
            this.metrics[label] = { start: 0, total: 0, count: 0, max: 0 };
        }
        this.metrics[label].start = performance.now();
    }

    end(label) {
        if (!this.enabled) return;
        if (this.metrics[label] && this.metrics[label].start > 0) {
            const duration = performance.now() - this.metrics[label].start;
            this.metrics[label].total += duration;
            this.metrics[label].count++;
            this.metrics[label].max = Math.max(this.metrics[label].max, duration);
            this.metrics[label].start = 0;
        }
    }

    snapshot() {
        const snapshot = {};
        for (const [label, data] of Object.entries(this.metrics)) {
            const avg = data.count > 0 ? data.total / data.count : 0;
            snapshot[label] = { avg, max: data.max, total: data.total };
            
            // Reset for next frame/interval
            data.total = 0;
            data.count = 0;
            data.max = 0;

            // Store history
            if (!this.history[label]) this.history[label] = [];
            this.history[label].push(avg);
            if (this.history[label].length > this.historyLength) {
                this.history[label].shift();
            }
        }
        return snapshot;
    }

    getHistory(label) {
        return this.history[label] || [];
    }
}