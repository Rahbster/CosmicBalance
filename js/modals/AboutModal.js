export function showAboutModal() {
    // 1. Inject HTML if not present
    if (!document.getElementById('about-modal')) {
        const modalHTML = `
        <div id="about-modal" class="modal">
            <div class="modal-content">
                <span id="close-about-modal" class="close-modal">&times;</span>
                <h2>About Cosmic Balance</h2>
                <div class="about-content" style="max-height: 60vh; overflow-y: auto; padding-right: 10px; line-height: 1.6;">
                    <p><strong>Cosmic Balance</strong> is a real-time strategy (RTS) game of galactic conquest, playable in your browser.</p>
                    
                    <h3>Game Modes</h3>
                    <ul>
                        <li><strong>Single Player:</strong> Challenge AI Overlords to dominate the galaxy.</li>
                        <li><strong>Multiplayer:</strong> Connect directly with friends via Peer-to-Peer (WebRTC). Play cooperatively or competitively.</li>
                    </ul>

                    <h3>Multiplayer Roles</h3>
                    <ul>
                        <li><strong>Host:</strong> The player who creates the game. The game state is saved in the Host's browser. The Host generates a unique ID to share with others.</li>
                        <li><strong>Joiner:</strong> Connects to a Host using their Game ID. Joiners interact with the Host's game state in real-time.</li>
                    </ul>

                    <h3>How to Play</h3>
                    <ul>
                        <li><strong>Explore:</strong> The galaxy is hidden by the fog of war. Build <strong>Scouts</strong> to reveal neighboring star systems and enemy movements.</li>
                        <li><strong>Expand:</strong> Use <strong>Troop Transports</strong> to colonize neutral planets or capture enemy worlds. Control systems to increase your territory.</li>
                        <li><strong>Exploit:</strong> Manage your economy.
                            <ul>
                                <li><strong>IO (Credits):</strong> Used for most construction and research.</li>
                                <li><strong>Minerals:</strong> Required for advanced ships and tech.</li>
                                <li><strong>Energy:</strong> Powers your infrastructure.</li>
                                <li><strong>Scrap:</strong> Collected by Salvagers from debris fields, used for repairs.</li>
                            </ul>
                        </li>
                        <li><strong>Exterminate:</strong> Build fleets of Fighters, Frigates, and Capital Ships. Combat is automatic when hostile fleets meet.</li>
                    </ul>
                    
                    <p><em>Tip: Use the Radial Menu (Right-Click or Long Press) on ships and systems to issue context-sensitive commands like Patrol, Scout, or Colonize.</em></p>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // 2. DOM Elements
    const modal = document.getElementById('about-modal');
    const closeBtn = document.getElementById('close-about-modal');

    // 3. Helper Functions
    function closeModal() {
        modal.classList.add('hidden');
    }

    // 4. Event Listeners
    closeBtn.onclick = closeModal;
    
    // Close on outside click
    // Note: This overrides other modal window.onclick handlers while active
    window.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    // 5. Show the modal
    modal.classList.remove('hidden');
}
