import fs from 'fs';
import {deflateSync} from 'node:zlib';
import {generateWallPixels} from '../src/photomontage/WallTextureGenerator.js';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = process.env.ZIP_OUT || '';

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));
copyDir(path.join(ROOT, 'src'), path.join(DIST, 'src'));
// Generate real thumbnails from the identical diffuse textures used by the 3D wall.
const previewDir=path.join(ROOT,'public','wall-previews');fs.mkdirSync(previewDir,{recursive:true});
const crc=buf=>{let c=0xffffffff;for(const byte of buf){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);};
for(const id of ['studioPremium','traverten','kompozit','siyahMermer','cevizPanel','beyazSiva','tugla','beton','ahsap','siva','mermer','vitrin','resepsiyon','karanlikCephe','studioNotr']){
 const {size,color}=generateWallPixels(id),w=160,h=96;
 const raw=Buffer.alloc((1+w*3)*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.floor(y*size/h)*size+Math.floor(x*size/w))*4,j=y*(1+w*3)+1+x*3;raw[j]=color[i];raw[j+1]=color[i+1];raw[j+2]=color[i+2];}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 fs.writeFileSync(path.join(previewDir,id+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
copyDir(path.join(ROOT, 'public'), path.join(DIST, 'public'));

console.log('Üretim derlemesi (dist/) oluşturuldu:', DIST);
if (OUT_DIR) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zipPath = path.join(OUT_DIR, 'Kutu_Harf_Studyosu_Pro_v2.zip');
  execSync(`python3 -c "import os, zipfile; z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),'${ROOT}')) for d in ['index.html','package.json','guncelle.bat','src','public','scripts','tests','dist'] for r,_,fs in (os.walk(os.path.join('${ROOT}',d)) if os.path.isdir(os.path.join('${ROOT}',d)) else [('${ROOT}',[],[d])]) for f in fs]; z.close()"`, { stdio: 'inherit' });
  console.log('ZIP paketi oluşturuldu:', zipPath);
}
