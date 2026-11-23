import { formatMoney } from './CostEngine.js';

/**
 * Professional Turkish Customer Quotation Generator (HTML / Print-to-PDF)
 * Supports price locking so subsequent geometry edits do not alter an agreed customer quote.
 */

export function buildQuoteHtml(state, metrics, costs, previewDataUrl = null) {
  const q = state.quote;
  const activeCosts = q.locked && q.lockedSnapshot ? q.lockedSnapshot.costs : costs;
  const activeMetrics = q.locked && q.lockedSnapshot ? q.lockedSnapshot.metrics : metrics;
  const curr = activeCosts.currency;
  const today = new Date().toLocaleDateString('tr-TR');
  const validUntil = new Date(Date.now() + (Number(q.validityDays) || 15) * 86400000).toLocaleDateString('tr-TR');

  const rowsHtml = activeMetrics.components
    .map(
      (c) => `
      <tr>
        <td>${c.index}</td>
        <td><strong>${escapeHtml(c.label)}</strong></td>
        <td>${escapeHtml(c.constructionType?.toUpperCase() || 'FİLELİ')}</td>
        <td>${c.widthMm} × ${c.heightMm} × ${c.depthMm} mm</td>
        <td>${c.ledCount} adet</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Teklif - ${escapeHtml(state.projectName)}</title>
<style>
  body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #18181b; margin: 32px; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #d97706; padding-bottom: 16px; margin-bottom: 20px; }
  .brand h1 { margin: 0; font-size: 22px; color: #111827; }
  .brand p { margin: 2px 0; font-size: 12px; color: #52525b; }
  .meta { text-align: right; font-size: 12px; color: #3f3f46; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .box { border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; background: #fafafa; font-size: 13px; }
  .box h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #71717a; }
  .preview { text-align: center; margin: 16px 0; }
  .preview img { max-width: 100%; max-height: 260px; border-radius: 8px; border: 1px solid #e4e4e7; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12.5px; }
  th, td { border-bottom: 1px solid #e4e4e7; padding: 8px 10px; text-align: left; }
  th { background: #f4f4f5; font-weight: 600; }
  .totals { margin-top: 20px; margin-left: auto; width: 320px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #e4e4e7; }
  .totals .grand { font-size: 16px; font-weight: 700; color: #b45309; border-bottom: 2px solid #d97706; padding-top: 8px; }
  .notes { margin-top: 24px; font-size: 12px; color: #52525b; border-top: 1px solid #e4e4e7; padding-top: 12px; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <h1>${escapeHtml(q.companyName)}</h1>
      <p>${escapeHtml(q.companyAddress)}</p>
      <p>${escapeHtml(q.companyPhone)} · ${escapeHtml(q.companyEmail)}</p>
    </div>
    <div class="meta">
      <div><strong>TEKLİF FORMU</strong>${q.locked ? ' (KİLİTLİ)' : ''}</div>
      <div>Tarih: ${today}</div>
      <div>Geçerlilik: ${validUntil}</div>
      <div>Proje: ${escapeHtml(state.projectName)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>Müşteri Bilgileri</h3>
      <div><strong>Yetkili:</strong> ${escapeHtml(q.customerName || '—')}</div>
      <div><strong>Firma:</strong> ${escapeHtml(q.customerCompany || '—')}</div>
      <div><strong>Telefon:</strong> ${escapeHtml(q.customerPhone || '—')}</div>
      <div><strong>E-posta:</strong> ${escapeHtml(q.customerEmail || '—')}</div>
    </div>
    <div class="box">
      <h3>Üretim ve Teslimat</h3>
      <div><strong>Toplam Ölçü:</strong> ${activeMetrics.totalWidthMm} × ${activeMetrics.totalHeightMm} mm</div>
      <div><strong>Üretim Süresi:</strong> ${q.productionDays} iş günü</div>
      <div><strong>Teslimat:</strong> ${escapeHtml(q.deliveryTerms)}</div>
      <div><strong>Montaj:</strong> ${escapeHtml(q.installationDetails)}</div>
    </div>
  </div>

  ${previewDataUrl ? `<div class="preview"><img src="${previewDataUrl}" alt="3D Tabela Önizleme"></div>` : ''}

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Bileşen / Harf</th>
        <th>Yapı Tipi</th>
        <th>Ölçü (G × Y × D)</th>
        <th>LED</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Ara Toplam</span><strong>${formatMoney(activeCosts.subtotal, curr)}</strong></div>
    <div><span>KDV (%${Math.round((state.costConfig.vatRate || 0.2) * 100)})</span><strong>${formatMoney(activeCosts.vatAmount, curr)}</strong></div>
    <div class="grand"><span>Genel Toplam</span><span>${formatMoney(activeCosts.grandTotal, curr)}</span></div>
  </div>

  <div class="notes">
    <strong>Notlar ve Şartlar:</strong> ${escapeHtml(q.notes)}
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
