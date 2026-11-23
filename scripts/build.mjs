import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = '/working_dir/c_3df7450c4340aa44/artifacts/file_generation/ttl=63d/output';

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
copyDir(path.join(ROOT, 'public'), path.join(DIST, 'public'));

// Create deliverable ZIP archive of complete source + dist
fs.mkdirSync(OUT_DIR, { recursive: true });
const zipPath = path.join(OUT_DIR, 'Kutu_Harf_Studyosu_Pro_v2.zip');
execSync(`python3 -c "import os, zipfile; z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(r,f), os.path.relpath(os.path.join(r,f),'${ROOT}')) for d in ['index.html','package.json','src','public','scripts','tests','dist'] for r,_,fs in (os.walk(os.path.join('${ROOT}',d)) if os.path.isdir(os.path.join('${ROOT}',d)) else [('${ROOT}',[],[d])]) for f in fs]; z.close()"`, { stdio: 'inherit' });
console.log('Üretim derlemesi (dist/) ve ZIP paketi oluşturuldu:', zipPath);
