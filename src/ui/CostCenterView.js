import { formatMoney, listPriceCatalog, getPriceCard, toTargetCurrency, COST_ROLE_LABELS } from '../manufacturing/CostEngine.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money = (n,c) => formatMoney(Number(n)||0,c);
const dec = n => Number(Number(n||0).toFixed(4));
const show = (v,fallback='') => esc(v == null?fallback:v);
const roleOf = key => String(key||'').split(':')[0];
const RATE_ROLES = [
  ['face','Ön Yüz Metali'],['side','Yanak Metali'],['file','Ön File'],['acrylic','Pleksi'],['process','İmalat & Hizmet'],
];
function option(value,label,active){return `<option value="${value}"${active===value?' selected':''}>${label}</option>`;}
function field(label,key,val,type='text',attrs=''){
 return `<label class="cst-field"><span>${esc(label)}</span><input data-cost-config="${key}" type="${type}" value="${show(val)}" ${attrs}></label>`;
}
function quoteField(label,key,val,type='text',attrs=''){
 return `<label class="cst-field"><span>${esc(label)}</span><input data-quote-field="${key}" type="${type}" value="${show(val)}" ${attrs}></label>`;
}
function quoteText(label,key,val){return `<label class="cst-field cst-wide"><span>${esc(label)}</span><textarea data-quote-field="${key}" rows="3">${show(val)}</textarea></label>`;}
function logoCard(name,field,value){
 const safe = typeof value==='string' && /^data:image\/(png|jpeg|webp);base64,/.test(value) ? value : '';
 return `<div class="cst-logo-card"><div class="cst-logo-img">${safe?`<img src="${safe}" alt="${esc(name)} logosu">`:'<span>Logo ekleyin</span>'}</div>
 <div class="cst-logo-actions"><label class="cst-button secondary">Logo Yükle<input type="file" data-cost-logo="${field}" accept="image/png,image/jpeg,image/webp" hidden></label>
 ${safe?`<button type="button" class="cst-button ghost" data-cost-clear-logo="${field}">Kaldır</button>`:''}</div>
 <small>${esc(name)} logosu · PNG/JPG/WebP</small></div>`;
}
function card(title,value,meta,kind='') {return `<div class="cst-kpi ${kind}"><small>${esc(title)}</small><strong>${value}</strong><span>${esc(meta)}</span></div>`;}
const TH = '<thead><tr><th>İmalat Kalemi</th><th class="number">Miktar</th><th class="number">Alış / Birim</th><th class="number">Gerçek Maliyet</th><th class="number">Satış / Birim</th><th class="number">Müşteri Tutarı</th></tr></thead>';
function ledger(state, cost){
 const cur=cost.currency;
 const rows=cost.lines.map(l=>{
  const extra=l.key.startsWith('extra:');
  const exchangeNotice=(l.buyRate?.currency!==cur||l.sellRate?.currency!==cur)
    ? `<small>Kur ile: ${esc(cur)}</small>`:'';
  const buy=extra?money(l.buyUnit,cur):`<label class="cst-inline-rate"><input aria-label="${esc(l.label)} alış birim fiyatı" data-rate-key="${esc(l.key)}" data-rate-path="buy.value" type="number" min="0" step="0.01" value="${dec(l.buyRate?.value)}"><small>${esc(l.buyRate?.currency||cur)}</small></label>`;
  const sell=extra?money(l.saleUnit,cur):`<label class="cst-inline-rate"><input aria-label="${esc(l.label)} müşteri birim satış fiyatı" data-rate-key="${esc(l.key)}" data-rate-path="sell.value" type="number" min="0" step="0.01" value="${dec(l.sellRate?.value)}"><small>${esc(l.sellRate?.currency||cur)}</small></label>`;
  return `<tr><td><b>${esc(l.label)}</b><small>${esc(l.group||'Malzeme')}</small></td>
 <td class="number">${dec(l.quantity)} ${esc(l.unit)}</td><td class="number">${buy}</td>
 <td class="number cst-cost-num">${money(l.costAmount,cur)}</td>
 <td class="number">${sell}${exchangeNotice}</td><td class="number cst-sale-num">${money(l.sellAmount,cur)}</td></tr>`;
 }).join('');
 return `<div class="cst-table-scroller"><table class="cst-price-table">${TH}<tbody>${rows||'<tr><td colspan="6">Metraj hesaplanınca kalemler burada görünecek.</td></tr>'}</tbody></table></div>`;
}
function summary(state,metrics,cost){
 const cfg=state.costConfig||{},cur=cost.currency;
 const negative=cost.profitAmount<0;
 return `<div class="cst-summary">
 <div class="cst-kpis">${card('Üretim / Gerçek Maliyet',money(cost.totalCost,cur),`Genel gider dahil`)}
 ${card('KDV Hariç Satış',money(cost.subtotal,cur),'Müşteri teklif tutarı')}
 ${card('Net Proje Kârı',money(cost.profitAmount,cur),`Kâr marjı %${dec(cost.profitMarginPct)}`,negative?'loss':'profit')}
 ${card('KDV Dahil Teklif',money(cost.grandTotal,cur),`KDV %${dec(cost.vatRate*100)}`,'accent')}</div>
 <div class="cst-two-col">
  <section class="cst-card"><div class="cst-heading"><div><small>GERÇEK GEOMETRİDEN</small><h3>Üretim metrajı</h3></div><span class="cst-chip">Canlı</span></div>
   <div class="cst-metrics"><div><span>Toplam ebat</span><b>${dec(metrics.totalWidthMm)} × ${dec(metrics.totalHeightMm)} mm</b></div>
   <div><span>Harf / Parça</span><b>${dec(metrics.componentCount)} adet</b></div>
   <div><span>Metal ön yüz</span><b>${dec(metrics.metalFaceAreaM2)} m²</b></div>
   <div><span>Pleksi / File</span><b>${dec(metrics.acrylicAreaM2)} / ${dec(metrics.fileAreaM2)} m²</b></div>
   <div><span>Yanak alanı</span><b>${dec(metrics.sidewallAreaM2)} m²</b></div>
   <div><span>Kesim / Büküm</span><b>${dec(metrics.cuttingLengthM)} / ${dec(metrics.perimeterM)} m</b></div>
   <div><span>LED / Güç kaynağı</span><b>${dec(metrics.totalLedModules)} / ${dec(metrics.powerSupplies)} adet</b></div></div>
   <p class="cst-help">Metrajlar mevcut 3D/2D nesnelerinden hesaplanır; malzeme fire, tedarik ve montaj toleranslarını kendi tarifenize göre kontrol edin.</p>
  </section>
  <section class="cst-card"><div class="cst-heading"><div><small>FİYATLANDIRMA</small><h3>Maliyet ve satış kuralları</h3></div></div>
   <div class="cst-form-grid">
    <label class="cst-field"><span>Para birimi</span><select data-cost-config="currency">${option('TRY','₺ Türk Lirası',cfg.currency)}${option('USD','$ Amerikan Doları',cfg.currency)}${option('EUR','€ Euro',cfg.currency)}</select></label>
    <label class="cst-field"><span>Fiyatlandırma yöntemi</span><select data-cost-config="pricingMode">${option('unit','Kalem Bazlı Satış Fiyatı',cfg.pricingMode)}${option('markup','Toplam Maliyet + Kâr Payı',cfg.pricingMode)}${option('margin','Hedef Kâr Marjı',cfg.pricingMode)}</select></label>
    ${field('USD kuru (₺)','rates.USD',cfg.rates?.USD,'number','min="0.01" step="0.01"')}
    ${field('EUR kuru (₺)','rates.EUR',cfg.rates?.EUR,'number','min="0.01" step="0.01"')}
    ${field('Genel gider %','overheadPct',cfg.overheadPct,'number','min="0" max="300" step="0.5"')}
    ${field('İndirim %','discountPct',cfg.discountPct,'number','min="0" max="100" step="0.5"')}
    ${cfg.pricingMode==='markup'?field('Toplam kâr payı %','markupPct',cfg.markupPct,'number','min="0" max="1000" step="1"'):''}
    ${cfg.pricingMode==='margin'?field('Hedef net kâr marjı %','marginPct',cfg.marginPct,'number','min="0" max="95" step="1"'):''}
    ${field('Satış fiyatı düzeltmesi','manualAdjustment',cfg.manualAdjustment,'number','step="0.01"')}
    <label class="cst-field"><span>KDV oranı</span><select data-cost-config="vatRate">${option('0','%0',String(cfg.vatRate))}${option('0.01','%1',String(cfg.vatRate))}${option('0.10','%10',String(cfg.vatRate))}${option('0.20','%20',String(cfg.vatRate))}</select></label>
    <label class="cst-field"><span>Montaj</span><select data-cost-config="mountingId">${option('duvar','Duvara Montaj',cfg.mountingId)}${option('profil','Profil / Konstrüksiyonlu',cfg.mountingId)}${option('yok','Montajsız',cfg.mountingId)}</select></label>
   </div><p class="cst-help">Kalem bazlı modda her malzemenin alış ve satış fiyatı bağımsızdır. Diğer iki modda toplam maliyete genel kâr formülü uygulanır. Döviz kurlarını kendiniz güncelleyin; canlı kur bağlantısı yoktur.</p>
  </section>
 </div>
 <section class="cst-card"><div class="cst-heading"><div><small>İÇ HESAP · MÜŞTERİYE GÖSTERİLMEZ</small><h3>Kalem bazında maliyet / satış karşılaştırması</h3><p class="cst-help">Alış ve müşteri birim fiyatını doğrudan satırdan değiştirin. Özel işler İşçilik &amp; Ek Kalemler bölümünden düzenlenir.</p></div>
 <button type="button" id="costExportInternalCsv" class="cst-button secondary">Excel İçin CSV</button></div>
 ${ledger(state,cost)}
 <div class="cst-totals"><span>Malzeme / İşçilik ${money(cost.directCost,cur)}</span><span>Genel Gider ${money(cost.overheadAmount,cur)}</span><span>İndirim −${money(cost.discountAmount,cur)}</span><b>Gerçek Kâr ${money(cost.profitAmount,cur)}</b></div></section>
 </div>`;
}
function catalogTable(state, cost, role){
 const used=new Set(cost.lines.map(l=>l.key));
 const rows=listPriceCatalog(state).filter(r=>roleOf(r.key)===role);
 const currs=['TRY','USD','EUR'];
 return `<div class="cst-table-scroller"><table class="cst-price-table cst-rate-table"><thead><tr><th>Malzeme / İşlem</th><th>Birim</th><th>Üretici Alış</th><th>Alış Para</th><th>Müşteri Satış</th><th>Satış Para</th><th>İşlem</th></tr></thead>
 <tbody>${rows.map(r=>`<tr class="${used.has(r.key)?'cst-used':''}" data-cost-catalog-item="${esc(r.key)}">
 <td><b>${esc(r.label)}</b>${used.has(r.key)?'<small>Bu projede kullanılıyor</small>':''}</td><td>${esc(r.unit)}</td>
 <td><input aria-label="${esc(r.label)} alış fiyatı" data-rate-key="${esc(r.key)}" data-rate-path="buy.value" type="number" min="0" step="0.01" value="${dec(r.buy.value)}"></td>
 <td><select data-rate-key="${esc(r.key)}" data-rate-path="buy.currency" aria-label="Alış para birimi">${currs.map(c=>option(c,c,r.buy.currency)).join('')}</select></td>
 <td><input aria-label="${esc(r.label)} satış fiyatı" data-rate-key="${esc(r.key)}" data-rate-path="sell.value" type="number" min="0" step="0.01" value="${dec(r.sell.value)}"></td>
 <td><select data-rate-key="${esc(r.key)}" data-rate-path="sell.currency" aria-label="Satış para birimi">${currs.map(c=>option(c,c,r.sell.currency)).join('')}</select></td>
 <td>${state.costConfig?.priceBook?.[r.key]?`<button type="button" class="cst-button ghost" data-cost-reset-rate="${esc(r.key)}" title="Varsayılan fiyatı geri al">↶</button>`:'<span class="muted">—</span>'}</td>
 </tr>`).join('')}</tbody></table></div>`;
}
function pricebook(state,cost,role){
 const allowed=['face','side','file','acrylic','process']; const chosen=allowed.includes(role)?role:'face';
 return `<section class="cst-card"><div class="cst-heading"><div><small>ÖZEL BİRİM FİYAT KATALOĞU</small><h3>Üretici alış ve müşteri satış tarifeleri</h3></div><button type="button" id="costSavePriceDefaults" class="cst-button secondary">Tarifeyi Varsayılan Kaydet</button></div>
 <p class="cst-help">Her malzemenin alış ve satış birim fiyatını ayrı girin. Yüz, yanak ve file fiyatları aynı metalde bile birbirinden bağımsız olabilir. Ayarlar bu projeye kaydedilir; istersen varsayılan tarife olarak da saklayabilirsin.</p>
 <div class="cst-role-tabs">${RATE_ROLES.map(([id,label])=>`<button type="button" class="${chosen===id?'on':''}" data-cost-role="${id}">${label}</button>`).join('')}</div>
 <div class="cst-catalog-toolbar"><label><span>Malzeme ara</span><input id="costCatalogSearch" type="search" placeholder="Örn: krom, altın, pleksi..."></label><span class="cst-chip">Renklendirilen satırlar bu projede kullanılıyor</span></div>
 ${catalogTable(state,cost,chosen)}
 </section>`;
}
function extras(state){
 const items=state.costConfig?.extraItems||[];
 return `<section class="cst-card"><div class="cst-heading"><div><small>PROJEYE ÖZEL</small><h3>Ek iş kalemleri</h3></div><button type="button" id="costAddExtra" class="cst-button secondary">+ Kalem Ekle</button></div>
 <p class="cst-help">Özel ambalaj, iş güvenliği, iskele, vinç, alt yapı, özel aksesuar veya herhangi bir hizmeti ayrı alış ve satış fiyatıyla ekleyebilirsin.</p>
 <div class="cst-extras">${items.map(e=>`<div class="cst-extra" data-extra-id="${esc(e.id)}">
  <label>Kalem<input data-extra-field="label" value="${show(e.label)}" placeholder="Özel iş"></label>
  <label>Miktar<input data-extra-field="qty" type="number" min="0" step="0.1" value="${dec(e.qty)}"></label>
  <label>Birim<input data-extra-field="unit" value="${show(e.unit||'adet')}"></label>
  <label>Alış<input data-extra-field="buy.value" type="number" min="0" step="0.01" value="${dec(e.buy?.value)}"></label>
  <label>Satış<input data-extra-field="sell.value" type="number" min="0" step="0.01" value="${dec(e.sell?.value)}"></label>
  <button type="button" class="cst-button ghost" data-remove-extra="${esc(e.id)}" title="Kalemi Sil">✕</button>
 </div>`).join('')||'<p class="muted">Henüz ek iş kalemi yok.</p>'}</div>
 </section>`;
}
function quotation(state,metrics,cost){
 const q=state.quote||{};
 const logo1=q.companyLogoDataUrl||'',logo2=q.customerLogoDataUrl||'';
 return `<div class="cst-two-col">
  <section class="cst-card"><div class="cst-heading"><div><small>TEKLİFİ HAZIRLAYAN</small><h3>Üretici firma</h3></div></div>
   ${logoCard('Üretici','companyLogoDataUrl',logo1)}
   <div class="cst-form-grid">${quoteField('Firma adı','companyName',q.companyName)}${quoteField('Telefon','companyPhone',q.companyPhone)}
   ${quoteField('E-posta','companyEmail',q.companyEmail,'email')}${quoteField('Teklif numarası','quoteNumber',q.quoteNumber||'KT-0001')}
   ${quoteText('Firma adresi','companyAddress',q.companyAddress)}</div>
  </section>
  <section class="cst-card"><div class="cst-heading"><div><small>TEKLİFİN ALICISI</small><h3>Müşteri bilgileri</h3></div></div>
   ${logoCard('Müşteri','customerLogoDataUrl',logo2)}
   <div class="cst-form-grid">${quoteField('Müşteri firma','customerCompany',q.customerCompany)}${quoteField('Yetkili kişi','customerName',q.customerName)}
   ${quoteField('Telefon','customerPhone',q.customerPhone)}${quoteField('E-posta','customerEmail',q.customerEmail,'email')}
   ${quoteText('Müşteri adresi','customerAddress',q.customerAddress)}</div>
  </section>
  <section class="cst-card cst-wide"><div class="cst-heading"><div><small>SUNUM VE İŞ ŞARTLARI</small><h3>Teklif ayrıntıları</h3></div></div>
   <div class="cst-form-grid">${quoteField('Üretim süresi (iş günü)','productionDays',q.productionDays,'number','min="1" max="365"')}
   ${quoteField('Teklif geçerliliği (gün)','validityDays',q.validityDays,'number','min="1" max="365"')}
   ${quoteText('Teslimat','deliveryTerms',q.deliveryTerms)}
   ${quoteText('Montaj kapsamı','installationDetails',q.installationDetails)}
   ${quoteText('Ödeme koşulları','paymentTerms',q.paymentTerms)}
   ${quoteText('Teklif notları / teknik açıklama','notes',q.notes)}
   </div><label class="cst-lock"><input id="costQuoteLock" type="checkbox"${q.locked?' checked':''}><span><b>Onaylanan fiyatı kilitle</b><small>Proje değişse bile müşteri teklifinde kaydedilen fiyat/ölçü sabit kalır.</small></span></label>
   <div class="cst-quote-actions"><button type="button" id="costCenterPreviewBtn" class="cst-button secondary">Teklif Önizleme</button>
   <button type="button" id="costCenterPdfBtn" class="cst-button primary">PDF / Yazdır</button>
   <button type="button" id="costCenterHtmlBtn" class="cst-button secondary">HTML İndir</button>
   <button type="button" id="costCenterCopyBtn" class="cst-button secondary">WhatsApp Özeti Kopyala</button></div>
   <p class="cst-help">Müşteriye oluşturulan teklif, iç maliyetlerinizi ve kârınızı içermez. Logolar proje JSON dosyasına gömülür; resmi logo dosyalarını siz yüklemelisiniz.</p>
  </section>
 </div>`;
}
export function renderDetailedCostCenter(state,metrics,cost,ctx={}){
 const tab=ctx.tab||'summary';const title='Maliyet & Teklif Stüdyosu';
 return `<div class="cst-workspace"><header class="cst-header"><div><div class="cst-eyebrow">KUTU HARF STÜDYOSU · TİCARİ YÖNETİM</div><h2>${title}</h2>
 <p>Üretim maliyeti ayrı, müşteriye satış fiyatı ayrı. Gerçek metraj, özelleştirilmiş malzeme tarifeleri ve kurumsal teklif.</p></div>
 <div class="cst-header-actions"><button type="button" class="cst-button secondary" id="costExportInternalCsv">İç Maliyet CSV</button><button type="button" class="cst-button primary" id="costHeaderQuoteBtn">Müşteri Teklifi ↗</button></div></header>
 <nav class="cst-nav" role="tablist" aria-label="Maliyet ve teklif alt bölümleri">
 ${[['summary','Hesap Özeti'],['materials','Malzeme Fiyatları'],['process','İşçilik & Ek Kalemler'],['quote','Teklif Tasarımı']].map(([id,label])=>`<button role="tab" aria-selected="${tab===id}" data-cost-tab="${id}" class="${tab===id?'on':''}">${label}</button>`).join('')}
 </nav><div class="cst-content">
 ${tab==='summary'?summary(state,metrics,cost):tab==='materials'?pricebook(state,cost,ctx.role||'face'):
 tab==='process'?pricebook(state,cost,'process')+extras(state):quotation(state,metrics,cost)}
 </div></div>`;
}
