export class GameStatusModal {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.lastMouseX = null;
        this.currentHistory = null;
        this._injectHTML();
        this._injectCSS();

        this.modal = document.getElementById('game-status-modal');
        this.closeBtn = document.getElementById('close-game-status-modal');
        this.generateBtn = document.getElementById('btn-generate-report');
        this.copyBtn = document.getElementById('btn-copy-report');
        this.copyHistoryBtn = document.getElementById('btn-copy-history');
        this.pauseBtn = document.getElementById('btn-pause-game');
        this.reportArea = document.getElementById('ai-report-area');
        this.statusInfo = document.getElementById('game-status-info');
        this.debugAiCheckbox = document.getElementById('chk-debug-ai-resources');

        this.closeBtn.onclick = () => this.hide();
        this.generateBtn.onclick = () => this.generateReport();
        this.copyBtn.onclick = () => this.copyReport();
        this.copyHistoryBtn.onclick = () => this.copyHistory();

        if (this.pauseBtn) {
            this.pauseBtn.onclick = () => {
                if (this.engine) {
                    this.engine.togglePause();
                    this.updatePauseButton();
                } else {
                    console.error("[GameStatusModal] Engine instance not found!");
                }
            };
        }

        if (this.debugAiCheckbox) {
            this.debugAiCheckbox.onchange = (e) => {
                if (this.engine) this.engine.setAIDebugMode(e.target.checked);
            };
        }

        this.modal.onclick = (e) => {
            if (e.target === this.modal) this.hide();
        };
    }

    show() {
        this.lastMouseX = null;
        this.updateStatus();
        this.currentHistory = this.engine.reportHistory;
        this.updatePauseButton();
        if (this.debugAiCheckbox && this.engine) {
            this.debugAiCheckbox.checked = this.engine.aiDebugMode;
        }
        
        this.renderGraph();
        this.modal.classList.remove('hidden');
    }

    updatePauseButton() {
        if (this.pauseBtn && this.engine) {
            this.pauseBtn.textContent = this.engine.paused ? "Resume Game" : "Pause Game";
            this.pauseBtn.style.backgroundColor = this.engine.paused ? "#27ae60" : "#e67e22";
        }
    }

    hide() {
        this.modal.classList.add('hidden');
    }

    update(report, history) {
        this.updateStatus();
        this.currentHistory = history || report.history;
        this.renderGraph(this.lastMouseX, this.currentHistory);
    }

    updateStatus() {
        if (!this.engine) return;
        
        // Use engine's elapsed time if available, otherwise fallback
        const secondsTotal = Math.floor((this.engine.elapsedTime || 0) / 1000);
        const hours = Math.floor(secondsTotal / 3600);
        const minutes = Math.floor((secondsTotal % 3600) / 60);
        const seconds = secondsTotal % 60;
        
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const playerCount = this.engine.state.players.length;
        const aiCount = this.engine.state.players.filter(p => p.isAI).length;
        
        // Generate Planet Breakdown HTML
        let planetRows = '';
        this.engine.state.players.forEach(p => {
            const myPlanets = this.engine.state.systems.flatMap(sys => sys.planets.filter(pl => pl.owner === p.id));
            const counts = { Terran: 0, Industrial: 0, Mining: 0, Farming: 0 };
            myPlanets.forEach(pl => {
                if (counts[pl.type] !== undefined) counts[pl.type]++;
            });
            
            planetRows += `
                <tr>
                    <td style="color: ${p.color}; padding: 4px;">${p.factionName}</td>
                    <td style="text-align: center;">${counts.Terran}</td>
                    <td style="text-align: center;">${counts.Industrial}</td>
                    <td style="text-align: center;">${counts.Mining}</td>
                    <td style="text-align: center;">${counts.Farming}</td>
                    <td style="text-align: center;"><strong>${myPlanets.length}</strong></td>
                </tr>
            `;
        });

        this.statusInfo.innerHTML = `
            <div style="display: flex; justify-content: space-around; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 4px;">
                <span><strong>Game Time:</strong> ${timeString}</span>
                <span><strong>Total Players:</strong> ${playerCount}</span>
                <span><strong>AI Bots:</strong> ${aiCount}</span>
                <span><strong>Reports:</strong> ${this.engine.reportHistory ? this.engine.reportHistory.length : 0}</span>
            </div>
            <div style="margin-top: 15px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 4px;">
                <h4 style="margin-top: 0; margin-bottom: 10px;">Planet Control Breakdown</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 1px solid #444;">
                            <th style="text-align: left; padding: 4px;">Faction</th>
                            <th>Terran</th>
                            <th>Ind.</th>
                            <th>Mining</th>
                            <th>Farm</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${planetRows}
                    </tbody>
                </table>
            </div>
        `;
    }

    generateReport() {
        if (!this.engine) return;
        const report = this.engine.generateAIReport();
        this.reportArea.value = JSON.stringify(report, null, 2);
    }

    async copyReport() {
        if (!this.reportArea.value) return;
        try {
            await navigator.clipboard.writeText(this.reportArea.value);
            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = "Copied!";
            setTimeout(() => this.copyBtn.textContent = originalText, 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert("Failed to copy to clipboard.");
        }
    }

    async copyHistory() {
        if (!this.engine || !this.engine.reportHistory) return;
        try {
            await navigator.clipboard.writeText(JSON.stringify(this.engine.reportHistory, null, 2));
            const originalText = this.copyHistoryBtn.textContent;
            this.copyHistoryBtn.textContent = "Copied!";
            setTimeout(() => this.copyHistoryBtn.textContent = originalText, 2000);
        } catch (err) {
            console.error('Failed to copy history: ', err);
            alert("Failed to copy history to clipboard.");
        }
    }

    renderGraph(mouseX, historyOverride = null) {
        const canvas = document.getElementById('resource-graph');
        const history = historyOverride || this.currentHistory || this.engine.reportHistory;
        if (!canvas || !history || history.length < 2) return;
        
        // Resize canvas to fit container
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = 250;

        // Update mouse tracking if argument provided
        if (mouseX !== undefined) {
            this.lastMouseX = mouseX;
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Add listeners once
        if (!canvas.dataset.hasListeners) {
            canvas.addEventListener('mousemove', (e) => {
                const rect = canvas.getBoundingClientRect();
                this.renderGraph(e.clientX - rect.left);
            });
            canvas.addEventListener('mouseleave', () => {
                this.renderGraph(null);
            });
            canvas.dataset.hasListeners = 'true';
        }
        
        const padding = 40;
        const graphWidth = canvas.width - padding * 2;
        const graphHeight = canvas.height - padding * 2;

        // Prepare Data
        const players = {};
        let maxVal = 0;
        let minTime = history[0].gameTimeSeconds;
        let maxTime = history[history.length - 1].gameTimeSeconds;

        history.forEach(report => {
            const reportPlayers = report.players || report.aiPlayers || [];
            reportPlayers.forEach(p => {
                if (!players[p.id]) {
                    const playerState = this.engine.state.players.find(pl => pl.id === p.id);
                    players[p.id] = { 
                        name: p.factionName, 
                        color: playerState ? playerState.color : '#fff', 
                        data: [] 
                    };
                }
                const res = p.totalResources;
                // Sum of all resources as a simple metric for "Total Gathered"
                const total = (res.IO||0) + (res.minerals||0) + (res.energy||0) + (res.food||0) + (res.scrap||0);
                if (total > maxVal) maxVal = total;
                players[p.id].data.push({ time: report.gameTimeSeconds, value: total });
            });
        });

        // Draw Axes
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw Lines
        Object.values(players).forEach(player => {
            ctx.strokeStyle = player.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            player.data.forEach((point, i) => {
                const x = padding + ((point.time - minTime) / (maxTime - minTime)) * graphWidth;
                const y = (canvas.height - padding) - (point.value / maxVal) * graphHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });

        // Draw Tooltip
        if (this.lastMouseX !== null && this.lastMouseX >= padding && this.lastMouseX <= canvas.width - padding) {
            const timeRatio = (this.lastMouseX - padding) / graphWidth;
            const hoverTime = minTime + timeRatio * (maxTime - minTime);
            
            // Find closest report
            const closestReport = history.reduce((prev, curr) => 
                Math.abs(curr.gameTimeSeconds - hoverTime) < Math.abs(prev.gameTimeSeconds - hoverTime) ? curr : prev
            );

            const x = padding + ((closestReport.gameTimeSeconds - minTime) / (maxTime - minTime)) * graphWidth;

            // Draw vertical line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, canvas.height - padding);
            ctx.stroke();
            ctx.setLineDash([]);

            // Sort players by value at this timestamp for the tooltip
            const sortedPlayers = Object.values(players).map(p => {
                const val = p.data.find(d => d.time === closestReport.gameTimeSeconds)?.value || 0;
                return { ...p, currentValue: val };
            }).sort((a, b) => b.currentValue - a.currentValue);

            // Draw Tooltip Box
            const boxWidth = 220;
            const lineHeight = 18;
            const headerHeight = 25;
            const boxHeight = headerHeight + (sortedPlayers.length * lineHeight);

            const tooltipX = x < canvas.width / 2 ? x + 10 : x - (boxWidth + 10);
            const tooltipY = padding;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.strokeStyle = '#00f2ff';
            ctx.lineWidth = 1;
            ctx.fillRect(tooltipX, tooltipY, boxWidth, boxHeight);
            ctx.strokeRect(tooltipX, tooltipY, boxWidth, boxHeight);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(`Time: ${Math.floor(closestReport.gameTimeSeconds / 60)}m ${closestReport.gameTimeSeconds % 60}s`, tooltipX + 10, tooltipY + 18);

            ctx.font = '14px monospace';
            sortedPlayers.forEach((p, i) => {
                ctx.fillStyle = p.color;
                ctx.fillText(`${p.name}: ${Math.floor(p.currentValue)}`, tooltipX + 10, tooltipY + headerHeight + 12 + (i * lineHeight));
            });
        }
    }

    _injectHTML() {
        if (document.getElementById('game-status-modal')) return;
        const html = `
            <div id="game-status-modal" class="modal hidden">
                <div class="modal-content">
                    <span id="close-game-status-modal" class="close-modal">&times;</span>
                    <h2>Game Status & AI Report</h2>
                    <div id="game-status-info" style="margin-bottom: 15px;"></div>
                    
                    <div id="graph-container" style="margin-bottom: 15px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px; border: 1px solid #333;">
                        <h4 style="margin-top: 0; color: #ccc; font-size: 0.9rem;">Total Resources Over Time</h4>
                        <canvas id="resource-graph" style="width: 100%; height: 200px;"></canvas>
                    </div>
                    
                    <div style="margin-bottom: 15px; padding: 10px; background: rgba(200, 50, 50, 0.1); border: 1px solid rgba(200, 50, 50, 0.3); border-radius: 4px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #ff8888;">
                            <input type="checkbox" id="chk-debug-ai-resources">
                            <strong>DEBUG: Infinite AI Resources</strong>
                        </label>
                        <small style="color: #aaa; margin-left: 26px;">Gives all AI players unlimited resources to test late-game behavior.</small>
                    </div>

                    <div class="report-controls" style="margin-bottom: 10px; display: flex; gap: 10px;">
                        <button id="btn-generate-report" class="theme-button">Generate AI Report</button>
                        <button id="btn-copy-report" class="theme-button">Copy to Clipboard</button>
                        <button id="btn-copy-history" class="theme-button">Copy Full History</button>
                        <button id="btn-pause-game" class="theme-button" style="background-color: #e67e22;">Pause Game</button>
                    </div>
                    <textarea id="ai-report-area" rows="15" style="width: 100%; font-family: monospace; background: #111; color: #0f0; border: 1px solid #333; padding: 10px; resize: vertical;" readonly placeholder="Click 'Generate AI Report' to view statistics..."></textarea>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    _injectCSS() {
        if (document.getElementById('game-status-css')) return;
        const css = `
            #game-status-modal .modal-content { max-width: 800px; width: 90%; }
        `;
        const style = document.createElement('style');
        style.id = 'game-status-css';
        style.textContent = css;
        document.head.appendChild(style);
    }
}