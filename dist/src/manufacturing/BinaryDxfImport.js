export function binaryDxfToText(input){
 const b=new Uint8Array(input),d=new DataView(b.buffer,b.byteOffset,b.byteLength),decoder=new TextDecoder('latin1');
 if(decoder.decode(b.subarray(0,22))!=='AutoCAD Binary DXF\r\n\x1a\0')throw Error('Binary DXF başlığı geçersiz.');
 let at=22;const wide=b[23]===0,lines=[];
 const need=n=>{if(at+n>b.length)throw Error('Binary DXF verisi eksik.');};
 const read=(method,n)=>{need(n);const val=d[method](at,true);at+=n;return val;};
 const u8=()=>read('getUint8',1);
 const str=()=>{const start=at;while(at<b.length&&b[at]!==0)at++;if(at===b.length)throw Error('Binary DXF metni eksik.');return decoder.decode(b.subarray(start,at++));};
 while(at<b.length){
  let k=wide?read('getUint16',2):u8();if(!wide&&k===255)k=read('getUint16',2);let val;
  if(k<=9||(k>=100&&k<=105)||(k>=300&&k<=309)||(k>=320&&k<=369)||(k>=390&&k<=399)||(k>=410&&k<=419)||(k>=430&&k<=439)||(k>=470&&k<=481)||k===999||(k>=1000&&k<=1009))val=str();
  else if((k>=10&&k<=59)||(k>=110&&k<=149)||(k>=210&&k<=239)||(k>=460&&k<=469)||(k>=1010&&k<=1059))val=read('getFloat64',8);
  else if((k>=60&&k<=79)||(k>=170&&k<=179)||(k>=270&&k<=289)||(k>=370&&k<=389)||(k>=400&&k<=409)||k===1070)val=read('getInt16',2);
  else if((k>=90&&k<=99)||(k>=420&&k<=429)||(k>=440&&k<=459)||k===1071)val=read('getInt32',4);
  else if(k>=160&&k<=169)val=read('getBigInt64',8).toString();
  else if(k>=290&&k<=299)val=u8();
  else if(k>=310&&k<=319){const len=u8();need(len);val=Array.from(b.subarray(at,at+len),v=>v.toString(16).padStart(2,'0')).join('');at+=len;}
  else throw Error('Binary DXF grup kodu desteklenmiyor: '+k);
  if(typeof val==='number'&&!Number.isFinite(val))throw Error('Binary DXF koordinatı geçersiz.');
  lines.push(String(k),String(val));if(k===0&&val==='EOF')return lines.join('\n');
 }
 throw Error('Binary DXF EOF eksik.');
}