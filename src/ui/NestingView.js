/**
 * Interactive SVG True-Shape Nesting Preview & Collision Visualizer
 * Shows exact sheet boundary, usable margin, internal holes, part labels,
 * locked badges, and red collision highlights.
 */

export function renderNestingSvg(sheet, selectedPlacementId = null, colors = {}) {
  if (!sheet) return '';
  const w = sheet.widthMm;
  const h = sheet.heightMm;
  const mL = sheet.marginLeftMm ?? sheet.marginMm ?? 15;
  const mR = sheet.marginRightMm ?? sheet.marginMm ?? 15;
  const mT = sheet.marginTopMm ?? sheet.marginMm ?? 15;
  const mB = sheet.marginBottomMm ?? sheet.marginMm ?? 15;
  const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
  const bodyColor = validColor(colors?.body, '#c89343');
  const holeColor = validColor(colors?.holes, '#c89343');
  const toD = pts => 'M ' + pts.map(pt => `${pt.x.toFixed(1)},${(h - pt.y).toFixed(1)}`).join(' L ') + ' Z';
  // Color-code empty interior contours separately. This is only a preview
  // overlay; holes remain actual holes in the exported manufacturing geometry.
  const holePreview = holes=>holes.map(pts=>`<path data-nest-hole="true" d="${toD(pts)}" fill="${holeColor}" fill-opacity="0.7" pointer-events="none" />`).join('');

  const polysSvg = sheet.placements
    .map((p) => {
      const isSel = p.id === selectedPlacementId;
      const isCol = p.hasCollision;
      const stroke = isCol ? '#ef4444' : isSel ? '#ffffff' : bodyColor;
      const fill = isCol ? 'rgba(239, 68, 68, 0.45)' : bodyColor;
      const d = [toD(p.outer), ...(p.holes || []).map(toD)].join(' ');
      const cx = ((p.bounds.minX + p.bounds.maxX) * 0.5).toFixed(1);
      const cy = (h - (p.bounds.minY + p.bounds.maxY) * 0.5).toFixed(1);
      const label = p.locked ? `🔒 ${p.label}` : p.label;

      return `
        <g data-pid="${escapeXml(p.id)}" style="cursor:pointer">
          <title>${escapeXml(label)}</title>
          ${holePreview(p.holes||[])}
          <path data-nest-body="true" d="${d}" fill="${fill}" fill-opacity="${isSel ? '0.83' : '0.55'}" stroke="${stroke}" stroke-width="${isSel || isCol ? 4 : 2}" fill-rule="evenodd" />
          ${isSel&&p.bounds.width>70&&p.bounds.height>35?`<text x="${cx}" y="${cy}" fill="#f8fafc" font-size="${Math.min(20,p.bounds.width/7,p.bounds.height/3)}" text-anchor="middle" dominant-baseline="middle" pointer-events="none">${Math.round(p.bounds.width)}×${Math.round(p.bounds.height)}</text>`:''}
        </g>`;
    })
    .join('\n');

  return `<svg class="nesting-sheet-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${w} × ${h} mm nesting levhası">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#12151b" />
    <rect x="${mL}" y="${mT}" width="${Math.max(10, w - mL - mR)}" height="${Math.max(10, h - mT - mB)}" fill="none" stroke="#334155" stroke-dasharray="10 8" stroke-width="2" />
    ${polysSvg}
  </svg>`;
}

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
