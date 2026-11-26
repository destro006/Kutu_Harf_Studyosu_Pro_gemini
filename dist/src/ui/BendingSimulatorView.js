import { BENDING_COIL_PROFILES, BENDING_MACHINE_PROFILES } from '../manufacturing/BendingSimulator.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderBendingSimulatorPane(job, simConfig = {}, simState = {}) {
  const contours = job?.contours || [];
  const activeIdx = Math.max(0, Math.min(contours.length - 1, Number(simState.activeContourIdx ?? 0)));
  const active = contours[activeIdx] || null;
  const speed = Number(simState.speed ?? 1);
  const progress = Math.max(0, Math.min(1, Number(simState.progress ?? 0)));
  const machineId = simConfig.machineId || job?.machine?.id || 'universal_dxf';
  const coilId = simConfig.coilId || job?.coil?.id || 'alu_08';

  const warningList = active
    ? active.bends.filter(b => b.hasCollision).map(b => `<li>@${b.distMm} mm: ${esc(b.collisionReason)}</li>`).join('')
    : '';

  return `
    <div class="bending-sim-layout">
      <div class="sec bending-sim-left">
        <h3 class="sec-title">Makine &amp; Bobin Parametreleri</h3>
        <div class="field-group">
          <label>Büküm Makinesi / Post</label>
          <select id="bendMachineSelect">
            ${BENDING_MACHINE_PROFILES.map(m => `<option value="${m.id}" ${m.id === machineId ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field-group">
          <label>Yan Bant Bobin Profili</label>
          <select id="bendCoilSelect">
            ${BENDING_COIL_PROFILES.map(c => `<option value="${c.id}" ${c.id === coilId ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field-row two-col">
          <div class="field-group">
            <label>Bindirme Payı (mm)</label>
            <input type="number" id="bendOverlapMm" min="0" max="40" step="1" value="${Number(simConfig.overlapMm ?? 6)}" />
          </div>
          <div class="field-group">
            <label>Yaylanma Telafisi (%)</label>
            <input type="number" id="bendSpringbackPct" min="0" max="25" step="0.5" value="${Number(job?.springbackPct ?? 4)}" />
          </div>
        </div>
        <div class="field-group">
          <label>V-Kerç Tetikleme Açısı (°)</label>
          <input type="number" id="bendNotchAngleDeg" min="10" max="90" step="2" value="${Number(job?.notchAngleDeg ?? 30)}" />
        </div>
        <div class="field-group">
          <label>Simüle Edilecek Harf / Kontur</label>
          <select id="bendContourSelect" ${!contours.length ? 'disabled' : ''}>
            ${contours.length
              ? contours.map((c, idx) => `<option value="${idx}" ${idx === activeIdx ? 'selected' : ''}>${esc(c.label)} (${c.contourType} · ${c.totalStripMm} mm)${c.collisionCount ? ' ⚠' : ''}</option>`).join('')
              : '<option>Sahnede harf/kontur yok</option>'}
          </select>
        </div>
        <div class="tip-card" style="font-size:11.5px;line-height:1.45">
          <strong>Akıllı Birleşim Yeri (Seam):</strong> Başlangıç noktası otomatik olarak harfin görünmeyen düz tabanına yerleştirildi. Tuvalde kenar üzerine tıklayarak birleşim yerini taşıyabilirsiniz.
        </div>
        ${active && active.collisionCount ? `
          <div style="margin-top:8px;padding:8px;border-radius:7px;background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.55);color:#fecaca;font-size:11.5px">
            <strong>⚠ ${active.collisionCount} Büküm Çarpışma / Yarıçap Uyarısı</strong>
            <ul style="margin:4px 0 0 16px;padding:0">${warningList}</ul>
          </div>` : ''}
      </div>

      <div class="sec bending-sim-center">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <h3 class="sec-title" style="margin:0">Canlı Büküm &amp; Şerit Simülasyonu</h3>
          <div style="display:flex;gap:6px;font-size:11px">
            <span style="color:#4ade80">● Başlangıç / Birleşim</span>
            <span style="color:#fbbf24">▲ V-Kerç</span>
            <span style="color:#38bdf8">▮ Flanş Kesimi</span>
            <span style="color:#f87171">⚠ Çarpışma Riski</span>
          </div>
        </div>
        <div class="bending-canvas-wrap">
          <canvas id="bendingSimCanvas" width="760" height="400"></canvas>
        </div>
        <div class="bending-transport">
          <button type="button" id="bendStepPrev" class="sec-btn" ${!active ? 'disabled' : ''}>⏮ Önceki</button>
          <button type="button" id="bendPlayPause" class="cta-btn" style="min-width:110px" ${!active ? 'disabled' : ''}>${simState.playing ? '⏸ Duraklat' : '▶ Başlat'}</button>
          <button type="button" id="bendStepNext" class="sec-btn" ${!active ? 'disabled' : ''}>Sonraki ⏭</button>
          <input type="range" id="bendScrubber" min="0" max="1000" value="${Math.round(progress * 1000)}" style="flex:1;min-width:120px" ${!active ? 'disabled' : ''} />
          <select id="bendSpeedSelect" style="width:74px">
            ${[0.5, 1, 2, 4].map(sp => `<option value="${sp}" ${sp === speed ? 'selected' : ''}>${sp}x</option>`).join('')}
          </select>
        </div>
        <div id="bendTelemetryBar" class="bending-telemetry">
          ${active ? `
            <span><strong>Kontur:</strong> ${esc(active.label)} (${active.contourType})</span>
            <span><strong>Net Çevre:</strong> ${active.perimeterMm} mm</span>
            <span><strong>Toplam Şerit (+Bindirme):</strong> ${active.totalStripMm} mm</span>
            <span><strong>V-Kerç:</strong> ${active.vNotchCount} · <strong>Flanş:</strong> ${active.flangeCutCount}</span>
            <span><strong>İlerleme:</strong> <span id="bendProgressMm">${Math.round(active.totalStripMm * progress)}</span> / ${active.totalStripMm} mm</span>
          ` : '<span>Simülasyon için 3D sahneye harf veya vektör ekleyin.</span>'}
        </div>
      </div>

      <div class="sec bending-sim-right">
        <h3 class="sec-title">Toplam İş Özeti &amp; Makine Çıktısı</h3>
        <div class="bending-kpis">
          <div><span>Toplam Bant</span><strong>${job?.totalMeters || 0} m</strong></div>
          <div><span>Toplam Kontur</span><strong>${contours.length} adet</strong></div>
          <div><span>V-Kerç</span><strong>${job?.totalVNotches || 0}</strong></div>
          <div><span>Uyarılar</span><strong style="color:${job?.totalCollisions ? '#f87171' : '#4ade80'}">${job?.totalCollisions || 0}</strong></div>
        </div>
        <div class="bending-table-wrap">
          <table class="bending-table">
            <thead><tr><th>Harf</th><th>Net</th><th>Şerit</th><th>Kerç</th><th>Durum</th></tr></thead>
            <tbody>
              ${contours.map((c, idx) => `
                <tr data-bend-row="${idx}" class="${idx === activeIdx ? 'active' : ''}">
                  <td>${esc(c.label)}</td>
                  <td>${c.perimeterMm}</td>
                  <td><strong>${c.totalStripMm}</strong></td>
                  <td>${c.vNotchCount}</td>
                  <td style="color:${c.collisionCount ? '#f87171' : '#4ade80'}">${c.collisionCount ? `⚠ ${c.collisionCount}` : '✓'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          <button type="button" id="bendExpDxfR2000" class="cta-btn" ${!contours.length ? 'disabled' : ''}>DXF R2000 İndir</button>
          <button type="button" id="bendExpDxfR12" class="sec-btn" ${!contours.length ? 'disabled' : ''}>DXF R12 İndir</button>
          <button type="button" id="bendExpPlt" class="sec-btn" ${!contours.length ? 'disabled' : ''}>HPGL (.plt) İndir</button>
          <button type="button" id="bendExpGcode" class="cta-btn" ${!contours.length ? 'disabled' : ''}>Büküm G-Code İndir</button>
          <button type="button" id="bendPrintJobSheet" class="sec-btn" style="grid-column:1/-1" ${!contours.length ? 'disabled' : ''}>🖨 İş Emri (Job Sheet) Yazdır</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Mounts animated 2D canvas drawing for contour bending simulation + flat unfolded strip bar + clickable seam repositioning.
 */
export function mountBendingSimulatorCanvas({ canvas, contour, simState, onSeamSelect, onProgress }) {
  if (!canvas || !contour) return () => {};
  const ctx = canvas.getContext('2d');
  let rafId = null;
  let lastTs = 0;

  const pts = contour.orderedPoints || [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  const gw = Math.max(10, maxX - minX), gh = Math.max(10, maxY - minY);
  const pad = 42;
  const topH = canvas.height - 96;
  const scale = Math.min((canvas.width - pad * 2) / gw, (topH - pad * 1.4) / gh);
  const ox = (canvas.width - gw * scale) * 0.5 - minX * scale;
  const oy = (topH - gh * scale) * 0.5 + maxY * scale; // flip Y so letter stands upright
  const toCanvas = p => ({ x: ox + p.x * scale, y: oy - p.y * scale });

  const drawFrame = () => {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, w, h);

    // Subtle CAD grid
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, topH); ctx.stroke(); }
    for (let y = 0; y < topH; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Ghost full contour
    if (pts.length >= 2) {
      ctx.beginPath();
      pts.forEach((p, idx) => {
        const c = toCanvas(p);
        if (idx === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
      });
      ctx.strokeStyle = 'rgba(148,163,184,0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Active formed strip up to progress distance
    const targetDist = Math.max(0, Math.min(contour.totalStripMm, simState.progress * contour.totalStripMm));
    const headPt = { x: pts[0]?.x || 0, y: pts[0]?.y || 0 };
    let headAngleRad = 0;

    ctx.beginPath();
    let started = false;
    for (const seg of contour.segments) {
      const a = toCanvas(seg.from);
      if (!started) { ctx.moveTo(a.x, a.y); started = true; }
      if (targetDist >= seg.endDistMm) {
        const b = toCanvas(seg.to);
        ctx.lineTo(b.x, b.y);
        headPt.x = seg.to.x; headPt.y = seg.to.y;
        headAngleRad = Math.atan2(-(seg.to.y - seg.from.y), seg.to.x - seg.from.x);
      } else if (targetDist > seg.startDistMm) {
        const frac = (targetDist - seg.startDistMm) / Math.max(0.01, seg.lengthMm);
        const ix = seg.from.x + (seg.to.x - seg.from.x) * frac;
        const iy = seg.from.y + (seg.to.y - seg.from.y) * frac;
        const b = toCanvas({ x: ix, y: iy });
        ctx.lineTo(b.x, b.y);
        headPt.x = ix; headPt.y = iy;
        headAngleRad = Math.atan2(-(seg.to.y - seg.from.y), seg.to.x - seg.from.x);
        break;
      } else {
        break;
      }
    }
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Bend markers: V-notch (amber), Flange cut (cyan), Collision (red pulse)
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.008);
    for (const b of contour.bends) {
      const c = toCanvas(b.point);
      if (b.hasCollision) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239,68,68,${0.32 * pulse})`;
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (b.isFlangeCut) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(c.x - 4, c.y - 4, 8, 8);
      } else if (b.isVNotch) {
        ctx.beginPath();
        ctx.moveTo(c.x, c.y - 5);
        ctx.lineTo(c.x + 5, c.y + 4);
        ctx.lineTo(c.x - 5, c.y + 4);
        ctx.closePath();
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
      }
    }

    // Green Start Seam pin
    if (contour.seamPoint) {
      const sp = toCanvas(contour.seamPoint);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Animated CNC bender head nozzle
    const hp = toCanvas(headPt);
    ctx.save();
    ctx.translate(hp.x, hp.y);
    ctx.rotate(headAngleRad);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-10, -7, 20, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Bottom Unfolded Strip Timeline Bar
    const stripY = topH + 16;
    const stripX = 28;
    const stripW = w - 56;
    const stripH = 44;
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.fillRect(stripX, stripY, stripW, stripH);
    ctx.strokeRect(stripX, stripY, stripW, stripH);

    // Strip fill up to targetDist
    const fracTotal = Math.min(1, targetDist / Math.max(1, contour.totalStripMm));
    ctx.fillStyle = 'rgba(59,130,246,0.28)';
    ctx.fillRect(stripX, stripY, stripW * fracTotal, stripH);

    // Strip overlap region tint
    const netEndX = stripX + stripW * (contour.perimeterMm / Math.max(1, contour.totalStripMm));
    ctx.fillStyle = 'rgba(34,197,94,0.18)';
    ctx.fillRect(netEndX, stripY, stripX + stripW - netEndX, stripH);

    // Notches on unfolded strip
    for (const m of contour.stripMarkers) {
      const mx = stripX + stripW * (m.distMm / Math.max(1, contour.totalStripMm));
      ctx.strokeStyle = m.hasCollision ? '#ef4444' : (m.isFlangeCut ? '#38bdf8' : '#fbbf24');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, stripY);
      ctx.lineTo(mx, stripY + 12);
      ctx.moveTo(mx, stripY + stripH - 12);
      ctx.lineTo(mx, stripY + stripH);
      ctx.stroke();
    }

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`Açınım Şerit: 0 mm → ${contour.perimeterMm} mm (+${contour.overlapMm} mm bindirme)`, stripX + 8, stripY + stripH + 17);
  };

  const handleClick = e => {
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const cy = ((e.clientY - rect.top) * canvas.height) / rect.height;
    if (cy > topH) return;
    const ring = contour.ringPoints || [];
    let bestIdx = -1, bestDist = 26;
    for (let i = 0; i < ring.length; i++) {
      const p0 = toCanvas(ring[i]), p1 = toCanvas(ring[(i + 1) % ring.length]);
      const midX = (p0.x + p1.x) * 0.5, midY = (p0.y + p1.y) * 0.5;
      const d = Math.hypot(cx - midX, cy - midY);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0 && onSeamSelect) onSeamSelect(contour.key, bestIdx);
  };
  canvas.addEventListener('click', handleClick);

  const tick = ts => {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (simState.playing) {
      const durationSec = Math.max(3, Math.min(18, contour.totalStripMm / 180));
      simState.progress += (dt * (simState.speed || 1)) / durationSec;
      if (simState.progress >= 1) {
        simState.progress = 1;
        simState.playing = false;
      }
      if (onProgress) onProgress(simState.progress, simState.playing);
    }
    drawFrame();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    canvas.removeEventListener('click', handleClick);
  };
}
