import assert from 'node:assert/strict';
import fs from 'node:fs';
import { importSvgText, importVectorText, groupRings } from '../src/manufacturing/VectorFileImport.js';
import { pdfOperatorRings } from '../src/manufacturing/PdfVectorImport.js';
import { runNestingImportJob } from '../src/manufacturing/NestingImportWorker.js';

const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="200mm" viewBox="0 0 400 200"><g transform="translate(10 20)"><path d="M0 0 L100 0 L100 80 L0 80 Z M20 20 L20 40 L50 40 L50 20 Z"/></g></svg>';
const parsed=importSvgText(svg,'nested.svg');
assert.equal(parsed.items.length,1);
assert.equal(parsed.items[0].holes.length,1);
assert.equal(parsed.items[0].areaMm2,8000-600);
const result=runNestingImportJob({operation:'importText',filename:'nested.svg',text:svg,
 options:{unit:'auto',scale:1,tolerance:1},nesting:{sheetWidthMm:1000,sheetHeightMm:500,marginMm:15,clearanceMm:5,kerfMm:.4}});
assert.equal(result.nesting.unplaced.length,0);
assert.equal(result.nesting.sheets.length,1);
assert.equal(result.imported.items[0].holes.length,1);

// Real, native PDF operator list contours, including a second closed hole.
const OPS={save:1,restore:2,transform:3,constructPath:4,moveTo:5,lineTo:6,
 curveTo:7,curveTo2:8,curveTo3:9,closePath:10,rectangle:11,stroke:12,closeStroke:13,
 fill:14,eoFill:15,fillStroke:16,eoFillStroke:17,closeFillStroke:18,closeEOFillStroke:19,
 endPath:20,clip:21,eoClip:22,showText:23,paintImageXObject:24};
const list={fnArray:[OPS.constructPath,OPS.eoFill],argsArray:[
  [[OPS.rectangle,OPS.rectangle],[0,0,200,100,60,20,40,30]],[]]};
const pdf=pdfOperatorRings(list,OPS);
assert.equal(pdf.rings.length,2);
assert(Math.abs(pdf.rings[0][1].x-200*25.4/72)<.001);
const grouped=groupRings(pdf.rings,'contours.pdf','pdf',1,[]);
assert.equal(grouped.items.length,1);
assert.equal(grouped.items[0].holes.length,1);
assert.throws(()=>importVectorText('foo','drawing.cdr'),/dönüştürücü/);

// Thousands of independent shapes must be indexable without quadratic ring nesting.
const many='<svg width="2000mm" height="2000mm" viewBox="0 0 2000 2000">'+
 Array.from({length:1200},(_,i)=>'<rect x="'+((i%40)*47)+'" y="'+(Math.floor(i/40)*55)+'" width="20" height="20"/>').join('')+'</svg>';
const start=performance.now();
const bulk=importSvgText(many,'bulk.svg');
assert.equal(bulk.items.length,1200);
assert(performance.now()-start<9000,'Large SVG contour indexing should not exhibit O(N²) freeze');
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert(main.includes('runVectorImportJob(job,'));
assert(main.includes('importPdfFile(file,options,'));
assert(main.includes('currentNestingImportController?.abort()'));
assert(!main.includes('file.size > 12 * 1024 * 1024'));
assert(!fs.readFileSync(new URL('../src/manufacturing/VectorFileImport.js',import.meta.url),'utf8').includes("if(text.length>12*1024*1024)"));
const vendor=fs.readFileSync(new URL('../public/vendor/pdfjs/pdf.min.js',import.meta.url),'utf8');
assert(vendor.includes('pdfjsLib'));
console.log('✓ Native PDF contour operators, huge SVG indexed in worker, cancellation and removed 12MB cap');
