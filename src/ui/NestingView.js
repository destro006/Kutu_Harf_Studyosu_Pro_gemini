/**
 * Interactive SVG True-Shape Nesting Preview & Manual Adjustment View
 */

export function renderNestingSvg(sheet, selectedPlacementId = null) {
  if (!sheet) return '';
  const w = sheet.widthMm;
  const h = sheet.heightMm;
  const m = sheet.marginMm;

  const polysSvg = sheet.placements
    .map((p, idx) => {
      const hue = (idx * 47) % 360;
      const isSel = p.id === selectedPlacementId;
      const toD = (pts) => 'M ' + pts.map(pt => `${pt.x.toFixed(1)},${(h - pt.y).toFixed(1)}`).join(' L ') + ' Z';
      const d = [toD(p.outer), ...(p.holes || []).map(toD)].join(' ');
      return `<path data-pid="${p.id}" d="${d}" fill="hsla(${hue}, 70%, 55%, ${isSel ? 0.55 : 0.32})" stroke="${isSel ? '#ffffff' : `hsl(${hue}, 80%, 65%)`}" stroke-width="${isSel ? 4 : 2}" fill-rule="evenodd" style="cursor:pointer" />`;
    })
    .join('\n');

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;background:#0d0f13;border:1px solid #2a2e37;border-radius:8px;display:block">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#12151b" />
    <rect x="${m}" y="${m}" width="${w - m * 2}" height="${h - m * 2}" fill="none" stroke="#334155" stroke-dasharray="10 8" stroke-width="2" />
    ${polysSvg}
  </svg>`;
}
