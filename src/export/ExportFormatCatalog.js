/** Format availability is intentionally truthful: no renamed proprietary files. */
export const EXPORT_FORMAT_GROUPS=Object.freeze([
  {label:'CorelDRAW / Illustrator — Vektörel ve Baskı',items:[
    {id:'pdf',label:'PDF — Vektörel / baskı · 1:1 mm',ready:true,kind:'vector',info:'Gerçek vektör PDF. CorelDRAW ve Illustrator açabilir; çizgiler milimetre ölçüsündedir.'},
    {id:'svg',label:'SVG — Katmanlı vektör',ready:true,kind:'vector',info:'Gerçek SVG; katmanlar ve üretim konturları korunur.'},
    {id:'eps',label:'EPS — Encapsulated PostScript',ready:true,kind:'vector',info:'CorelDRAW ve Illustrator için vektör EPS; fiziksel ölçü korunur.'},
    {id:'ps',label:'PS — PostScript',ready:true,kind:'vector',info:'EPS uyumlu PostScript vektör yolu.'},
    {id:'cdr',label:'CDR — CorelDRAW (dönüştürücü gerekir)',ready:false,kind:'converter',info:'Yerel CDR dosyasına gerçek dönüştürme için CorelDRAW gerekir; PDF/EPS/SVG açıp CDR olarak kaydedin.',alt:'pdf'},
    {id:'ai',label:'AI — Adobe Illustrator (dönüştürücü gerekir)',ready:false,kind:'converter',info:'Native Illustrator AI biçimi yazılmıyor. Vektör PDF veya EPS içe aktarılıp AI olarak kaydedilebilir.',alt:'pdf'},
    {id:'cmx',label:'CMX — Corel Presentation Exchange (dönüştürücü)',ready:false,kind:'converter',alt:'eps'},
    {id:'cgm',label:'CGM — Computer Graphics Metafile (dönüştürücü)',ready:false,kind:'converter',alt:'svg'},
    {id:'wmf',label:'WMF — Windows Metafile (dönüştürücü)',ready:false,kind:'converter',alt:'svg'},
    {id:'emf',label:'EMF — Enhanced Metafile (dönüştürücü)',ready:false,kind:'converter',alt:'svg'},
  ]},
  {label:'CNC / Lazer / Plotter',items:[
    {id:'dxf',label:'DXF — Katmanlı CNC konturu · mm',ready:true,kind:'vector',info:'DXF üretim geometrisidir; takım yolu için CAM doğrulaması gerekir.'},
    {id:'plt',label:'PLT / HPGL — Plotter',ready:true,kind:'vector',info:'40 HPGL birimi/mm olan gerçek PU/PD kesim çizgileri.'},
    {id:'gcode',label:'G-code (.nc) — Nesting tezgâh yolu',ready:true,kind:'cam',info:'Yerleşmiş levhadan G-code; kesimden önce operatörün kerf ve makine ayarlarını kontrol etmesi zorunlu.'},
    {id:'csv',label:'CSV — İmalat parça listesi',ready:true,kind:'data',info:'Metrik liste veya seçili nesting levhasındaki parçalar.'},
    {id:'dwg',label:'DWG — AutoCAD (dönüştürücü gerekir)',ready:false,kind:'converter',alt:'dxf'},
  ]},
  {label:'Görsel / Baskı / Müşteri Sunumu',items:[
    {id:'png',label:'PNG — 3D sunum',ready:true,kind:'raster'},
    {id:'transparentPng',label:'PNG — Şeffaf 3D',ready:true,kind:'raster'},
    {id:'jpg',label:'JPG — Yüksek kaliteli sunum',ready:true,kind:'raster'},
    {id:'webp',label:'WebP — Web sitesi görseli',ready:true,kind:'raster'},
    {id:'bmp',label:'BMP — Windows Bitmap',ready:true,kind:'raster'},
    {id:'tiff',label:'TIFF / TIF — Baskı (dönüştürücü gerekir)',ready:false,kind:'converter',alt:'png'},
    {id:'gif',label:'GIF — Görsel (dönüştürücü gerekir)',ready:false,kind:'converter',alt:'png'},
    {id:'psd',label:'PSD — Photoshop katmanları (dönüştürücü)',ready:false,kind:'converter',alt:'png'},
    {id:'tga',label:'TGA — Targa (dönüştürücü)',ready:false,kind:'converter',alt:'png'},
    {id:'jp2',label:'JP2 — JPEG 2000 (dönüştürücü)',ready:false,kind:'converter',alt:'png'},
    {id:'heif',label:'HEIF — High Efficiency (dönüştürücü)',ready:false,kind:'converter',alt:'webp'},
  ]},
  {label:'3D Tasarım / 3D Baskı / Mimari',items:[
    {id:'glb',label:'GLB — 3D PBR · Blender / Web',ready:true,kind:'3d',info:'Gerçek yüzey üçgenleri, seçili harfler, metal/pleksi renkleri; glTF standardı metre.'},
    {id:'gltf',label:'glTF — Gömülü geometri + PBR',ready:true,kind:'3d',info:'Tek dosya .gltf; geometri base64 gömülü, model uzunluk birimi metredir.'},
    {id:'obj',label:'OBJ + MTL — 3D geometri / renk',ready:true,kind:'3d',info:'Ayrı OBJ + MTL dosyaları, mm; harf yüzü ve yanak materyalleri korunur.'},
    {id:'stl',label:'STL — Binary · 3D Baskı',ready:true,kind:'3d',info:'3D baskı için binary STL; koordinatlar mm; renk içermez.'},
    {id:'stla',label:'STL — ASCII · 3D Baskı',ready:true,kind:'3d',info:'Okunabilir üçgen STL; mm; renk içermez.'},
    {id:'3mf',label:'3MF — Renkli 3D Baskı',ready:true,kind:'3d',info:'Gerçek ZIP/OPC 3MF, mm birimi, basematerials renkleri ve üçgenli modeller.'},
    {id:'ply',label:'PLY — Renkli mesh',ready:true,kind:'3d',info:'Renkli vertex ve üçgenler; koordinatlar mm.'},
    {id:'fbx',label:'FBX — Blender / Maya (dönüştürücü)',ready:false,kind:'converter',alt:'glb'},
    {id:'usd',label:'USD — Evrensel Sahne (dönüştürücü)',ready:false,kind:'converter',alt:'glb'},
    {id:'usdz',label:'USDZ — AR / Apple (dönüştürücü)',ready:false,kind:'converter',alt:'glb'},
    {id:'dae',label:'DAE — Collada (dönüştürücü)',ready:false,kind:'converter',alt:'glb'},
    {id:'3ds',label:'3DS — 3D Studio (dönüştürücü)',ready:false,kind:'converter',alt:'obj'},
    {id:'step',label:'STEP / STP — NURBS / CAD (B-rep dönüştürücü)',ready:false,kind:'converter',alt:'stl'},
    {id:'blend',label:'BLEND — Blender projesi (Blender gerekir)',ready:false,kind:'converter',alt:'glb'},
  ]},
  {label:'Proje ve Yedekleme',items:[
    {id:'json',label:'KHS JSON — Düzenlenebilir proje',ready:true,kind:'project'},
  ]},
]);
export const EXPORT_FORMATS=Object.freeze(EXPORT_FORMAT_GROUPS.flatMap(group=>group.items));
export function getExportFormat(id){return EXPORT_FORMATS.find(x=>x.id===id)||null;}
export function formatSupportsSource(format,source){
  const meta=getExportFormat(format);if(!meta?.ready)return false;
  if(source==='design')return meta.kind!=='cam';
  return ['vector','data','cam'].includes(meta.kind) && format!=='json';
}
