import assert from 'node:assert/strict';
import {forbiddenTranslations,nfpCandidates} from '../src/manufacturing/NfpGeometry.js';
import {runTrueShapeNesting,validateSheetLayout} from '../src/manufacturing/NestingEngine.js';
import {runProNesting} from '../src/manufacturing/NestingEnginePro.js';
import {optimizeNesting,nestingScore,betterNesting} from '../src/manufacturing/NestingOptimizer.js';
import {polygonArea,polygonBounds} from '../src/geometry/PolygonOffset.js';
const make=(id,coords,holes=[])=>{const outer=coords.map(([x,y])=>({x,y}));const hs=holes.map(r=>r.map(([x,y])=>({x,y})));return {id,label:id,outer,holes:hs,areaMm2:polygonArea(outer)-hs.reduce((a,h)=>a+polygonArea(h),0),materialGroup:'metal'};};
const rect=(id,w,h)=>make(id,[[0,0],[w,0],[w,h],[0,h]]);
const L=(id)=>make(id,[[0,0],[100,0],[100,25],[25,25],[25,100],[0,100]]);
const a=L('a'),b=L('b');
assert(forbiddenTranslations(a.outer,b.outer,2).length>0);
const cfg={sheetWidthMm:210,sheetHeightMm:210,marginMm:2,clearanceMm:2,kerfMm:0,rotationStepDeg:90,optimizationBudgetMs:1500};
const items=Array.from({length:6},(_,i)=>L('L'+i));
const before=runTrueShapeNesting(items,{...cfg,quickImport:true}),after=optimizeNesting(items,cfg);
assert(!betterNesting(before,after));assert.equal(after.unplaced.length,0);assert(after.sheets.every(s=>validateSheetLayout(s,2).valid));assert(after.optimization.nfpAttempts>0);
console.log('L shapes: baseline',nestingScore(before),'NFP',nestingScore(after));
const frame=make('O',[[0,0],[130,0],[130,130],[0,130]],[[[15,15],[15,115],[115,115],[115,15]]]);
const small=rect('I',70,70);
const fit=optimizeNesting([frame,small],{...cfg,sheetWidthMm:140,sheetHeightMm:140,optimizationBudgetMs:1000});
assert.equal(fit.sheetCount,1);assert.equal(fit.unplaced.length,0);assert(validateSheetLayout(fit.sheets[0],2).valid);
assert(!validateSheetLayout(fit.sheets[0],2,false).valid);
const letters=[make('A',[[0,0],[36,105],[64,105],[100,0],[74,0],[65,30],[35,30],[26,0]],[[[43,55],[57,55],[50,80]]]),make('V',[[0,105],[26,105],[50,35],[74,105],[100,105],[64,0],[36,0]]),L('L'),rect('I',22,105)];
const mixed=Array.from({length:3},(_,i)=>letters.map(p=>({...p,id:p.id+i}))).flat();
const opt=optimizeNesting(mixed,{...cfg,sheetWidthMm:350,sheetHeightMm:220,optimizationBudgetMs:1800});
const base=runTrueShapeNesting(mixed,{...cfg,sheetWidthMm:350,sheetHeightMm:220,quickImport:true});
assert(!betterNesting(base,opt));assert.equal(opt.unplaced.length,0);assert(opt.sheets.every(s=>validateSheetLayout(s,2).valid));
for(const p of opt.sheets.flatMap(s=>s.placements)){const original=mixed.find(i=>i.id===p.id);assert.equal(p.outer.length,original.outer.length);assert.equal(p.holes.length,original.holes.length);assert(Math.abs(polygonArea(p.outer)-polygonArea(original.outer))<.001);}
console.log('Letter mix: baseline',nestingScore(base),'NFP',nestingScore(opt));
console.log('✓ Clipper NFP, fixed-sheet packing, hole policy, exact contour preservation, collision validation and baseline protection');

 // Exercise the new solver directly, rather than allowing the fallback to mask regressions.
 const proConfig={...cfg,sheetWidthMm:140,sheetHeightMm:140,rotationStepDeg:0,timeBudgetMs:2000};
 const pro=runProNesting([frame,small],proConfig);
 assert.equal(pro.sheetCount,1);assert.equal(pro.unplaced.length,0);
 assert(pro.sheets.every(s=>validateSheetLayout(s,2,true).valid));
 assert(pro.totalCutLengthM>0);assert.equal(pro.sheets[0].placements.length,2);
 for(const p of pro.sheets[0].placements){assert.equal(p.angleDeg,0);assert.equal(p.outer.length,[frame,small].find(i=>i.id===p.id).outer.length);}
 const noHole=runProNesting([frame,small],{...proConfig,allowHoleNesting:false});
 assert.equal(noHole.sheetCount,2);
 const locked=pro.sheets.map(s=>({...s,placements:s.placements.map(p=>({...p,locked:p.id==='O'}))}));
 const relaid=runProNesting([frame,small],proConfig,locked);
 const oldFrame=pro.sheets[0].placements.find(p=>p.id==='O'),newFrame=relaid.sheets.flatMap(s=>s.placements).find(p=>p.id==='O');
 assert(newFrame.locked);assert.deepEqual(newFrame.outer,oldFrame.outer);
 assert(after.optimization.proAttempts>0);
 console.log('✓ Supplied v3 Pro: hole policy, rotation, locked positions, production cut length and validated optimization integration');
