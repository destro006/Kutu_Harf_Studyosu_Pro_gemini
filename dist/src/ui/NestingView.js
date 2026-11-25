import {normalizeDisplayUnit,formatMmAsUnit,formatDimensions} from '../core/units.js';
/**
 * Interactive SVG True-Shape Nesting Preview & Collision Visualizer
 * Shows exact sheet boundary, usable margin, internal holes, part labels,
 * locked badges, and red collision highlights.
 */

const pathCache=new WeakMap();
export function renderNestingSvg(sheet, selectedPlacementId = null, colors = {}, displayUnit='mm', groupCtx = {}) {
  if (!sheet) return '';
  const unit=normalizeDisplayUnit(displayUnit),show=mm=>formatMmAsUnit(mm,unit);
  const w = sheet.widthMm;
  const h = sheet.heightMm;
  const mL = sheet.marginLeftMm ?? sheet.marginMm ?? 15;
  const mR = sheet.marginRightMm ?? sheet.marginMm ?? 15;
  const mT = sheet.marginTopMm ?? sheet.marginMm ?? 15;
  const mB = sheet.marginBottomMm ?? sheet.marginMm ?? 15;
  const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
  const bodyColor = validColor(colors?.body, '#c89343');
  const holeColor = validColor(colors?.holes, '#c89343');
  const groupColors = groupCtx?.groupColors || colors?.groups || {};
  const activeGroup = groupCtx?.activeGroup || null;
  const toD=pts=>{const cached=pathCache.get(pts);if(cached?.h===h)return cached.d;const d='M '+pts.map(pt=>`${pt.x.toFixed(1)},${(h-pt.y).toFixed(1)}`).join(' L ')+' Z';if(Object.isFrozen(pts))pathCache.set(pts,{h,d});return d;};
  // Render all contours as stroke-only outlines (no interior fill colors).
  const holePreview = (holes, holeStroke, isHighlighted) => (holes || []).map(pts =>
    `<path data-nest-hole="true" d="${toD(pts)}" fill="none" stroke="${holeStroke}" stroke-width="${isHighlighted ? 4 : 2.6}" stroke-linejoin="round" pointer-events="none" />`
  ).join('');

  const selected=selectedPlacementId instanceof Set?selectedPlacementId:new Set(Array.isArray(selectedPlacementId)?selectedPlacementId:selectedPlacementId==null?[]:[selectedPlacementId]);
  const polysSvg = sheet.placements
    .map((p) => {
      const isSel = selected.has(p.id);
      const isCol = p.hasCollision;
      const grp = p.partGroup || 'body';
      const pieceColor = (p.partColor || groupColors[grp]) ? validColor(groupColors[grp] || p.partColor, bodyColor) : bodyColor;
      const dimmed = Boolean(activeGroup && grp !== activeGroup);
      const stroke = isCol ? '#ef4444' : isSel ? '#ffffff' : pieceColor;
      const restHoleColor = grp === 'file_frame' ? pieceColor : holeColor;
      const holeStroke = isCol ? '#ef4444' : isSel ? '#ffffff' : restHoleColor;
      const d = toD(p.outer);
      const cx = ((p.bounds.minX + p.bounds.maxX) * 0.5).toFixed(1);
      const cy = (h - (p.bounds.minY + p.bounds.maxY) * 0.5).toFixed(1);
      const label = p.locked ? `🔒 ${p.label}` : p.label;

      return `
        <g data-pid="${escapeXml(p.id)}" data-part-group="${escapeXml(grp)}" data-part-color="${escapeXml(pieceColor)}" data-hole-color="${escapeXml(restHoleColor)}" class="${isSel?'nest-picked ':''}${isCol?'nest-collision ':''}${dimmed?'nest-group-dimmed':''}" style="cursor:${dimmed?'default':'pointer'}"${dimmed?' opacity="0.18" pointer-events="none"':''}>
          <title>${escapeXml(label)}</title>
          ${holePreview(p.holes, holeStroke, isSel || isCol)}
          <path data-nest-body="true" d="${d}" fill="none" pointer-events="all" stroke="${stroke}" stroke-width="${isSel || isCol ? 4.5 : 2.8}" stroke-linejoin="round" stroke-linecap="round" />
          ${isSel&&p.bounds.width>70&&p.bounds.height>35?`<text x="${cx}" y="${cy}" fill="#f8fafc" font-size="${Math.min(20,p.bounds.width/7,p.bounds.height/3)}" text-anchor="middle" dominant-baseline="middle" pointer-events="none">${show(p.bounds.width)}×${show(p.bounds.height)} ${unit}</text>`:''}
        </g>`;
    })
    .join('\n');

  return `<svg class="nesting-sheet-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${formatDimensions(w,h,unit)} nesting levhası">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#12151b" />
    <rect x="${mL}" y="${mT}" width="${Math.max(10, w - mL - mR)}" height="${Math.max(10, h - mT - mB)}" fill="none" stroke="#334155" stroke-dasharray="10 8" stroke-width="2" />
    ${polysSvg}
  </svg>`;
}

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
