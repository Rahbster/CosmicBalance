export class TechTreeModal {
    constructor(engine, getTeam) {
        this.engine = engine;
        this.getTeam = getTeam;
        this.techTreeData = null;
        this._injectHTML();
        this._injectCSS();

        this.modal = document.getElementById('tech-tree-modal');
        this.closeBtn = document.getElementById('close-tech-tree-modal');
        this.contentContainer = document.getElementById('tech-tree-content');

        this.closeBtn.onclick = () => this.hide();
        this.modal.onclick = (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        };

        // Use event delegation for research buttons
        this.contentContainer.addEventListener('click', (e) => {
            if (e.target.matches('button[data-tech-id]')) {
                const techId = e.target.dataset.techId;
                this.engine.requestResearch(techId);
                this.hide(); // Optionally close modal after starting research
            }
        });
    }

    async show() {
        if (!this.techTreeData) {
            try {
                const response = await fetch('./data/tech-tree.json');
                this.techTreeData = await response.json();
            } catch (error) {
                console.error("Failed to load tech tree data:", error);
                this.contentContainer.innerHTML = '<p>Error loading tech tree.</p>';
                this.modal.classList.remove('hidden');
                return;
            }
        }
        this.render();
        this.modal.classList.remove('hidden');
        this.engine.selectionManager.renderTechTreeProgress();
    }

    hide() {
        this.modal.classList.add('hidden');
    }

    render() {
        const player = this.engine.state.players.find(p => p.id === this.engine.getIdentity().guid);
        const myTechBase = player ? player.techBase : this.getTeam();
        const teamTechs = this.techTreeData[myTechBase];
        if (!teamTechs || !player) {
            this.contentContainer.innerHTML = '<p>No tech tree available for your faction.</p>';
            return;
        }

        let html = '<ul>';
        for (const techId in teamTechs) {
            const tech = teamTechs[techId];
            const isResearched = player.researchedTechs.includes(techId);
            const dependenciesMet = tech.dependencies.every(dep => player.researchedTechs.includes(dep));
            const canAfford = player.resources.IO >= (tech.cost.IO || 0) && player.resources.minerals >= (tech.cost.minerals || 0);
            const isResearching = player.researchQueue.some(item => item.techId === techId);

            let status = '';
            let button = '';
            if (isResearched) {
                status = '<span class="status researched">Researched</span>';
            } else if (isResearching) {
                status = '<span class="status researching">Researching...</span>';
            } else if (!dependenciesMet) {
                status = '<span class="status locked">Locked</span>';
                button = `<button disabled>Research</button>`;
            } else {
                status = '<span class="status available">Available</span>';
                button = `<button data-tech-id="${techId}" ${!canAfford ? 'disabled' : ''}>Research</button>`;
            }

            html += `
                <li class="tech-item ${isResearched ? 'researched' : ''} ${!dependenciesMet ? 'locked' : ''}">
                    <div class="tech-info">
                        <h4>${tech.name} ${status}</h4>
                        <p>${tech.description}</p>
                        <small>Cost: ${tech.cost.IO || 0} IO, ${tech.cost.minerals || 0} Minerals | Time: ${tech.researchTime / 1000}s</small>
                        ${tech.dependencies.length > 0 ? `<small>Requires: ${tech.dependencies.map(d => teamTechs[d].name).join(', ')}</small>` : ''}
                    </div>
                    <div class="tech-actions">
                        ${button}
                    </div>
                </li>
            `;
        }
        html += '</ul>';
        this.contentContainer.innerHTML = html;
    }

    _injectHTML() {
        if (document.getElementById('tech-tree-modal')) return;
        const html = `
            <div id="tech-tree-modal" class="modal hidden">
                <div class="modal-content">
                    <span id="close-tech-tree-modal" class="close-modal">&times;</span>
                    <h2>Technology Tree</h2>
                    <div id="research-queue-container"></div>
                    <div id="tech-tree-content"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _injectCSS() {
        if (document.getElementById('tech-tree-css')) return;
        const css = `
            #tech-tree-modal .modal-content { max-width: 800px; }
            #tech-tree-content ul { list-style: none; padding: 0; }
            .tech-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border-color); }
            .tech-item.locked { opacity: 0.6; }
            .tech-item.researched .tech-info h4 { color: var(--primary-color); }
            .tech-info h4 { margin: 0 0 0.25rem 0; }
            .tech-info p { margin: 0 0 0.5rem 0; font-size: 0.9rem; }
            .tech-info small { color: #888; display: block; }
            .status { font-size: 0.8rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }
            .status.researched { background-color: #28a745; color: white; }
            .status.researching { background-color: #007bff; color: white; }
            .status.locked { background-color: #6c757d; color: white; }
            .status.available { background-color: #ffc107; color: black; }
        `;
        const style = document.createElement('style');
        style.id = 'tech-tree-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}