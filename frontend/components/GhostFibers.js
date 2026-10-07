// ============================================================
// GHOST FIBERS COMPONENT (Light Theme Canvas Waves)
// Smooth oscillating refractive fiber waves
// ============================================================

class GhostFibers {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      lineColor: options.lineColor || '#64748B',
      glowColor: options.glowColor || '#0284C7',
      speed: options.speed || 0.2,
      layers: options.layers || 4,
      waveAmplitude: options.waveAmplitude || 0.015,
      waveFrequency: options.waveFrequency || 3,
      lineFrequency: options.lineFrequency || 6,
      ...options,
    };

    this.time = 0;
    this.animId = null;
    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.drawStatic();
      return;
    }
    this.animate();
  }

  drawStatic() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const { layers, waveAmplitude, waveFrequency } = this.options;
    const h = this.height;
    const w = this.width;
    for (let l = 0; l < layers; l++) {
      const layerOffset = (l / layers) * Math.PI * 2;
      this.ctx.beginPath();
      this.ctx.lineWidth = 1.2;
      const alpha = 0.12 + (l / layers) * 0.18;
      this.ctx.strokeStyle = `rgba(2, 132, 199, ${alpha})`;
      for (let x = 0; x <= w; x += 12) {
        const nx = (x / w) * waveFrequency;
        const y = h * 0.5 + Math.sin(nx + layerOffset) * (h * waveAmplitude * 10);
        if (x === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
    }
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  animate() {
    this.time += 0.015 * this.options.speed;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const { layers, waveAmplitude, waveFrequency, lineFrequency } = this.options;
    const h = this.height;
    const w = this.width;

    for (let l = 0; l < layers; l++) {
      const layerOffset = (l / layers) * Math.PI * 2;
      this.ctx.beginPath();
      this.ctx.lineWidth = 1.2;
      
      const alpha = 0.12 + (l / layers) * 0.18;
      this.ctx.strokeStyle = `rgba(2, 132, 199, ${alpha})`;

      for (let x = 0; x <= w; x += 12) {
        const nx = (x / w) * waveFrequency;
        const y = h * 0.5 +
          Math.sin(nx + this.time + layerOffset) * (h * waveAmplitude * 10) +
          Math.cos(nx * 1.5 - this.time * 0.8) * 18;

        if (x === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
    }

    this.animId = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }
}

window.GhostFibers = GhostFibers;
