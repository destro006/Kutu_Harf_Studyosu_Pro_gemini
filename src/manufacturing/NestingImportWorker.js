/** Runs geometry decoding and true-shape nesting away from the interactive UI thread. */
import { importVectorText, groupRings } from './VectorFileImport.js';
import { runTrueShapeNesting, validateSheetLayout } from './NestingEngine.js';

function processJob(job){
  let imported;
  if(job.operation==='importText') {
    imported=importVectorText(job.text,job.filename,job.options||{});
  } else if(job.operation==='importPdfRings'){
    const scale=Number(job.options?.scale??1);
    if(!(scale>0&&scale<=1000))throw Error('Ölçek katsayısı geçersiz.');
    imported=groupRings(job.rings,job.filename,'pdf',scale,job.warnings||[]);
  } else if(job.operation==='nest') {
    imported=job.imported;
  } else throw Error('Bilinmeyen içe aktarma işlemi.');
  if(!imported.items?.length)throw Error('Dosyada üretilebilir kapalı vektör parçası yok.');
  const result=runTrueShapeNesting(imported.items,job.nesting||{});
  for(const sheet of result.sheets){
    const test=validateSheetLayout(sheet,(job.nesting?.clearanceMm||5)+(job.nesting?.kerfMm||.4));
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
