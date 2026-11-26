import {formatDimensions} from '../core/units.js';
import { formatMoney } from './CostEngine.js';
import { generateQrSvg } from '../sales/QrCodeGenerator.js';

/**
 * Müşteriye sunulan teklif. Alış fiyatlarını, genel gideri ve kârı ASLA dışa aktarmaz.
 * HTML tarayıcıdan PDF olarak kaydedilebilir; firma logoları projede data URL olarak saklanır.
 */
export function buildQuoteHtml(state, metrics, costs, previewDataUrl = null, extras = {}) {
  const q=state.quote||{};
  const locked=q.locked && q.lockedSnapshot;
  const activeCosts=locked ? q.lockedSnapshot.costs : costs;
  const activeMetrics=locked ? q.lockedSnapshot.metrics : metrics;
  const curr=activeCosts.currency||'TRY';
  const date=locked && q.lockedSnapshot?.createdAt ? new Date(q.lockedSnapshot.createdAt) : new Date();
  const validDate=new Date(date.getTime() + Math.max(1,Number(q.validityDays)||15)*86400000);
  const formatDate=d=>d.toLocaleDateString('tr-TR',{year:'numeric',month:'long',day:'numeric'});
  const p=(s)=>escapeHtml(s||'—');
  const companyLogo=safeImage(q.companyLogoDataUrl);
  const customerLogo=safeImage(q.customerLogoDataUrl);
  const preview=safeImage(previewDataUrl);
  const detail=Array.isArray(activeCosts.lines)?activeCosts.lines.filter(l=>l.included!==false&&Number(l.quantity)>0):[];
  const rawTotal=detail.reduce((a,l)=>a+(Number(l.sellAmount)||0),0);
  const mode=state.costConfig?.pricingMode||'unit';
  const rate=mode!=='unit' && rawTotal>0 ? (Number(activeCosts.preDiscountPrice)||0)/rawTotal : 1;
  const rows=detail.map((l,index)=>{
    const unit=Number(l.saleUnit||0)*rate;
    const linePrice=Number(l.sellAmount||0)*rate;
    return `<tr><td class="line-index">${index+1}</td><td><b>${p(l.label)}</b></td><td class="number">${num(l.quantity)}</td><td>${p(l.unit)}</td><td class="number">${formatMoney(unit,curr)}</td><td class="number"><b>${formatMoney(linePrice,curr)}</b></td></tr>`;
  }).join('');
  const dimensions = formatDimensions(activeMetrics.totalWidthMm,activeMetrics.totalHeightMm,state.pageLayout?.displayUnit);
  const depthMm = Math.round(state.dimensions?.depthMm || 80);
  const qrTarget = String(extras?.shareUrl || `https://kutuharf.local/?teklif=${encodeURIComponent(q.quoteNumber || 'KT-0001')}`);
  const qrSvg = generateQrSvg(qrTarget, 92);
  const opts = [
    `${num(activeMetrics.componentCount)} harf/parça`,
    `${dimensions} · Derinlik ${depthMm} mm`,
    `LED: ${num(activeMetrics.totalLedModules)} modül`,
  ];
  const styles = `
  :root{font-family:'Segoe UI',Arial,sans-serif;color:#18202b;font-size:12px}
  *{box-sizing:border-box} body{margin:0;background:#f3f4f6;line-height:1.5}
  .paper{max-width:210mm;min-height:290mm;margin:12px auto;background:#fff;padding:15mm 16mm 17mm;box-shadow:0 12px 36px #18202b19}
  .mast{display:grid;grid-template-columns:1fr auto;gap:25px;align-items:start;border-bottom:3px solid #be9557;padding-bottom:22px}
  .brand{display:flex;align-items:center;gap:14px}.logo{display:block;max-height:70px;max-width:135px;object-fit:contain}
  .brand-name{font-size:21px;line-height:1.2;font-weight:800;letter-spacing:-.5px}
  .muted{color:#677180}.sm{font-size:10.5px}.contacts{margin-top:7px;line-height:1.6}
  .offer{text-align:right}.eyebrow{font-size:10px;letter-spacing:2px;font-weight:800;color:#a77c3b}
  .offer h1{font-size:23px;margin:4px 0 10px;line-height:1.1;color:#1d2530}
  .pill{display:inline-block;border:1px solid #e4d2b5;color:#865d25;background:#fbf6ed;border-radius:6px;padding:4px 9px;font-size:10px;font-weight:700}
  .meta{margin-top:10px;font-size:11px;color:#525c6a}.meta b{color:#222}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 9px;color:#946f3e}
  .boxes{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:22px}
  .box{border:1px solid #e7e9ec;border-radius:10px;padding:14px 16px;min-height:118px}
  .box h3{font-size:10px;text-transform:uppercase;letter-spacing:1.25px;margin:0 0 8px;color:#a47b48}
  .box .title{font-size:14px;font-weight:750;margin-bottom:5px}
  .customer-logo{max-height:42px;max-width:100px;display:block;object-fit:contain;margin-bottom:8px}
  .project-name{font-size:16px;margin:0 0 7px;font-weight:800}
  .specs{display:flex;flex-wrap:wrap;gap:7px}.specs span{padding:5px 9px;background:#f6f7f8;border-radius:4px;font-size:10.5px}
  .visual{margin:16px 0 4px;display:grid;place-items:center;padding:10px;border:1px solid #e5e8eb;border-radius:9px}
  .visual img{max-width:100%;max-height:195px;object-fit:contain}
  .qr-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px;padding:10px 14px;border:1px solid #e2d5be;border-radius:9px;background:#fbf8f2}
  .qr-box{flex:none;background:#fff;padding:4px;border:1px solid #e5e7eb;border-radius:6px;line-height:0}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10.5px}
  thead{display:table-header-group} tr{break-inside:avoid;page-break-inside:avoid}
  th{background:#233043;color:#fff;padding:9px 8px;text-align:left;white-space:nowrap;font-weight:600}
  td{padding:8px;border-bottom:1px solid #e6e9ec;vertical-align:middle}
  tbody tr:nth-child(even){background:#fafbfc}.line-index{color:#7f8790;width:28px}
  .number{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .total-area{display:flex;justify-content:flex-end;margin-top:14px}
  .totals{width:290px;max-width:100%}.totals .r{display:flex;justify-content:space-between;gap:15px;padding:7px 0;border-bottom:1px solid #e8e9ee}
  .totals .main{margin-top:7px;background:#223047;color:#fff;padding:14px;border-radius:8px;display:flex;justify-content:space-between;font-size:15px;font-weight:800}
  .terms{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:12px}
  .terms section{border:1px solid #e6e8ed;border-radius:8px;padding:11px 13px;min-height:74px}
  .terms h3{margin:0 0 6px;font-size:10.5px;color:#9b7443;letter-spacing:.3px}
  .notes{white-space:pre-wrap;overflow-wrap:anywhere}
  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:25px;padding-top:12px;border-top:1px solid #e5e7eb}
  .signatures .sign{min-height:65px;border-top:1px dashed #c4cbd3;margin-top:37px;text-align:center;padding:5px;color:#677180}
  .foot{margin-top:20px;padding-top:12px;border-top:1px solid #e8eaec;display:flex;justify-content:space-between;color:#7c8592;font-size:9px}
  @page{size:A4;margin:9mm}
  @media print{body{background:#fff}.paper{padding:4mm 5mm;margin:0;box-shadow:none;max-width:unset;min-height:auto}.terms section{break-inside:avoid} .total-area{break-inside:avoid}}
  `;
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${p(q.quoteNumber||'Teklif')} · ${p(state.projectName)}</title><style>${styles}</style></head>
<body><main class="paper"><header class="mast">
  <div class="brand">${companyLogo?`<img class="logo" src="${companyLogo}" alt="Üretici firma logosu">`:''}<div>
    <div class="brand-name">${p(q.companyName)}</div><div class="contacts muted sm">${p(q.companyAddress)}<br>${p(q.companyPhone)} &nbsp;·&nbsp; ${p(q.companyEmail)}</div></div></div>
  <div class="offer"><div class="eyebrow">FİYAT TEKLİFİ</div><h1>Üretim &amp; Montaj</h1><span class="pill">${locked?'FİYAT SABİTLENDİ':'TEKLİF'}</span>
  <div class="meta"><b>Teklif No:</b> ${p(q.quoteNumber||'—')}<br><b>Tarih:</b> ${formatDate(date)}<br><b>Geçerlilik:</b> ${formatDate(validDate)}</div></div>
</header>
<div class="boxes"><section class="box"><h3>TEKLİF VERİLEN FİRMA</h3>${customerLogo?`<img class="customer-logo" src="${customerLogo}" alt="Müşteri firma logosu">`:''}
  <div class="title">${p(q.customerCompany||q.customerName)}</div><div>${p(q.customerName)}</div><div class="muted sm">${p(q.customerAddress)}<br>${p(q.customerPhone)} &nbsp; ${p(q.customerEmail)}</div></section>
  <section class="box"><h3>PROJE &amp; ÜRETİM</h3><div class="project-name">${p(state.projectName)}</div>
  <div class="specs"><span>Ölçü: ${p(dimensions)} · Derinlik ${depthMm} mm</span><span>${p(q.productionDays||7)} iş günü</span><span>${p(opts[0])}</span><span>${p(opts[2])}</span></div>
  <div class="sm muted" style="margin-top:8px">${p(q.deliveryTerms)}</div></section></div>
  ${preview?`<div class="visual"><img src="${preview}" alt="Tabela 3D görseli"></div>`:''}
  <div class="qr-bar"><div><b style="color:#865d25;font-size:11.5px">CANLI 3D ÖNİZLEME &amp; ONAY QR KODU</b><div class="sm muted">Müşteriniz telefon kamerasıyla QR kodu okutarak 3D tabelayı 360° inceleyebilir ve onaylayabilir.</div></div><div class="qr-box">${qrSvg}</div></div>
  <h2>Ürünler, malzemeler ve hizmetler</h2>
  <table><thead><tr><th>#</th><th>Ürün / İş Kalemi</th><th class="number">Miktar</th><th>Birim</th><th class="number">Birim Satış</th><th class="number">Tutar</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="6">Henüz hesaplanmış iş kalemi bulunmuyor.</td></tr>'}</tbody></table>
  <div class="total-area"><div class="totals"><div class="r"><span>İşçilik ve Malzeme Toplamı</span><b>${formatMoney(activeCosts.preDiscountPrice,curr)}</b></div>
  ${activeCosts.discountAmount?`<div class="r"><span>İndirim</span><b>− ${formatMoney(activeCosts.discountAmount,curr)}</b></div>`:''}
  ${activeCosts.manualAdj?`<div class="r"><span>Fiyat Düzeltmesi</span><b>${formatMoney(activeCosts.manualAdj,curr)}</b></div>`:''}
  <div class="r"><span>KDV Hariç Ara Toplam</span><b>${formatMoney(activeCosts.subtotal,curr)}</b></div>
  <div class="r"><span>KDV (%${num((activeCosts.vatRate||0)*100)})</span><b>${formatMoney(activeCosts.vatAmount,curr)}</b></div>
  <div class="main"><span>TEKLİF TOPLAMI</span><span>${formatMoney(activeCosts.grandTotal,curr)}</span></div></div></div>
  <h2>Uygulama ve ticari şartlar</h2><div class="terms"><section><h3>ÜRETİM / TESLİM</h3>
  <div class="notes">${p(q.deliveryTerms)}<br><b>Üretim:</b> ${num(q.productionDays||7)} iş günü<br><b>Montaj:</b> ${p(q.installationDetails)}</div></section>
  <section><h3>ÖDEME KOŞULLARI</h3><div class="notes">${p(q.paymentTerms||'Ödeme koşulları karşılıklı anlaşma ile belirlenir.')}</div></section>
  <section style="grid-column:1/-1"><h3>NOTLAR / KAPSAM</h3><div class="notes">${p(q.notes)}</div></section></div>
  <div class="signatures"><div><div class="sign">${p(q.companyName)} · Yetkili Onayı</div></div><div><div class="sign">${p(q.customerCompany||'Müşteri')} · Onay</div></div></div>
  <footer class="foot"><span>${p(q.companyName)} · ${p(q.companyPhone)} · ${p(q.companyEmail)}</span><span>${p(q.quoteNumber||'Teklif')} · ${formatDate(date)}</span></footer>
</main></body></html>`;
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function num(n){const x=Number(n);return Number.isFinite(x)?new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(x):'0';}
function safeImage(v){return typeof v==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<3_000_000?v:'';}
