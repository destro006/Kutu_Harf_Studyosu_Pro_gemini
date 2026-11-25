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

  const rotateMode = Boolean(groupCtx?.rotateMode);
  const selected=selectedPlacementId instanceof Set?selectedPlacementId:new Set(Array.isArray(selectedPlacementId)?selectedPlacementId:selectedPlacementId==null?[]:[selectedPlacementId]);
  const selectedParts = [];
  const polysSvg = sheet.placements
    .map((p) => {
      const isSel = selected.has(p.id);
      if (isSel) selectedParts.push(p);
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

  let gizmoSvg = '';
  if (selectedParts.length) {
    const bx1 = Math.min(...selectedParts.map(p => p.bounds.minX));
    const bx2 = Math.max(...selectedParts.map(p => p.bounds.maxX));
    const by1 = h - Math.max(...selectedParts.map(p => p.bounds.maxY));
    const by2 = h - Math.min(...selectedParts.map(p => p.bounds.minY));
    const bcx = (bx1 + bx2) * 0.5;
    const bcy = (by1 + by2) * 0.5;
    const u = Math.max(w, h) / 1000;
    const bw = Math.max(4 * u, bx2 - bx1);
    const bh = Math.max(4 * u, by2 - by1);
    if (rotateMode) {
      const pad = 14 * u;
      const hr = 7.5 * u;
      const topHy = Math.max(12 * u, by1 - 28 * u);
      const corners = [
        [bx1 - pad, by1 - pad],
        [bx2 + pad, by1 - pad],
        [bx1 - pad, by2 + pad],
        [bx2 + pad, by2 + pad],
      ];
      gizmoSvg = `
        <g class="nest-transform-gizmo" data-gizmo-mode="rotate">
          <rect x="${bx1.toFixed(1)}" y="${by1.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="none" stroke="#fbbf24" stroke-width="${(1.8 * u).toFixed(2)}" stroke-dasharray="${(7 * u).toFixed(1)} ${(5 * u).toFixed(1)}" pointer-events="none" />
          <circle cx="${bcx.toFixed(1)}" cy="${bcy.toFixed(1)}" r="${(5.5 * u).toFixed(1)}" fill="none" stroke="#fbbf24" stroke-width="${(1.6 * u).toFixed(2)}" pointer-events="none" />
          <line x1="${(bcx - 9 * u).toFixed(1)}" y1="${bcy.toFixed(1)}" x2="${(bcx + 9 * u).toFixed(1)}" y2="${bcy.toFixed(1)}" stroke="#fbbf24" stroke-width="${(1.4 * u).toFixed(2)}" pointer-events="none" />
          <line x1="${bcx.toFixed(1)}" y1="${(bcy - 9 * u).toFixed(1)}" x2="${bcx.toFixed(1)}" y2="${(bcy + 9 * u).toFixed(1)}" stroke="#fbbf24" stroke-width="${(1.4 * u).toFixed(2)}" pointer-events="none" />
          <line x1="${bcx.toFixed(1)}" y1="${by1.toFixed(1)}" x2="${bcx.toFixed(1)}" y2="${topHy.toFixed(1)}" stroke="#fbbf24" stroke-width="${(1.6 * u).toFixed(2)}" pointer-events="none" />
          <g data-nest-rotate-handle="top" data-cx="${bcx.toFixed(2)}" data-cy="${bcy.toFixed(2)}" style="cursor:grab">
            <title>Sürükleyerek döndürün (Shift: 15° adım)</title>
            <circle cx="${bcx.toFixed(1)}" cy="${topHy.toFixed(1)}" r="${(hr * 1.45).toFixed(1)}" fill="#1e293b" fill-opacity="0.92" stroke="#fbbf24" stroke-width="${(2 * u).toFixed(2)}" />
            <text x="${bcx.toFixed(1)}" y="${(topHy + 0.5 * u).toFixed(1)}" fill="#fbbf24" font-size="${(12 * u).toFixed(1)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" pointer-events="none">↻</text>
          </g>
          ${corners.map(([cxp, cyp]) => `
            <g data-nest-rotate-handle="corner" data-cx="${bcx.toFixed(2)}" data-cy="${bcy.toFixed(2)}" style="cursor:grab">
              <title>Köşeden döndürün</title>
              <circle cx="${cxp.toFixed(1)}" cy="${cyp.toFixed(1)}" r="${(hr * 1.3).toFixed(1)}" fill="#0f172a" fill-opacity="0.88" stroke="#fbbf24" stroke-width="${(1.8 * u).toFixed(2)}" />
              <text x="${cxp.toFixed(1)}" y="${(cyp + 0.5 * u).toFixed(1)}" fill="#fbbf24" font-size="${(10.5 * u).toFixed(1)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" pointer-events="none">⟲</text>
            </g>
          `).join('')}
        </g>`;
    } else {
      const sq = 4.6 * u;
      const boxPts = [
        [bx1, by1], [bx2, by1], [bx1, by2], [bx2, by2],
      ];
      gizmoSvg = `
        <g class="nest-transform-gizmo" data-gizmo-mode="select" pointer-events="none">
          <rect x="${bx1.toFixed(1)}" y="${by1.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="none" stroke="#38bdf8" stroke-width="${(1.6 * u).toFixed(2)}" stroke-dasharray="${(7 * u).toFixed(1)} ${(5 * u).toFixed(1)}" />
          ${boxPts.map(([px, py]) => `<rect x="${(px - sq).toFixed(1)}" y="${(py - sq).toFixed(1)}" width="${(sq * 2).toFixed(1)}" height="${(sq * 2).toFixed(1)}" fill="#0f172a" stroke="#38bdf8" stroke-width="${(1.5 * u).toFixed(2)}" />`).join('')}
        </g>`;
    }
  }

  return `<svg class="nesting-sheet-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${formatDimensions(w,h,unit)} nesting levhası">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#12151b" />
    <rect x="${mL}" y="${mT}" width="${Math.max(10, w - mL - mR)}" height="${Math.max(10, h - mT - mB)}" fill="none" stroke="#334155" stroke-dasharray="10 8" stroke-width="2" />
    ${polysSvg}
    ${gizmoSvg}
  </svg>`;
}

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
