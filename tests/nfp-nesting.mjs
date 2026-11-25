import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFont } from '../src/vendor/opentype.mjs';
import { layoutTextMm } from '../src/geometry/FontManager.js';
import { buildChannelComponent } from '../src/geometry/ChannelLetterGeometry.js';
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

 // Exact Minkowski NFP + Multi-Directional Compaction: curved crescent arcs + U spoon-nesting
 const makeArc = (id, rOut = 120, rIn = 85, a0 = -55, a1 = 55, steps = 16) => {
   const pts = [];
   for (let i = 0; i <= steps; i++) {
     const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180;
     pts.push({ x: Math.cos(a) * rOut, y: Math.sin(a) * rOut });
   }
   for (let i = steps; i >= 0; i--) {
     const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180;
     pts.push({ x: Math.cos(a) * rIn, y: Math.sin(a) * rIn });
   }
   const b = polygonBounds(pts);
   return make(id, pts.map(p => [p.x - b.minX, p.y - b.minY]));
 };
 const makeU = (id, w = 130, h = 160, t = 28) => make(id, [
   [0, 0], [w, 0], [w, h], [w - t, h], [w - t, t], [t, t], [t, h], [0, h],
 ]);
 const curvedBatch = [
   makeU('U0'),
   makeArc('ARC0'),
   makeArc('ARC1'),
   makeArc('ARC2'),
   makeArc('ARC3'),
   makeArc('ARC4'),
 ];
 const curvedCfg = { sheetWidthMm: 520, sheetHeightMm: 340, marginMm: 8, clearanceMm: 4, kerfMm: 0, rotationStepDeg: 'auto', placementStrategy: 'auto', optimizationBudgetMs: 2200 };
 const curvedBaseline = runTrueShapeNesting(curvedBatch, { ...curvedCfg, quickImport: true });
 const curvedOpt = optimizeNesting(curvedBatch, curvedCfg);
 assert.equal(curvedOpt.unplaced.length, 0);
 assert.equal(curvedOpt.sheetCount, 1);
 assert(validateSheetLayout(curvedOpt.sheets[0], 4, true).valid);
 const envOf = (res) => {
   const s = res.sheets[0];
   return Math.max(0, ...s.placements.map(p => p.bounds.maxX)) * Math.max(0, ...s.placements.map(p => p.bounds.maxY));
 };
 const envRatio = envOf(curvedOpt) / Math.max(1, envOf(curvedBaseline));
 assert(envRatio <= 0.78, `Expected curved arcs + U to compact envelope by >=22% vs baseline, got ratio ${envRatio.toFixed(3)}`);
 assert(curvedOpt.interlockedPairs >= 3, `Expected >=3 interlocked curved pairs, got ${curvedOpt.interlockedPairs}`);
 for (const p of curvedOpt.sheets[0].placements) {
   const orig = curvedBatch.find(x => x.id === p.id);
   assert.equal(p.outer.length, orig.outer.length);
   assert(Math.abs(polygonArea(p.outer) - polygonArea(orig.outer)) < 0.01);
 }

 // Strict 0-degree grain lock (zero rotation across Pro, baseline, and optimizer)
 for (const solver of [
   runTrueShapeNesting(curvedBatch, { ...curvedCfg, sheetWidthMm: 900, sheetHeightMm: 500, enforceGrainDirection: true }),
   runProNesting(curvedBatch, { ...curvedCfg, sheetWidthMm: 900, sheetHeightMm: 500, enforceGrainDirection: true, timeBudgetMs: 800 }),
   optimizeNesting(curvedBatch, { ...curvedCfg, sheetWidthMm: 900, sheetHeightMm: 500, enforceGrainDirection: true, optimizationBudgetMs: 1000 }),
 ]) {
   assert.equal(solver.unplaced.length, 0);
   for (const p of solver.sheets.flatMap(s => s.placements)) {
     assert.equal(p.angleDeg, 0, `enforceGrainDirection must lock every part to 0 deg, got ${p.angleDeg}`);
   }
 }
 console.log(`✓ Exact Minkowski NFP crescent/U interlocking (env ${(envRatio * 100).toFixed(1)}%, interlocked=${curvedOpt.interlockedPairs}) & strict 0° grain lock verified`);

 // Real serif font (Cinzel) 'MARKANIZ' true-shape A(0°)+A(180°) & diagonal interlocking check
 const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
 const loadWoff = (fn) => {
   const b = fs.readFileSync(path.join(ROOT, 'public/fonts', fn));
   return parseFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
 };
 const cinzel = [loadWoff('cinzel-latin-700-normal-C-gK7hA8.woff'), loadWoff('cinzel-latin-ext-700-normal-CORa-yIv.woff')];
 const markaniz = layoutTextMm(cinzel, 'MARKANIZ', 400, 8).glyphs.map((g, gi) => {
   const built = buildChannelComponent(g.shapes, { constructionType: 'metal', depthMm: 80 });
   return built.polygonsMm.map((poly, pi) => {
     const b = polygonBounds(poly.outer);
     const sh = p => ({ x: p.x - b.minX, y: p.y - b.minY });
     const outer = poly.outer.map(sh);
     const holes = poly.holes.map(h => h.map(sh));
     return {
       id: `m_${gi}_${pi}`,
       label: `${g.char} (Gövde)`,
       partType: 'Gövde',
       materialGroup: 'metal · 80 mm',
       outer,
       holes,
       areaMm2: polygonArea(outer) - holes.reduce((a, h) => a + polygonArea(h), 0),
     };
   });
 }).flat();
 const mCfg = { sheetWidthMm: 3000, sheetHeightMm: 1500, marginMm: 15, clearanceMm: 5, kerfMm: 0.2, rotationStepDeg: 'auto', placementStrategy: 'compact', optimizationBudgetMs: 2500 };
 const mBase = runTrueShapeNesting(markaniz, { ...mCfg, quickImport: true });
 const mOpt = optimizeNesting(markaniz, mCfg);
 assert.equal(mOpt.unplaced.length, 0);
 assert.equal(mOpt.sheetCount, 1);
 assert(validateSheetLayout(mOpt.sheets[0], 5.2, true).valid);
 const mRatio = envOf(mOpt) / Math.max(1, envOf(mBase));
 assert(mOpt.interlockedPairs >= 1, `Expected real Cinzel MARKANIZ interlocking >= 1, got ${mOpt.interlockedPairs}`);
 assert(mRatio <= 0.88, `Expected MARKANIZ true-shape envelope reduction vs rectangular baseline, got ${(mRatio * 100).toFixed(1)}%`);
 console.log(`✓ Real Cinzel MARKANIZ true-shape interlocking verified (env ${(mRatio * 100).toFixed(1)}%, interlocked=${mOpt.interlockedPairs})`);
