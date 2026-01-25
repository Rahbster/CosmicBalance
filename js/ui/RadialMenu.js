import { StellarNavigator } from './StellarNavigator.js';

export class RadialMenu {
    constructor() {
        this.container = null;
        this._injectCSS();
        this._closeHandler = null;
        this.navigator = null;
    }

    show(items, x, y, customRadius = null) {
        this.hide(); // Hide any existing menu

        if (items && items.length === 1) {
            if (items[0].action) items[0].action();
            return;
        }

        this.container = document.createElement('div');
        this.container.id = 'radial-menu-container';
        document.body.appendChild(this.container);

        const backdrop = document.createElement('div');
        backdrop.className = 'radial-menu-backdrop';
        this.container.appendChild(backdrop);
        
        // Wrapper to position the carousel at x,y
        const wrapper = document.createElement('div');
        wrapper.className = 'radial-menu-navigator-wrapper';
        wrapper.style.left = `${x}px`;
        wrapper.style.top = `${y}px`;
        this.container.appendChild(wrapper);

        const carouselEl = document.createElement('div');
        carouselEl.className = 'stellar-carousel';
        wrapper.appendChild(carouselEl);

        // Convert menu items to slides
        const slides = items.map(item => ({
            title: item.label,
            icon: item.icon || '💠',
            desc: '',
            action: (e) => {
                if (item.action) item.action(e);
                this.hide();
            }
        }));

        // Controls (hidden/unused for radial context)
        const controls = {}; 

        // Initialize StellarNavigator
        // Use a radius suitable for the menu
        const radius = customRadius || 140; 
        
        this.navigator = new StellarNavigator(slides, carouselEl, null, controls, { radius: radius, maxAngleStep: 45 });

        // Close menu on outside click, but allow click to pass through to canvas
        this._closeHandler = (e) => {
            if (!e.target.closest('.carousel-slide') && !e.target.closest('.radial-menu-navigator-wrapper')) {
                this.hide();
            }
        };
        // Delay adding listener to avoid closing immediately on the opening click
        setTimeout(() => {
            document.addEventListener('mousedown', this._closeHandler);
            document.addEventListener('touchstart', this._closeHandler);
        }, 0);
    }

    hide() {
        if (this._closeHandler) {
            document.removeEventListener('mousedown', this._closeHandler);
            document.removeEventListener('touchstart', this._closeHandler);
            this._closeHandler = null;
        }
        
        const containerToRemove = this.container;
        if (containerToRemove) {
            if (this.navigator) {
                this.navigator.destroy();
                this.navigator = null;
            }
            this.container = null; // Clear reference immediately
            this.navigator = null;
            if (containerToRemove.parentNode) containerToRemove.remove();
        }
    }

    _injectCSS() {
        if (document.getElementById('radial-menu-css')) return;
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap');

            :root {
                --rm-glass-bg: rgba(20, 30, 50, 0.85);
                --rm-glass-accent: #aee1f9;
                --rm-cosmic-purple: #6c3fd1;
                --rm-glow: 0 0 16px var(--rm-glass-accent), 0 0 32px var(--rm-cosmic-purple);
                --rm-font: "Orbitron", Arial, sans-serif;
            }

            #radial-menu-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 5000; pointer-events: none; }
            .radial-menu-backdrop { width: 100%; height: 100%; background: rgba(0,0,0,0.1); backdrop-filter: blur(2px); pointer-events: auto; }
            
            .radial-menu-navigator-wrapper {
                position: absolute;
                width: 0; 
                height: 0; 
                perspective: 800px;
                z-index: 5001;
                pointer-events: none;
            }

            .stellar-carousel {
                position: relative;
                width: 0; height: 0;
                transform-style: preserve-3d;
                transition: transform 0.5s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #radial-menu-container .carousel-slide {
                position: absolute;
                width: 110px; height: 90px;
                background: var(--rm-glass-bg); 
                border: 1px solid rgba(174, 225, 249, 0.3); 
                border-radius: 12px;
                box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(5px);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 5px;
                transition: all 0.3s ease;
                cursor: pointer; 
                pointer-events: auto;
                user-select: none;
                backface-visibility: hidden;
            }

            #radial-menu-container .carousel-slide.active {
                background: rgba(108, 63, 209, 0.7);
                border-color: var(--rm-glass-accent);
                box-shadow: var(--rm-glow);
                z-index: 100;
                transform: scale(1.1);
            }

            #radial-menu-container .slide-icon { font-size: 1.8rem; margin-bottom: 5px; filter: drop-shadow(0 0 5px var(--rm-cosmic-purple)); }
            #radial-menu-container .slide-title { font-size: 0.85rem; font-weight: bold; color: #fff; font-family: var(--rm-font); text-shadow: 0 0 5px var(--rm-cosmic-purple); }
            #radial-menu-container .slide-desc { display: none; }
        `;
        const style = document.createElement('style');
        style.id = 'radial-menu-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}