/**
 * True vector PDF / EPS / HPGL interchange, using the exact manufacturing
 * contours in millimeters. No rasterization or fake proprietary formats.
 * PDF page and PostScript coordinates are points: 72/25.4 points per mm.
 */
const PT_PER_MM = 72 / 25.4;
const palette = {outer:[0.74,0.48,0.14],file:[0.78,0.62,0.15],acrylic:[0.15,0.55,0.78]};
const fmt = n => Number(n).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
const validRing = ring => Array.isArray(ring) && ring.length >= 3 && ring.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));

export function collectManufacturingContours(metricsList) {
  const contours=[];
  for (const m of metricsList || []) {
    for (const role of ['outer','file','acrylic']) {
      for (const poly of m.exportContours?.[role] || []) {
        for (const ring of [poly.outer,...(poly.holes || [])]) {
          if (!validRing(ring)) continue;
          contours.push({role, label:String(m.label||''),
            points:ring.map(p=>({x:p.x+(m.offsetXMm||0), y:p.y+(m.offsetYMm||0)}))});
        }
      }
    }
  }
  return contours;
}

export function collectNestingContours(sheets) {
  const contours=[];
  let sheetX=0;
  for (const sheet of sheets || []) {
    for (const placement of sheet.placements || []) {
      for (const ring of [placement.outer,...(placement.holes||[])]) {
        if (!validRing(ring)) continue;
        contours.push({role:ring===placement.outer?'outer':'acrylic',label:String(placement.label||''),
          points:ring.map(p=>({x:p.x+sheetX,y:p.y}))});
      }
    }
    sheetX+=(sheet.widthMm||2000)+80;
  }
  return contours;
}

export function prepareVectorPage(contours, padMm=5) {
  if (!contours?.length) throw Error('Dışa aktarılacak gerçek vektör konturu bulunamadı.');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const c of contours) for(const p of c.points) {
    minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);
  }
  const widthMm=Math.max(1,maxX-minX+padMm*2);
  const heightMm=Math.max(1,maxY-minY+padMm*2);
  return {widthMm,heightMm,widthPt:widthMm*PT_PER_MM,heightPt:heightMm*PT_PER_MM,
    contours:contours.map(c=>({...c,points:c.points.map(p=>({x:(p.x-minX+padMm)*PT_PER_MM,y:(p.y-minY+padMm)*PT_PER_MM}))}))};
}

function pdfPath(c) {
  const first=c.points[0],rest=c.points.slice(1);
  return `${fmt(first.x)} ${fmt(first.y)} m\n${rest.map(p=>`${fmt(p.x)} ${fmt(p.y)} l`).join('\n')}\nh S\n`;
}
/** PDF 1.4, exact 1:1 mm vector paths, physical page size, separate contour colours. */
export function generateVectorPdf(contours) {
  const page=prepareVectorPage(contours);
  let content='q\n1 J 1 j\n0.55 w\n';
  for(const role of ['outer','file','acrylic']) {
    const color=palette[role];
    content+=color.map(fmt).join(' ')+' RG\n';
    for (const c of page.contours.filter(c=>c.role===role)) content+=pdfPath(c);
  }
  content+='Q\n';
  const encoder=new TextEncoder();
  const stream=encoder.encode(content);
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(page.widthPt)} ${fmt(page.heightPt)}] /Resources << >> /Contents 4 0 R >>`,
    {stream,head:`<< /Length ${stream.length} >>`},
    '<< /Producer (Kutu Harf Studyosu) /Title (1:1 mm Vector Export) >>',
  ];
  const parts=[encoder.encode('%PDF-1.4\n% KHS vector artwork\n')];
  let pos=parts[0].length;
  const offsets=[0];
  for(let i=0;i<objects.length;i++) {
    offsets.push(pos);
    const obj=objects[i];
    let data;
    if (typeof obj==='string') data=encoder.encode(`${i+1} 0 obj\n${obj}\nendobj\n`);
    else {
      const prefix=encoder.encode(`${i+1} 0 obj\n${obj.head}\nstream\n`);
      const suffix=encoder.encode('\nendstream\nendobj\n');
      data=concatBytes([prefix,obj.stream,suffix]);
    }
    parts.push(data);pos+=data.length;
  }
  const xrefOffset=pos;
  let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const off of offsets.slice(1)) xref+=`${String(off).padStart(10,'0')} 00000 n \n`;
  xref+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(encoder.encode(xref));
  return concatBytes(parts);
}

export function generateVectorEps(contours) {
  const page=prepareVectorPage(contours);
  let out=`%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Kutu Harf Studyosu\n%%BoundingBox: 0 0 ${Math.ceil(page.widthPt)} ${Math.ceil(page.heightPt)}\n%%HiResBoundingBox: 0 0 ${fmt(page.widthPt)} ${fmt(page.heightPt)}\n%%Pages: 1\n%%LanguageLevel: 2\n%%EndComments\ngsave\n0.55 setlinewidth\n1 setlinejoin\n1 setlinecap\n`;
  for(const role of ['outer','file','acrylic']) {
    out+=`${palette[role].map(fmt).join(' ')} setrgbcolor\n% Layer: ${role}\n`;
    for(const c of page.contours.filter(x=>x.role===role)) {
      const [head,...rest]=c.points;
      out+=`newpath ${fmt(head.x)} ${fmt(head.y)} moveto\n`;
      out+=rest.map(p=>`${fmt(p.x)} ${fmt(p.y)} lineto\n`).join('');
      out+='closepath stroke\n';
    }
  }
  return out+'grestore\nshowpage\n%%EOF\n';
}

export function generateVectorHpgl(contours) {
  if (!contours?.length) throw Error('HPGL için vektör konturu bulunamadı.');
  const toDevice=n=>Math.round(n*40); // HPGL convention 40 plotter units per millimeter
  let out='IN;\nSP1;\n';
  for(const c of contours) {
    if(!c.points?.length)continue;
    const start=c.points[0];
    out+=`PU${toDevice(start.x)},${toDevice(start.y)};\n`;
    const steps=[...c.points.slice(1),start].map(p=>`${toDevice(p.x)},${toDevice(p.y)}`).join(',');
    out+=`PD${steps};\nPU;\n`;
  }
  return out+'SP0;\n';
}
function concatBytes(parts) {
  const result=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let at=0;
  for(const p of parts){result.set(p,at);at+=p.length;}
  return result;
}
