export class LoggingService {
    constructor(duration = 5000) {
        this.startTime = performance.now();
        this.duration = duration;
        this.isActive = true;
    }

    log(...args) {
        if (!this.isActive) return;

        if (performance.now() - this.startTime > this.duration) {
            console.log('[DEBUG] Logging period has ended.');
            this.isActive = false;
            return;
        }
        console.log('[DEBUG]', ...args);
    }
}