/**
 * Production interchange of the actual assembled Three.js letter geometry.
 * STL/OBJ/PLY/3MF: vertices in millimeters. glTF/GLB: meters as specified by glTF.
 * Material colours retained in OBJ+MTL, PLY, 3MF, and glTF's PBR factors.
 * The application scene is not mutated during collection or export.
 */
const enc=new TextEncoder();
const f=n=>Number(n).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
const ascii=s=>enc.encode(s);
const hexColor=c=>'#'+[c[0],c[1],c[2]].map(v=>Math.max(0,Math.min(255,Math.round(Math.pow(v,1/2.2)*255))).toString(16).padStart(2,'0')).join('');
const bytesJoin=parts=>{const out=new Uint8Array(parts.reduce((n,b)=>n+b.length,0));let pos=0;for(const b of parts){out.set(b,pos);pos+=b.length;}return out;};
const pad4=b=>{const padded=new Uint8Array(Math.ceil(b.length/4)*4);padded.set(b);return padded;};
const xmlEscape=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function getLayerId(mesh,root) {
  let node=mesh;
  while(node&&node!==root){if(node.userData?.layerId)return node.userData.layerId;node=node.parent;}
  return null;
}
function readColor(material) {
  const c=material?.color;
  return c&&Number.isFinite(c.r)?[c.r,c.g,c.b]:[0.75,0.75,0.75];
}
/** Extract every triangle from visible physical meshes of signGroup, respecting selected CAD layers. */
export function collectSignTriangles(signGroup, selectedIds=null) {
  if(!signGroup?.traverse)throw Error('3D model henüz oluşturulmadı.');
  const selected=selectedIds===null?null:new Set(selectedIds);
  if(selected&&selected.size===0)throw Error('3D dışa aktarma için nesne seçin.');
  signGroup.updateWorldMatrix?.(true,true);
  const groups=[];
  let triangleCount=0;
  signGroup.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry||mesh.visible===false)return;
    let ancestor=mesh.parent;
    while(ancestor&&ancestor!==signGroup){if(ancestor.visible===false)return;ancestor=ancestor.parent;}
    const layerId=getLayerId(mesh,signGroup);
    // Helpers, walls, lights, raycaster outlines and halo are not manufactured solids.
    if(!layerId)return;
    if(selected&&!selected.has(layerId))return;
    const geo=mesh.geometry,pos=geo.getAttribute?.('position');
    if(!pos||pos.count<3)return;
    const index=geo.getIndex?.();
    const total=index?.count??pos.count;
    // ExtrudeGeometry uses separate geometry groups for face and sidewall.
    // A mesh can therefore hold two distinct PBR materials, which must remain
    // separate after OBJ/GLB/3MF export rather than being flattened to slot 0.
    const materialRuns=Array.isArray(mesh.material)&&geo.groups?.length
      ?geo.groups:[{start:0,count:total,materialIndex:0}];
    // Object transform is baked: files can be opened in external CAD/3D packages.
    const me=mesh.matrixWorld?.elements;
    function vertex(idx) {
      let x=pos.getX(idx),y=pos.getY(idx),z=pos.getZ(idx);
      if(me) {
        const w=me[3]*x+me[7]*y+me[11]*z+me[15]||1;
        const X=(me[0]*x+me[4]*y+me[8]*z+me[12])/w;
        const Y=(me[1]*x+me[5]*y+me[9]*z+me[13])/w;
        const Z=(me[2]*x+me[6]*y+me[10]*z+me[14])/w;
        x=X;y=Y;z=Z;
      }
      return [x,y,z];
    }
    for(const run of materialRuns) {
      const material=Array.isArray(mesh.material)?mesh.material[run.materialIndex||0]:mesh.material;
      if(material?.visible===false)continue;
      const group={name:String(mesh.name||layerId)+(materialRuns.length>1?'_surface'+(run.materialIndex||0):''),layerId,
        color:readColor(material),metallic:Number(material?.metalness||0),roughness:Number(material?.roughness??0.65),
        opacity:Number(material?.opacity??1),triangles:[]};
      const end=Math.min(total,(run.start||0)+(run.count||total));
      for(let i=run.start||0;i+2<end;i+=3) {
        const a=vertex(index?index.getX(i):i);
        const b=vertex(index?index.getX(i+1):i+1);
        const c=vertex(index?index.getX(i+2):i+2);
        if(![...a,...b,...c].every(Number.isFinite))continue;
        const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
        const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
        const l=Math.hypot(nx,ny,nz);
        if(l<1e-13)continue;
        group.triangles.push({verts:[a,b,c],normal:[nx/l,ny/l,nz/l]});
        if(++triangleCount>1_500_000)throw Error('3D model dışa aktarma sınırını aştı (1,5 milyon üçgen).');
      }
      if(group.triangles.length)groups.push(group);
    }
  });
  if(!groups.length)throw Error('Dışa aktarılacak gerçek 3D harf geometrisi bulunamadı.');
  return groups;
}
export function writeObjMtl(groups,mtlFile='kutu_harf.mtl') {
  let obj=`# Kutu Harf Studyosu - 3D model\n# Vertex units: millimeters (3D printing/CAD)\nmtllib ${mtlFile.replace(/[^\w.\-]/g,'_')}\n`;
  let mtl='# Physically-inspired preview material approximations\n';
  let firstIndex=1;
  groups.forEach((g,gi)=>{
    const matId='material_'+gi;
    const rgb=g.color;
    mtl+=`newmtl ${matId}\nKd ${rgb.map(f).join(' ')}\nKa 0 0 0\nKs ${f(g.metallic)} ${f(g.metallic)} ${f(g.metallic)}\nNs ${f((1-g.roughness)*900+10)}\nd ${f(g.opacity)}\nillum 2\n\n`;
    obj+=`o ${g.name.replace(/\s+/g,'_').replace(/[^\w.\-]/g,'_')}\nusemtl ${matId}\n`;
    for(const tri of g.triangles) {
      for(const p of tri.verts) obj+=`v ${p.map(n=>f(n*1000)).join(' ')}\n`;
      for(let k=0;k<3;k++)obj+=`vn ${tri.normal.map(f).join(' ')}\n`;
      obj+=`f ${firstIndex}//${firstIndex} ${firstIndex+1}//${firstIndex+1} ${firstIndex+2}//${firstIndex+2}\n`;
      firstIndex+=3;
    }
  });
  return {obj,mtl};
}
export function writeStlAscii(groups) {
  let out='solid Kutu_Harf_Studyosu_mm\n';
  for(const g of groups)for(const t of g.triangles){
    out+=`  facet normal ${t.normal.map(f).join(' ')}\n    outer loop\n`;
    out+=t.verts.map(p=>`      vertex ${p.map(n=>f(n*1000)).join(' ')}\n`).join('');
    out+='    endloop\n  endfacet\n';
  }
  return out+'endsolid Kutu_Harf_Studyosu_mm\n';
}
export function writeStlBinary(groups) {
  const count=groups.reduce((n,g)=>n+g.triangles.length,0);
  const bytes=new Uint8Array(84+count*50),view=new DataView(bytes.buffer);
  bytes.set(ascii('Kutu Harf Studyosu | binary STL | millimeter').slice(0,80),0);
  view.setUint32(80,count,true);let at=84;
  for(const g of groups)for(const t of g.triangles) {
    for(const n of [...t.normal,...t.verts.flat().map(x=>x*1000)]){view.setFloat32(at,n,true);at+=4;}
    view.setUint16(at,0,true);at+=2;
  }
  return bytes;
}
export function writePly(groups) {
  const faces=groups.reduce((n,g)=>n+g.triangles.length,0),verts=faces*3;
  let out=`ply\nformat ascii 1.0\ncomment Coordinates in millimeters\nelement vertex ${verts}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${faces}\nproperty list uchar int vertex_indices\nend_header\n`;
  for(const g of groups){const colors=Array.from(hexColor(g.color).slice(1).matchAll(/../g)).map(x=>parseInt(x[0],16));
    for(const t of g.triangles)for(const p of t.verts)out+=`${p.map(n=>f(n*1000)).join(' ')} ${colors.join(' ')}\n`;
  }
  for(let i=0;i<faces;i++)out+=`3 ${i*3} ${i*3+1} ${i*3+2}\n`;
  return out;
}
function makeGltf(groups) {
  const document={asset:{version:'2.0',generator:'Kutu Harf Studyosu'},scene:0,
    scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[],bufferViews:[],accessors:[]};
  const binary=[];let cursor=0;
  const append=(array,target)=>{
    const data=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
    const aligned=pad4(data),start=cursor;
    binary.push(aligned);cursor+=aligned.length;
    const view=document.bufferViews.push({buffer:0,byteOffset:start,byteLength:data.byteLength,target})-1;
    return view;
  };
  for(const group of groups){
    const triangles=group.triangles;
    const positions=new Float32Array(triangles.length*9),normals=new Float32Array(triangles.length*9),indices=new Uint32Array(triangles.length*3);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let vertex=0;
    triangles.forEach(t=>t.verts.forEach((p,i)=>{
      const idx=vertex++;indices[idx]=idx;
      for(let c=0;c<3;c++){
        positions[idx*3+c]=p[c];normals[idx*3+c]=t.normal[c];
        min[c]=Math.min(min[c],p[c]);max[c]=Math.max(max[c],p[c]);
      }
    }));
    const pv=append(positions,34962),nv=append(normals,34962),iv=append(indices,34963);
    const pa=document.accessors.push({bufferView:pv,componentType:5126,count:vertex,type:'VEC3',min,max})-1;
    const na=document.accessors.push({bufferView:nv,componentType:5126,count:vertex,type:'VEC3'})-1;
    const ia=document.accessors.push({bufferView:iv,componentType:5125,count:vertex,type:'SCALAR'})-1;
    const mat=document.materials.push({name:group.name,pbrMetallicRoughness:{baseColorFactor:[...group.color,group.opacity],metallicFactor:group.metallic,roughnessFactor:group.roughness},
      ...(group.opacity<1?{alphaMode:'BLEND'}:{})})-1;
    const mesh=document.meshes.push({primitives:[{attributes:{POSITION:pa,NORMAL:na},indices:ia,material:mat,mode:4}],name:group.name})-1;
    const node=document.nodes.push({mesh,name:group.name})-1;
    document.scenes[0].nodes.push(node);
  }
  const buffer=bytesJoin(binary);
  document.buffers=[{byteLength:buffer.length}];
  return {document,buffer};
}
export function writeGlb(groups) {
  const {document,buffer}=makeGltf(groups);
  const json=pad4(ascii(JSON.stringify(document)));
  // JSON chunks must be padded with spaces, not NUL.
  json.fill(0x20,ascii(JSON.stringify(document)).length);
  const bin=pad4(buffer);
  const bytes=new Uint8Array(12+8+json.length+8+bin.length),v=new DataView(bytes.buffer);
  v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,bytes.length,true);
  v.setUint32(12,json.length,true);v.setUint32(16,0x4e4f534a,true);bytes.set(json,20);
  let at=20+json.length;v.setUint32(at,bin.length,true);v.setUint32(at+4,0x004e4942,true);bytes.set(bin,at+8);
  return bytes;
}
export function writeGltf(groups) {
  const {document,buffer}=makeGltf(groups);
  // One-file .gltf uses a valid embedded data URI, avoiding a missing external .bin.
  let base64='';
  const CHUNK=8192;
  for(let i=0;i<buffer.length;i+=CHUNK)base64+=String.fromCharCode(...buffer.subarray(i,i+CHUNK));
  document.buffers[0].uri=`data:application/octet-stream;base64,${btoa(base64)}`;
  return JSON.stringify(document,null,2);
}
function crc32(bytes) {
  let c=-1;
  for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}
  return (c^-1)>>>0;
}
/** Write ZIP/STORED, sufficient for self-contained standard 3MF packages. */
function zipFiles(files) {
  const local=[],central=[];let offset=0;
  for(const [name,content] of files){
    const file=ascii(name),data=typeof content==='string'?ascii(content):content;
    const crc=crc32(data),localHead=new Uint8Array(30+file.length),lv=new DataView(localHead.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);
    lv.setUint16(26,file.length,true);localHead.set(file,30);
    local.push(localHead,data);
    const dir=new Uint8Array(46+file.length),dv=new DataView(dir.buffer);
    dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);
    dv.setUint16(8,0x0800,true);dv.setUint32(16,crc,true);dv.setUint32(20,data.length,true);dv.setUint32(24,data.length,true);
    dv.setUint16(28,file.length,true);dv.setUint32(42,offset,true);dir.set(file,46);
    central.push(dir);offset+=localHead.length+data.length;
  }
  const size=central.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),dv=new DataView(end.buffer);
  dv.setUint32(0,0x06054b50,true);dv.setUint16(8,files.length,true);dv.setUint16(10,files.length,true);
  dv.setUint32(12,size,true);dv.setUint32(16,offset,true);
  return bytesJoin([...local,...central,end]);
}
export function write3mf(groups) {
  let res='',build='',index=1,matIndex=0;
  const bases=groups.map((g,i)=>`<base name="${xmlEscape(g.name)}" displaycolor="${hexColor(g.color)}FF"/>`).join('');
  res+=`<basematerials id="999">${bases}</basematerials>`;
  for(const g of groups){
    let vertices='',faces='',n=0;
    for(const t of g.triangles){for(const p of t.verts)vertices+=`<vertex x="${f(p[0]*1000)}" y="${f(p[1]*1000)}" z="${f(p[2]*1000)}"/>`;
      faces+=`<triangle v1="${n}" v2="${n+1}" v3="${n+2}" pid="999" p1="${matIndex}"/>`;n+=3;}
    res+=`<object id="${index}" type="model" name="${xmlEscape(g.name)}"><mesh><vertices>${vertices}</vertices><triangles>${faces}</triangles></mesh></object>`;
    build+=`<item objectid="${index}"/>`;index++;matIndex++;
  }
  const model=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xml:lang="tr-TR"><resources>${res}</resources><build>${build}</build></model>`;
  return zipFiles([
    ['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'],
    ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'],
    ['3D/3dmodel.model',model],
  ]);
}
