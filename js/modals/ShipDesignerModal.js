import { LOG_CATEGORIES, LOG_LEVELS, HULLS, COMPONENTS, DEFAULT_SHIP_DESIGNS } from '../cb_constants.js';

export class ShipDesignerModal {
    constructor(engine) {
        this.engine = engine;
        this.isEditing = false;
        this.currentDesign = null;
        this.originalDesignSnapshot = null;
        
        this._injectHTML();
        this._injectCSS();

        this.modal = document.getElementById('ship-designer-modal');
        this.closeBtn = document.getElementById('close-ship-designer-modal');
        this.componentList = document.getElementById('component-list');
        this.layoutArea = document.getElementById('ship-layout-area');
        this.savedList = document.getElementById('saved-designs-list');
        this.componentColumn = document.getElementById('designer-component-column');
        this.savedDesignsColumn = document.getElementById('designer-saved-designs-column');
        this.newDesignBtn = document.getElementById('new-design-btn');

        this.closeBtn.onclick = () => this.hide();
        this.newDesignBtn.onclick = () => this.showNewDesignSelector();
        
        this._setupDragAndDrop();
        this._populateComponentCatalog();
    }

    show() {
        this.isEditing = false;
        this.currentDesign = null;
        this.originalDesignSnapshot = null;
        this.render();
        this.modal.classList.remove('hidden');
    }

    hide() {
        this.modal.classList.add('hidden');
    }

    _populateComponentCatalog() {
        this.componentList.innerHTML = '';
        Object.keys(COMPONENTS).forEach(category => {
            const categoryHeader = document.createElement('h4');
            categoryHeader.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            this.componentList.appendChild(categoryHeader);

            COMPONENTS[category].forEach(component => {
                const item = document.createElement('div');
                item.className = 'component-item';
                item.textContent = component.name;
                item.draggable = true;
                item.dataset.componentId = component.id;
                item.dataset.category = category;
                item.addEventListener('dragstart', (e) => {
                    const dragData = { id: component.id, category: category };
                    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                });
                this.componentList.appendChild(item);
            });
        });
    }

    _setupDragAndDrop() {
        this.componentColumn.addEventListener('dragover', (e) => e.preventDefault());

        this.modal.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.target.closest('#ship-layout-area')) {
                e.dataTransfer.dropEffect = 'copy';
                this.layoutArea.classList.add('drag-over');
            }
        });

        this.modal.addEventListener('dragleave', (e) => {
            if (e.target.closest('#ship-layout-area')) {
                this.layoutArea.classList.remove('drag-over');
            }
        });

        this.modal.addEventListener('drop', (e) => {
            if (e.target.closest('#ship-layout-area')) {
                this._handleComponentDrop(e);
            }
        });
    }

    render() {
        if (!this.currentDesign) {
            // STATE 1: No active design. Show only the saved designs list.
            this.componentColumn.classList.add('hidden');
            this.savedDesignsColumn.classList.remove('hidden');
            this.layoutArea.innerHTML = `<div class="stat-item"><strong>Select a design to view or create a new one.</strong></div>`;
            this._renderSavedDesigns();
            return;
        }

        if (this.isEditing) {
            // STATE 2: Editing.
            this.componentColumn.classList.remove('hidden');
            this.savedDesignsColumn.classList.add('hidden');
            this._rebuildLayoutArea(true);
        } else {
            // STATE 3: Viewing.
            this.componentColumn.classList.add('hidden');
            this.savedDesignsColumn.classList.remove('hidden');
            this._rebuildLayoutArea(false);
            this._renderSavedDesigns();
        }

        const installedList = document.getElementById('installed-components');
        if (installedList) {
            installedList.innerHTML = '<h4>Installed Components</h4>';
            this.currentDesign.components.forEach(compInfo => {
                const component = COMPONENTS[compInfo.category].find(c => c.id === compInfo.id);
                if (component) {
                    installedList.appendChild(this._createInstalledComponentElement(compInfo, component));
                }
            });
        }

        this._updateShipStats();
        
        const nameInput = document.getElementById('ship-design-name');
        if (nameInput) {
            nameInput.value = this.currentDesign.name;
            nameInput.disabled = !this.isEditing;
            if (this.isEditing) {
                nameInput.oninput = (e) => { this.currentDesign.name = e.target.value; };
            }
        }

        this._bindActionButtons();
    }

    showNewDesignSelector() {
        this.isEditing = true;
        this.layoutArea.innerHTML = `
            <div style="text-align: center;">
                <h3>Start a New Design</h3>
                <p>Select a Hull and Technology Level to begin.</p>
                <div class="designer-column">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4>1. Select Hull</h4>
                        <span id="hull-info-text" style="font-size: 0.9rem; color: #aaa;"></span>
                    </div>
                    <div id="hull-selector-list">
                        ${HULLS.map(hull => `<button class="theme-button component-item" data-hull-id="${hull.id}">${hull.name}</button>`).join('')}
                    </div>
                </div>
                <div class="designer-column">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4>2. Select Tech Level</h4>
                        <span id="tech-info-text" style="font-size: 0.9rem; color: #aaa;"></span>
                    </div>
                    <div id="tech-selector-list">
                         ${[1,2,3,4,5,6].map(n => `<button class="theme-button component-item" data-tech-level="${n}">Tech ${n}</button>`).join('')}
                    </div>
                </div>
                <div class="button-row" style="justify-content: center; margin-top: 20px;">
                    <button id="begin-design-btn" class="theme-button" disabled>Begin Design</button>
                    <button id="cancel-new-design-btn" class="theme-button" style="background-color: #555;">Cancel</button>
                </div>
            </div>
        `;

        const hullButtons = this.layoutArea.querySelectorAll('button[data-hull-id]');
        const beginBtn = document.getElementById('begin-design-btn');
        const techButtons = this.layoutArea.querySelectorAll('button[data-tech-level]');
        const hullInfo = document.getElementById('hull-info-text');
        const techInfo = document.getElementById('tech-info-text');
        const cancelBtn = document.getElementById('cancel-new-design-btn');

        let selectedHullId = null;
        let selectedTechLevel = 1;

        hullButtons.forEach(button => {
            button.onclick = () => {
                hullButtons.forEach(btn => btn.classList.remove('active-hand'));
                button.classList.add('active-hand');
                selectedHullId = button.dataset.hullId;
                const hull = HULLS.find(h => h.id === selectedHullId);
                hullInfo.textContent = `Size: ${hull.size}, Mass: ${hull.mass}`;
                beginBtn.disabled = !selectedHullId;
            };
        });

        techButtons.forEach(button => {
            button.onclick = () => {
                techButtons.forEach(btn => btn.classList.remove('active-hand'));
                button.classList.add('active-hand');
                selectedTechLevel = parseInt(button.dataset.techLevel, 10);
                techInfo.textContent = `Space per Tech Sector: ${9 + selectedTechLevel}`;
            };
        });

        beginBtn.onclick = () => {
            if (selectedHullId) {
                this.currentDesign = {
                    id: `design-${Date.now()}`,
                    name: `${HULLS.find(h => h.id === selectedHullId).name} Mk I`,
                    hull: selectedHullId,
                    techLevel: selectedTechLevel,
                    components: []
                };
                this.originalDesignSnapshot = JSON.stringify(this.currentDesign);
                this.render();
            }
        };

        cancelBtn.onclick = () => {
            this.isEditing = false;
            this.currentDesign = null;
            this.render();
        };
    }

    _renderSavedDesigns() {
        this.savedList.innerHTML = '';
        const player = this.engine.getLocalPlayer();
        const playerDesigns = player ? (player.designs || []) : [];
        const allDesigns = [...DEFAULT_SHIP_DESIGNS, ...playerDesigns];

        allDesigns.forEach(design => {
            const item = document.createElement('div');
            item.className = 'component-item theme-button';
            let deleteBtn = '';
            if (!design.id.startsWith('default-')) {
                deleteBtn = `<button class="designer-close-btn" style="font-size: 1.5rem; padding: 0 5px;" data-design-id="${design.id}">&times;</button>`;
            }
            const designInfo = `<div style="flex-grow: 1; cursor: pointer;"><strong>${design.name}</strong><br><small>${design.description || ''}</small></div>`;
            item.innerHTML = `${designInfo} ${deleteBtn}`;
            item.style.display = 'flex';
            item.style.alignItems = 'center';

            item.querySelector('div').onclick = () => {
                this.currentDesign = JSON.parse(JSON.stringify(design));
                this.originalDesignSnapshot = JSON.stringify(this.currentDesign);
                this.isEditing = false;
                this.render();
            };

            const deleteButton = item.querySelector('button.designer-close-btn');
            if (deleteButton) {
                deleteButton.onclick = (e) => {
                    e.stopPropagation();
                    this._deleteSavedDesign(design.id);
                };
            }
            this.savedList.appendChild(item);
        });
    }

    _handleComponentDrop(event) {
        event.preventDefault();
        this.layoutArea.classList.remove('drag-over');

        const rawData = event.dataTransfer.getData('text/plain');
        let data;
        try { data = JSON.parse(rawData); } catch (e) { return; }

        if (!data || !this.currentDesign) return;

        const component = COMPONENTS[data.category].find(c => c.id === data.id);
        if (component) {
            const existingComponent = this.currentDesign.components.find(c => c.id === data.id && c.category === data.category);
            if (existingComponent) {
                existingComponent.count = (existingComponent.count || 1) + 1;
                this.render();
            } else {
                const newCompInfo = { category: data.category, id: data.id, count: 1 };
                if (data.category === 'weapons') newCompInfo.arcs = [1];
                this.currentDesign.components.push(newCompInfo);
                
                if (data.category === 'weapons') {
                    this._setWeaponArcs(newCompInfo);
                } else {
                    this.render();
                }
            }
            if (window.toastManager) window.toastManager.show(`Added ${component.name}`, 'success');
        }
    }

    _updateShipStats() {
        const statsGrid = document.getElementById('ship-stats-grid');
        if (!statsGrid || !this.currentDesign) return;

        const hull = HULLS.find(h => h.id === this.currentDesign.hull);
        const techLevel = this.currentDesign.techLevel || 1;
        const totalSpace = (9 + techLevel) * Math.pow(2, hull.size - 1);

        let spaceUsed = 0;
        this.currentDesign.components.forEach(compInfo => {
            const component = COMPONENTS[compInfo.category].find(c => c.id === compInfo.id);
            if (component) {
                spaceUsed += this._calculateComponentSpace(component, compInfo, techLevel);
            }
        });
        const spaceLeft = totalSpace - spaceUsed;

        const driveCount = this.currentDesign.components.filter(c => c.category === 'drives').reduce((sum, c) => sum + c.count, 0);
        const maxAccel = driveCount * 2;
        const maxSpeed = maxAccel * 2;

        const hullSpace = this.currentDesign.components.filter(c => c.category === 'hull').reduce((sum, c) => sum + c.count, 0);
        const minHullSpace = hull.mass / 2;
        let efficiency = 1;
        if (hullSpace >= minHullSpace * 2) efficiency = 3;
        else if (hullSpace >= minHullSpace * 1.5) efficiency = 2;

        const power = this.currentDesign.components.filter(c => c.category === 'engines').reduce((sum, c) => sum + (COMPONENTS.engines.find(e => e.id === c.id)?.power || 0) * c.count, 0);

        statsGrid.innerHTML = `
            <div class="stat-item"><strong>SPACE LEFT:</strong> ${spaceLeft.toFixed(2)}</div>
            <div class="stat-item"><strong>MASS:</strong> ${hull.mass}</div>
            <div class="stat-item"><strong>TECH LEVEL:</strong> ${techLevel}</div>
            <div class="stat-item"><strong>POWER:</strong> ${power}</div>
            <div class="stat-item"><strong>MAX ACCEL:</strong> ${maxAccel}</div>
            <div class="stat-item"><strong>MAX SPEED:</strong> ${maxSpeed}</div>
            <div class="stat-item"><strong>EFFICIENCY:</strong> ${efficiency}</div>
        `;
    }

    _calculateComponentSpace(component, compInfo, techLevel) {
        if (component.techSpace) {
            return component.techSpace * (9 + techLevel) * compInfo.count;
        }
        if (compInfo.category === 'weapons') {
            const baseSpace = component.space;
            const arcBonus = component.arcBonus;
            const numArcs = compInfo.arcs ? compInfo.arcs.length : 1;
            const totalArcCost = numArcs > 1 ? baseSpace + (arcBonus * (numArcs - 1)) : baseSpace;
            return totalArcCost * compInfo.count;
        }
        return (component.space || 0) * compInfo.count;
    }

    _setWeaponArcs(compInfo) {
        const modal = document.createElement('div');
        modal.className = 'arc-selector-modal';
        let currentArcs = new Set(compInfo.arcs || [1]);

        modal.innerHTML = `
            <h3>Set Firing Arcs</h3>
            <div class="arc-selector-display">
                ${[...Array(8)].map((_, i) => `<div class="arc-segment" data-arc="${i + 1}"></div>`).join('')}
            </div>
            <div class="button-row" style="justify-content: center;">
                <button id="save-arcs-btn" class="theme-button">Save</button>
                <button id="cancel-arcs-btn" class="theme-button">Cancel</button>
            </div>
        `;
        document.body.appendChild(modal);

        const segments = modal.querySelectorAll('.arc-segment');
        const updateSegments = () => {
            segments.forEach(seg => {
                const arcNum = parseInt(seg.dataset.arc, 10);
                seg.classList.toggle('active', currentArcs.has(arcNum));
            });
        };

        segments.forEach(segment => {
            segment.addEventListener('click', () => {
                const arcNum = parseInt(segment.dataset.arc, 10);
                if (currentArcs.has(arcNum)) currentArcs.delete(arcNum);
                else currentArcs.add(arcNum);
                updateSegments();
            });
        });

        document.getElementById('save-arcs-btn').onclick = (e) => {
            e.stopPropagation();
            compInfo.arcs = Array.from(currentArcs).sort((a, b) => a - b);
            this.render();
            modal.remove();
        };
        document.getElementById('cancel-arcs-btn').onclick = (e) => {
            e.stopPropagation();
            modal.remove();
        };
        updateSegments();
    }

    _removeComponent(categoryId, componentId) {
        const componentIndex = this.currentDesign.components.findIndex(c => c.category === categoryId && c.id === componentId);
        if (componentIndex > -1) {
            const component = this.currentDesign.components[componentIndex];
            component.count--;
            if (component.count <= 0) {
                this.currentDesign.components.splice(componentIndex, 1);
            }
            this.render();
        }
    }

    _saveCurrentDesign() {
        if (!this.currentDesign) return;
        const player = this.engine.getLocalPlayer();
        if (!player) return;

        this.currentDesign.name = document.getElementById('ship-design-name').value || 'Unnamed Design';
        if (this.currentDesign.id.startsWith('default-')) {
            this.currentDesign.id = `design-${Date.now()}`;
        }

        if (!player.designs) player.designs = [];
        const existingIndex = player.designs.findIndex(d => d.id === this.currentDesign.id);
        if (existingIndex > -1) {
            player.designs[existingIndex] = this.currentDesign;
        } else {
            player.designs.push(this.currentDesign);
        }

        // Broadcast update to persist designs
        this.engine.requestPlayerUpdate({ designs: player.designs });
        if (window.toastManager) window.toastManager.show(`Design "${this.currentDesign.name}" saved!`, 'success');
        this._renderSavedDesigns();
    }

    _deleteSavedDesign(designId) {
        if (confirm('Delete this design?')) {
            const player = this.engine.getLocalPlayer();
            if (player && player.designs) {
                player.designs = player.designs.filter(d => d.id !== designId);
                this.engine.requestPlayerUpdate({ designs: player.designs });
                this._renderSavedDesigns();
            }
        }
    }

    _rebuildLayoutArea(isEditable) {
        let buttonsHTML = '';
        if (isEditable) {
            buttonsHTML = `
                <div class="button-row" style="justify-content: center; margin-top: auto;">
                    <button id="save-design-btn" class="theme-button">Save Design</button>
                    <button id="cancel-design-btn" class="theme-button" style="background-color: #555;">Cancel</button>
                </div>
            `;
        } else {
            const isDefault = this.currentDesign?.id.startsWith('default-');
            const editButtonHTML = isDefault ? '' : `<button id="edit-design-btn" class="theme-button">Edit Design</button>`;
            buttonsHTML = `
                <div class="button-row" style="justify-content: center; margin-top: auto;">
                    ${editButtonHTML}
                    <button id="copy-design-btn" class="theme-button">Copy to New</button>
                </div>
            `;
        }

        this.layoutArea.innerHTML = `
            <input type="text" id="ship-design-name" placeholder="Enter Ship Name" class="designer-input">
            <div id="ship-stats-grid" class="ship-stats-grid"></div>
            <div id="installed-components" class="designer-column">
                <h4>Installed Components</h4>
            </div>
            ${buttonsHTML}
        `;

        this._bindActionButtons();
    }

    _bindActionButtons() {
        const saveBtn = document.getElementById('save-design-btn');
        if (saveBtn) saveBtn.onclick = () => this._saveCurrentDesign();

        const cancelBtn = document.getElementById('cancel-design-btn');
        if (cancelBtn) cancelBtn.onclick = () => {
            this.isEditing = false;
            this.currentDesign = null;
            this.render();
        };

        const editBtn = document.getElementById('edit-design-btn');
        if (editBtn) editBtn.onclick = () => {
            this.isEditing = true;
            this.render();
        };

        const copyBtn = document.getElementById('copy-design-btn');
        if (copyBtn) copyBtn.onclick = () => {
            const newDesign = JSON.parse(JSON.stringify(this.currentDesign));
            newDesign.id = `design-${Date.now()}`;
            newDesign.name = `${this.currentDesign.name} (Copy)`;
            this.currentDesign = newDesign;
            this.isEditing = true;
            this.render();
        };
    }

    _createInstalledComponentElement(compInfo, component) {
        const techLevel = this.currentDesign.techLevel || 1;
        const spaceCost = this._calculateComponentSpace(component, compInfo, techLevel);

        const itemDiv = document.createElement('div');
        itemDiv.className = 'installed-component';
        itemDiv.innerHTML = `<span>${component.name} (x${compInfo.count}) - Space: ${spaceCost.toFixed(2)}</span>`;

        if (this.isEditing) {
            if (compInfo.category === 'weapons') {
                const arcBtn = document.createElement('button');
                arcBtn.textContent = 'Set Arcs';
                arcBtn.className = 'arc-selector-btn theme-button';
                arcBtn.onclick = (e) => { e.stopPropagation(); this._setWeaponArcs(compInfo); };
                itemDiv.appendChild(arcBtn);
            }

            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '&times;';
            removeBtn.className = 'remove-component-btn';
            removeBtn.onclick = (e) => { e.stopPropagation(); this._removeComponent(compInfo.category, compInfo.id); };
            itemDiv.appendChild(removeBtn);
        }
        return itemDiv;
    }

    _injectHTML() {
        if (document.getElementById('ship-designer-modal')) return;
        const html = `
            <div id="ship-designer-modal" class="modal hidden">
                <div class="modal-content" style="max-width: 95vw; height: 90vh; display: flex; flex-direction: column; padding: 0;">
                    <div class="designer-header" style="padding: 10px; border-bottom: 1px solid #444; display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="margin: 0;">Ship Designer</h2>
                        <button id="close-ship-designer-modal" class="close-modal" style="position: static;">&times;</button>
                    </div>
                    <div class="ship-designer" style="display: flex; flex-grow: 1; overflow: hidden;">
                        <div id="designer-component-column" class="designer-column hidden" style="width: 250px; border-right: 1px solid #444; padding: 10px; overflow-y: auto;">
                            <h3>Component Catalog</h3>
                            <div id="component-list"></div>
                        </div>
                        <div id="ship-layout-area" class="ship-layout-area" style="flex-grow: 1; padding: 20px; overflow-y: auto; background: rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 10px;">
                            <!-- Dynamic Content -->
                        </div>
                        <div id="designer-saved-designs-column" class="designer-column" style="width: 250px; border-left: 1px solid #444; padding: 10px; overflow-y: auto; display: flex; flex-direction: column;">
                            <h3>Saved Designs</h3>
                            <div id="saved-designs-list" style="flex-grow: 1;"></div>
                            <button id="new-design-btn" class="theme-button" style="margin-top: 10px;">New Design</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _injectCSS() {
        if (document.getElementById('ship-designer-css')) return;
        const css = `
            .component-item { background: rgba(255,255,255,0.1); padding: 8px; margin-bottom: 5px; cursor: grab; border: 1px solid transparent; border-radius: 4px; }
            .component-item:hover { border-color: var(--primary-color); background: rgba(255,255,255,0.15); }
            .ship-layout-area.drag-over { background: rgba(0, 255, 0, 0.1) !important; border: 2px dashed #0f0; }
            .active-hand { border-color: var(--primary-color); background: var(--primary-color); color: #000; }
            .ship-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 15px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; }
            .installed-component { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 5px 10px; margin-bottom: 5px; border-radius: 4px; }
            .remove-component-btn { background: none; border: none; color: #e74c3c; font-size: 1.2rem; cursor: pointer; }
            .arc-selector-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #222; padding: 20px; border: 1px solid #555; z-index: 10000; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.8); }
            .arc-selector-display { width: 200px; height: 200px; position: relative; border-radius: 50%; border: 2px solid #444; margin: 20px auto; }
            .arc-segment { position: absolute; top: 0; left: 0; width: 100%; height: 100%; clip-path: polygon(50% 50%, 50% 0, 100% 0); transform-origin: 50% 50%; cursor: pointer; background: rgba(255,255,255,0.1); transition: background 0.2s; }
            .arc-segment:hover { background: rgba(255,255,255,0.3); }
            .arc-segment.active { background: rgba(0, 255, 0, 0.5); }
            /* Rotate segments to form a circle */
            .arc-segment:nth-child(1) { transform: rotate(-22.5deg); }
            .arc-segment:nth-child(2) { transform: rotate(22.5deg); }
            .arc-segment:nth-child(3) { transform: rotate(67.5deg); }
            .arc-segment:nth-child(4) { transform: rotate(112.5deg); }
            .arc-segment:nth-child(5) { transform: rotate(157.5deg); }
            .arc-segment:nth-child(6) { transform: rotate(202.5deg); }
            .arc-segment:nth-child(7) { transform: rotate(247.5deg); }
            .arc-segment:nth-child(8) { transform: rotate(292.5deg); }
            .designer-input { width: 100%; padding: 8px; margin-bottom: 15px; background: #333; border: 1px solid #555; color: #fff; font-size: 1.1rem; }
        `;
        const style = document.createElement('style');
        style.id = 'ship-designer-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}