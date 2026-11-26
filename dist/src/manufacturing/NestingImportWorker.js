/** Runs geometry decoding and true-shape nesting away from the interactive UI thread. */
import {detectVectorFormat,extractPostScript} from './VectorFormatDetect.js';
import {binaryDxfToText} from './BinaryDxfImport.js';
import {importLegacyPostScript,extractAiOutlineFallback} from './LegacyPostScriptImport.js';
import { importVectorText, groupRings } from './VectorFileImport.js';
import { pdfOperatorRings } from './PdfVectorImport.js';
import { optimizeNesting } from './NestingOptimizer.js?v=20261126-v17';
import { runTrueShapeNesting, validateSheetLayout } from './NestingEngine.js';

function processJob(job,onProgress=()=>{}){
  let imported;
  if(job.operation==='importBinary'){
    const data=new Uint8Array(job.bytes),kind=detectVectorFormat(data,job.filename);
    if(['postscript','eps-binary','ai','eps','ps'].includes(kind))imported=importLegacyPostScript(extractPostScript(data),job.filename,job.options||{});
    else if(kind==='dxf-binary')imported=importVectorText(binaryDxfToText(data),'converted.dxf',job.options||{});
    else imported=importVectorText(new TextDecoder().decode(data),'converted.'+kind,job.options||{});
    imported.filename=job.filename;for(const [i,item] of imported.items.entries()){item.projectName=job.filename;item.label=job.filename.replace(/\.[^.]+$/,'')+' · Parça '+(i+1);}
  } else if(job.operation==='importText') {
    imported=importVectorText(job.text,job.filename,job.options||{});
  } else if(job.operation==='importPdfPages'){
    const scale=Number(job.options?.scale??1);
    if(!(scale>0&&scale<=1000))throw Error('Ölçek katsayısı geçersiz.');
    // Each painted PDF path owns its own holes; overlaid lettering must not
    // become holes in an independently painted background panel.
    const items=[],warnings=[...(job.warnings||[])];let count=0,width=0,height=0;
    for(const [index,page] of (job.pages||[]).entries()){
      const out=pdfOperatorRings(page,job.ops,job.options);
      warnings.push(...out.warnings.map(x=>'Sayfa '+(index+1)+': '+x));
      if(out.rings.length){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const ring of out.rings)for(const p of ring){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}width=Math.max(width,(maxX-minX)*scale);height=Math.max(height,(maxY-minY)*scale);}
      for(const group of out.groups){
        const result=groupRings(group,job.filename,'pdf',scale,[]);
        count+=result.contourCount;
        for(const item of result.items)items.push({...item,id:'import_'+items.length,label:job.filename.replace(/\.[^.]+$/,'')+' · Parça '+(items.length+1)});
      }
    }
    if(!items.length)throw Error('PDF içinde kapalı vektör konturu bulunamadı.');
    warnings.push('PDF: bağımsız boyalı yollar ayrı kesim parçalarıdır. Açık ölçü çizgileri kesime alınmadı; zemin ve yazıları CNC öncesinde kontrol edin.');
    imported={filename:job.filename,format:'pdf',items,contourCount:count,widthMm:width,heightMm:height,warnings:[...new Set(warnings)]};
  } else if(job.operation==='importPdfRings'){
    const scale=Number(job.options?.scale??1);
    if(!(scale>0&&scale<=1000))throw Error('Ölçek katsayısı geçersiz.');
    imported=groupRings(job.rings,job.filename,'pdf',scale,job.warnings||[]);
  } else if(job.operation==='nest') {
    imported=job.imported;
  } else throw Error('Bilinmeyen içe aktarma işlemi.');
  if(!imported.items?.length)throw Error('Dosyada üretilebilir kapalı vektör parçası yok.');
  if(job.parseOnly)return {imported,nesting:null};
  const config={...(job.nesting||{}),optimizationBudgetMs:job.operation==='nest'?3500:2500,quickImport:job.operation!=='nest'||Boolean(job.nesting?.quickImport)};
  // Small jobs receive a compact first layout instead of showing a shelf as final.
  const compactImport=job.operation!=='nest'&&imported.items.length<=60;
  const result=compactImport?optimizeNesting(imported.items,{...config,optimizationBudgetMs:2500},job.lockedSheets||[],onProgress):job.operation==='nest'&&!config.quickImport?optimizeNesting(imported.items,config,job.lockedSheets||[],onProgress):runTrueShapeNesting(imported.items,config,job.lockedSheets||[]);
  if(!result.optimization)result.optimization={engineVersion:'3.0-pro',selectedEngine:'quick-baseline',attempts:1,proAttempts:0,proCompleted:0,nfpAttempts:0,elapsedMs:0};
  for(const sheet of result.sheets){
    const test=validateSheetLayout(sheet,result.minSep,config.allowHoleNesting!==false);
    if(!test.valid)throw Error('Nesting doğrulaması başarısız: kesim parçaları çakışıyor.');
  }
  return {imported,nesting:result};
}

// Protect UI: this module is also importable in deterministic Node tests.
export { processJob as runNestingImportJob };
if(typeof self!=='undefined'&&typeof self.addEventListener==='function'){
  self.addEventListener('message',async event=>{
    const job=event.data;
    try{
      if(job.operation==='importBinary'){
        const kind=detectVectorFormat(new Uint8Array(job.bytes),job.filename);
        if(['cdr','dwg'].includes(kind)){
          const {importNativeCad}=await import('./NativeCadImport.js');
          const imported=await importNativeCad(job.bytes,job.filename,kind,job.options||{},status=>self.postMessage({jobId:job.jobId,status}));
          if(job.parseOnly){
            if(!imported.items?.length)throw Error('Dosyada üretilebilir kapalı vektör parçası yok.');
            self.postMessage({jobId:job.jobId,result:{imported,nesting:null}});return;
          }
          self.postMessage({jobId:job.jobId,result:processJob({...job,operation:'nest',imported,nesting:{...job.nesting,quickImport:imported.items.length>60,optimizationBudgetMs:3000}})});return;
        }
        if(['wmf','emf'].includes(kind)){
          const {importWmfEmf}=await import('./WmfEmfImport.js');
          const imported=importWmfEmf(job.bytes,job.filename,kind,job.options||{});
          if(job.parseOnly){
            if(!imported.items?.length)throw Error('Dosyada üretilebilir kapalı vektör parçası yok.');
            self.postMessage({jobId:job.jobId,result:{imported,nesting:null}});return;
          }
          self.postMessage({jobId:job.jobId,result:processJob({...job,operation:'nest',imported,nesting:{...job.nesting,quickImport:imported.items.length>60,optimizationBudgetMs:3000}})});return;
        }
      }
      try{self.postMessage({jobId:job.jobId,result:processJob(job,p=>self.postMessage({jobId:job.jobId,status:'Nesting v3 Pro · '+p.attempts+' deneme · '+Math.min(99,Math.floor(100*p.elapsedMs/p.budgetMs))+'% zaman bütçesi'}))});}
      catch(original){
        const kind=job.operation==='importBinary'?detectVectorFormat(new Uint8Array(job.bytes),job.filename):'';
        if(job.operation!=='importBinary'||!['postscript','eps-binary','ai','eps','ps'].includes(kind))throw original;
        self.postMessage({jobId:job.jobId,status:'AI/EPS için gelişmiş yerel PostScript motoru yükleniyor…'});
        try{
          const {postScriptToPdf}=await import('./PostScriptWasmImport.js');
          const pdf=await postScriptToPdf(job.bytes);
          self.postMessage({jobId:jobIdOrFallback(job),result:{convertedPdf:pdf}},[pdf.buffer]);
        }catch(gsErr){
          self.postMessage({jobId:job.jobId,status:'AI/EPS uyumluluk kontur kurtarıcısı deneniyor…'});
          try{
            const imported=extractAiOutlineFallback(extractPostScript(job.bytes),job.filename,job.options||{});
            if(job.parseOnly){
              if(!imported.items?.length)throw Error('Dosyada üretilebilir kapalı vektör parçası yok.');
              self.postMessage({jobId:job.jobId,result:{imported,nesting:null}});return;
            }
            self.postMessage({jobId:job.jobId,result:processJob({...job,operation:'nest',imported,nesting:{...job.nesting,quickImport:imported.items.length>60,optimizationBudgetMs:3000}})});
          }catch(fbErr){
            throw Error(String(gsErr?.message||original?.message||'AI/EPS dosyası açılamadı')+' (Yedek okuyucu: '+String(fbErr?.message||fbErr)+')');
          }
        }
      }
    }
    catch(err){self.postMessage({jobId:job.jobId,error:String(err?.message||err)});}
  });
}
function jobIdOrFallback(job){return job.jobId;}
