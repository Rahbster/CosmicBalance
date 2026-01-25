export class StellarNavigator {
    constructor(slides, carouselEl, dotNavEl, controls, options = {}) {
        this.slides = slides;
        this.carouselEl = carouselEl;
        this.dotNavEl = dotNavEl;
        this.controls = controls;
        this.options = options;
        this.slideCount = slides.length;
        this.activeIdx = options.startIdx || 0;
        
        const defaultStep = 360 / (this.slideCount || 1);
        this.angleStep = (this.options.maxAngleStep) 
            ? Math.min(defaultStep, this.options.maxAngleStep) 
            : defaultStep;

        if (options.radius) {
            this.radius = options.radius;
        } else if (options.slideWidth) {
            const gap = options.slideGap || 20;
            const angleRad = (this.angleStep * Math.PI) / 180;
            this.radius = (angleRad > 0.001) ? (options.slideWidth + gap) / (2 * Math.sin(angleRad / 2)) : 300;
        } else {
            this.radius = 300; 
        }
        this.init();
    }

    init() {
        this.renderSlides();
        this.renderDots();
        this.attachEvents();
        this.update();
    }

    renderSlides() {
        this.carouselEl.innerHTML = "";
        this.slideEls = [];
        for (let i = 0; i < this.slideCount; i++) {
            const slide = document.createElement("div");
            slide.className = "carousel-slide";
            slide.innerHTML = `
                <span class="slide-icon">${this.slides[i].icon}</span>
                <span class="slide-title">${this.slides[i].title}</span>
                <span class="slide-desc">${this.slides[i].desc || ''}</span>
            `;

            // Support for click actions (e.g. for commands)
            if (this.slides[i].action) {
                slide.style.cursor = 'pointer';
                slide.addEventListener('click', (e) => {
                    if (this.activeIdx === i) {
                        this.slides[i].action(e);
                    } else {
                        this.goTo(i);
                    }
                });
            }

            this.carouselEl.appendChild(slide);
            this.slideEls.push(slide);
        }
    }

    renderDots() {
        if (!this.dotNavEl) return;
        this.dotNavEl.innerHTML = "";
        this.dotEls = [];
        for (let i = 0; i < this.slideCount; i++) {
            const dot = document.createElement("button");
            dot.className = "dot";
            dot.addEventListener("click", () => this.goTo(i));
            this.dotNavEl.appendChild(dot);
            this.dotEls.push(dot);
        }
    }

    attachEvents() {
        if (this.controls.prev) this.controls.prev.addEventListener("click", () => this.prev());
        if (this.controls.next) this.controls.next.addEventListener("click", () => this.next());

        // Drag/Swipe Events
        this.carouselEl.addEventListener("mousedown", (e) => this.handleMouseDown(e));
        this.carouselEl.addEventListener("touchstart", (e) => this.handleTouchStart(e), { passive: true });
        this.carouselEl.addEventListener("touchmove", (e) => this.handleTouchMove(e), { passive: true });
        this.carouselEl.addEventListener("touchend", (e) => this.handleTouchEnd(e));
    }

    handleMouseDown(e) {
        if (e.button !== 0) return;
        e.preventDefault(); // Prevent text selection during drag
        this.dragStartX = e.clientX;
        this.dragging = true;
        
        this.handleMouseMoveBound = this.handleMouseMove.bind(this);
        this.handleMouseUpBound = this.handleMouseUp.bind(this);
        
        document.addEventListener("mousemove", this.handleMouseMoveBound);
        document.addEventListener("mouseup", this.handleMouseUpBound);
    }

    handleMouseMove(e) {
        if (!this.dragging) return;
        const dx = e.clientX - this.dragStartX;
        if (Math.abs(dx) > 50) {
            if (dx > 0) this.prev();
            else this.next();
            this.dragging = false;
        }
    }

    handleMouseUp(e) {
        this.dragging = false;
        document.removeEventListener("mousemove", this.handleMouseMoveBound);
        document.removeEventListener("mouseup", this.handleMouseUpBound);
    }

    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchMoved = false;
    }

    handleTouchMove(e) {
        this.touchMoved = true;
        this.touchEndX = e.touches[0].clientX;
    }

    handleTouchEnd(e) {
        if (!this.touchMoved) return;
        const dx = this.touchEndX - this.touchStartX;
        if (Math.abs(dx) > 50) {
            if (dx > 0) this.prev();
            else this.next();
        }
        this.touchMoved = false;
    }

    update() {
        const defaultStep = 360 / (this.slideCount || 1);
        this.angleStep = (this.options.maxAngleStep) 
            ? Math.min(defaultStep, this.options.maxAngleStep) 
            : defaultStep;
        
        for (let i = 0; i < this.slideCount; i++) {
            // Calculate shortest angular distance for wrapping
            let diff = i - this.activeIdx;
            if (diff > this.slideCount / 2) diff -= this.slideCount;
            if (diff < -this.slideCount / 2) diff += this.slideCount;

            // Calculate position on the circle
            const angle = (diff * this.angleStep * Math.PI) / 180;
            const x = Math.sin(angle) * this.radius;
            const z = Math.cos(angle) * this.radius;
            
            // Rotate slide to face outward/center relative to its position
            const rotateY = diff * this.angleStep;

            this.slideEls[i].style.transform = `translateX(${x}px) translateZ(${z}px) rotateY(${rotateY}deg)`;
            
            if (i === this.activeIdx) {
                this.slideEls[i].classList.add("active");
                this.slideEls[i].style.opacity = 1;
                this.slideEls[i].style.pointerEvents = 'auto';
            } else {
                this.slideEls[i].classList.remove("active");
                this.slideEls[i].style.opacity = 0.5;
                this.slideEls[i].style.pointerEvents = 'auto';
            }
        }

        if (this.dotEls) {
            this.dotEls.forEach((dot, i) => {
                dot.classList.toggle("active", i === this.activeIdx);
            });
        }

        if (this.options.onChange) {
            this.options.onChange(this.activeIdx);
        }
    }

    goTo(idx) {
        this.activeIdx = idx;
        this.update();
    }

    next() {
        this.activeIdx = (this.activeIdx + 1) % this.slideCount;
        this.update();
    }

    prev() {
        this.activeIdx = (this.activeIdx - 1 + this.slideCount) % this.slideCount;
        this.update();
    }

    destroy() {
        if (this.dragging) {
            document.removeEventListener("mousemove", this.handleMouseMoveBound);
            document.removeEventListener("mouseup", this.handleMouseUpBound);
        }
    }
}