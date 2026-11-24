import assert from 'node:assert/strict';
import {pdfOperatorRings} from '../src/manufacturing/PdfVectorImport.js';
import {runNestingImportJob} from '../src/manufacturing/NestingImportWorker.js';
const OPS={constructPath:4,rectangle:11,fill:14,eoFill:15,moveTo:5,lineTo:6,closePath:10,curveTo:7,stroke:12};
const list={fnArray:[4,14,4,15],argsArray:[[[11],[0,0,2300,600]],[],[[11,11],[100,100,100,200,120,120,60,160]],[]]};
list.fnArray.push(4,12);list.argsArray.push([[5,6,6],[0,0,50,0,50,100]],[]);
const parsed=pdfOperatorRings(list,OPS);
assert.equal(parsed.groups.length,2);assert.equal(parsed.rings.length,3); // open dimension line is ignored
const out=runNestingImportJob({operation:'importPdfPages',pages:[list],ops:OPS,filename:'test.pdf',options:{scale:72/25.4},nesting:{sheetWidthMm:3000,sheetHeightMm:1500}});
assert.equal(out.imported.items.length,2);assert.equal(out.imported.items[1].holes.length,1);assert.equal(out.nesting.unplaced.length,0);
console.log('✓ Independent painted PDF paths, physical dimensions, safe quick nesting');
