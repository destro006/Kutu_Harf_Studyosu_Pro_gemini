import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'public/vendor/cad');
await fs.mkdir(out,{recursive:true});
const cdr='https://raw.githubusercontent.com/nobbs/go-libcdr/57427ba5c758239f1debf10ca6034a7955227c73/';
const dwg='https://raw.githubusercontent.com/mlightcad/libredwg-web/c8d0bc8f4c0dfac6fcde9f8347867ed1c35ffad0/';
async function pinned(url,dest,sha){
 let b;try{b=await fs.readFile(dest);}catch{}
 const hash=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 if(!b||hash(b)!==sha){
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('CAD engine asset: '+response.status+' '+url);
  b=Buffer.from(await response.arrayBuffer());
  if(hash(b)!==sha)throw Error('CAD engine asset integrity failure: '+url);
  await fs.writeFile(dest,b);
 }
}
await pinned(cdr+'cdr2svg.wasm',path.join(out,'cdr2svg.wasm'),'9b8df5e7f9be20bb55be7e160a88548fbc4cca03');
await pinned(cdr+'NOTICE',path.join(out,'CDR-NOTICE.txt'),'09f9ee6fd3679231c7905ac0177045e64ce1e171');
await pinned(cdr+'LICENSE',path.join(out,'CDR-LICENSE.txt'),'1c29083c95216a995a3da902a833d3373b703014');
await pinned(cdr+'native/shim/NOTICE',path.join(out,'CDR-SHIM-NOTICE.txt'),'e0f178994b377bd29ad1e16e580135fe60d82d19');
const node=path.join(root,'node_modules/@mlightcad/libredwg-web');
const wasmDir=path.join(node,'wasm');
const entries=await fs.readdir(wasmDir);
const js=entries.find(x=>x==='libredwg-web.js'),wasm=entries.find(x=>x==='libredwg-web.wasm'||x==='libredwg.wasm');
if(!js||!wasm)throw Error('LibreDWG npm package does not contain the expected runtime assets.');
await fs.copyFile(path.join(wasmDir,js),path.join(out,'libredwg-web.js'));
await fs.copyFile(path.join(wasmDir,wasm),path.join(out,'libredwg-web.wasm'));
const dwgApi=await fs.readFile(path.join(node,'dist/libredwg-web.js'),'utf8');
await fs.writeFile(path.join(out,'libredwg-api.js'),dwgApi.replaceAll('../wasm/libredwg-web.js','./libredwg-web.js'));
const gsRoot=path.join(root,'node_modules/@wasmedia/wghostscript'),gsOut=path.join(out,'ghostscript');
await fs.cp(gsRoot,gsOut,{recursive:true});
const gsEntry=fileURLToPath(import.meta.resolve('@wasmedia/wghostscript'));
const gsRelative=path.relative(gsRoot,gsEntry).split(path.sep).join('/');
if(gsRelative.startsWith('..'))throw Error('Ghostscript package entry is outside its package.');
await fs.writeFile(path.join(out,'ghostscript-entry.js'),'export {initWGhostscript} from '+JSON.stringify('./ghostscript/'+gsRelative)+';\n');
await build({stdin:{contents:"export {WASI,File,OpenFile,PreopenDirectory} from '@bjorn3/browser_wasi_shim'; export {unzipSync} from 'fflate';",resolveDir:root},outfile:path.join(out,'cdr-runtime.js'),format:'esm',platform:'browser',bundle:true,legalComments:'linked'});
await fs.writeFile(path.join(out,'NOTICE.txt'),'CDR engine: https://github.com/nobbs/go-libcdr/tree/57427ba5c758239f1debf10ca6034a7955227c73 (MIT/MPL-2.0 and bundled notices).\nDWG engine: @mlightcad/libredwg-web 0.8.8, GPL-3.0; source and build instructions: https://github.com/mlightcad/libredwg-web . Distribution must comply with GPL-3.0.\nWASI shim: @bjorn3/browser_wasi_shim 0.4.2, MIT/Apache-2.0. fflate 0.8.2 MIT.\\nGhostscript: @wasmedia/wghostscript 0.2.0, AGPL-3.0-or-later; redistribution requires license/source compliance.\n');
const fixture=path.join(root,'tests/native-cad-fixtures');await fs.mkdir(fixture,{recursive:true});
await pinned(dwg+'test/test-data/2018/circle.dwg',path.join(fixture,'circle2018.dwg'),'7e524a9d2770ab7011a85c12c1d1134bb1011154');
await pinned(dwg+'test/test-data/2000/Polygon.dwg',path.join(fixture,'polygon2000.dwg'),'d1d4663a841210ff99192df61c5102dc4b4e1fbb');
await pinned('https://raw.githubusercontent.com/fumikrobot/source-code/278c033dd96319ef7cef37685ca623d160c38a23/draw%20file%20prepare/test.cdr',path.join(fixture,'test.cdr'),'46331005467171e3a280f1c84eb51d3a90bb5d15');
console.log('Native CAD engines and pinned upstream test fixtures prepared.');
