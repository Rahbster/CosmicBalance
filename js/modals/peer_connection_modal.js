export function showPeerConnectionModal(toastManager, config) {
    const { peerManager, getIdentity, onConnection } = config;
    const appPrefix = 'pwa';

    // 1. Inject CSS if not present
    if (!document.getElementById('peer-modal-css')) {
        const link = document.createElement('link');
        link.id = 'peer-modal-css';
        link.rel = 'stylesheet';
        link.href = 'css/peer_connection_modal.css';
        document.head.appendChild(link);
    }

    // 2. Inject HTML if not present
    if (!document.getElementById('peer-modal')) {
        const modalHTML = `
        <div id="peer-modal" class="modal">
            <div class="modal-content">
                <span id="close-peer-modal" class="close-modal">&times;</span>
                <h2>Peer Connection <button id="btn-peer-info" class="info-icon" title="How it works">ℹ️</button></h2>
                <div class="peer-controls">
                    <div id="peer-setup">
                        <div class="role-selector">
                            <button id="select-host" class="role-btn">Host</button>
                            <button id="select-joiner" class="role-btn">Joiner</button>
                        </div>
                        <div id="panel-host" class="role-panel hidden">
                            <div class="step-box">
                                <h4>Host Session</h4>
                                <button id="btn-host-session">Start Hosting</button>
                                <div id="host-share-info" class="hidden">
                                    <p>Share this ID with the Joiner:</p>
                                    <div id="host-id-display" class="code-display">------</div>
                                </div>
                            </div>
                        </div>
                        <div id="panel-join" class="role-panel hidden">
                            <div class="step-box">
                                <h4>Join Session</h4>
                                <p>Enter 6-Digit Host ID:</p>
                                <input type="text" id="joiner-id-input" class="sdp-box" placeholder="Enter Host ID" maxlength="6" style="text-align: center; font-size: 1.5rem; letter-spacing: 4px;">
                            </div>
                        </div>
                        <input type="text" id="peer-search-input" class="sdp-box hidden" placeholder="Search peers..." style="margin-bottom: 0.5rem;">
                        <div id="recent-peers-list" class="step-box hidden"></div>
                    </div>
                </div>
            </div>
        </div>
        <div id="peer-info-modal" class="modal hidden">
            <div class="modal-content">
                <span id="close-peer-info-modal" class="close-modal">&times;</span>
                <h2>How it Works</h2>
                <div class="info-content">
                    <h3>Host</h3>
                    <p>The Host initiates the session. They generate a unique ID (or use their own) which must be shared with the Joiner.</p>
                    <h3>Joiner</h3>
                    <p>The Joiner connects to a Host by entering the Host's 6-digit ID.</p>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // 3. DOM Elements
    const dom = {
        modal: document.getElementById('peer-modal'),
        closeBtn: document.getElementById('close-peer-modal'),
        infoModal: document.getElementById('peer-info-modal'),
        infoBtn: document.getElementById('btn-peer-info'),
        closeInfoBtn: document.getElementById('close-peer-info-modal'),
        selectHost: document.getElementById('select-host'),
        selectJoiner: document.getElementById('select-joiner'),
        panelHost: document.getElementById('panel-host'),
        panelJoin: document.getElementById('panel-join'),
        btnHost: document.getElementById('btn-host-session'),
        hostShareInfo: document.getElementById('host-share-info'),
        hostIdDisplay: document.getElementById('host-id-display'),
        joinInput: document.getElementById('joiner-id-input'),
        searchInput: document.getElementById('peer-search-input'),
        list: document.getElementById('recent-peers-list')
    };

    // 4. Helper Functions
    function getPeers() {
        return JSON.parse(localStorage.getItem(`${appPrefix}_peers`) || '{}');
    }

    function removePeer(guid) {
        let peers = getPeers();
        delete peers[guid];
        localStorage.setItem(`${appPrefix}_peers`, JSON.stringify(peers));
        renderPeerList(dom.selectHost.classList.contains('selected') ? 'host' : 'joiner');
    }

    function renderPeerList(role) {
        const peers = getPeers();
        const filter = dom.searchInput.value.toLowerCase();
        let html = '<h5>Recent Peers</h5>';
        
        const filtered = Object.entries(peers).filter(([, p]) => p.name.toLowerCase().includes(filter));

        if (filtered.length === 0) {
            html += '<p>No matching peers found.</p>';
        } else {
            filtered.forEach(([guid, peer]) => {
                const btn = role === 'host' 
                    ? `<button class="host-user-btn" data-guid="${guid}">Host</button>`
                    : `<button class="join-user-btn" data-guid="${guid}">Join</button>`;
                
                html += `
                    <div class="peer-item">
                        <span class="peer-name">${peer.name}</span>
                        <div class="peer-item-actions">
                            ${btn}
                            <button class="remove-peer-btn" data-guid="${guid}">&times;</button>
                        </div>
                    </div>`;
            });
        }
        dom.list.innerHTML = html;
    }

    function selectRole(role) {
        dom.selectHost.classList.toggle('selected', role === 'host');
        dom.selectJoiner.classList.toggle('selected', role !== 'host');
        dom.panelHost.classList.toggle('hidden', role !== 'host');
        dom.panelJoin.classList.toggle('hidden', role === 'host');
        dom.list.classList.remove('hidden');
        dom.searchInput.classList.remove('hidden');
        renderPeerList(role);
    }

    // 5. Connection Logic
    async function startHosting(hostId) {
        try {
            const id = await peerManager.host(hostId);
            dom.hostIdDisplay.textContent = id;
            dom.hostShareInfo.classList.remove('hidden');
            toastManager.show('Session started. Waiting for peer...', 'info');
        } catch (err) {
            toastManager.show("Hosting Error: " + err.message, 'error');
        }
    }

    async function startJoining(hostId) {
        try {
            await peerManager.join(hostId);
            closeModal();
            if (onConnection) onConnection();
        } catch (err) {
            toastManager.show("Joining Error: " + err.message, 'error');
        }
    }

    function closeModal() {
        dom.modal.classList.add('hidden');
    }

    // 6. Event Listeners
    dom.closeBtn.onclick = closeModal;
    dom.infoBtn.onclick = () => dom.infoModal.classList.remove('hidden');
    dom.closeInfoBtn.onclick = () => dom.infoModal.classList.add('hidden');
    
    dom.selectHost.onclick = () => selectRole('host');
    dom.selectJoiner.onclick = () => selectRole('joiner');
    
    dom.searchInput.oninput = () => renderPeerList(dom.selectHost.classList.contains('selected') ? 'host' : 'joiner');

    dom.btnHost.onclick = () => startHosting(null);
    
    dom.joinInput.oninput = () => {
        if (dom.joinInput.value.length === 6) startJoining(dom.joinInput.value);
    };

    dom.list.onclick = (e) => {
        const guid = e.target.dataset.guid;
        if (!guid) return;

        if (e.target.classList.contains('remove-peer-btn')) {
            if (confirm('Remove peer?')) removePeer(guid);
        } else if (e.target.classList.contains('host-user-btn')) {
            startHosting(getIdentity().guid);
        } else if (e.target.classList.contains('join-user-btn')) {
            startJoining(guid);
        }
    };

    // Close on outside click
    window.onclick = (e) => {
        if (e.target === dom.modal) closeModal();
        if (e.target === dom.infoModal) dom.infoModal.classList.add('hidden');
    };

    // Initialize
    dom.modal.classList.remove('hidden');
    selectRole('host');
}