import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFont } from '../src/vendor/opentype.mjs';
import { layoutTextMm } from '../src/geometry/FontManager.js';
import { buildChannelComponent } from '../src/geometry/ChannelLetterGeometry.js';
import { serializeProject, deserializeProject } from '../src/core/projectSerializer.js';
import { createDefaultState } from '../src/core/state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function readFont(file) {
  const bytes = fs.readFileSync(file);
  // Node Buffers can be views into a larger shared ArrayBuffer.
  return parseFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
const font = readFont(path.join(ROOT, 'public/fonts/montserrat-latin-800-normal-C3dfDxXV.woff'));
const fontExt = readFont(path.join(ROOT, 'public/fonts/montserrat-latin-ext-800-normal-Wjq_OapB.woff'));
const glyphs = layoutTextMm([font, fontExt], 'MERHABA', 300, 8).glyphs;
assert.equal(glyphs.length, 7);
let geometryCount = 0, triangles = 0;
function zBounds(g) { const p = g.getAttribute('position'); let min = Infinity, max = -Infinity;for(let i=0;i<p.count;i++){min=Math.min(min,p.getZ(i));max=Math.max(max,p.getZ(i));}return {min,max}; }
for (const glyph of glyphs) {
  const built = buildChannelComponent(glyph.shapes, {
    constructionType:'fileli',fileWidthMm:5,fileThicknessMm:2,metalThicknessMm:1,
    acrylicThicknessMm:3,acrylicInsetMm:2.5,depthMm:80
  });
  assert.equal(built.warnings.length,0,`Invalid letter ${glyph.char}: ${built.warnings.join(' | ')}`);
  assert(built.outerGeos.length>=1,`No side wall for ${glyph.char}`);
  assert(built.fileGeos.length>=1,`No front file for ${glyph.char}`);
  assert(built.acrylicGeos.length>=1,`No acrylic for ${glyph.char}`);
  const fileMinZ=Math.min(...built.fileGeos.map(g=>zBounds(g).min));
  const acrylicMaxZ=Math.max(...built.acrylicGeos.map(g=>zBounds(g).max));
  assert(acrylicMaxZ <= fileMinZ - 1e-4,`Acrylic intersects front rim ${glyph.char}: ${acrylicMaxZ} > ${fileMinZ}`);
  assert(built.metrics.acrylicAreaMm2 > 0 && built.metrics.fileAreaMm2 > 0);
  assert(built.metrics.acrylicAreaMm2 + built.metrics.fileAreaMm2 <= built.metrics.outerAreaMm2*1.025,
    `Impossible material areas in ${glyph.char}`);
  for (const geo of [...built.outerGeos,...built.fileGeos,...built.acrylicGeos]) {
    const p=geo.getAttribute('position');
    assert.equal(p.count%3,0);
    for(let i=0;i<p.count;i+=3){
      const a=[p.getX(i),p.getY(i),p.getZ(i)], b=[p.getX(i+1),p.getY(i+1),p.getZ(i+1)],c=[p.getX(i+2),p.getY(i+2),p.getZ(i+2)];
      assert([...a,...b,...c].every(Number.isFinite),`Invalid mesh coordinates ${glyph.char}`);
      const u=b.map((v,j)=>v-a[j]), v=c.map((v,j)=>v-a[j]);
      const area2=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
      assert(area2>1e-10,`Degenerate triangle ${glyph.char}`);
      triangles++;
    }
    geometryCount++;
    geo.dispose();
  }
}
const narrow = buildChannelComponent(glyphs[0].shapes,{constructionType:'fileli',fileWidthMm:400,depthMm:80});
assert(narrow.warnings.length>0,'Invalid giant file width must be warned about');
assert.equal(narrow.fileGeos.length,0,'Do not manufacture a fake metal file for invalid geometry');
assert.equal(narrow.metrics.fileAreaMm2,0,'Do not fake 50/50 metal material area');
for(const g of [...narrow.outerGeos,...narrow.fileGeos,...narrow.acrylicGeos]) g.dispose();
const state = createDefaultState();state.fileli.metalThicknessMm=1.2;
const saved=deserializeProject(serializeProject(state));
assert.equal(saved.fileli.metalThicknessMm,1.2,'Metal thickness must survive save/load');
console.log(`✓ Fileli entegrasyon: MERHABA ${glyphs.length} harf, ${geometryCount} mesh, ${triangles} sağlam üçgen; içe gömülü pleksi; güvenli hatalı-ofset davranışı; kayıt testi`);
