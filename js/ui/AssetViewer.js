import { SHIP_DATA } from '../services/GalaxyService.js';

export class AssetViewer {
    constructor(gameEngine, spriteService) {
        this.engine = gameEngine;
        this.spriteService = spriteService;
        this.isVisible = false;
        
        this.currentType = 'Fighter';
        this.currentFaction = 'Solaris';
        this.currentStyle = 'Default';
        this.hullColor = '#ff8800'; // Default Solaris Orange
        this.rotation = 0;
        this.autoRotate = true;
        this.cachedRecoloredSprite = null;
        this.lastStateKey = ''; // Initialize key
        this.createUI();
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.id = 'asset-viewer';
        this.container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 1100px;
            height: 650px;
            background: rgba(10, 15, 25, 0.95);
            border: 2px solid #00ffff;
            border-radius: 12px;
            z-index: 2000;
            display: none;
            flex-direction: column;
            color: #fff;
            font-family: 'Orbitron', sans-serif;
            box-shadow: 0 0 30px rgba(0, 255, 255, 0.2);
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 1rem;
            background: rgba(0, 255, 255, 0.1);
            border-bottom: 1px solid rgba(0, 255, 255, 0.3);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `<h2>ASSET DESIGN LAB</h2><button id="close-viewer" style="background:none; border:none; color:#ff4444; font-size:1.5rem; cursor:pointer;">&times;</button>`;
        this.container.appendChild(header);

        const main = document.createElement('div');
        main.style.cssText = `display: flex; flex: 1; overflow: hidden;`;
        
        // Sidebar Controls
        const sidebar = document.createElement('div');
        sidebar.style.cssText = `width: 250px; padding: 1.5rem; border-right: 1px solid rgba(0, 255, 255, 0.2); background: rgba(0, 0, 0, 0.3); display: flex; flex-direction: column; gap: 1rem;`;
        
        sidebar.innerHTML = `
            <div class="control-group">
                <label>SHIP TYPE</label>
                <select id="viewer-type" style="width:100%; background:#111; color:#fff; border:1px solid #444; padding:5px;"></select>
            </div>
            <div class="control-group">
                <label>FACTION</label>
                <select id="viewer-faction" style="width:100%; background:#111; color:#fff; border:1px solid #444; padding:5px;">
                    <option value="Solaris">Solaris</option>
                    <option value="Syndicate">Syndicate</option>
                    <option value="Pirate">Pirates</option>
                </select>
            </div>
            <div class="control-group">
                <label>STYLE VARIATION</label>
                <select id="viewer-style" style="width:100%; background:#111; color:#fff; border:1px solid #444; padding:5px;">
                    <option value="">Default</option>
                </select>
            </div>
            <div class="control-group">
                <label>HULL PAINT</label>
                <input type="color" id="viewer-hull-color" value="#ff8800" style="width:100%; height:30px; border:none; background:none; cursor:pointer;">
            </div>
            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1);">
            <div class="control-group">
                <label>ROTATION</label>
                <input type="range" id="viewer-rotation" min="0" max="360" value="0" style="width:100%;">
                <div style="display:flex; align-items:center; gap:5px; margin-top:5px;">
                    <input type="checkbox" id="viewer-auto-rotate" checked> <label style="font-size:0.8rem;">Auto-Rotate</label>
                </div>
            </div>
            <div id="viewer-info" style="margin-top:auto; padding:10px; background:rgba(0,0,0,0.5); border-radius:4px; font-size:0.8rem; color:#aaa;">
                <!-- Asset Info -->
            </div>
        `;
        main.appendChild(sidebar);

        // Preview Area
        const preview = document.createElement('div');
        preview.style.cssText = `flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle, #1a2533 0%, #05070a 100%); position: relative;`;
        
        this.canvas = document.createElement('canvas');
        this.canvas.width = 450;
        this.canvas.height = 450;
        this.canvas.style.cssText = `background: rgba(0,0,0,0.5); border: 1px solid rgba(0,255,255,0.2);`;
        this.ctx = this.canvas.getContext('2d');
        
        this.portraitImg = document.createElement('div');
        this.portraitImg.id = 'viewer-portrait-container';
        this.portraitImg.style.cssText = `width: 450px; height: 450px; display: none; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 0 20px rgba(0,0,0,0.5); background-size: contain; background-repeat: no-repeat; background-position: center;`;
        
        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = `display: flex; gap: 20px; align-items: center; justify-content: center; width: 100%;`;
        previewContainer.appendChild(this.canvas);
        previewContainer.appendChild(this.portraitImg);
        
        preview.appendChild(previewContainer);
        
        const zoomHint = document.createElement('div');
        zoomHint.style.cssText = `position: absolute; bottom: 10px; color: rgba(255,255,255,0.3); font-size:0.7rem;`;
        zoomHint.innerText = "PREVIEW RENDER (400x400)";
        preview.appendChild(zoomHint);

        main.appendChild(preview);
        this.container.appendChild(main);
        document.body.appendChild(this.container);

        // Populate Types
        const typeSelect = this.container.querySelector('#viewer-type');
        Object.keys(SHIP_DATA).forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.innerText = type;
            typeSelect.appendChild(opt);
        });

        // Events
        this.container.querySelector('#close-viewer').onclick = () => this.hide();
        typeSelect.onchange = (e) => { 
            this.currentType = e.target.value; 
            this.refreshStyles();
            this.updatePortrait();
            this.updateInfo(); 
        };
        this.container.querySelector('#viewer-faction').onchange = (e) => { 
            this.currentFaction = e.target.value; 
            this.refreshStyles();
            this.updatePortrait();
            this.updateInfo(); 
        };
        this.container.querySelector('#viewer-style').onchange = (e) => { 
            this.currentStyle = e.target.value; 
            this.updateInfo(); 
        };
        this.container.querySelector('#viewer-rotation').oninput = (e) => { this.rotation = parseInt(e.target.value); this.autoRotate = false; this.container.querySelector('#viewer-auto-rotate').checked = false; };
        this.container.querySelector('#viewer-auto-rotate').onchange = (e) => { this.autoRotate = e.target.checked; };
        this.container.querySelector('#viewer-hull-color').oninput = (e) => { 
            this.hullColor = e.target.value; 
            this.updatePortrait(); // Update portrait in real-time
        };

        this.refreshStyles();
        this.updatePortrait();
        this.updateInfo();
        this.startLoop();
    }

    show() {
        this.isVisible = true;
        this.container.style.display = 'flex';
    }

    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
    }

    refreshStyles() {
        const styleSelect = this.container.querySelector('#viewer-style');
        styleSelect.innerHTML = '<option value="">Default</option>';
        
        const factionData = this.spriteService.availableStyles[this.currentFaction];
        if (factionData && factionData[this.currentType]) {
            factionData[this.currentType].forEach(style => {
                if (style === 'Default') return;
                const opt = document.createElement('option');
                opt.value = style;
                
                // Human-readable labels for Tiers
                let label = style;
                if (style === 'V3_T1_Scavenged') label = 'V3 Tier 1 (Scavenged)';
                else if (style === 'V3_T2_Refined') label = 'V3 Tier 2 (Refined)';
                else if (style === 'V3_T3_Elite') label = 'V3 Tier 3 (Elite)';
                
                opt.innerText = label;
                styleSelect.appendChild(opt);
            });
        }
        this.currentStyle = '';
        styleSelect.value = '';
    }

    updatePortrait() {
        const portrait = this.spriteService.getPortrait(this.currentFaction, this.currentType);
        if (portrait && portrait.complete) {
            const coloredPortrait = this.spriteService.recolorSprite(portrait, this.currentFaction, this.hullColor);
            const container = this.container.querySelector('#viewer-portrait-container');
            container.innerHTML = '';
            coloredPortrait.style.width = '100%';
            coloredPortrait.style.height = '100%';
            coloredPortrait.style.objectFit = 'contain';
            container.appendChild(coloredPortrait);
            container.style.display = 'block';
        }
    }

    updateInfo() {
        const info = this.container.querySelector('#viewer-info');
        const data = SHIP_DATA[this.currentType];
        info.innerHTML = `
            <strong>${this.currentType}</strong><br>
            Hull: ${data.maxHull}<br>
            Speed: ${data.sublight}<br>
            Tech: ${this.currentFaction}<br>
            Style: ${this.currentStyle || 'Default'}
        `;
    }

    startLoop() {
        const loop = () => {
            if (this.isVisible) {
                if (this.autoRotate) {
                    this.rotation = (this.rotation + 0.5) % 360;
                    this.container.querySelector('#viewer-rotation').value = this.rotation;
                }
                this.render();
            }
            requestAnimationFrame(loop);
        };
        loop();
    }

    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, 450, 450);
        
        // Draw Reference Grid
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for(let i=0; i<=450; i+=50) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 450); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(450, i); ctx.stroke();
        }

        const spriteKey = this.currentStyle ? `${this.currentType}_${this.currentStyle}` : this.currentType;
        const baseSprite = this.spriteService.getSprite(this.currentFaction, spriteKey) || this.spriteService.getSprite(this.currentFaction, this.currentType);

        if (baseSprite) {
            // Only recalculate if the state has changed
            const currentState = `${this.currentFaction}-${this.currentType}-${this.currentStyle}-${this.hullColor}`;
            if (this.lastStateKey !== currentState) {
                this.cachedRecoloredSprite = this.spriteService.recolorSprite(baseSprite, this.currentFaction, this.hullColor);
                this.lastStateKey = currentState;
            }

            ctx.save();
            ctx.translate(225, 225);
            ctx.rotate(this.rotation * Math.PI / 180);
            
            // Draw Shadow
            ctx.shadowBlur = 20;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            
            const size = 250; // Larger preview
            ctx.drawImage(this.cachedRecoloredSprite, -size/2, -size/2, size, size);
            ctx.restore();
        } else {
            ctx.fillStyle = '#ff4444';
            ctx.font = '14px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(`ASSET NOT FOUND: ${this.currentFaction} ${spriteKey}`, 225, 225);
        }
    }
}
