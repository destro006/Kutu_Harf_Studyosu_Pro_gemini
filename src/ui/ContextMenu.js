/**
 * Context-Sensitive Right-Click Menu System (Turkish CAD/CAM)
 * Supports: Vector Object, Layer Item, Nesting Part, and Empty Canvas.
 */

export class ContextMenu {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'cadContextMenu';
    this.el.className = 'cad-ctx-menu hidden';
    this.el.setAttribute('role', 'menu');
    document.body.appendChild(this.el);

    window.addEventListener('pointerdown', (e) => {
      if (!this.el.contains(e.target)) this.hide();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
    window.addEventListener('resize', () => this.hide());
  }

  show(clientX, clientY, items = []) {
    if (!items.length) { this.hide(); return; }
    this.el.innerHTML = items.map((item, idx) => {
      if (item.sep) return '<div class="ctx-sep"></div>';
      const dis = item.disabled ? 'disabled' : '';
      const danger = item.danger ? 'danger' : '';
      return `
        <button type="button" class="ctx-item ${danger}" data-ctx-idx="${idx}" ${dis}>
          <span class="ctx-lbl">${item.icon ? `${item.icon} ` : ''}${item.label}</span>
          ${item.kbd ? `<kbd>${item.kbd}</kbd>` : ''}
        </button>
      `;
    }).join('');

    this.el.classList.remove('hidden');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = this.el.getBoundingClientRect();
    const x = Math.min(vw - rect.width - 8, Math.max(8, clientX));
    const y = Math.min(vh - rect.height - 8, Math.max(8, clientY));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;

    this.el.querySelectorAll('[data-ctx-idx]').forEach(btn => {
      btn.onclick = () => {
        const it = items[Number(btn.dataset.ctxIdx)];
        this.hide();
        if (it && !it.disabled) it.action?.();
      };
    });
  }

  hide() {
    this.el.classList.add('hidden');
  }
}
