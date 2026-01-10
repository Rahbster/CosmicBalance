export class ToastManager {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            width: 90%;
            max-width: 400px;
        `;
        document.body.appendChild(this.container);
        
        // Inject CSS for toasts
        const style = document.createElement('style');
        style.textContent = `
            .toast {
                background: #333;
                color: #fff;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 0.95rem;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s ease;
                pointer-events: auto;
                display: flex;
                align-items: center;
                gap: 12px;
                justify-content: center;
                text-align: center;
            }
            .toast.visible { opacity: 1; transform: translateY(0); }
            .toast.success { background: #2e7d32; }
            .toast.error { background: #d32f2f; }
            .toast.info { background: #0288d1; }
        `;
        document.head.appendChild(style);
    }

    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, duration);
    }
}