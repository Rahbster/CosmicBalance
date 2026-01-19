export class RadialMenu {
    constructor() {
        this.container = null;
        this._injectCSS();
        this._closeHandler = null;
    }

    show(items, x, y, customRadius = null) {
        this.hide(); // Hide any existing menu

        this.container = document.createElement('div');
        this.container.id = 'radial-menu-container';
        document.body.appendChild(this.container);

        const backdrop = document.createElement('div');
        backdrop.className = 'radial-menu-backdrop';
        this.container.appendChild(backdrop);
        
        const menu = document.createElement('div');
        menu.className = 'radial-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        this.container.appendChild(menu);

        // Add a central hub for visual flair
        const hub = document.createElement('div');
        hub.className = 'radial-menu-hub';
        menu.appendChild(hub);

        const angleStep = 360 / items.length;
        const radius = customRadius || (items.length > 5 ? 110 : 90); // Increased radius for larger items

        items.forEach((item, index) => {
            const menuItem = document.createElement('div');
            menuItem.className = 'radial-menu-item';
            
            const angle = angleStep * index - 90; // -90 to start at the top
            menuItem.style.transform = `rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`;

            const content = document.createElement('div');
            content.className = 'radial-menu-item-content';
            content.innerHTML = `<span>${item.label}</span>`;
            menuItem.appendChild(content);

            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.action) item.action();
                this.hide();
            });

            menu.appendChild(menuItem);
        });

        requestAnimationFrame(() => {
            menu.classList.add('visible');
        });

        // Close menu on outside click, but allow click to pass through to canvas
        this._closeHandler = (e) => {
            if (!e.target.closest('.radial-menu-item')) {
                this.hide();
            }
        };
        // Delay adding listener to avoid closing immediately on the opening click
        setTimeout(() => {
            document.addEventListener('mousedown', this._closeHandler);
        }, 0);
    }

    hide() {
        if (this._closeHandler) {
            document.removeEventListener('mousedown', this._closeHandler);
            this._closeHandler = null;
        }
        
        const containerToRemove = this.container;
        if (containerToRemove) {
            this.container = null; // Clear reference immediately

            const menu = containerToRemove.querySelector('.radial-menu');
            if (menu) {
                menu.classList.remove('visible');
                const remove = () => {
                    if (containerToRemove.parentNode) containerToRemove.remove();
                };
                // Remove after transition to be smooth
                menu.addEventListener('transitionend', remove, { once: true });
                // Safety timeout in case transitionend doesn't fire
                setTimeout(remove, 200);
            } else {
                if (containerToRemove.parentNode) containerToRemove.remove();
            }
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
            
            .radial-menu { 
                position: absolute; 
                transform: translate(-50%, -50%) scale(0.5); 
                width: 0; 
                height: 0; 
                opacity: 0; 
                transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
                pointer-events: none; 
            }
            .radial-menu.visible { opacity: 1; transform: translate(-50%, -50%) scale(1); }

            .radial-menu-hub {
                position: absolute;
                top: 50%; left: 50%;
                width: 20px; height: 20px;
                transform: translate(-50%, -50%);
                background: var(--rm-glass-accent);
                border-radius: 50%;
                box-shadow: 0 0 20px var(--rm-cosmic-purple);
                z-index: 0;
            }

            .radial-menu-item { position: absolute; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; transform-origin: center center; transition: transform 0.1s ease-out; pointer-events: auto; }
            
            .radial-menu-item-content { 
                width: 100%; height: 100%; 
                background: var(--rm-glass-bg); 
                color: #fff; 
                border: 1px solid rgba(174, 225, 249, 0.3); 
                border-radius: 50%; 
                display: flex; align-items: center; justify-content: center; 
                cursor: pointer; 
                box-shadow: 0 4px 12px rgba(0,0,0,0.5); 
                font-family: var(--rm-font); font-size: 0.75rem; text-align: center; 
                transition: all 0.2s ease; 
                padding: 5px;
                text-shadow: 0 0 5px var(--rm-cosmic-purple);
                backdrop-filter: blur(4px);
            }
            
            .radial-menu-item:hover .radial-menu-item-content { transform: scale(1.15); background: var(--rm-cosmic-purple); border-color: var(--rm-glass-accent); box-shadow: var(--rm-glow); color: #fff; z-index: 10; }
        `;
        const style = document.createElement('style');
        style.id = 'radial-menu-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}