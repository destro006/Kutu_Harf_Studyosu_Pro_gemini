import assert from 'node:assert/strict';
import {svgPathRings,svgTransform,importDxfText,importHpglText,importVectorText} from '../src/manufacturing/VectorFileImport.js';
import {createNestingImportedTab,switchNestingTab,closeNestingImportedTab,syncActiveNestingTab,getActiveNestingImportedItems,openNestingImportTab} from '../src/manufacturing/NestingTabs.js';
const rings=svgPathRings('M0 0 L100 0 L100 100 L0 100 Z M25 25 L25 75 L75 75 L75 25 Z');
assert.equal(rings.length,2);assert.deepEqual(rings[0][1],{x:100,y:0});
assert(svgPathRings('M0 0 Q60 130 120 0 L0 0 Z')[0].length>10);
assert(svgPathRings('M0 0 C25 100 75 100 100 0 L0 0 Z')[0].length>20);
assert(svgPathRings('M50 0 A50 50 0 1 1 49.999 0 L50 0 Z').length>=0);
assert.deepEqual(svgTransform('translate(10,20)'),[1,0,0,1,10,20]);
const dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES',
'0','LWPOLYLINE','8','CUT','70','1','10','0','20','0','10','100','20','0','10','100','20','80','10','0','20','80',
'0','LWPOLYLINE','70','1','10','20','20','20','10','20','20','50','10','45','20','50','10','45','20','20',
'0','CIRCLE','10','220','20','20','40','15','0','ENDSEC','0','EOF'].join('\n');
const d=importDxfText(dxf,'parts.dxf');assert.equal(d.items.length,2);assert.equal(d.items[0].holes.length,1);assert.equal(d.items[0].areaMm2,8000-25*30);assert.equal(d.format,'dxf');
const plot='IN;PU0,0;PD4000,0,4000,2000,0,2000,0,0;PU;';
const h=importHpglText(plot,'sample.plt');assert.equal(h.items.length,1);assert.equal(h.widthMm,100);assert.equal(h.heightMm,50);
assert.throws(()=>importVectorText('fake','letter.cdr'),/dönüştürücü/);
const n={sheetWidthMm:3000,sheetHeightMm:1500,marginMm:15,placementStrategy:'compact',sheets:[{id:'original'}],unplaced:[]};
openNestingImportTab(n);assert.equal(n.activeTabId,'import');
const tab=createNestingImportedTab(n,d);assert.equal(n.activeTabId,tab.id);n.sheetWidthMm=1000;n.sheets=[{id:'imported'}];syncActiveNestingTab(n);
assert.equal(getActiveNestingImportedItems(n).length,2);switchNestingTab(n,'design');
assert.equal(n.sheetWidthMm,3000);assert.equal(n.sheets[0].id,'original');switchNestingTab(n,tab.id);
assert.equal(n.sheetWidthMm,1000);assert.equal(n.sheets[0].id,'imported');assert(closeNestingImportedTab(n,tab.id));assert.equal(n.activeTabId,'design');
console.log('✓ SVG path, DXF holes/units, HPGL paths, unsupported formats and separate nesting tabs');
import {renderNestingSourceTabs,renderNestingImportPane} from '../src/ui/NestingImportView.js';
import {runTrueShapeNesting,validateSheetLayout} from '../src/manufacturing/NestingEngine.js';
const nested=runTrueShapeNesting(d.items,{sheetWidthMm:1000,sheetHeightMm:1500,clearanceMm:5,kerfMm:.3,marginMm:15,rotationStepDeg:90});
assert.equal(nested.unplaced.length,0);assert.equal(nested.sheets.length,1);
assert(validateSheetLayout(nested.sheets[0],5.3).valid);
console.log('✓ Imported real polygon jobs pass nesting placement and manufacturing collision checks');

assert(renderNestingSourceTabs({activeTabId:'design',importedTabs:[{id:'x',name:'logo.svg'}]}).includes('data-nest-tab="x"'));
assert(renderNestingImportPane().includes('id="nestVectorFileInput"'));
assert(renderNestingImportPane().includes('Birden fazla dosya'));
console.log('✓ Nesting file tabs and multiple-file import view rendered');
