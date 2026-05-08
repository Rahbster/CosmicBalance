export class StellarNavigator {
    constructor(slides, carouselEl, dotNavEl, controls, options = {}) {
        this.slides    = slides;
        this.carouselEl = carouselEl;
        this.dotNavEl  = dotNavEl;
        this.controls  = controls;
        this.options   = options;
        this.slideCount = slides.length;
        this.radius    = options.radius || 220;

        // Visibility state: all slides visible by default
        this._visible  = slides.map(() => true);
        // _visiblePos is the current position within the *visible* subset
        this._visiblePos = 0;

        this.init();

        // Honour startIdx after init (find its visible position)
        if (options.startIdx !== undefined) this.goTo(options.startIdx);
    }

    // ── Computed helpers ────────────────────────────────────────────────────

    /** Returns the real slide indices that are currently visible. */
    _visibleIndices() {
        return this.slides.map((_, i) => i).filter(i => this._visible[i]);
    }

    /** Currently active real slide index. */
    get activeIdx() {
        return this._visibleIndices()[this._visiblePos] ?? 0;
    }

    /** Angle between adjacent visible slides. */
    _angleStep() {
        const count = this._visibleIndices().length || 1;
        const defaultStep = 360 / count;
        return this.options.maxAngleStep
            ? Math.min(defaultStep, this.options.maxAngleStep)
            : defaultStep;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    init() {
        this.renderSlides();
        this.renderDots();
        this.attachEvents();
        this.update();
    }

    renderSlides() {
        this.carouselEl.innerHTML = '';
        this.slideEls = [];
        for (let i = 0; i < this.slideCount; i++) {
            const slide = document.createElement('div');
            slide.className = 'stellar-slide';
            
            if (this.slides[i].html) {
                slide.innerHTML = this.slides[i].html;
            } else {
                slide.innerHTML = `
                    <div class="stellar-slide-icon">${this.slides[i].icon || '💠'}</div>
                    <div class="stellar-slide-title">${this.slides[i].title}</div>
                    <div class="stellar-slide-desc">${this.slides[i].desc || ''}</div>
                `;
            }

            this.carouselEl.appendChild(slide);
            this.slideEls.push(slide);

            // Support for click actions (important for AssetViewer and selection)
            slide.style.cursor = 'pointer';
            slide.addEventListener('click', (e) => {
                const visPos = this._visibleIndices().indexOf(i);
                if (this._visiblePos === visPos) {
                    if (this.slides[i].action) {
                        this.slides[i].action(e);
                    }
                } else if (visPos !== -1) {
                    this._goToPos(visPos);
                }
            });
        }
    }

    renderDots() {
        if (!this.dotNavEl) return;
        this.dotNavEl.innerHTML = '';
        this.dotEls = [];
        const visIdx = this._visibleIndices();
        for (let p = 0; p < visIdx.length; p++) {
            const dot = document.createElement('button');
            dot.className = 'stellar-dot';
            dot.setAttribute('aria-label', `Slide ${p + 1}`);
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                this._goToPos(p);
            });
            this.dotNavEl.appendChild(dot);
            this.dotEls.push(dot);
        }
    }

    attachEvents() {
        if (this.controls.prev) this.controls.prev.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
        if (this.controls.next) this.controls.next.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });

        this.carouselEl.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.carouselEl.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        this.carouselEl.addEventListener('touchmove',  (e) => this._onTouchMove(e),  { passive: false });
        this.carouselEl.addEventListener('touchend',   ()  => this._onTouchEnd());
    }

    // ── Visibility API ────────────────────────────────────────────────────────

    /**
     * Show or hide a slide by its real index.
     * Navigation and dots automatically adjust to the new visible set.
     */
    setSlideVisible(slideIdx, visible) {
        this._visible[slideIdx] = visible;

        // Clamp _visiblePos so it still points to a valid visible slide
        const visIdx = this._visibleIndices();
        if (visIdx.length === 0) return;
        this._visiblePos = Math.min(this._visiblePos, visIdx.length - 1);

        this.renderDots();
        this.update();
    }

    /**
     * Updates the carousel options (like radius) at runtime.
     * Useful for responsive adjustments after window resize.
     */
    recalculate(newOptions = {}) {
        this.options = { ...this.options, ...newOptions };
        if (newOptions.radius !== undefined) this.radius = newOptions.radius;
        this.update();
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    update() {
        const visIdx   = this._visibleIndices();
        const visCount = visIdx.length;
        const step     = this._angleStep();

        for (let i = 0; i < this.slideCount; i++) {
            const visPos = visIdx.indexOf(i);

            if (visPos === -1) {
                // Not in the current visible set — park it far behind
                this.slideEls[i].style.transform    = 'translateX(0px) translateZ(-9999px) rotateY(0deg)';
                this.slideEls[i].style.opacity       = '0';
                this.slideEls[i].style.pointerEvents = 'none';
                this.slideEls[i].classList.remove('active');
                continue;
            }

            // Difference from current position within the visible ring
            let diff = visPos - this._visiblePos;
            if (diff >  visCount / 2) diff -= visCount;
            if (diff < -visCount / 2) diff += visCount;

            const angle = (diff * step * Math.PI) / 180;
            const x     = Math.sin(angle) * this.radius;
            const z     = Math.cos(angle) * this.radius;
            const rotY  = diff * step;

            const isActive = visPos === this._visiblePos;
            const zOffset = isActive ? 0 : -500; // Push side panels much further back
            const scale = isActive ? 1 : 0.85;  // Scale down side panels to ensure they don't peek above/below
            this.slideEls[i].style.transform    = `translateX(${x}px) translateZ(${z + zOffset}px) rotateY(${rotY}deg) scale(${scale})`;
            this.slideEls[i].style.opacity       = isActive ? '1' : '0.4'; // Lower opacity for background panels
            this.slideEls[i].style.pointerEvents = isActive ? 'auto' : 'none';
            this.slideEls[i].classList.toggle('active', isActive);
        }

        if (this.dotEls) {
            this.dotEls.forEach((d, p) => d.classList.toggle('active', p === this._visiblePos));
        }

        if (this.options.onActive) {
            this.options.onActive(this.activeIdx, this._visiblePos, visCount);
        }
        // Backward compatibility for CB
        if (this.options.onChange) {
            this.options.onChange(this.activeIdx);
        }
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    _goToPos(pos) {
        this._visiblePos = pos;
        this.update();
    }

    /** Navigate to a slide by its real index (if visible). */
    goTo(idx) {
        const visPos = this._visibleIndices().indexOf(idx);
        if (visPos !== -1) this._visiblePos = visPos;
        this.update();
    }

    next() {
        const visCount = this._visibleIndices().length;
        if (this.options.circular === false && this._visiblePos >= visCount - 1) return;
        this._visiblePos = (this._visiblePos + 1) % visCount;
        this.update();
    }

    prev() {
        const visCount = this._visibleIndices().length;
        if (this.options.circular === false && this._visiblePos <= 0) return;
        this._visiblePos = (this._visiblePos - 1 + visCount) % visCount;
        this.update();
    }

    // ── Input handlers ────────────────────────────────────────────────────────

    _isInteractiveTarget(e) {
        if (!e.target) return false;
        return ['input', 'select', 'button', 'textarea', 'label'].includes(e.target.tagName.toLowerCase()) || 
               e.target.closest('button, input, select, textarea, .role-btn');
    }

    _onMouseDown(e) {
        if (e.button !== 0 || this._isInteractiveTarget(e)) return;
        e.preventDefault();
        this._dragStartX = e.clientX;
        this._dragging   = true;
        this._mmBound    = this._onMouseMove.bind(this);
        this._muBound    = this._onMouseUp.bind(this);
        document.addEventListener('mousemove', this._mmBound);
        document.addEventListener('mouseup',   this._muBound);
    }

    _onMouseMove(e) {
        if (!this._dragging) return;
        const dx = e.clientX - this._dragStartX;
        if (Math.abs(dx) > 50) {
            dx > 0 ? this.prev() : this.next();
            this._dragging = false;
        }
    }

    _onMouseUp() {
        this._dragging = false;
        document.removeEventListener('mousemove', this._mmBound);
        document.removeEventListener('mouseup',   this._muBound);
    }

    _onTouchStart(e) {
        if (this._isInteractiveTarget(e)) { this._ignoreTouch = true; return; }
        this._ignoreTouch = false;
        this._touchX      = e.touches[0].clientX;
        this._touchMoved  = false;
    }
    _onTouchMove(e) {
        if (this._ignoreTouch) return;
        this._touchMoved = true;
        this._touchEndX  = e.touches[0].clientX;
    }
    _onTouchEnd() {
        if (this._ignoreTouch || !this._touchMoved) return;
        const dx = this._touchEndX - this._touchX;
        if (Math.abs(dx) > 50) dx > 0 ? this.prev() : this.next();
        this._touchMoved = false;
    }

    destroy() {
        if (this._dragging) {
            document.removeEventListener('mousemove', this._mmBound);
            document.removeEventListener('mouseup',   this._muBound);
        }
    }
}