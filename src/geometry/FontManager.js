import { parseFont } from '../vendor/opentype.mjs';
import { ShapePath, Shape, Path } from '../vendor/three.js';
import Clipper from '../../public/vendor/cad/clipper-runtime.js';

/**
 * Font Manager with all 8 bundled Turkish-ready (latin + latin-ext) fonts,
 * custom TTF/OTF/WOFF upload, persistent custom font storage, and Local Font Access API support.
 */

export const FONT_ASSETS = [
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: "'Montserrat', sans-serif",
    weight: 800,
    files: [
      './public/fonts/montserrat-latin-800-normal-C3dfDxXV.woff',
      './public/fonts/montserrat-latin-ext-800-normal-Wjq_OapB.woff',
    ],
  },
  {
    id: 'bebas',
    label: 'Bebas Neue',
    family: "'Bebas Neue', sans-serif",
    weight: 400,
    files: [
      './public/fonts/bebas-neue-latin-400-normal-Bi-ndsyu.woff',
      './public/fonts/bebas-neue-latin-ext-400-normal-HFKRJXnW.woff',
    ],
  },
  {
    id: 'oswald',
    label: 'Oswald',
    family: "'Oswald', sans-serif",
    weight: 600,
    files: [
      './public/fonts/oswald-latin-600-normal-DRToI_2E.woff',
      './public/fonts/oswald-latin-ext-600-normal-BUCHT9gM.woff',
    ],
  },
  {
    id: 'poppins',
    label: 'Poppins',
    family: "'Poppins', sans-serif",
    weight: 700,
    files: [
      './public/fonts/poppins-latin-700-normal-BVuQR_eA.woff',
      './public/fonts/poppins-latin-ext-700-normal-DctTR6Tg.woff',
    ],
  },
  {
    id: 'playfair',
    label: 'Playfair',
    family: "'Playfair Display', serif",
    weight: 800,
    files: [
      './public/fonts/playfair-display-latin-800-normal-D0Xz4t1K.woff',
      './public/fonts/playfair-display-latin-ext-800-normal-DD7uHqs8.woff',
    ],
  },
  {
    id: 'cinzel',
    label: 'Cinzel',
    family: "'Cinzel', serif",
    weight: 700,
    files: [
      './public/fonts/cinzel-latin-700-normal-C-gK7hA8.woff',
      './public/fonts/cinzel-latin-ext-700-normal-CORa-yIv.woff',
    ],
  },
  {
    id: 'righteous',
    label: 'Righteous',
    family: "'Righteous', sans-serif",
    weight: 400,
    files: [
      './public/fonts/righteous-latin-400-normal-CRvo487o.woff',
      './public/fonts/righteous-latin-ext-400-normal-EtPo6WgU.woff',
    ],
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    family: "'Pacifico', cursive",
    weight: 400,
    files: [
      './public/fonts/pacifico-latin-400-normal-DArfF-vd.woff',
      './public/fonts/pacifico-latin-ext-400-normal-nyRvH6_c.woff',
    ],
  },
];

const CUSTOM_FONTS_KEY = 'khs_custom_fonts_v1';

export class FontManager {
  constructor() {
    this.fonts = new Map();
    this.customCatalog = this.loadCustomCatalog();
    this.cssRegistered = new Set();
    this.assetBytes=new Map();
  }

  getAllFontMetas() {
    const builtIn = FONT_ASSETS.map(f => ({
      id: f.id,
      label: f.label,
      family: f.family,
      weight: f.weight,
      isCustom: false,
      turkishReady: true,
    }));
    const custom = this.customCatalog.map(f => ({
      id: f.id,
      label: f.label,
      family: f.family,
      weight: 400,
      isCustom: true,
      turkishReady: f.turkishReady ?? true,
    }));
    return [...builtIn, ...custom];
  }

  loadCustomCatalog() {
    try {
      const raw = localStorage.getItem(CUSTOM_FONTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveCustomCatalog() {
    try {
      localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(this.customCatalog));
    } catch {
      // Ignore quota errors
    }
  }

  getAssetBytes(url){
    if(!this.assetBytes.has(url)){
      const pending=fetch(url).then(r=>{if(!r.ok)throw Error('Font yüklenemedi: '+url);return r.arrayBuffer();});
      this.assetBytes.set(url,pending);pending.catch(()=>this.assetBytes.delete(url));
    }
    return this.assetBytes.get(url);
  }
  async ensureCssFont(meta) {
    if(this.cssRegistered.has(meta.id)||typeof document==='undefined'||typeof FontFace==='undefined')return;
    this.cssRegistered.add(meta.id);
    const asset=FONT_ASSETS.find(f=>f.id===meta.id);if(!asset)return;
    try{
      await Promise.all(asset.files.map(async url=>{
        const name=meta.family.split(',')[0].replace(/['"]/g,'').trim();
        const face=new FontFace(name,(await this.getAssetBytes(url)).slice(0),{weight:String(meta.weight)});
        await face.load();document.fonts.add(face);
      }));
    }catch{this.cssRegistered.delete(meta.id);}
  }

  async loadFont(fontId) {
    if (this.fonts.has(fontId)) return this.fonts.get(fontId);

    const builtIn = FONT_ASSETS.find(f => f.id === fontId);
    if (builtIn) {
      const promise=Promise.all(builtIn.files.map(url=>this.getAssetBytes(url).then(buf=>parseFont(buf.slice(0)))));
      promise.catch(()=>this.fonts.delete(fontId));
      this.fonts.set(fontId, promise);
      this.ensureCssFont(builtIn);
      return promise;
    }

    const custom = this.customCatalog.find(f => f.id === fontId);
    if (custom && custom.base64) {
      const promise = (async () => {
        const bin = atob(custom.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const parsed = parseFont(bytes.buffer);
        return [parsed];
      })();
      this.fonts.set(fontId, promise);
      return promise;
    }

    // Fallback to montserrat
    return this.loadFont('montserrat');
  }

  async uploadCustomFont(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['ttf', 'otf', 'woff'].includes(ext)) {
      throw new Error('Desteklenen font biçimleri: TTF, OTF, WOFF.');
    }
    const buf = await file.arrayBuffer();
    const parsed = parseFont(buf);
    const label = file.name.replace(/\.[^.]+$/, '');
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // Check Turkish character coverage
    const trChars = ['Ş', 'İ', 'Ğ', 'Ü', 'Ç', 'Ö', 'ş', 'ı', 'ğ', 'ü', 'ç', 'ö'];
    const turkishReady = trChars.every(ch => parsed.charToGlyph(ch).index > 0);

    // Store base64 in custom catalog
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);

    const family = `'${label}', sans-serif`;
    if (typeof FontFace !== 'undefined' && typeof document !== 'undefined') {
      try {
        const face = new FontFace(label, buf);
        await face.load();
        document.fonts.add(face);
      } catch {
        // Non-fatal
      }
    }

    const entry = { id, label, family, weight: 400, isCustom: true, turkishReady, base64 };
    this.customCatalog.push(entry);
    this.saveCustomCatalog();
    this.fonts.set(id, Promise.resolve([parsed]));
    return entry;
  }

  removeCustomFont(id) {
    this.customCatalog = this.customCatalog.filter(f => f.id !== id);
    this.fonts.delete(id);
    this.saveCustomCatalog();
  }

  /**
   * Browser Local Font Access API (if supported & permitted by user).
   * Never misrepresents availability — returns clear status.
   */
  async queryBrowserLocalFonts() {
    if (typeof window === 'undefined' || typeof window.queryLocalFonts !== 'function') {
      return {
        supported: false,
        message: 'Tarayıcınız yerel sistem fontlarına doğrudan erişimi desteklemiyor. TTF/OTF/WOFF dosyası yükleyebilirsiniz.',
        fonts: [],
      };
    }
    try {
      const list = await window.queryLocalFonts();
      const unique = [];
      const seen = new Set();
      for (const f of list) {
        if (!seen.has(f.family)) {
          seen.add(f.family);
          unique.push({ family: f.family, fullName: f.fullName, style: f.style, fontData: f });
        }
      }
      return {
        supported: true,
        message: `${unique.length} yerel font bulundu.`,
        fonts: unique,
      };
    } catch (err) {
      return {
        supported: true,
        message: 'Yerel font izni verilmedi veya iptal edildi. Dosyadan TTF/OTF yükleyebilirsiniz.',
        fonts: [],
      };
    }
  }

  async activateBrowserLocalFont(fontData) {
    const blob = await fontData.blob();
    const buf = await blob.arrayBuffer();
    const parsed = parseFont(buf);
    const id = 'local_' + fontData.family.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const trChars = ['Ş', 'İ', 'Ğ', 'Ü', 'Ç', 'Ö'];
    const turkishReady = trChars.every(ch => parsed.charToGlyph(ch).index > 0);
    const entry = {
      id,
      label: fontData.family,
      family: `'${fontData.family}', sans-serif`,
      weight: 400,
      isCustom: true,
      turkishReady,
    };
    this.fonts.set(id, Promise.resolve([parsed]));
    if (!this.customCatalog.some(c => c.id === id)) {
      this.customCatalog.push(entry);
      this.saveCustomCatalog();
    }
    return entry;
  }
}

/**
 * Converts an opentype glyph path into Three.js Shapes (preserving outer + holes).
 */
function commandsToShapes(commands, scale, offsetX) {
  const sp = new ShapePath();
  const tx = x => offsetX + x * scale;
  const ty = y => -y * scale;
  let startX = 0, startY = 0, curX = 0, curY = 0, hasSub = false;
  const closeIfOpen = () => {
    if (hasSub && Math.hypot(curX - startX, curY - startY) > 1e-4) {
      sp.lineTo(startX, startY);
    }
    hasSub = false;
  };
  for (const c of commands) {
    if (c.type === 'M') {
      closeIfOpen();
      startX = curX = tx(c.x);
      startY = curY = ty(c.y);
      hasSub = true;
      sp.moveTo(curX, curY);
    } else if (c.type === 'L') {
      const nx = tx(c.x), ny = ty(c.y);
      if (hasSub && Math.hypot(nx - curX, ny - curY) < 1e-5) continue;
      curX = nx; curY = ny;
      sp.lineTo(nx, ny);
    } else if (c.type === 'Q') {
      const cx1 = tx(c.x1), cy1 = ty(c.y1), nx = tx(c.x), ny = ty(c.y);
      curX = nx; curY = ny;
      sp.quadraticCurveTo(cx1, cy1, nx, ny);
    } else if (c.type === 'C') {
      const cx1 = tx(c.x1), cy1 = ty(c.y1), cx2 = tx(c.x2), cy2 = ty(c.y2), nx = tx(c.x), ny = ty(c.y);
      curX = nx; curY = ny;
      sp.bezierCurveTo(cx1, cy1, cx2, cy2, nx, ny);
    } else if (c.type === 'Z') {
      closeIfOpen();
    }
  }
  closeIfOpen();
  sp.userData = { style: { fillRule: 'nonzero' } };
  return unionConnectedGlyphShapes(sp.toShapes());
}

/**
 * Layouts text into independent per-glyph 2D shapes in MILLIMETERS.
 * Preserves spaces, Turkish characters (Ç, Ğ, İ, Ö, Ş, Ü, ı, ğ, ş), kerning, and letter spacing.
 */
export function layoutTextMm(fontList, text, heightMm, letterSpacingMm = 0, lineSpacingMult = 1.25, textAlign = 'center') {
  if (!fontList || !fontList.length) return { glyphs: [], widthMm: 0, heightMm };
  const primary = fontList[0];
  const capHeight = (primary.tables?.os2?.sCapHeight) || primary.unitsPerEm * 0.7;
  const scale = heightMm / capHeight;
  const defaultTracking = heightMm * 0.02 + letterSpacingMm;
  const lineStep = heightMm * Math.max(0.8, lineSpacingMult || 1.25);

  const rawLines = String(text || '').split(/\r?\n/);
  const lineLayouts = [];
  let maxWidth = 0;

  for (let li = 0; li < rawLines.length; li++) {
    const lineText = rawLines[li];
    const lineGlyphs = [];
    let cursorX = 0;
    let prev = null;
    const yOffset = -li * lineStep;

    for (const ch of [...lineText]) {
      const font = fontList.find(f => f.charToGlyph(ch).index > 0) || primary;
      const glyph = font.charToGlyph(ch);

      if (prev && prev.font === font) {
        cursorX += font.getKerningValue(prev.glyph, glyph) * scale;
      }

      if (!/\s/.test(ch)) {
        const path = glyph.getPath(0, 0, font.unitsPerEm);
        const localScale = scale * (primary.unitsPerEm / font.unitsPerEm);
        const shapes = commandsToShapes(path.commands, localScale, cursorX);
        if (shapes.length) {
          if (yOffset !== 0) {
            for (const sh of shapes) {
              for (const c of sh.curves) {
                if (c.v1) c.v1.y += yOffset;
                if (c.v2) c.v2.y += yOffset;
                if (c.v0) c.v0.y += yOffset;
                if (c.v3) c.v3.y += yOffset;
              }
              for (const h of (sh.holes || [])) {
                for (const c of h.curves) {
                  if (c.v1) c.v1.y += yOffset;
                  if (c.v2) c.v2.y += yOffset;
                  if (c.v0) c.v0.y += yOffset;
                  if (c.v3) c.v3.y += yOffset;
                }
              }
            }
          }
          lineGlyphs.push({ char: ch, xMm: cursorX, shapes });
        }
      }

      const advance = (glyph.advanceWidth ?? font.unitsPerEm * 0.32) * scale;
      cursorX += advance + defaultTracking;
      prev = { font, glyph };
    }

    const lineW = Math.max(0, cursorX - defaultTracking);
    if (lineW > maxWidth) maxWidth = lineW;
    lineLayouts.push({ lineW, lineGlyphs });
  }

  const glyphs = [];
  for (const ll of lineLayouts) {
    const shiftX = textAlign === 'center' ? (maxWidth - ll.lineW) * 0.5 : textAlign === 'right' ? (maxWidth - ll.lineW) : 0;
    if (Math.abs(shiftX) > 0.01) {
      for (const g of ll.lineGlyphs) {
        g.xMm += shiftX;
        for (const sh of g.shapes) {
          for (const c of sh.curves) {
            if (c.v1) c.v1.x += shiftX;
            if (c.v2) c.v2.x += shiftX;
            if (c.v0) c.v0.x += shiftX;
            if (c.v3) c.v3.x += shiftX;
          }
          for (const h of (sh.holes || [])) {
            for (const c of h.curves) {
              if (c.v1) c.v1.x += shiftX;
              if (c.v2) c.v2.x += shiftX;
              if (c.v0) c.v0.x += shiftX;
              if (c.v3) c.v3.x += shiftX;
            }
          }
        }
      }
    }
    glyphs.push(...ll.lineGlyphs);
  }

  return {
    glyphs,
    widthMm: maxWidth,
    heightMm: heightMm + Math.max(0, rawLines.length - 1) * lineStep,
  };
}

/** Union overlapping filled contours within a single glyph. Never bridge air gaps. */
export function unionConnectedGlyphShapes(shapes){
 if(shapes.length<2)return shapes;
 const S=10000,paths=[];
 const ring=(path,positive)=>{
  const points=path.getPoints(24).map(p=>({X:Math.round(p.x*S),Y:Math.round(p.y*S)}));
  if(Clipper.Clipper.Orientation(points)!==positive)points.reverse();
  return points;
 };
 try{
  for(const shape of shapes){paths.push(ring(shape,true));for(const h of shape.holes||[])paths.push(ring(h,false));}
  const cl=new Clipper.Clipper(),tree=new Clipper.PolyTree();
  cl.AddPaths(paths,Clipper.PolyType.ptSubject,true);
  if(!cl.Execute(Clipper.ClipType.ctUnion,tree,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero))return shapes;
  const result=[];
  const toPath=(pts,Type)=>{const p=new Type();pts.forEach((v,i)=>i?p.lineTo(v.X/S,v.Y/S):p.moveTo(v.X/S,v.Y/S));p.closePath();return p;};
  const visit=node=>{for(const c of node.Childs()){
   if(!c.IsHole()){const sh=toPath(c.Contour(),Shape);sh.holes=c.Childs().filter(h=>h.IsHole()).map(h=>toPath(h.Contour(),Path));result.push(sh);}
   visit(c);
  }};
  visit(tree);
  return result.length>0&&result.length<shapes.length?result:shapes;
 }catch{return shapes;}
}
