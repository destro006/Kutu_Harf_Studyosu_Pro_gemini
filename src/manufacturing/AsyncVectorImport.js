
/**
 * Dedicated worker per import: cancellation terminates CPU-heavy parsers and
 * nesting immediately. Browser thread never runs O(N^2) contour calculations.
 */
export async function runVectorImportJob(job,{signal,onStatus=()=>{}}={}){
 if(signal?.aborted)throw new DOMException('İçe aktarma iptal edildi.','AbortError');
 if(typeof Worker==='undefined'){
  throw Error('Bu tarayıcı Web Worker desteklemiyor. Donmayı önlemek için içe aktarma durduruldu. Güncel Chrome/Edge kullanın.');
 }
 const worker = new Worker(new URL('./NestingImportWorker.js?v=pro3-ui2',import.meta.url),{type:'module'});
 return new Promise((resolve,reject)=>{
  let finished=false,timeout;
  const cleanup=()=>{clearTimeout(timeout);worker.terminate();signal?.removeEventListener('abort',abort);};
  const complete=(error,result)=>{
   if(finished)return;
   finished=true;cleanup();error?reject(error):resolve(result);
  };
  const abort=()=>complete(new DOMException('İçe aktarma iptal edildi.','AbortError'));
  worker.onmessage=e=>{
   if(e.data?.jobId!==job.jobId)return;
   if(e.data?.status){onStatus(e.data.status);return;}
   complete(e.data?.error?new Error(e.data.error):null,e.data?.result);
  };
  worker.onmessageerror=()=>complete(new Error('Nesting motorundan gelen veri okunamadı.'));
  worker.onerror=e=>complete(new Error('Nesting işlem motoru: '+(e.message||'beklenmeyen hata')));
  signal?.addEventListener('abort',abort,{once:true});
  onStatus('Yerel vektörler çözümleniyor ve levhaya yerleştiriliyor…');
  timeout=setTimeout(()=>complete(new Error('Dosya çözümleme süresi aşıldı. Dosyayı daha küçük parçalara ayırın.')),180000);
  worker.postMessage(job,job.bytes instanceof ArrayBuffer?[job.bytes]:[]);
 });
}
