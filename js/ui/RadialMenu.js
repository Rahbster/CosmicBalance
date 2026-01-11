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

        const angleStep = 360 / items.length;
        const radius = customRadius || (items.length > 5 ? 90 : 75); // Use custom radius if provided

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
            #radial-menu-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 5000; pointer-events: none; }
            .radial-menu-backdrop { width: 100%; height: 100%; background: rgba(0,0,0,0.05); backdrop-filter: blur(1px); pointer-events: none; }
            .radial-menu { position: absolute; transform: translate(-50%, -50%) scale(0.8); width: 1px; height: 1px; opacity: 0; transition: all 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: none; }
            .radial-menu.visible { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            .radial-menu-item { position: absolute; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; transform-origin: center center; transition: transform 0.1s ease-out; pointer-events: auto; }
            .radial-menu-item-content { width: 100%; height: 100%; background: var(--surface-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: var(--shadow); font-size: 0.75rem; text-align: center; transition: all 0.15s ease; padding: 4px; }
            .radial-menu-item:hover .radial-menu-item-content { transform: scale(1.1); background: var(--primary-color); color: white; border-color: var(--primary-color); }
        `;
        const style = document.createElement('style');
        style.id = 'radial-menu-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}