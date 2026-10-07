// ============================================================
// PEEK RATING COMPONENT
// Star resolution rating with hover lift, magnify, pop scale, and tooltips
// ============================================================

class PeekRating {
  constructor(container, options = {}) {
    this.container = container;
    this.defaultValue = options.defaultValue || 0;
    this.count = options.count || 5;
    this.labels = options.labels || ['Poor', 'Fair', 'Good', 'Great', 'Superb'];
    this.activeColor = options.activeColor || '#f5b400';
    this.idleColor = options.idleColor || '#E2E8F0';
    this.size = options.size || 32;
    this.lift = options.lift || 7;
    this.magnify = options.magnify || 1.15;
    this.popScale = options.popScale || 1.3;
    this.showTip = options.showTip !== false;
    this.allowClear = options.allowClear !== false;
    this.onChange = options.onChange || (() => {});

    this.currentValue = this.defaultValue;
    this.hoverValue = 0;
    this.element = null;
    this.init();
  }

  init() {
    this.element = document.createElement('div');
    this.element.className = 'peek-rating-container';

    this.element.innerHTML = `
      <div style="font-size:15px;font-weight:700;color:var(--tx-primary);">How was your resolution experience?</div>
      <div class="peek-rating-stars"></div>
      ${this.showTip ? `<div class="peek-rating-tip">Rate to help us improve</div>` : ''}
    `;

    const starsWrap = this.element.querySelector('.peek-rating-stars');

    for (let i = 1; i <= this.count; i++) {
      const star = document.createElement('button');
      star.className = 'peek-star-btn';
      star.innerHTML = '★';
      star.dataset.val = i;

      star.addEventListener('mouseenter', () => this.onHover(i));
      star.addEventListener('mouseleave', () => this.onHover(0));
      star.addEventListener('click', () => this.onClick(i));

      starsWrap.appendChild(star);
    }

    this.container.appendChild(this.element);
    this.render();
  }

  onHover(val) {
    this.hoverValue = val;
    this.render();
  }

  onClick(val) {
    if (this.allowClear && this.currentValue === val) {
      this.currentValue = 0;
    } else {
      this.currentValue = val;
    }
    this.render();

    // Trigger pop scale on clicked star
    const star = this.element.querySelector(`.peek-star-btn[data-val="${val}"]`);
    if (star) {
      star.style.transform = `scale(${this.popScale})`;
      setTimeout(() => { star.style.transform = ''; }, 200);
    }

    this.onChange(this.currentValue);
  }

  render() {
    const val = this.hoverValue || this.currentValue;
    const stars = this.element.querySelectorAll('.peek-star-btn');
    const tipEl = this.element.querySelector('.peek-rating-tip');

    stars.forEach((star, idx) => {
      const starVal = idx + 1;
      const isActive = starVal <= val;
      star.style.color = isActive ? this.activeColor : this.idleColor;
      if (starVal === this.hoverValue) {
        star.style.transform = `translateY(-${this.lift}px) scale(${this.magnify})`;
      } else if (!this.hoverValue) {
        star.style.transform = '';
      }
    });

    if (tipEl) {
      if (val > 0 && this.labels[val - 1]) {
        tipEl.textContent = `${this.labels[val - 1]} (${val}/${this.count})`;
      } else {
        tipEl.textContent = 'Rate to help us improve';
      }
    }
  }

  destroy() {
    if (this.element) this.element.remove();
  }
}

window.PeekRating = PeekRating;
