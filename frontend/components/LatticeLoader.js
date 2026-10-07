// ============================================================
// LATTICE LOADER COMPONENT
// 3x3 Orbiting Circular Grid with Dynamic Timer & Status States
// ============================================================

class LatticeLoader {
  constructor(options = {}) {
    this.status = options.status || 'working';
    this.label = options.label || 'Thinking';
    this.doneLabel = options.doneLabel || 'Done in';
    this.errorLabel = options.errorLabel || 'Failed after';
    this.grid = options.grid || 3;
    this.cellSize = options.cellSize || 6;
    this.gap = options.gap || 2;
    this.doneColor = options.doneColor || '#22c55e';
    this.errorColor = options.errorColor || '#ef4444';
    this.showTimer = options.showTimer !== false;

    this.startTime = Date.now();
    this.timerInterval = null;
    this.element = this.createElement();
    this.startTimer();
  }

  createElement() {
    const el = document.createElement('div');
    el.className = 'lattice-loader-container';
    el.innerHTML = `
      <div class="lattice-grid" style="grid-template-columns: repeat(${this.grid}, ${this.cellSize}px); grid-gap: ${this.gap}px;">
        ${Array.from({ length: this.grid * this.grid }).map(() => `<div class="lattice-cell"></div>`).join('')}
      </div>
      <div class="lattice-label-wrap" style="display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--tx-secondary);">
        <span class="lattice-text">${this.label}</span>
        ${this.showTimer ? `<span class="lattice-timer" style="font-size:12px;color:var(--tx-tertiary);font-variant-numeric:tabular-nums;">0.0s</span>` : ''}
      </div>
    `;
    return el;
  }

  startTimer() {
    if (!this.showTimer) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timerEl = this.element.querySelector('.lattice-timer');
      if (timerEl) timerEl.textContent = '…';
      return;
    }
    const timerEl = this.element.querySelector('.lattice-timer');
    this.timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      if (timerEl) timerEl.textContent = `${elapsed}s`;
    }, 100);
  }

  setStatus(newStatus, errorMsg = '') {
    this.status = newStatus;
    if (this.timerInterval) clearInterval(this.timerInterval);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    const cells = this.element.querySelectorAll('.lattice-cell');
    const textEl = this.element.querySelector('.lattice-text');
    const timerEl = this.element.querySelector('.lattice-timer');

    if (newStatus === 'done') {
      cells.forEach(c => {
        c.style.animation = 'none';
        c.style.background = this.doneColor;
        c.style.opacity = '1';
      });
      if (textEl) textEl.textContent = `${this.doneLabel} ${elapsed}s`;
      if (timerEl) timerEl.style.display = 'none';
    } else if (newStatus === 'error') {
      cells.forEach(c => {
        c.style.animation = 'none';
        c.style.background = this.errorColor;
        c.style.opacity = '1';
      });
      if (textEl) textEl.textContent = `${this.errorLabel} ${elapsed}s`;
      if (timerEl) timerEl.style.display = 'none';
    }
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.element.remove();
  }
}

window.LatticeLoader = LatticeLoader;
