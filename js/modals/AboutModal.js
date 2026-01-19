import { StellarNavigator } from '../ui/StellarNavigator.js';

const SLIDES = [
    { title: "Explore", icon: "🔍", desc: "Scout the galaxy to reveal star systems and resources." },
    { title: "Expand", icon: "🌱", desc: "Colonize planets and grow your territory." },
    { title: "Exploit", icon: "⛏️", desc: "Gather IO, Minerals, Energy, and Scrap to fuel your empire." },
    { title: "Exterminate", icon: "⚔️", desc: "Build fleets and conquer your enemies." },
    { title: "Multiplayer", icon: "🌐", desc: "Host or join P2P games with friends." },
    { title: "Tactical", icon: "🎯", desc: "Micro-manage ships in real-time tactical combat." },
    { title: "Design", icon: "🛠️", desc: "Create custom ship designs to counter your foes." }
];

let navigatorInstance = null;

export function showAboutModal() {
    _injectCSS();
    // 1. Inject HTML if not present
    if (!document.getElementById('about-modal')) {
        const modalHTML = `
        <div id="about-modal" class="modal">
            <div class="modal-content">
                <span id="close-about-modal" class="close-modal">&times;</span>
                <h2 style="text-align:center; margin-bottom: 20px; font-family: 'Orbitron', sans-serif; color: #aee1f9; text-shadow: 0 0 10px #6c3fd1;">Cosmic Balance</h2>
                
                <div id="carousel-container">
                    <div id="stellar-carousel"></div>
                    
                    <div id="carousel-controls">
                        <button class="nav-btn" id="prev-btn">‹</button>
                        <button class="nav-btn" id="next-btn">›</button>
                    </div>
                    <div id="dot-nav"></div>
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

    // 6. Initialize Navigator
    if (!navigatorInstance) {
        const carouselEl = document.getElementById("stellar-carousel");
        const dotNavEl = document.getElementById("dot-nav");
        const prevBtn = document.getElementById("prev-btn");
        const nextBtn = document.getElementById("next-btn");
        
        if (carouselEl) {
             navigatorInstance = new StellarNavigator(SLIDES, carouselEl, dotNavEl, { prev: prevBtn, next: nextBtn });
        }
    } else {
        navigatorInstance.update();
    }
}

function _injectCSS() {
    if (document.getElementById('about-modal-css')) return;
    const css = `
        #about-modal .modal-content { width: 90vw; max-width: 900px; height: 80vh; background: linear-gradient(135deg, #0a1a2f 0%, #1a2a4f 100%); color: #fff; overflow: hidden; display: flex; flex-direction: column; border: 1px solid #aee1f9; box-shadow: 0 0 30px rgba(108, 63, 209, 0.5); }
        #carousel-container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; perspective: 1000px; overflow: hidden; position: relative; }
        #stellar-carousel { position: relative; width: 100%; height: 300px; transform-style: preserve-3d; transition: transform 0.5s; display: flex; align-items: center; justify-content: center; }
        .carousel-slide { position: absolute; width: 240px; height: 180px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(174, 225, 249, 0.3); border-radius: 16px; box-shadow: 0 0 15px rgba(0, 0, 0, 0.5); backdrop-filter: blur(5px); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 15px; transition: all 0.5s ease; }
        .carousel-slide.active { background: rgba(255, 255, 255, 0.1); border-color: #aee1f9; box-shadow: 0 0 30px rgba(174, 225, 249, 0.4); z-index: 10; transform: scale(1.1); }
        .slide-icon { font-size: 3rem; margin-bottom: 10px; filter: drop-shadow(0 0 5px #6c3fd1); }
        .slide-title { font-size: 1.5rem; font-weight: bold; color: #aee1f9; margin-bottom: 5px; font-family: "Orbitron", sans-serif; text-shadow: 0 0 5px #6c3fd1; }
        .slide-desc { font-size: 0.9rem; color: #ddd; line-height: 1.4; }
        #carousel-controls { margin-top: 20px; display: flex; gap: 20px; z-index: 20; }
        .nav-btn { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
        .nav-btn:hover { background: rgba(255, 255, 255, 0.3); transform: scale(1.1); box-shadow: 0 0 10px #aee1f9; }
        #dot-nav { display: flex; gap: 10px; margin-top: 15px; z-index: 20; }
        .dot { width: 12px; height: 12px; min-width: 12px; padding: 0; border-radius: 50%; background: rgba(255, 255, 255, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer; transition: all 0.2s; flex-shrink: 0; }
        .dot.active { background: #aee1f9; transform: scale(1.3); box-shadow: 0 0 5px #aee1f9; }
    `;
    const style = document.createElement('style');
    style.id = 'about-modal-css';
    style.textContent = css;
    document.head.appendChild(style);
}
