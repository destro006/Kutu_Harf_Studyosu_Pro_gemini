export function detectVectorFormat(bytes,name=''){
 const b=new Uint8Array(bytes),t=new TextDecoder('latin1').decode(b.subarray(0,65536)),ext=name.toLowerCase().split('.').pop();
 const pdfIdx=t.indexOf('%PDF-');
 if(pdfIdx>=0&&pdfIdx<16384)return 'pdf';
 if(b.length>=2&&b[0]===31&&b[1]===139)return 'svgz';
 if(b.length>=4&&b[0]===197&&b[1]===208&&b[2]===211&&b[3]===198)return 'eps-binary';
 if(/^\s*%!PS(?:-Adobe)?/i.test(t))return 'postscript';
 if(t.startsWith('AutoCAD Binary DXF\r\n\x1a\0'))return 'dxf-binary';
 if(/^AC10\d\d/.test(t))return 'dwg';
 if(/^(RIFF|RIFX)/.test(t)&&/CDR|CMX/.test(t.slice(8,12)))return ext==='cmx'?'cmx':'cdr';
 if(b.length>=4&&b[0]===80&&b[1]===75&&(ext==='cdr'||/content\/(?:root\.dat|riffData\.cdr)/i.test(t)))return 'cdr';
 if(b.length>=4&&b[0]===0xd7&&b[1]===0xcd&&b[2]===0xc6&&b[3]===0x9a)return 'wmf';
 if(ext==='wmf'&&b.length>=6&&(b[0]===1||b[0]===2)&&b[1]===0&&b[2]===9&&b[3]===0)return 'wmf';
 if(b.length>=44&&b[0]===1&&b[1]===0&&b[2]===0&&b[3]===0&&t.slice(40,44)===' EMF')return 'emf';
 if(/<svg(?:\s|>)/i.test(t))return 'svg';
 if(/^\s*0\s*[\r\n]+\s*SECTION\b/i.test(t))return 'dxf';
 if(/^\s*(?:IN|SP|PU|PD|PA|PR)\s*[-\d,;\s]/i.test(t))return 'plt';
 return ext||'unknown';
}
export function slicePdfBytes(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const head=new TextDecoder('latin1').decode(b.subarray(0,16384));
 const idx=head.indexOf('%PDF-');
 return idx>0?b.subarray(idx):b;
}
export function extractPostScript(bytes){
 const b=new Uint8Array(bytes);
 if(b.length>=4&&b[0]===197&&b[1]===208&&b[2]===211&&b[3]===198){
  if(b.length<30)throw Error('EPS başlığı eksik.');
  const d=new DataView(b.buffer,b.byteOffset,b.byteLength),start=d.getUint32(4,true),len=d.getUint32(8,true);
  if(start<30||!len||start+len>b.length)throw Error('EPS vektör bölümü geçersiz.');
  return new TextDecoder('latin1').decode(b.subarray(start,start+len)).replace(/\r\n?|\n/g,'\n');
 }
 const raw=new TextDecoder('latin1').decode(b).replace(/\r\n?|\n/g,'\n');
 const psIdx=raw.search(/%!PS(?:-Adobe)?/i);
 return psIdx>0&&psIdx<4096?raw.slice(psIdx):raw;
}
