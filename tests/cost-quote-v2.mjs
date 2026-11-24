import assert from 'node:assert/strict';
import { createDefaultState } from '../src/core/state.js';
import { calculateProjectCosts, getPriceCard, listPriceCatalog } from '../src/manufacturing/CostEngine.js';
import { buildQuoteHtml } from '../src/manufacturing/QuoteGenerator.js';
import { renderCostCenter } from '../src/ui/CentralWorkspaces.js';
import { serializeProject,deserializeProject } from '../src/core/projectSerializer.js';
const state=createDefaultState();
state.objects=[
 {id:'one',faceMaterial:'aynaAltin',sideMaterial:'aynaAltin',sideFollowsFace:false,constructionType:'metal'},
 {id:'two',faceMaterial:'aynaKrom',sideMaterial:'satenAltin',sideFollowsFace:false,constructionType:'metal'},
];
const component=(id)=>({objectId:id,label:id,constructionType:'metal',outerAreaCm2:10000,acrylicAreaCm2:0,fileAreaCm2:0,sidewallAreaCm2:5000,perimeterMm:2500,cuttingLengthMm:3500,ledCount:0});
const metrics={componentCount:2,components:[component('one'),component('two')],totalWidthMm:2000,totalHeightMm:700,
 outerAreaM2:2,metalFaceAreaM2:2,sidewallAreaM2:1,acrylicAreaM2:0,fileAreaM2:0,perimeterM:5,cuttingLengthM:7,totalLedModules:0,powerSupplies:0};
assert.ok(listPriceCatalog(state).length>45);
assert.notEqual(getPriceCard(state,'face:aynaAltin').buy.value,getPriceCard(state,'face:aynaKrom').buy.value);
state.costConfig.pricingMode='unit';state.costConfig.priceBook={
 'face:aynaAltin':{buy:{value:300,currency:'TRY'},sell:{value:3000,currency:'TRY'}},
 'face:aynaKrom':{buy:{value:800,currency:'TRY'},sell:{value:4000,currency:'TRY'}},
 'side:aynaAltin':{buy:{value:120,currency:'TRY'},sell:{value:800,currency:'TRY'}},
};
let costs=calculateProjectCosts(metrics,state);
const faceGold=costs.lines.find(x=>x.key==='face:aynaAltin');
const faceChrome=costs.lines.find(x=>x.key==='face:aynaKrom');
assert.ok(faceGold&&faceChrome);
assert.equal(faceGold.costAmount,300);
assert.equal(faceChrome.costAmount,800);
assert.equal(faceGold.sellAmount,3000);
assert.equal(faceChrome.sellAmount,4000);
const firstSale=costs.subtotal,firstCost=costs.totalCost;
state.costConfig.priceBook['face:aynaAltin'].sell.value=7000;
let c2=calculateProjectCosts(metrics,state);
assert.equal(c2.totalCost,firstCost,'changing only customer sale may NOT change internal cost');
assert.equal(c2.subtotal,firstSale+4000,'changing only sale must update customer total');
state.costConfig.priceBook['face:aynaAltin'].buy.value=500;
let c3=calculateProjectCosts(metrics,state);
assert.ok(c3.totalCost>c2.totalCost);
assert.equal(c3.subtotal,c2.subtotal,'purchase price must not change unit-rate customer sale');
state.costConfig.discountPct=10;state.costConfig.manualAdjustment=180;
let discounted=calculateProjectCosts(metrics,state);
assert.ok(Math.abs(discounted.subtotal-(c3.subtotal*0.9+180))<0.01);
assert.ok(Math.abs(discounted.profitAmount-(discounted.subtotal-discounted.totalCost))<1e-6);
state.costConfig.pricingMode='margin';state.costConfig.marginPct=50;state.costConfig.discountPct=0;state.costConfig.manualAdjustment=0;
let margin=calculateProjectCosts(metrics,state);
assert.equal(margin.subtotal,margin.totalCost*2);
state.costConfig.pricingMode='unit';
state.costConfig.extraItems=[{id:'custom',label:'Vinç',qty:2,unit:'saat',buy:{value:100,currency:'TRY'},sell:{value:450,currency:'TRY'}}];
const extra=calculateProjectCosts(metrics,state);
assert.equal(extra.lines.find(l=>l.key==='extra:custom')?.sellAmount,900);
state.quote.companyName='Atölye & İnşaat';state.quote.customerCompany='Müşteri <Özel>';
state.quote.companyLogoDataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WliOCQAAAAASUVORK5CYII=';
state.quote.customerLogoDataUrl=state.quote.companyLogoDataUrl;
const html=buildQuoteHtml(state,metrics,extra);
assert.ok(html.includes('Atölye &amp; İnşaat'));
assert.ok(html.includes('Müşteri &lt;Özel&gt;'));
assert.ok(html.includes('alt="Müşteri firma logosu"')&&html.includes('alt="Üretici firma logosu"'));
assert.ok(html.includes('Vinç'));
assert.ok(!html.includes('Üretici maliyet toplamı')&&!html.includes('Gerçek Maliyet')&&!html.includes('Net Proje Kârı'));
state.quote.locked=true;state.quote.lockedSnapshot={costs:extra,metrics,createdAt:'2026-11-24T00:00:00.000Z'};
const lockedHtml=buildQuoteHtml(state,metrics,{...extra,grandTotal:9999999});
assert.ok(lockedHtml.includes('FİYAT SABİTLENDİ'));
assert.ok(!lockedHtml.includes('9.999.999'));
const ui=renderCostCenter(state,metrics,extra,{tab:'quote'});
assert.ok(ui.includes('data-cost-logo="companyLogoDataUrl"'));
assert.ok(ui.includes('data-cost-logo="customerLogoDataUrl"'));
const prices=renderCostCenter(state,metrics,extra,{tab:'materials',role:'face'});
assert.ok(prices.includes('data-rate-key="face:aynaKrom"'));
const summary=renderCostCenter(state,metrics,extra,{tab:'summary'});
assert.ok(summary.includes('Gerçek Kâr')&&summary.includes('Alış / Birim'));
const restored=deserializeProject(serializeProject(state));
assert.equal(restored.quote.companyLogoDataUrl,state.quote.companyLogoDataUrl);
assert.equal(restored.costConfig.priceBook['face:aynaAltin'].sell.value,7000);
assert.equal(restored.costConfig.extraItems[0].label,'Vinç');
console.log('✓ 2 taraflı malzeme fiyatı, müşteri teklifindeki gizlilik, 2 logo, özel kalem ve proje kaydı');

const directEdit = renderCostCenter(state, metrics, extra, {tab:'summary'});
assert.ok(directEdit.includes('data-rate-key="face:aynaAltin"') && directEdit.includes('data-rate-path="buy.value"') && directEdit.includes('data-rate-path="sell.value"'));
assert.ok(directEdit.includes('Kalem bazında maliyet'));
