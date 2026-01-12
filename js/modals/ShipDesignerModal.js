import { dom, appState } from '../scripts.js';
import { showToast, showConfirmationModal } from '../ui.js';
import { HULLS, COMPONENTS, DEFAULT_SHIP_DESIGNS } from '../cb_constants.js';

let isEditing = false; // Module-level state to track if we are in edit mode
let originalDesignSnapshot = null; // To track if a design has been modified

export function showShipDesigner() {
    if (document.getElementById('ship-designer-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ship-designer-overlay';
    overlay.className = 'ship-designer-overlay';
    document.body.appendChild(overlay);
    renderShipDesigner();
}

function closeShipDesigner() {
    const overlay = document.getElementById('ship-designer-overlay');
    appState.soloGameState.currentDesign = null; // Clear active design on close
    originalDesignSnapshot = null;
    isEditing = false;
    if (overlay) {
        overlay.remove();
    }
}

function renderShipDesigner() {
    const overlay = document.getElementById('ship-designer-overlay');
    overlay.innerHTML = `
        <div class="designer-header">
            <h2>Ship Designer</h2>
            <button class="designer-close-btn" onclick="closeShipDesignerFromGlobal()">&times;</button> <!-- NOSONAR -->
        </div>
        <div class="ship-designer">
            <div id="designer-component-column" class="designer-column hidden">
                <h3>Component Catalog</h3>
                <div id="component-list"></div>
            </div>
            <div id="ship-layout-area" class="ship-layout-area">
                <!-- This area will be dynamically filled -->
            </div>
            <div id="designer-saved-designs-column" class="designer-column">
                <h3>Saved Designs</h3>
                <div id="saved-designs-list"></div>
                <button id="new-design-btn" class="theme-button" style="margin-top: auto;">New Design</button>
            </div>
        </div>
    `;

    window.closeShipDesignerFromGlobal = closeShipDesigner;

    // Populate component list (it's hidden initially but ready)
    const componentList = document.getElementById('component-list');
    Object.keys(COMPONENTS).forEach(category => {
        const categoryHeader = document.createElement('h4');
        categoryHeader.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        componentList.appendChild(categoryHeader);

        COMPONENTS[category].forEach(component => {
            const item = document.createElement('div'); // Use a div instead of a button
            item.className = 'component-item'; // Remove theme-button to avoid pseudo-element interference
            item.textContent = component.name;
            item.draggable = true;
            item.dataset.componentId = component.id;
            item.dataset.category = category;
            item.addEventListener('dragstart', (e) => {
                const dragData = { id: component.id, category: category };
                // Use text/plain for broadest compatibility
                e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
            });
            componentList.appendChild(item);
        });
    });

    // Add a dragover listener to the component column as well to prevent data loss
    const componentColumn = document.getElementById('designer-component-column');
    componentColumn.addEventListener('dragover', (e) => e.preventDefault());

    overlay.addEventListener('dragover', (e) => {
        // This MUST be called to allow a drop.
        e.preventDefault();
        // Now, conditionally apply visual feedback.
        if (e.target.closest('#ship-layout-area')) {
            e.dataTransfer.dropEffect = 'copy';
            document.getElementById('ship-layout-area').classList.add('drag-over');
        }
    });

    overlay.addEventListener('dragleave', (e) => {
        if (e.target.closest('#ship-layout-area')) {
            document.getElementById('ship-layout-area').classList.remove('drag-over');
        }
    });

    overlay.addEventListener('drop', (e) => {
        if (e.target.closest('#ship-layout-area')) {
            handleComponentDrop(e);
        }
    });

    rerenderCurrentDesign(); // Initial render
}

function showNewDesignSelector() {
    isEditing = true; // Entering edit mode by starting a new design
    const layoutArea = document.getElementById('ship-layout-area');
    layoutArea.innerHTML = `
        <div style="text-align: center;">
            <h3>Start a New Design</h3>
            <p>Select a Hull and Technology Level to begin.</p>
            <div class="designer-column">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4>1. Select Hull</h4>
                    <span id="hull-info-text" style="font-size: 0.9rem; color: var(--text-light);"></span>
                </div>
                <div id="hull-selector-list">
                    ${HULLS.map(hull => `<button class="theme-button component-item" data-hull-id="${hull.id}">${hull.name}</button>`).join('')}
                </div>
            </div>
            <div class="designer-column">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h4>2. Select Tech Level</h4>
                    <span id="tech-info-text" style="font-size: 0.9rem; color: var(--text-light);"></span>
                </div>
                <div id="tech-selector-list">
                     ${[1,2,3,4,5,6].map(n => `<button class="theme-button component-item" data-tech-level="${n}">Tech ${n}</button>`).join('')}
                </div>
            </div>
            <div class="button-row" style="justify-content: center;">
                <button id="begin-design-btn" class="theme-button" disabled>Begin Design</button>
                <button id="cancel-new-design-btn" class="theme-button">Cancel</button>
            </div>
        </div>
    `;

    const hullButtons = layoutArea.querySelectorAll('button[data-hull-id]');
    const beginBtn = document.getElementById('begin-design-btn');
    const techButtons = layoutArea.querySelectorAll('button[data-tech-level]');
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
            appState.soloGameState.currentDesign = {
                id: `design-${Date.now()}`,
                name: `${HULLS.find(h => h.id === selectedHullId).name} Mk I`,
                hull: selectedHullId,
                techLevel: selectedTechLevel,
                components: []
            };
            originalDesignSnapshot = JSON.stringify(appState.soloGameState.currentDesign);
            // Don't re-render the whole designer, just the layout area for the new design.
            rerenderCurrentDesign();
        }
    };

    cancelBtn.onclick = () => {
        // Simply re-render the current state, which should be null,
        // returning to the initial selection screen.
        isEditing = false;
        originalDesignSnapshot = null;
        appState.soloGameState.currentDesign = null;
        rerenderCurrentDesign();
    };
}

function renderSavedDesigns() {
    const savedList = document.getElementById('saved-designs-list');
    if (!savedList) return;
    savedList.innerHTML = '';
    const allDesigns = [...DEFAULT_SHIP_DESIGNS, ...appState.soloGameState.shipDesigns];

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

        item.querySelector('div').onclick = () => loadDesignIntoDesigner(design);

        const deleteButton = item.querySelector('button.designer-close-btn');
        if (deleteButton) {
            deleteButton.onclick = (e) => {
                e.stopPropagation();
                deleteSavedDesign(design.id);
            };
        }
        savedList.appendChild(item);
    });
}

function loadDesignIntoDesigner(design) {
    appState.soloGameState.currentDesign = JSON.parse(JSON.stringify(design));
    originalDesignSnapshot = JSON.stringify(appState.soloGameState.currentDesign);
    isEditing = false; // Start in view-only mode
    // Now that the current design is set, re-render the UI to show the
    // view-only state.
    rerenderCurrentDesign();
}

function handleComponentDrop(event) {
    event.preventDefault(); // Crucial: Prevent browser's default drop behavior.
    document.getElementById('ship-layout-area').classList.remove('drag-over');

    const rawData = event.dataTransfer.getData('text/plain');

    let data;
    try {
        data = JSON.parse(rawData);
    } catch (e) {
        console.error("[Drop] Failed to parse dropped data. Data might be empty or invalid.", e);
        return;
    }
    if (!data || !appState.soloGameState.currentDesign) {
        console.error('[Drop] Drop failed: No dragged component data or no active design.');
        return;
    }

    // Display a toast to confirm what was dropped
    showToast(`Dropped: ${data.category} - ${data.id}`, 'info');

    const component = COMPONENTS[data.category].find(c => c.id === data.id);
    if (component) {
        const existingComponent = appState.soloGameState.currentDesign.components.find(c => c.id === data.id && c.category === data.category);
        if (existingComponent) {
            existingComponent.count = (existingComponent.count || 1) + 1;
            rerenderCurrentDesign(); // Just re-render, don't show arc selector
        } else {
            const newCompInfo = { category: data.category, id: data.id, count: 1 };
            // For weapons, default to a forward arc
            if (data.category === 'weapons') {
                newCompInfo.arcs = [1];
            }
            appState.soloGameState.currentDesign.components.push(newCompInfo);
            
            // If a weapon was just added, immediately prompt for arc selection for a better UX
            if (data.category === 'weapons') {
                setWeaponArcs(newCompInfo); // Pass the newly created object
            } else {
                rerenderCurrentDesign(); // If not a weapon, just re-render
            }
        }
    } else {
        console.error('[Drop] Could not find component in catalog for data:', data);
    }
}

function updateShipStats(design) {
    const statsGrid = document.getElementById('ship-stats-grid');
    if (!statsGrid) return; // Exit if the element doesn't exist yet
    if (!design) {
        statsGrid.innerHTML = `<div class="stat-item"><strong>Select a design to begin...</strong></div>`;
        return;
    }

    const hull = HULLS.find(h => h.id === design.hull);
    const techLevel = design.techLevel || 1;
    const totalSpace = (9 + techLevel) * Math.pow(2, hull.size - 1);

    let spaceUsed = 0;
    design.components.forEach(compInfo => {
        const component = COMPONENTS[compInfo.category].find(c => c.id === compInfo.id);
        if (component) {
            spaceUsed += calculateComponentSpace(component, compInfo, techLevel);
        }
    });
    const spaceLeft = totalSpace - spaceUsed;

    const driveCount = design.components.filter(c => c.category === 'drives').reduce((sum, c) => sum + c.count, 0);
    const maxAccel = driveCount * 2;
    const maxSpeed = maxAccel * 2;

    const hullSpace = design.components.filter(c => c.category === 'hull').reduce((sum, c) => sum + c.count, 0);
    const minHullSpace = hull.mass / 2;
    let efficiency = 1;
    if (hullSpace >= minHullSpace * 2) {
        efficiency = 3;
    } else if (hullSpace >= minHullSpace * 1.5) {
        efficiency = 2;
    }

    const power = design.components.filter(c => c.category === 'engines').reduce((sum, c) => sum + (COMPONENTS.engines.find(e => e.id === c.id)?.power || 0) * c.count, 0);
    const mass = hull.mass;

    statsGrid.innerHTML = `
        <div class="stat-item"><strong>SPACE LEFT:</strong> ${spaceLeft.toFixed(2)}</div>
        <div class="stat-item"><strong>MASS:</strong> ${mass}</div>
        <div class="stat-item"><strong>TECH LEVEL:</strong> ${techLevel}</div>
        <div class="stat-item"><strong>POWER:</strong> ${power}</div>
        <div class="stat-item"><strong>MAX ACCEL:</strong> ${maxAccel}</div>
        <div class="stat-item"><strong>MAX SPEED:</strong> ${maxSpeed}</div>
        <div class="stat-item"><strong>EFFICIENCY:</strong> ${efficiency}</div>
    `;
}

function calculateComponentSpace(component, compInfo, techLevel) {
    if (component.techSpace) {
        return component.techSpace * (9 + techLevel) * compInfo.count;
    }
    if (compInfo.category === 'weapons') {
        const baseSpace = component.space;
        const arcBonus = component.arcBonus;
        const numArcs = compInfo.arcs ? compInfo.arcs.length : 1; // Default to 1 arc if not defined
        const totalArcCost = numArcs > 1 ? baseSpace + (arcBonus * (numArcs - 1)) : baseSpace;
        return totalArcCost * compInfo.count;
    }
    return (component.space || 0) * compInfo.count;
}

function setWeaponArcs(compInfo) {
    // Create and display a custom modal for arc selection
    const modal = document.createElement('div');
    modal.className = 'arc-selector-modal';

    // Use the passed-in component info directly
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
            if (currentArcs.has(arcNum)) {
                seg.classList.add('active');
            } else {
                seg.classList.remove('active');
            }
        });
    };

    segments.forEach(segment => {
        segment.addEventListener('click', () => {
            const arcNum = parseInt(segment.dataset.arc, 10);
            if (currentArcs.has(arcNum)) {
                currentArcs.delete(arcNum);
            } else {
                currentArcs.add(arcNum);
            }
            updateSegments();
        });
    });

    document.getElementById('save-arcs-btn').onclick = (e) => {
        e.stopPropagation(); // Prevent the event from bubbling up to the drop handler
        // Directly modify the component info object that was passed in
        compInfo.arcs = Array.from(currentArcs).sort((a, b) => a - b);
        rerenderCurrentDesign();
        modal.remove();
    };

    document.getElementById('cancel-arcs-btn').onclick = (e) => {
        e.stopPropagation(); // Prevent the event from bubbling up to the drop handler
        modal.remove();
    };

    updateSegments();
}

function removeComponent(categoryId, componentId) {
    const design = appState.soloGameState.currentDesign;
    if (!design) return;

    const componentIndex = design.components.findIndex(c => c.category === categoryId && c.id === componentId);
    if (componentIndex > -1) {
        const component = design.components[componentIndex];
        component.count--;
        if (component.count <= 0) {
            design.components.splice(componentIndex, 1);
        }
        rerenderCurrentDesign();
    }
}

function saveCurrentDesign() {
    const currentDesign = appState.soloGameState.currentDesign;
    if (!currentDesign) {
        showToast('No active design to save.', 'error');
        return;
    }

    currentDesign.name = document.getElementById('ship-design-name').value || 'Unnamed Design';

    // If we are saving a modified default template, it must become a new custom design.
    if (currentDesign.id.startsWith('default-')) {
        currentDesign.id = `design-${Date.now()}`;
        showToast('Saving default template as a new custom design.', 'info');
    }

    const existingIndex = appState.soloGameState.shipDesigns.findIndex(d => d.id === currentDesign.id);
    if (existingIndex > -1) {
        appState.soloGameState.shipDesigns[existingIndex] = currentDesign;
    } else {
        appState.soloGameState.shipDesigns.push(currentDesign);
    }

    localStorage.setItem('cosmicBalanceDesigns', JSON.stringify(appState.soloGameState.shipDesigns));
    showToast(`Design "${currentDesign.name}" saved!`, 'info');
    renderSavedDesigns();
}

export function loadDesignsFromStorage() {
    const saved = localStorage.getItem('cosmicBalanceDesigns');
    return saved ? JSON.parse(saved) : [];
}

function rerenderCurrentDesign() {
    const design = appState.soloGameState.currentDesign;
    const componentColumn = document.getElementById('designer-component-column');
    const savedDesignsColumn = document.getElementById('designer-saved-designs-column');

    if (!design) {
        // STATE 1: No active design. Show only the saved designs list.
        componentColumn.classList.add('hidden');
        originalDesignSnapshot = null;
        savedDesignsColumn.classList.remove('hidden');
        document.getElementById('ship-layout-area').innerHTML = `<div class="stat-item"><strong>Select a design to view or create a new one.</strong></div>`;
        document.getElementById('new-design-btn').onclick = showNewDesignSelector;
        renderSavedDesigns();
        return;
    }

    if (isEditing) {
        // STATE 2: Editing an active design.
        componentColumn.classList.remove('hidden');
        savedDesignsColumn.classList.add('hidden');
        rebuildLayoutArea(true); // Rebuild with editing controls
    } else {
        // STATE 3: Viewing a read-only design.
        componentColumn.classList.add('hidden');
        savedDesignsColumn.classList.remove('hidden'); // Keep saved designs visible
        rebuildLayoutArea(false); // Rebuild with view-only controls
        renderSavedDesigns(); // Ensure saved designs list is up-to-date
    }

    const installedList = document.getElementById('installed-components');
    installedList.innerHTML = '<h4>Installed Components</h4>';

    design.components.forEach(compInfo => {
        const component = COMPONENTS[compInfo.category].find(c => c.id === compInfo.id);
        if (component) {
            installedList.appendChild(createInstalledComponentElement(compInfo, component, isEditing));
        }
    });
    updateShipStats(design);
    document.getElementById('ship-design-name').value = design.name;
    document.getElementById('ship-design-name').disabled = !isEditing;

    if (isEditing) {
        document.getElementById('save-design-btn').onclick = saveCurrentDesign;
        document.getElementById('cancel-design-btn').onclick = () => {
            const currentSnapshot = JSON.stringify(appState.soloGameState.currentDesign);
            const hasChanges = currentSnapshot !== originalDesignSnapshot;

            const doCancel = () => {
                appState.soloGameState.currentDesign = null;
                originalDesignSnapshot = null;
                isEditing = false;
                rerenderCurrentDesign();
            };

            if (hasChanges) {
                showConfirmationModal('Are you sure you want to cancel? All unsaved changes will be lost.', doCancel);
            } else {
                doCancel(); // No changes, just cancel without confirmation.
            }
        };
        // Update name on input for immediate feedback
        document.getElementById('ship-design-name').oninput = (e) => { design.name = e.target.value; };
    } else {
        const editBtn = document.getElementById('edit-design-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                isEditing = true;
                rerenderCurrentDesign();
            };
        }
        document.getElementById('copy-design-btn').onclick = () => {
            const sourceDesign = appState.soloGameState.currentDesign;
            if (!sourceDesign) return;

            // Create a deep copy
            const newDesign = JSON.parse(JSON.stringify(sourceDesign));

            // Modify for the new copy
            newDesign.id = `design-${Date.now()}`;
            newDesign.name = `${sourceDesign.name} (Copy)`;

            // Set the new copy as the current design
            appState.soloGameState.currentDesign = newDesign;

            // Enter edit mode
            isEditing = true;

            // Re-render the UI in edit mode with the new copy
            rerenderCurrentDesign();
        };
    }
}

function rebuildLayoutArea(isEditable) {
    const layoutArea = document.getElementById('ship-layout-area');
    if (!layoutArea) return;

    let buttonsHTML = '';
    if (isEditable) {
        buttonsHTML = `
            <div class="button-row" style="justify-content: center; margin-top: auto;">
                <button id="save-design-btn" class="theme-button">Save Design</button>
                <button id="cancel-design-btn" class="theme-button">Cancel</button>
            </div>
        `;
    } else {
        const isDefault = appState.soloGameState.currentDesign?.id.startsWith('default-');
        const editButtonHTML = isDefault ? '' : `<button id="edit-design-btn" class="theme-button">Edit Design</button>`;
        buttonsHTML = `
            <div class="button-row" style="justify-content: center; margin-top: auto;">
                ${editButtonHTML}
                <button id="copy-design-btn" class="theme-button">Copy to New</button>
            </div>
        `;
    }

    layoutArea.innerHTML = `
        <input type="text" id="ship-design-name" placeholder="Enter Ship Name" class="designer-input">
        <div id="ship-stats-grid" class="ship-stats-grid"></div>
        <div id="installed-components" class="designer-column">
            <h4>Installed Components</h4>
        </div>
        ${buttonsHTML}
    `;
}

function createInstalledComponentElement(compInfo, component, isEditable) {
    const techLevel = appState.soloGameState.currentDesign.techLevel || 1;
    const spaceCost = calculateComponentSpace(component, compInfo, techLevel);

    const itemDiv = document.createElement('div');
    itemDiv.className = 'installed-component';
    itemDiv.innerHTML = `<span>${component.name} (x${compInfo.count}) - Space: ${spaceCost.toFixed(2)}</span>`;

    if (isEditable) {
        if (compInfo.category === 'weapons') {
            const arcBtn = document.createElement('button');
            arcBtn.textContent = 'Set Arcs';
            arcBtn.className = 'arc-selector-btn theme-button';
            arcBtn.onclick = (e) => { e.stopPropagation(); setWeaponArcs(compInfo); };
            itemDiv.appendChild(arcBtn);
        }

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '&times;';
        removeBtn.className = 'remove-component-btn';
        removeBtn.onclick = (e) => { e.stopPropagation(); removeComponent(compInfo.category, compInfo.id); };
        itemDiv.appendChild(removeBtn);
    }

    return itemDiv;
}

function deleteSavedDesign(designId) {
    const designs = appState.soloGameState.shipDesigns;
    const designToDelete = designs.find(d => d.id === designId);
    if (!designToDelete) return;

    const onConfirm = () => {
        const designIndex = designs.findIndex(d => d.id === designId);
        if (designIndex > -1) {
            designs.splice(designIndex, 1);
            localStorage.setItem('cosmicBalanceDesigns', JSON.stringify(designs));
            showToast(`Design "${designToDelete.name}" deleted.`, 'info');
            renderSavedDesigns();
        }
    };

    showConfirmationModal(`Are you sure you want to delete "${designToDelete.name}"? This action cannot be undone.`, onConfirm);
}