import assert from 'node:assert/strict';
import { createDefaultState } from '../src/core/state.js';
import { runTrueShapeNesting, validateSheetLayout } from '../src/manufacturing/NestingEngine.js';
import { renderNestingSvg } from '../src/ui/NestingView.js';
import { renderNestingCenter } from '../src/ui/CentralWorkspaces.js';
import { generateNestedDxf } from '../src/export/ExportService.js';

const rectangle = (w, h) => [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
const parts = Array.from({length: 8}, (_, i) => ({
  id: `part${i}`, label: ['A','O','R','M','N','K','B','P'][i]+' (Gövde)',
  materialGroup:'Paslanmaz · 2mm', material:'metal', thicknessMm:2,
  outer:rectangle(400,350),holes:[],areaMm2:140000,
}));
const base = { sheetWidthMm:3000,sheetHeightMm:1500,marginMm:15,
  clearanceMm:5,kerfMm:0,rotationStepDeg:0,groupByMaterial:true };
const compact = runTrueShapeNesting(parts,{...base,placementStrategy:'compact'});
const vertical = runTrueShapeNesting(parts,{...base,placementStrategy:'vertical'});
assert.equal(compact.sheets[0].placements.length,8);
assert.equal(vertical.sheets[0].placements.length,8);
assert.ok(vertical.sheets[0].placements.some(p=>p.bounds.minY>600),
  'Vertical strategy should make use of upper rows of the 3000 × 1500 sheet');
for(const result of [compact,vertical]) {
 assert.ok(validateSheetLayout(result.sheets[0],5).valid,'no overlaps or out-of-bounds');
 assert.equal(result.sheets[0].widthMm,3000);
 assert.equal(result.sheets[0].heightMm,1500);
}
const tall={id:'tall',label:'test',materialGroup:'metal',material:'metal',
 outer:rectangle(600,170),holes:[],areaMm2:102000};
const noRotate=runTrueShapeNesting([tall],{sheetWidthMm:300,sheetHeightMm:700,marginMm:10,rotationStepDeg:0});
assert.equal(noRotate.sheets.length,0);
const rotated=runTrueShapeNesting([tall],{sheetWidthMm:300,sheetHeightMm:700,marginMm:10,rotationStepDeg:90});
assert.equal(rotated.sheets.length,1);
assert.equal(rotated.sheets[0].placements[0].angleDeg%180,90);
const grained=runTrueShapeNesting([tall],{sheetWidthMm:300,sheetHeightMm:700,marginMm:10,rotationStepDeg:90,enforceGrainDirection:true});
assert.equal(grained.sheets.length,0,'brush/grain direction prevents sideways rotation');
const state=createDefaultState();
state.nesting.previewColors={body:'#abc123',holes:'#123abc'};
const card=renderNestingCenter(state,{activeSheetIdx:0});
assert.ok(card.includes('id="cwsNestBodyColor"'));
assert.ok(card.includes('id="cwsNestHoleColor"'));
assert.ok(card.includes('value="#abc123"'));
assert.ok(card.includes('value="#123abc"'));
assert.ok(card.includes('id="cwsNestStrategy"'));
assert.ok(card.includes('Nesting v3 Pro'));
assert.ok(card.includes('id="cwsNestAdvanced"'));
assert.ok(!/<details[^>]*id="cwsNestAdvanced"[^>]*\bopen\b/i.test(card), 'Advanced nesting drawer must start closed by default');
const grainedState = createDefaultState();
grainedState.nesting.enforceGrainDirection = true;
const grainedCard = renderNestingCenter(grainedState, { activeSheetIdx: 0, advancedOpen: true });
assert.match(grainedCard, /id="cwsNestRot"[^>]*disabled/, 'Grain lock must disable rotation selector');
assert.ok(!card.includes('cwsNestBudget'));
assert.ok(!card.includes('Optimizasyon süresi'));
assert.ok(!card.includes('Sol araç çubuğu: Seç, Taşı, Ölçek, Döndür.'));
assert.ok(!card.includes('Delete yalnızca seçili nesting parçasını siler.'));
assert.ok(card.includes('henüz hesaplanmadı'));
state.nesting.optimizationInfo={engineVersion:'3.0-pro',selectedEngine:'v3-pro',proAttempts:1,proCompleted:1,attempts:4,elapsedMs:1000};
assert.ok(renderNestingCenter(state,{activeSheetIdx:0}).includes('<b>Son yerleşim:</b> v3 Pro'));
state.nesting.optimizationInfo.selectedEngine='clipper-nfp';
assert.ok(renderNestingCenter(state,{activeSheetIdx:0}).includes('Clipper NFP (daha iyi doğrulanmış sonuç)'));

const holeShape=[{x:60,y:60},{x:60,y:170},{x:170,y:170},{x:170,y:60}];
const sheet={widthMm:1000,heightMm:1000,placements:[
 ...parts.slice(0,2).map((item,i)=>({
  id:item.id,label:item.label,outer:rectangle(260,230).map(pt=>({x:pt.x+i*300+10,y:pt.y+10})),
  holes:[holeShape.map(pt=>({x:pt.x+i*300,y:pt.y}))],
  bounds:{minX:i*300+10,minY:10,maxX:i*300+270,maxY:240}
 }))
]};
const colors={body:'#101abc',holes:'#ddeeff'};
const svg=renderNestingSvg(sheet,null,colors);
assert.equal((svg.match(/data-nest-body="true"/g)||[]).length,2);
assert.equal((svg.match(/data-nest-hole="true"/g)||[]).length,2);
assert.ok(!svg.includes('hsl('),'no separate color per piece');
assert.ok(svg.includes('fill="none"'));
assert.ok(!svg.includes('fill="#101abc"'));
assert.ok(!svg.includes('fill="#ddeeff"'));
assert.ok(!svg.includes('fill-opacity'));
assert.ok(svg.includes('stroke="#101abc"'));
assert.ok(svg.includes('stroke="#ddeeff"'));
const dxfBefore=generateNestedDxf([sheet]);
renderNestingSvg(sheet,null,{body:'#ff00ff',holes:'#ffff00'});
assert.equal(generateNestedDxf([sheet]),dxfBefore,'preview color changes must never alter actual DXF paths');
console.log('✓ Nesting layout strategies, 3000×1500 upper-sheet utilization, rotations, grain constraint, unified colors, colored holes and DXF isolation');
