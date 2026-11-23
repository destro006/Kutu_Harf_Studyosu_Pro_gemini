/**
 * Professional Design, Presentation & Manufacturing Export Service
 * Formats:
 *  - High-Resolution PNG
 *  - Transparent PNG
 *  - Layered SVG (exact mm viewBox, independent components, acrylic/file/outer groups)
 *  - Layered CAD DXF (exact mm, separate ACRYLIC, FILE_BORDER, METAL_FACE, SIDEWALL layers + CNC warning)
 *  - Versioned Project JSON
 *  - Printable PDF Customer Quotation
 */

export function downloadBlob(filename, content, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Generates an exact-millimeter layered SVG from manufacturing metricsList.
 */
export function generateManufacturingSvg(metricsList) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const shiftedOuter = [];
  const shiftedFile = [];
  const shiftedAcrylic = [];

  const shiftRing = (ring, ox, oy) => ring.map(p => ({ x: p.x + ox, y: -(p.y + oy) }));

  for (const m of metricsList) {
    const ox = m.offsetXMm || 0;
    const oy = m.offsetYMm || 0;

    for (const poly of (m.exportContours?.outer || [])) {
      const o = shiftRing(poly.outer, ox, oy);
      const hs = (poly.holes || []).map(h => shiftRing(h, ox, oy));
      for (const p of o) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      shiftedOuter.push({ label: m.label, outer: o, holes: hs });
    }
    for (const poly of (m.exportContours?.file || [])) {
      shiftedFile.push({
        label: m.label,
        outer: shiftRing(poly.outer, ox, oy),
        holes: (poly.holes || []).map(h => shiftRing(h, ox, oy)),
      });
    }
    for (const poly of (m.exportContours?.acrylic || [])) {
      shiftedAcrylic.push({
        label: m.label,
        outer: shiftRing(poly.outer, ox, oy),
        holes: (poly.holes || []).map(h => shiftRing(h, ox, oy)),
      });
    }
  }

  if (!Number.isFinite(minX)) {
    minX = 0; maxX = 100; minY = 0; maxY = 100;
  }
  const pad = 10;
  const vbX = (minX - pad).toFixed(2);
  const vbY = (minY - pad).toFixed(2);
  const vbW = (maxX - minX + pad * 2).toFixed(2);
  const vbH = (maxY - minY + pad * 2).toFixed(2);

  const toPathD = (item) => {
    const ringD = r => 'M ' + r.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' L ') + ' Z';
    return [ringD(item.outer), ...item.holes.map(ringD)].join(' ');
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}mm" height="${vbH}mm" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">
  <g id="METAL_OUTER" fill="none" stroke="#f59e0b" stroke-width="0.4" fill-rule="evenodd">
    ${shiftedOuter.map(i => `<path data-component="${escapeXml(i.label)}" d="${toPathD(i)}" />`).join('\n    ')}
  </g>
  <g id="FILE_BORDER" fill="none" stroke="#eab308" stroke-width="0.35" fill-rule="evenodd">
    ${shiftedFile.map(i => `<path data-component="${escapeXml(i.label)}" d="${toPathD(i)}" />`).join('\n    ')}
  </g>
  <g id="ACRYLIC_FACE" fill="none" stroke="#38bdf8" stroke-width="0.35" fill-rule="evenodd">
    ${shiftedAcrylic.map(i => `<path data-component="${escapeXml(i.label)}" d="${toPathD(i)}" />`).join('\n    ')}
  </g>
</svg>`;
}

/**
 * Generates an AutoCAD-compatible R12/R2000 ASCII DXF in exact millimeters.
 * Separates METAL_FACE, FILE_BORDER, ACRYLIC, and SIDEWALL_GUIDE into distinct DXF layers
 * and preserves holes & disconnected components.
 *
 * IMPORTANT: A valid vector DXF outline is NOT a ready-to-run CNC G-code toolpath;
 * CAM software must still apply kerf compensation and lead-in/lead-out settings.
 */
export function generateManufacturingDxf(metricsList) {
  const lines = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$INSUNITS', '70', '4', // 4 = Millimeters
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '4',
    ...dxfLayer('METAL_FACE', 2),
    ...dxfLayer('FILE_BORDER', 3),
    ...dxfLayer('ACRYLIC', 4),
    ...dxfLayer('SIDEWALL_OUTLINE', 1),
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  const emitPoly = (ring, layer, ox, oy) => {
    if (!ring || ring.length < 3) return;
    lines.push('0', 'LWPOLYLINE', '8', layer, '90', String(ring.length), '70', '1');
    for (const p of ring) {
      lines.push('10', (p.x + ox).toFixed(4), '20', (p.y + oy).toFixed(4));
    }
  };

  for (const m of metricsList) {
    const ox = m.offsetXMm || 0;
    const oy = m.offsetYMm || 0;

    for (const poly of (m.exportContours?.outer || [])) {
      emitPoly(poly.outer, 'SIDEWALL_OUTLINE', ox, oy);
      for (const h of (poly.holes || [])) emitPoly(h, 'SIDEWALL_OUTLINE', ox, oy);
      if (m.constructionType !== 'fileli' && m.constructionType !== 'pleksi') {
        emitPoly(poly.outer, 'METAL_FACE', ox, oy);
        for (const h of (poly.holes || [])) emitPoly(h, 'METAL_FACE', ox, oy);
      }
    }
    for (const poly of (m.exportContours?.file || [])) {
      emitPoly(poly.outer, 'FILE_BORDER', ox, oy);
      for (const h of (poly.holes || [])) emitPoly(h, 'FILE_BORDER', ox, oy);
    }
    for (const poly of (m.exportContours?.acrylic || [])) {
      emitPoly(poly.outer, 'ACRYLIC', ox, oy);
      for (const h of (poly.holes || [])) emitPoly(h, 'ACRYLIC', ox, oy);
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return {
    dxfText: lines.join('\n'),
    cncWarning:
      'Uyarı: Dışa aktarılan DXF dosyası gerçek milimetre vektör konturlarını içerir; doğrudan CNC/lazer takım yolu değildir. Kesim öncesi CAM yazılımında kerf (kesim payı) telafisi ve giriş-çıkış (lead-in) ayarlarını uygulayın.',
  };
}

function dxfLayer(name, colorIndex) {
  return ['0', 'LAYER', '2', name, '70', '0', '62', String(colorIndex), '6', 'CONTINUOUS'];
}

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}
