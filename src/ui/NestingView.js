/**
 * Interactive SVG True-Shape Nesting Preview & Collision Visualizer
 * Shows exact sheet boundary, usable margin, internal holes, part labels,
 * locked badges, and red collision highlights.
 */

export function renderNestingSvg(sheet, selectedPlacementId = null) {
  if (!sheet) return '';
  const w = sheet.widthMm;
  const h = sheet.heightMm;
  const mL = sheet.marginLeftMm ?? sheet.marginMm ?? 15;
  const mR = sheet.marginRightMm ?? sheet.marginMm ?? 15;
  const mT = sheet.marginTopMm ?? sheet.marginMm ?? 15;
  const mB = sheet.marginBottomMm ?? sheet.marginMm ?? 15;

  const polysSvg = sheet.placements
    .map((p, idx) => {
      const hue = (idx * 47) % 360;
      const isSel = p.id === selectedPlacementId;
      const isCol = p.hasCollision;
      const stroke = isCol ? '#ef4444' : isSel ? '#ffffff' : `hsl(${hue}, 80%, 65%)`;
      const fill = isCol ? 'rgba(239, 68, 68, 0.45)' : `hsla(${hue}, 70%, 55%, ${isSel ? 0.58 : 0.32})`;
      const toD = (pts) => 'M ' + pts.map(pt => `${pt.x.toFixed(1)},${(h - pt.y).toFixed(1)}`).join(' L ') + ' Z';
      const d = [toD(p.outer), ...(p.holes || []).map(toD)].join(' ');
      const cx = ((p.bounds.minX + p.bounds.maxX) * 0.5).toFixed(1);
      const cy = (h - (p.bounds.minY + p.bounds.maxY) * 0.5).toFixed(1);
      const label = p.locked ? `🔒 ${p.label}` : p.label;

      return `
        <g data-pid="${p.id}" style="cursor:pointer">
          <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${isSel || isCol ? 4 : 2}" fill-rule="evenodd" />
          <text x="${cx}" y="${cy}" fill="#f8fafc" font-size="22" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" pointer-events="none">${escapeXml(label)}</text>
        </g>`;
    })
    .join('\n');

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;background:#0d0f13;border:1px solid #2a2e37;border-radius:8px;display:block">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#12151b" />
    <rect x="${mL}" y="${mT}" width="${Math.max(10, w - mL - mR)}" height="${Math.max(10, h - mT - mB)}" fill="none" stroke="#334155" stroke-dasharray="10 8" stroke-width="2" />
    ${polysSvg}
  </svg>`;
}

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
