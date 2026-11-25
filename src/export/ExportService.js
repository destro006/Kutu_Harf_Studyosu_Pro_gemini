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
    for (const poly of (m.exportContours?.acrylicCut?.length ? m.exportContours.acrylicCut : m.exportContours?.acrylic || [])) {
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
    for (const poly of (m.exportContours?.acrylicCut?.length ? m.exportContours.acrylicCut : m.exportContours?.acrylic || [])) {
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

/**
 * PART C — Dedicated Nested Sheet Exports ("Nesting Dışa Aktar")
 * Exports the ACTUAL nested sheet layouts (preserving exact X/Y coordinates, rotations, holes, and material groups).
 */

export function generateNestedSvg(sheets) {
  if (!sheets || !sheets.length) return "";
  const gap = 80;
  let totalH = 0;
  let maxW = 0;
  for (const sh of sheets) {
    maxW = Math.max(maxW, sh.widthMm);
    totalH += sh.heightMm + gap;
  }
  totalH = Math.max(100, totalH - gap);

  let yOff = 0;
  const groups = [];
  for (const sh of sheets) {
    const paths = [];
    for (const p of sh.placements) {
      const toD = (r) => "M " + r.map(pt => `${pt.x.toFixed(3)},${(sh.heightMm - pt.y).toFixed(3)}`).join(" L ") + " Z";
      paths.push(`<path class="cut-outer" data-part="${escapeXml(p.label)}" d="${toD(p.outer)}" />`);
      for (const h of (p.holes || [])) {
        paths.push(`<path class="cut-inner" data-part="${escapeXml(p.label)}" d="${toD(h)}" />`);
      }
    }
    groups.push(`
  <g id="SHEET_${sh.index}" data-material="${escapeXml(sh.materialGroup)}" transform="translate(0, ${yOff})">
    <rect id="SHEET_BOUNDARY_${sh.index}" x="0" y="0" width="${sh.widthMm}" height="${sh.heightMm}" fill="none" stroke="#64748b" stroke-width="0.6" />
    ${paths.join("\n    ")}
  </g>`);
    yOff += sh.heightMm + gap;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${maxW}mm" height="${totalH}mm" viewBox="0 0 ${maxW} ${totalH}">
  <style>.cut-outer{fill:none;stroke:#f59e0b;stroke-width:0.35}.cut-inner{fill:none;stroke:#38bdf8;stroke-width:0.35}</style>
  ${groups.join("\n")}
</svg>`;
}

export function generateNestedDxf(sheets) {
  const lines = [
    "0", "SECTION", "2", "HEADER",
    "9", "$INSUNITS", "70", "4",
    "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LAYER", "70", "4",
    ...dxfLayer("CUT_OUTER", 2),
    ...dxfLayer("CUT_INNER", 4),
    ...dxfLayer("ENGRAVE", 3),
    ...dxfLayer("SHEET_BOUNDARY", 7),
    "0", "ENDTAB", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  ];

  const emitPoly = (ring, layer, xOff, yOff) => {
    if (!ring || ring.length < 3) return;
    lines.push("0", "LWPOLYLINE", "8", layer, "90", String(ring.length), "70", "1");
    for (const p of ring) {
      lines.push("10", (p.x + xOff).toFixed(4), "20", (p.y + yOff).toFixed(4));
    }
  };

  let xOff = 0;
  for (const sh of sheets) {
    // Sheet boundary reference rectangle
    emitPoly([
      { x: 0, y: 0 }, { x: sh.widthMm, y: 0 },
      { x: sh.widthMm, y: sh.heightMm }, { x: 0, y: sh.heightMm },
    ], "SHEET_BOUNDARY", xOff, 0);

    for (const p of sh.placements) {
      emitPoly(p.outer, "CUT_OUTER", xOff, 0);
      for (const h of (p.holes || [])) emitPoly(h, "CUT_INNER", xOff, 0);
    }
    xOff += sh.widthMm + 150;
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

export function generateNestedCsv(sheets) {
  const rows = ["Plaka,Malzeme Grubu,Parca,Aci (deg),X (mm),Y (mm),Genislik (mm),Yukseklik (mm),Alan (cm2)"];
  for (const sh of sheets) {
    for (const p of sh.placements) {
      rows.push([
        sh.index,
        `"${(sh.materialGroup || "").replace(/"/g, '""')}"`,
        `"${(p.label || "").replace(/"/g, '""')}"`,
        p.angleDeg,
        Math.round(p.xMm),
        Math.round(p.yMm),
        Math.round(p.bounds.width),
        Math.round(p.bounds.height),
        (p.areaMm2 / 100).toFixed(2),
      ].join(","));
    }
  }
  return rows.join("\n");
}
