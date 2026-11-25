/** Browser canvas raster export; alpha and supported codec checked explicitly. */
export function rgbaToBmp(data,width,height) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)throw Error('Geçersiz BMP ebatı.');
  if(data.length!==width*height*4)throw Error('BMP veri boyutu hatalı.');
  const stride=Math.ceil(width*3/4)*4,size=54+stride*height;
  const out=new Uint8Array(size),dv=new DataView(out.buffer);
  out[0]=66;out[1]=77;dv.setUint32(2,size,true);dv.setUint32(10,54,true);
  dv.setUint32(14,40,true);dv.setInt32(18,width,true);dv.setInt32(22,height,true);
  dv.setUint16(26,1,true);dv.setUint16(28,24,true);dv.setUint32(34,stride*height,true);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,j=54+(height-1-y)*stride+x*3;
    const a=data[i+3]/255;
    out[j]=Math.round(data[i+2]*a+255*(1-a));
    out[j+1]=Math.round(data[i+1]*a+255*(1-a));
    out[j+2]=Math.round(data[i]*a+255*(1-a));
  }
  return out;
}
export async function convertPngDataUrl(dataUrl,format) {
  if(typeof Image==='undefined')throw Error('Görsel dönüştürme tarayıcı gerektirir.');
  const image=new Image();image.src=dataUrl;
  await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:format==='bmp'});
  if(!ctx)throw Error('Görsel dönüştürme canvas desteği gerektirir.');
  if(format==='jpg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);}
  ctx.drawImage(image,0,0);
  if(format==='bmp'){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);return {bytes:rgbaToBmp(pixels.data,canvas.width,canvas.height),mime:'image/bmp'};}
  const type=format==='jpg'?'image/jpeg':'image/webp';
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,0.94));
  if(!blob||blob.type!==type)throw Error('Tarayıcı '+format.toUpperCase()+' dönüştürmesini desteklemiyor.');
  return {bytes:blob,mime:type};
}
