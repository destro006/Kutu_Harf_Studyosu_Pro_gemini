/** Runs geometry decoding and true-shape nesting away from the interactive UI thread. */
import { importVectorText, groupRings } from './VectorFileImport.js';
import { pdfOperatorRings } from './PdfVectorImport.js';
import { runTrueShapeNesting, validateSheetLayout } from './NestingEngine.js';

function processJob(job){
  let imported;
  if(job.operation==='importText') {
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
  const result=runTrueShapeNesting(imported.items,{...(job.nesting||{}),quickImport:job.operation!=='nest'||Boolean(job.nesting?.quickImport)});
  for(const sheet of result.sheets){
    const test=validateSheetLayout(sheet,(job.nesting?.clearanceMm??5)+(job.nesting?.kerfMm??.4));
    if(!test.valid)throw Error('Nesting doğrulaması başarısız: kesim parçaları çakışıyor.');
  }
  return {imported,nesting:result};
}

// Protect UI: this module is also importable in deterministic Node tests.
export { processJob as runNestingImportJob };
if(typeof self!=='undefined'&&typeof self.addEventListener==='function'){
  self.addEventListener('message',event=>{
    const job=event.data;
    try{self.postMessage({jobId:job.jobId,result:processJob(job)});}
    catch(err){self.postMessage({jobId:job.jobId,error:String(err?.message||err)});}
  });
}
