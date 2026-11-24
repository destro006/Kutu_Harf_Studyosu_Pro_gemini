export function detectVectorFormat(bytes,name=''){
 const b=new Uint8Array(bytes),t=new TextDecoder('latin1').decode(b.subarray(0,65536)),ext=name.toLowerCase().split('.').pop();
 if(t.indexOf('%PDF-')>=0&&t.indexOf('%PDF-')<1024)return 'pdf';
 if(b[0]===31&&b[1]===139)return 'svgz';
 if(b[0]===197&&b[1]===208&&b[2]===211&&b[3]===198)return 'eps-binary';
 if(/^\s*%!PS-Adobe/.test(t))return 'postscript';
 if(t.startsWith('AutoCAD Binary DXF\r\n\x1a\0'))return 'dxf-binary';
 if(/^AC10\d\d/.test(t))return 'dwg';
 if(/^(RIFF|RIFX)/.test(t)&&/CDR|CMX/.test(t.slice(8,12)))return ext==='cmx'?'cmx':'cdr';
 if(/<svg(?:\s|>)/i.test(t))return 'svg';
 if(/^\s*0\s*[\r\n]+\s*SECTION\b/i.test(t))return 'dxf';
 if(/^\s*(?:IN|SP|PU|PD|PA|PR)\s*[-\d,;\s]/i.test(t))return 'plt';
 return ext||'unknown';
}
export function extractPostScript(bytes){
 const b=new Uint8Array(bytes);
 if(b[0]===197&&b[1]===208&&b[2]===211&&b[3]===198){
  if(b.length<30)throw Error('EPS başlığı eksik.');
  const d=new DataView(b.buffer,b.byteOffset,b.byteLength),start=d.getUint32(4,true),len=d.getUint32(8,true);
  if(start<30||!len||start+len>b.length)throw Error('EPS vektör bölümü geçersiz.');
  return new TextDecoder('latin1').decode(b.subarray(start,start+len));
 }
 return new TextDecoder('latin1').decode(b);
}