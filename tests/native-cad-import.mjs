import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {convertDwg,convertCdr,importNativeCad,cleanCdrSvg} from '../src/manufacturing/NativeCadImport.js';
import {runNestingImportJob} from '../src/manufacturing/NestingImportWorker.js';
const bytes=async name=>new Uint8Array(await fs.readFile(new URL('./native-cad-fixtures/'+name,import.meta.url)));
const read=async name=>{const b=await bytes(name);return b.buffer;};
for(const name of ['circle2018.dwg','polygon2000.dwg']){
 const input=await read(name),dxf=await convertDwg(input);assert(dxf.includes('ENTITIES'));
 const result=await importNativeCad(input,name,'dwg',{tolerance:1});
 assert(result.items.length>0);assert(result.widthMm>0&&result.heightMm>0);
 console.log('✓ real '+name+' -> '+result.items.length+' closed DWG parts');
}
const cdr=await read('test.cdr'),svg=await convertCdr(cdr);assert(/<svg\b/.test(svg));const result=await importNativeCad(cdr,'test.cdr','cdr',{tolerance:1});
assert(result.items.length>0);assert(result.widthMm>0&&result.heightMm>0);
console.log('✓ real CorelDRAW test.cdr -> '+result.items.length+' closed parts');
const job=runNestingImportJob({operation:'nest',imported:result,nesting:{quickImport:true,sheetWidthMm:10000,sheetHeightMm:10000}});
assert(job.nesting.sheets.length>0);
assert.throws(()=>runNestingImportJob({operation:'importBinary',bytes:new Uint8Array([1,2,3]).buffer,filename:'invalid.cdr'}),/dönüştürücü/);
console.log('✓ Native CDR and DWG conversion and nesting');
