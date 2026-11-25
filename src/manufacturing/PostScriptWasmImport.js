// Restricted to a same-origin, disposable worker and the engine's virtual filesystem.
import {extractPostScript} from './VectorFormatDetect.js';

const AI_PROCSET_PATTERNS=/\bAdobe_(?:packedarray|cmykcolor|cshow|customcolor|level2_AI[0-9]+|IllustratorA?_AI[0-9]+|Illustrator_AI[0-9]+_vars|typography_AI[0-9]+|pattern_AI[0-9]+|ColorImage_AI[0-9]+|SmoothShade_AI[0-9]+)\b/i;

// Compatibility procset shim for legacy Adobe Illustrator (AI3-AI9) PostScript files
// that reference %%IncludeResource: procset Adobe_packedarray / Adobe_Illustrator_AI5
// without embedding inline PostScript dictionary definitions.
const AI_COMPAT_PROLOG=`%%BeginResource: procset KutuHarf_AI_Compat 1.0 0
userdict /Adobe_packedarray known not {
  userdict begin
  /Adobe_packedarray 4 dict def
  Adobe_packedarray begin
    /initialize { count 0 gt { dup type /dicttype eq { pop } if } if } bind def
    /terminate {} bind def
  end
  /_ai_nop_proc { /initialize { count 0 gt { dup type /dicttype eq { pop } if } if } bind def /terminate {} bind def } bind def
  /Adobe_cmykcolor 3 dict dup begin _ai_nop_proc end def
  /Adobe_cshow 3 dict dup begin _ai_nop_proc end def
  /Adobe_customcolor 3 dict dup begin _ai_nop_proc end def
  /Adobe_level2_AI5 3 dict dup begin _ai_nop_proc end def
  /Adobe_pattern_AI5 3 dict dup begin _ai_nop_proc end def
  /Adobe_ColorImage_AI6 3 dict dup begin _ai_nop_proc end def
  /Adobe_SmoothShade_AI8 3 dict dup begin _ai_nop_proc end def
  /Adobe_Illustrator_AI5_vars 16 dict def
  /Adobe_typography_AI5 16 dict dup begin
    _ai_nop_proc
    /TE { clear } bind def
    /TZ { clear } bind def
    /ZE { clear } bind def
  end def

  /_ai_eo false def
  /_ai_cp 0 def
  /_ai_cp_op 0 def
  /_ai_popn { { count 0 gt { pop } if } repeat } bind def
  /_ai_paint_cp {
    dup 1 eq { fill } if
    dup 2 eq { eofill } if
    dup 3 eq { stroke } if
    dup 4 eq { gsave fill grestore stroke } if
    dup 5 eq { gsave eofill grestore stroke } if
    dup 6 eq { newpath } if
    pop
  } bind def

  /Adobe_Illustrator_AI5 96 dict def
  Adobe_Illustrator_AI5 begin
    /initialize {
      count 0 gt { dup type /dicttype eq { pop } if } if
      Adobe_Illustrator_AI5 begin
    } bind def
    /terminate { currentdict Adobe_Illustrator_AI5 eq { end } if } bind def
    /m { moveto } bind def
    /l { lineto } bind def
    /L { lineto } bind def
    /c { curveto } bind def
    /C { curveto } bind def
    /v { currentpoint 6 2 roll curveto } bind def
    /V { currentpoint 6 2 roll curveto } bind def
    /y { 2 copy curveto } bind def
    /Y { 2 copy curveto } bind def
    /h { closepath } bind def
    /H { closepath } bind def
    /q { gsave } bind def
    /Q { grestore } bind def
    /W { clip } bind def
    /u {} bind def
    /U {} bind def
    /*u { /_ai_cp _ai_cp 1 add def } bind def
    /*U {
      /_ai_cp _ai_cp 1 sub dup 0 lt { pop 0 } if def
      _ai_cp 0 eq {
        _ai_cp_op 0 gt { _ai_cp_op _ai_paint_cp /_ai_cp_op 0 def } if
      } if
    } bind def
    /f { closepath _ai_cp 0 gt { /_ai_cp_op _ai_eo { 2 } { 1 } ifelse def } { _ai_eo { eofill } { fill } ifelse } ifelse } bind def
    /F { _ai_cp 0 gt { /_ai_cp_op _ai_eo { 2 } { 1 } ifelse def } { _ai_eo { eofill } { fill } ifelse } ifelse } bind def
    /s { closepath _ai_cp 0 gt { /_ai_cp_op 3 def } { stroke } ifelse } bind def
    /S { _ai_cp 0 gt { /_ai_cp_op 3 def } { stroke } ifelse } bind def
    /b { closepath _ai_cp 0 gt { /_ai_cp_op _ai_eo { 5 } { 4 } ifelse def } { gsave _ai_eo { eofill } { fill } ifelse grestore stroke } ifelse } bind def
    /B { _ai_cp 0 gt { /_ai_cp_op _ai_eo { 5 } { 4 } ifelse def } { gsave _ai_eo { eofill } { fill } ifelse grestore stroke } ifelse } bind def
    /n { closepath _ai_cp 0 gt { /_ai_cp_op 6 def } { newpath } ifelse } bind def
    /N { _ai_cp 0 gt { /_ai_cp_op 6 def } { newpath } ifelse } bind def
    /g { setgray } bind def
    /G { setgray } bind def
    /k { setcmykcolor } bind def
    /K { setcmykcolor } bind def
    /Xa { setrgbcolor } bind def
    /XA { setrgbcolor } bind def
    /x { 2 _ai_popn setcmykcolor } bind def
    /X { 2 _ai_popn setcmykcolor } bind def
    /Xk { 3 _ai_popn setrgbcolor } bind def
    /XK { 3 _ai_popn setrgbcolor } bind def
    /Xx { 4 _ai_popn setrgbcolor } bind def
    /XX { 4 _ai_popn setrgbcolor } bind def
    /w { setlinewidth } bind def
    /j { setlinejoin } bind def
    /J { setlinecap } bind def
    /M { setmiterlimit } bind def
    /d { setdash } bind def
    /i { pop } bind def
    /D { pop } bind def
    /O { pop } bind def
    /R { pop } bind def
    /A { pop } bind def
    /Ap { pop } bind def
    /Ar { pop } bind def
    /XR { 0 ne /_ai_eo exch def } bind def
    /Xw { pop } bind def
    /XW { pop } bind def
    /Ae { pop } bind def
    /AE { pop } bind def
    /Al { pop } bind def
    /AL { pop } bind def
    /As { pop } bind def
    /AS { pop } bind def
    /Lb { 10 _ai_popn } bind def
    /LB {} bind def
    /Ln { pop } bind def
    /Ld { pop } bind def
    /Lm { pop } bind def
    /Lp { pop } bind def
    /Lw { pop } bind def
    /Lz { pop } bind def
    /LN { pop } bind def
    /Xm { 6 _ai_popn } bind def
    /Xy { 5 _ai_popn } bind def
    /Xd { pop } bind def
    /Xq { 2 _ai_popn } bind def
    /Xs { 3 _ai_popn } bind def
    /X! { 4 _ai_popn } bind def
    /X# { pop } bind def
    /XH { pop } bind def
    /Xh { pop } bind def
    /Bb {} bind def
    /BB { pop } bind def
    /Bg { 10 _ai_popn } bind def
    /Bh { 4 _ai_popn } bind def
    /Bm { 6 _ai_popn } bind def
    /Bc { 6 _ai_popn } bind def
    /Bd { 3 _ai_popn } bind def
    /BD {} bind def
    /Bs { 2 _ai_popn } bind def
    /Bu {} bind def
    /BH { pop } bind def
    /To { pop } bind def
    /TO {} bind def
    /Tp { 7 _ai_popn } bind def
    /TP {} bind def
    /Tf { 2 _ai_popn } bind def
    /Tr { pop } bind def
    /Ta { pop } bind def
    /Tq { pop } bind def
    /Tt { pop } bind def
    /Th { pop } bind def
    /Tv { pop } bind def
    /Tl { 2 _ai_popn } bind def
    /Tc { pop } bind def
    /Tw { pop } bind def
    /Ts { pop } bind def
    /Ti { 4 _ai_popn } bind def
    /Tm { pop } bind def
    /Tz { 4 _ai_popn } bind def
    /Tx { 2 _ai_popn } bind def
    /TX { count 0 gt { dup type /stringtype eq { pop } if } if } bind def
    /T* {} bind def
    /TE { clear } bind def
    /TZ { clear } bind def
    /ZE { clear } bind def
    /currentpacking where { pop } { /currentpacking { false } bind def /setpacking { pop } bind def } ifelse
  end
  /Adobe_IllustratorA_AI3 Adobe_Illustrator_AI5 def
  end
} if
%%EndResource
`;

function findBoundingBox(text){
 const matches=[...text.matchAll(/^%%(?:HiRes)?BoundingBox:\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/gm)];
 const valid=matches.map(m=>m.slice(1,5).map(Number)).filter(b=>b.every(Number.isFinite)&&b[2]>b[0]&&b[3]>b[1]);
 return valid.at(-1)||null;
}

function preparePostScriptForGhostscript(raw){
 let text=raw.replace(/\r\n?|\n/g,'\n');
 const needsAiShim=AI_PROCSET_PATTERNS.test(text)&&!/\/Adobe_packedarray\s+\d+\s+dict\s+def/.test(text);
 const bbox=findBoundingBox(text);
 const pageSetup=bbox
  ?`\n<< /PageSize [${Math.ceil(bbox[2]-bbox[0])} ${Math.ceil(bbox[3]-bbox[1])}] >> setpagedevice ${(-bbox[0]).toFixed(3)} ${(-bbox[1]).toFixed(3)} translate\n`
  :'';

 if(needsAiShim){
  // Put AI_COMPAT_PROLOG right after the first %!PS line (or %%EndComments)
  const endComments=text.match(/^%%EndComments\s*$/m);
  if(endComments){
   const idx=endComments.index+endComments[0].length;
   text=text.slice(0,idx)+'\n'+AI_COMPAT_PROLOG+text.slice(idx);
  }else{
   const firstNl=text.indexOf('\n');
   text=firstNl>=0?text.slice(0,firstNl+1)+AI_COMPAT_PROLOG+text.slice(firstNl+1):AI_COMPAT_PROLOG+'\n'+text;
  }
  // Ensure %%EndSetup clears any leftover font-encoding tokens and binds AI dict + BoundingBox page size
  const endSetup=text.match(/^%%EndSetup\s*$/m);
  if(endSetup){
   const idx=endSetup.index;
   text=text.slice(0,idx)+'\nclear\n'+pageSetup+text.slice(idx);
  }else if(pageSetup){
   const endProlog=text.match(/^%%EndProlog\s*$/m);
   if(endProlog){
    const idx=endProlog.index+endProlog[0].length;
    text=text.slice(0,idx)+pageSetup+text.slice(idx);
   }
  }
  // If file has no showpage at all (common in AI5/AI7 files), inject showpage before %%Trailer/%%EOF
  if(!/\bshowpage\b/.test(text)){
   const trailer=text.match(/^%%(?:Trailer|EOF)\b/m);
   text=trailer?text.slice(0,trailer.index)+'\nshowpage\n'+text.slice(trailer.index):text+'\nshowpage\n';
  }
 }else if(pageSetup){
  const endSetup=text.match(/^%%(?:EndSetup|EndProlog)\s*$/m);
  if(endSetup){
   const idx=endSetup.index+endSetup[0].length;
   text=text.slice(0,idx)+pageSetup+text.slice(idx);
  }
 }
 return text;
}

export async function postScriptToPdf(bytes){
 const text=extractPostScript(bytes);
 if(!/^\s*%!PS(?:-Adobe)?/i.test(text))throw Error('AI içeriği PDF veya PostScript değil; özel Illustrator verisi desteklenmiyor.');
 const prepared=preparePostScriptForGhostscript(text);
 const {initWGhostscript}=await import(new URL('../../public/vendor/cad/ghostscript-entry.js',import.meta.url).href);
 const gs=await initWGhostscript();
 // The public operation uses Ghostscript's pdfwrite pipeline, not a raster trace.
 try{
  const output=await gs.ops.psToPdf(new TextEncoder().encode(prepared));
  let data=output?.data??output?.pdf??output;
  if(data instanceof Blob)data=await data.arrayBuffer();
  if(data instanceof ArrayBuffer)data=new Uint8Array(data);
  if(!ArrayBuffer.isView(data)||new TextDecoder().decode(data.subarray(0,5))!=='%PDF-')throw Error('AI/EPS motoru geçerli PDF üretmedi.');
  return new Uint8Array(data);
 }finally{gs.dispose?.();}
}
