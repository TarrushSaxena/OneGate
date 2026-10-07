// ============================================================
// RUBBER SEGMENT COMPONENT
// Physics-based elastic morphing tab indicator
// ============================================================

class RubberSegment {
  constructor(containerElement, onChange) {
    this.container = containerElement;
    this.onChange = onChange;
    this.indicator = this.container.querySelector('.rubber-segment-indicator');
    this.items = Array.from(this.container.querySelectorAll('.rubber-segment-item'));
    this.activeIndex = 0;

    this.init();
  }

  init() {
    this.items.forEach((item, index) => {
      item.addEventListener('click', () => this.selectIndex(index));
      item.addEventListener('mouseenter', () => this.previewIndex(index));
    });

    this.container.addEventListener('mouseleave', () => this.updateIndicator(this.activeIndex));

    // Initial positioning
    requestAnimationFrame(() => this.updateIndicator(0));
  }

  selectIndex(index) {
    this.activeIndex = index;
    this.items.forEach((item, idx) => {
      item.classList.toggle('active', idx === index);
    });
    this.updateIndicator(index);
    if (this.onChange) this.onChange(this.items[index].dataset.value || index, index);
  }

  previewIndex(index) {
    this.updateIndicator(index, true);
  }

  updateIndicator(index, isHover = false) {
    const item = this.items[index];
    if (!item || !this.indicator) return;

    const containerRect = this.container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();

    const left = itemRect.left - containerRect.left;
    const width = itemRect.width;

    this.indicator.style.transform = `translateX(${left}px)`;
    this.indicator.style.width = `${width}px`;
    this.indicator.style.opacity = '1';
  }
}

window.RubberSegment = RubberSegment;
