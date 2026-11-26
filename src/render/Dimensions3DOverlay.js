import THREE from '../vendor/three.js';
import { formatMmAsUnit, normalizeDisplayUnit } from '../core/units.js';

/**
 * Architectural CAD-style 3D Dimension Overlay (Width, Height, Extrusion Depth)
 * Projects live Three.js bounding box corners onto an overlay 2D canvas.
 */
export function computeSignageDimensionData(signEngine, state, metrics = null) {
  const unit = normalizeDisplayUnit(state?.pageLayout?.displayUnit);
  const selectedIds = new Set(state?.selectedIds || []);
  const box = new THREE.Box3();
  let found = false;

  if (signEngine?.signGroup) {
    const useSelected = selectedIds.size > 0 && signEngine.signGroup.children.some(c => c.visible && selectedIds.has(c.userData?.layerId));
    for (const child of signEngine.signGroup.children) {
      if (!child.visible || !child.userData?.layerId) continue;
      if (useSelected && !selectedIds.has(child.userData.layerId)) continue;
      box.expandByObject(child);
      found = true;
    }
  }

  if (!found || box.isEmpty()) {
    const wMm = Math.round(metrics?.totalWidthMm || 0);
    const hMm = Math.round(metrics?.totalHeightMm || 0);
    const dMm = Math.round(state?.dimensions?.depthMm || 80);
    if (!(wMm > 0 && hMm > 0)) return { valid: false, unit };
    const hw = wMm * 0.0005, hh = hMm * 0.0005, dz = dMm * 0.001;
    box.set(new THREE.Vector3(-hw, -hh, 0), new THREE.Vector3(hw, hh, dz));
  }

  const size = new THREE.Vector3();
  box.getSize(size);
  const selObj = (state?.objects || []).find(o => selectedIds.has(o.id) && o.visible);
  const depthMm = Math.round(selObj?.depthMm ?? state?.dimensions?.depthMm ?? Math.round(size.z * 1000));
  return {
    valid: true,
    unit,
    box,
    widthMm: Math.round(size.x * 1000),
    heightMm: Math.round(size.y * 1000),
    depthMm: Math.max(1, depthMm),
  };
}

function projectPoint(v, camera, w, h) {
  const p = v.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * w,
    y: (-p.y * 0.5 + 0.5) * h,
    z: p.z,
  };
}

function drawArrowHead(ctx, x, y, dx, dy, size = 7) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size + px * size * 0.45, y - uy * size + py * size * 0.45);
  ctx.lineTo(x - ux * size - px * size * 0.45, y - uy * size - py * size * 0.45);
  ctx.closePath();
  ctx.fill();
}

function drawDimPill(ctx, cx, cy, text, bgColor = 'rgba(13, 18, 26, 0.88)', strokeColor = '#fbbf24') {
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const pw = tw + 16, ph = 22;
  const rx = cx - pw / 2, ry = cy - ph / 2;
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.roundRect(rx, ry, pw, ph, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fef3c7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

export function renderDimensions2DOverlay(ctx, width, height, camera, dimData, options = {}) {
  if (!ctx || !dimData?.valid || !camera || !(width > 10 && height > 10)) return;
  const opacity = Math.max(0, Math.min(1, options.opacity ?? 1));
  if (opacity <= 0.01) return;

  const { box, widthMm, heightMm, depthMm, unit } = dimData;
  const fmt = mm => `${formatMmAsUnit(mm, unit)} ${unit}`;
  camera.updateMatrixWorld();

  // Bottom width line (minY front edge)
  const bl = projectPoint(new THREE.Vector3(box.min.x, box.min.y, box.max.z), camera, width, height);
  const br = projectPoint(new THREE.Vector3(box.max.x, box.min.y, box.max.z), camera, width, height);
  // Left height line (minX front edge)
  const tl = projectPoint(new THREE.Vector3(box.min.x, box.max.y, box.max.z), camera, width, height);
  // Depth edge (top-right back -> front)
  const trBack = projectPoint(new THREE.Vector3(box.max.x, box.max.y, box.min.z), camera, width, height);
  const trFront = projectPoint(new THREE.Vector3(box.max.x, box.max.y, box.max.z), camera, width, height);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = '#fbbf24';
  ctx.fillStyle = '#fbbf24';
  ctx.lineWidth = 1.5;

  // 1. Horizontal Total Width below bottom edge
  const wOffY = 26;
  const wx1 = bl.x, wy1 = bl.y + wOffY;
  const wx2 = br.x, wy2 = br.y + wOffY;
  if (Math.hypot(wx2 - wx1, wy2 - wy1) > 16) {
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(bl.x, bl.y + 4); ctx.lineTo(wx1, wy1 + 5);
    ctx.moveTo(br.x, br.y + 4); ctx.lineTo(wx2, wy2 + 5);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(wx1, wy1); ctx.lineTo(wx2, wy2);
    ctx.stroke();
    drawArrowHead(ctx, wx1, wy1, wx1 - wx2, wy1 - wy2);
    drawArrowHead(ctx, wx2, wy2, wx2 - wx1, wy2 - wy1);
    drawDimPill(ctx, (wx1 + wx2) * 0.5, (wy1 + wy2) * 0.5, `G: ${fmt(widthMm)}`);
  }

  // 2. Vertical Total Height left of left edge
  const hOffX = -28;
  const hx1 = tl.x + hOffX, hy1 = tl.y;
  const hx2 = bl.x + hOffX, hy2 = bl.y;
  if (Math.hypot(hx2 - hx1, hy2 - hy1) > 16) {
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(tl.x - 4, tl.y); ctx.lineTo(hx1 - 5, hy1);
    ctx.moveTo(bl.x - 4, bl.y); ctx.lineTo(hx2 - 5, hy2);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(hx1, hy1); ctx.lineTo(hx2, hy2);
    ctx.stroke();
    drawArrowHead(ctx, hx1, hy1, hx1 - hx2, hy1 - hy2);
    drawArrowHead(ctx, hx2, hy2, hx2 - hx1, hy2 - hy1);
    drawDimPill(ctx, (hx1 + hx2) * 0.5, (hy1 + hy2) * 0.5, `Y: ${fmt(heightMm)}`);
  }

  // 3. Depth callout at top-right extrusion edge
  if (options.showDepth !== false) {
    const mx = (trBack.x + trFront.x) * 0.5;
    const my = (trBack.y + trFront.y) * 0.5;
    const lx = Math.min(width - 78, Math.max(78, mx + 52));
    const ly = Math.max(24, my - 26);
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(mx, my, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.restore();
    drawDimPill(ctx, lx, ly, `Derinlik: ${fmt(depthMm)}`, 'rgba(13, 18, 26, 0.90)', '#38bdf8');
  }
  ctx.restore();
}

export class Dimensions3DOverlayController {
  constructor(canvasEl, getDeps) {
    this.canvas = canvasEl;
    this.getDeps = getDeps;
    this.enabled = false;
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.canvas) this.canvas.classList.toggle('hidden', !this.enabled);
    if (this.enabled) this.render();
  }

  render() {
    if (!this.enabled || !this.canvas) return;
    const { signEngine, state, metrics } = this.getDeps();
    if (!signEngine || signEngine.isDisposed || !signEngine.container) return;
    const w = signEngine.container.clientWidth || 0;
    const h = signEngine.container.clientHeight || 0;
    if (!(w > 10 && h > 10)) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const data = computeSignageDimensionData(signEngine, state, metrics);
    renderDimensions2DOverlay(ctx, w, h, signEngine.camera, data, { opacity: 1, showDepth: true });
  }
}
