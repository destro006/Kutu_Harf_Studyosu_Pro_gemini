import {
  ensureWinding,
  minDistanceBetweenPolygons,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  polygonsIntersect,
  segmentsIntersect,
} from '../geometry/PolygonOffset.js';

/**
 * Industrial True-Shape Irregular Polygon Sheet Nesting Engine
 * - Material-aware batching (never mixes acrylic with stainless steel or different thicknesses)
 * - True-shape hole nesting (places smaller compatible parts inside large holes like 'O' when enabled)
 * - Grain-direction & rotation increment controls (0, 0/90, 0/90/180/270, 45, 30, 15, 5, 1 deg)
 * - Multi-sheet allocation + locked-part preservation during re-optimization
 * - Independent geometric validity & collision verification
 */

export const SHEET_PRESETS = [
  { id: '1000x2000', label: '1000 × 2000 mm', w: 1000, h: 2000 },
  { id: '1220x2440', label: '1220 × 2440 mm', w: 1220, h: 2440 },
  { id: '1250x2500', label: '1250 × 2500 mm', w: 1250, h: 2500 },
  { id: '3000x1500', label: '3000 × 1500 mm (Yatay)', w: 3000, h: 1500 },
  { id: '1500x3000', label: '1500 × 3000 mm (Dikey)', w: 1500, h: 3000 },
  { id: '2000x3000', label: '2000 × 3000 mm', w: 2000, h: 3000 },
  { id: '400x400', label: '400 × 400 mm (Test)', w: 400, h: 400 },
];

export function rotatePolygon(pts, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rotated = pts.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const b = polygonBounds(rotated);
  return {
    points: rotated.map(p => ({ x: p.x - b.minX, y: p.y - b.minY })),
    dx: -b.minX,
    dy: -b.minY,
  };
}

export function translatePolygon(pts, dx, dy) {
  return pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

function simplifyClosedPolygon(pts, tol = 1.5) {
  if (!pts || pts.length <= 12) return pts;
  let farIdx = 0, maxD2 = -1;
  for (let i = 1; i < pts.length; i++) {
    const d2 = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
    if (d2 > maxD2) { maxD2 = d2; farIdx = i; }
  }
  const rdp = (arr) => {
    if (arr.length < 3) return arr;
    const keep = new Uint8Array(arr.length);
    keep[0] = keep[arr.length - 1] = 1;
    const stack = [[0, arr.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const a = arr[s], b = arr[e];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      let bestIdx = -1, bestD = tol;
      for (let i = s + 1; i < e; i++) {
        const d = Math.abs(dy * arr[i].x - dx * arr[i].y + b.x * a.y - b.y * a.x) / len;
        if (d > bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx > 0) { keep[bestIdx] = 1; stack.push([s, bestIdx], [bestIdx, e]); }
    }
    return arr.filter((_, i) => keep[i]);
  };
  const p1 = rdp(pts.slice(0, farIdx + 1));
  const p2 = rdp(pts.slice(farIdx).concat([pts[0]]));
  const res = p1.slice(0, -1).concat(p2.slice(0, -1));
  return res.length >= 3 ? res : pts;
}

/**
 * Extracts nestable manufacturing components from current scene metricsList,
 * preserving projectId, parentId, partId, material, thickness, finish, and exact contours.
 */
export function extractNestingItems(metricsList, state) {
  const copies = Math.max(1, Number(state.nesting?.copies || 1));
  const targetPart = state.nesting?.targetPart || 'all';
  const items = [];

  for (let c = 0; c < copies; c++) {
    for (const m of metricsList) {
      if (!m.polygonsMm?.length) continue;

      const addRing = (outer, holes, partType, materialName, thicknessMm, operation) => {
        const rawOuter = ensureWinding(outer, true);
        const normOuter = simplifyClosedPolygon(rawOuter, 1.5);
        if (normOuter.length < 3) return;
        const b = polygonBounds(normOuter);
        const shift = p => ({ x: p.x - b.minX, y: p.y - b.minY });
        const normHoles = (holes || []).map(h => simplifyClosedPolygon(ensureWinding(h, false), 1.5).map(shift));
        const holeArea = normHoles.reduce((acc, h) => acc + polygonArea(h), 0);
        const areaMm2 = Math.max(0, polygonArea(normOuter) - holeArea);

        items.push({
          id: `${m.objectId}_${m.label}_${partType}_c${c}_${items.length}`,
          projectId: state.projectId || 'proj_default',
          projectName: state.projectName || 'Proje',
          parentId: m.objectId,
          label: `${m.label} (${partType})`,
          partType,
          operation,
          material: materialName,
          thicknessMm,
          materialGroup: `${materialName} · ${thicknessMm} mm`,
          outer: normOuter.map(shift),
          holes: normHoles,
          areaMm2,
          locked: false,
        });
      };

      if (targetPart === 'all' || targetPart === 'outer') {
        for (const poly of m.polygonsMm) {
          addRing(poly.outer, poly.holes, 'Gövde', state.materials?.faceId || 'metal', m.depthMm || 80, 'CUT_OUTER');
        }
      }
      if ((targetPart === 'all' || targetPart === 'acrylic') && m.exportContours?.acrylic?.length) {
        for (const poly of m.exportContours.acrylic) {
          addRing(poly.outer, poly.holes, 'Pleksi', state.fileli?.acrylicMaterial || 'opalPleksi', state.fileli?.acrylicThicknessMm || 3, 'CUT_OUTER');
        }
      }
      if ((targetPart === 'all' || targetPart === 'file') && m.exportContours?.file?.length) {
        for (const poly of m.exportContours.file) {
          addRing(poly.outer, poly.holes, 'File', state.fileli?.fileMaterial || 'aynaAltin', state.fileli?.fileThicknessMm || 2, 'CUT_OUTER');
        }
      }
    }
  }
  return items;
}

/**
 * Checks whether `candPoly` can be placed inside `holePoly` of `placedPart`
 * with at least `minSep` clearance on all edges.
 */
function fitsInsideHole(candPoly, holePoly, minSep) {
  if (!holePoly || holePoly.length < 3) return false;
  const cb = polygonBounds(candPoly);
  const hb = polygonBounds(holePoly);
  if (cb.minX < hb.minX + minSep || cb.maxX > hb.maxX - minSep || cb.minY < hb.minY + minSep || cb.maxY > hb.maxY - minSep) {
    return false;
  }
  // Every vertex of candPoly must be inside holePoly
  for (let i = 0; i < candPoly.length; i += Math.max(1, Math.floor(candPoly.length / 8))) {
    if (!pointInPolygon(candPoly[i], holePoly)) return false;
  }
  // No edge crossing and minimum distance >= minSep
  for (let i = 0; i < candPoly.length; i++) {
    const a = candPoly[i], b = candPoly[(i + 1) % candPoly.length];
    for (let j = 0; j < holePoly.length; j++) {
      if (segmentsIntersect(a, b, holePoly[j], holePoly[(j + 1) % holePoly.length], false)) return false;
    }
  }
  // Boundary-to-boundary distance (containment is desired here, not collision!)
  let minD = Infinity;
  for (const pt of candPoly) {
    for (let j = 0; j < holePoly.length; j++) {
      const a = holePoly[j], b = holePoly[(j + 1) % holePoly.length];
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / l2));
      minD = Math.min(minD, Math.hypot(pt.x - (a.x + t * vx), pt.y - (a.y + t * vy)));
    }
  }
  return minD >= minSep;
}

/**
 * Validates every placement on a sheet for overlaps, out-of-bounds, and insufficient spacing.
 */
export function validateSheetLayout(sheet, minSep = 5) {
  const errors = [];
  const mL = sheet.marginLeftMm ?? sheet.marginMm ?? 15;
  const mR = sheet.marginRightMm ?? sheet.marginMm ?? 15;
  const mT = sheet.marginTopMm ?? sheet.marginMm ?? 15;
  const mB = sheet.marginBottomMm ?? sheet.marginMm ?? 15;

  for(const placement of sheet.placements)placement.hasCollision=false;
  const sorted=sheet.placements.slice().sort((a,b)=>a.bounds.minX-b.bounds.minX);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (
      a.bounds.minX < mL - 0.1 ||
      a.bounds.minY < mB - 0.1 ||
      a.bounds.maxX > sheet.widthMm - mR + 0.1 ||
      a.bounds.maxY > sheet.heightMm - mT + 0.1
    ) {
      a.hasCollision = true;
      errors.push(`${a.label}: Plaka kesim sınırı dışında.`);
    }

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const ab=a.bounds,bb=b.bounds;
      if(ab.maxX+minSep<=bb.minX+1e-5)break;
      if(ab.maxX+minSep<=bb.minX+1e-5||bb.maxX+minSep<=ab.minX+1e-5||ab.maxY+minSep<=bb.minY+1e-5||bb.maxY+minSep<=ab.minY+1e-5)continue;
      const insideAHole = a.holes?.some(h => fitsInsideHole(b.outer, h, minSep));
      const insideBHole = b.holes?.some(h => fitsInsideHole(a.outer, h, minSep));
      if (insideAHole || insideBHole) continue;

      const d = minDistanceBetweenPolygons(a.outer, b.outer);
      if (d < minSep - 0.05 || polygonsIntersect(a.outer, b.outer)) {
        a.hasCollision = true;
        b.hasCollision = true;
        errors.push(`${a.label} ↔ ${b.label}: Çarpışma veya yetersiz boşluk (${d.toFixed(1)} mm < ${minSep.toFixed(1)} mm).`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Runs material-aware true-shape irregular polygon nesting.
 * Groups incompatible materials/thicknesses into separate batches automatically.
 */
export function runTrueShapeNesting(items, config = {}, existingLockedSheets = []) {
  const {
    sheetWidthMm = 3000,
    sheetHeightMm = 1500,
    marginMm = 15,
    marginLeftMm,
    marginRightMm,
    marginTopMm,
    marginBottomMm,
    clearanceMm = 5,
    kerfMm = 0.4,
    allowedAngles = [0, 90, 180, 270],
    fineAngleStep = 0,
    rotationStepDeg,
    placementStrategy = 'compact',
    enforceGrainDirection = false,
    grainDirection = 'none',
    allowHoleNesting = true,
    groupByMaterial = true,
    quickImport = false,
    itemOrder='area', deadline=Infinity,
  } = config;

  const mL = marginLeftMm ?? marginMm;
  const mR = marginRightMm ?? marginMm;
  const mT = marginTopMm ?? marginMm;
  const mB = marginBottomMm ?? marginMm;
  const minSep = Math.max(0.5, clearanceMm + kerfMm);
  const usableW = sheetWidthMm - mL - mR;
  const usableH = sheetHeightMm - mB - mT;

  // The UI rotation selector is authoritative. Older projects that lack it
  // retain their explicit allowedAngles/fineAngleStep settings.
  let angles = allowedAngles.length ? allowedAngles : [0, 90, 180, 270];
  if (rotationStepDeg != null && [0, 5, 15, 30, 45, 90, 180].includes(Number(rotationStepDeg))) {
    angles = Number(rotationStepDeg) === 0 ? [0] :
      Array.from({length:360 / Number(rotationStepDeg)}, (_, i) => i * Number(rotationStepDeg));
  } else if (fineAngleStep > 0) {
    angles = [];
    for (let a = 0; a < 360; a += fineAngleStep) angles.push(a);
  }
  if (enforceGrainDirection || grainDirection === 'horizontal' || grainDirection === 'vertical') {
    angles = angles.filter(a => a % 180 === 0);
    if (!angles.length) angles = [0, 180];
  }

  // Group items by materialGroup so acrylic and metal never share a sheet
  const batches = new Map();
  for (const item of items) {
    const key = groupByMaterial ? (item.materialGroup || 'Genel') : 'Genel';
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(item);
  }

  const allSheets = [];
  const unplaced = [];

  for (const [materialGroup, batchItems] of batches.entries()) {
    const extent=item=>polygonBounds(item.outer);
    const sizes=new Map(batchItems.map(item=>[item,extent(item)]));
    const sorted=batchItems.slice().sort((a,b)=>{
      const x=sizes.get(a),y=sizes.get(b);
      if(itemOrder==='box')return y.width*y.height-x.width*x.height||b.areaMm2-a.areaMm2;
      if(itemOrder==='long')return Math.max(y.width,y.height)-Math.max(x.width,x.height)||b.areaMm2-a.areaMm2;
      if(itemOrder==='short')return Math.min(y.width,y.height)-Math.min(x.width,x.height)||b.areaMm2-a.areaMm2;
      return b.areaMm2-a.areaMm2;
    });
    const batchSheets = [];

    // Preserve any locked placements for this materialGroup
    for (const ex of existingLockedSheets) {
      if (ex.materialGroup === materialGroup) {
        const batchIds=new Set(batchItems.map(item=>item.id));
        const lockedPls = ex.placements.filter(p=>p.locked).map(p=>batchIds.has(p.id)?p:{...p,id:String(p.id).replace(/_copy0$/,'')}).filter(p=>batchIds.has(p.id));
        if (lockedPls.length) {
          batchSheets.push({
            index: allSheets.length + batchSheets.length + 1,
            materialGroup,
            widthMm: sheetWidthMm,
            heightMm: sheetHeightMm,
            marginMm,
            marginLeftMm: mL,
            marginRightMm: mR,
            marginTopMm: mT,
            marginBottomMm: mB,
            placements: lockedPls.map(p => ({ ...p })),
            usedAreaMm2: lockedPls.reduce((s, p) => s + p.areaMm2, 0),
          });
        }
      }
    }

    const lockedIds = new Set(batchSheets.flatMap(s => s.placements.map(p => p.id)));

    const fitsOnSheet = (sheet, candPoly, candBounds) => {
      if (
        candBounds.minX < mL - 1e-4 ||
        candBounds.minY < mB - 1e-4 ||
        candBounds.maxX > sheetWidthMm - mR + 1e-4 ||
        candBounds.maxY > sheetHeightMm - mT + 1e-4
      ) {
        return false;
      }

      for (const placed of sheet.placements) {
        const pb = placed.bounds;
        if (
          candBounds.maxX + minSep <= pb.minX ||
          pb.maxX + minSep <= candBounds.minX ||
          candBounds.maxY + minSep <= pb.minY ||
          pb.maxY + minSep <= candBounds.minY
        ) {
          continue;
        }

        if(allowHoleNesting&&placed.holes?.some(h=>fitsInsideHole(candPoly,h,minSep)))continue;
        const dist = minDistanceBetweenPolygons(candPoly, placed.outer);
        if (dist < minSep) return false;
        if (polygonsIntersect(candPoly, placed.outer)) return false;
      }
      return true;
    };

    const choose=(sheet,variants)=>quickImport?findQuickPlacement(sheet,variants,mL,mB,sheetWidthMm-mR,sheetHeightMm-mT,minSep):findBestPlacementOnSheet(sheet,variants,mL,mB,sheetWidthMm-mR,sheetHeightMm-mT,allowHoleNesting,fitsOnSheet,minSep,placementStrategy,deadline);
    for (const item of sorted) {
      if(performance.now()>deadline)throw Error('NEST_BUDGET');
      if (lockedIds.has(item.id)) continue;

      const variants = angles.map(ang => {
        const rO = rotatePolygon(item.outer, ang);
        const rH = (item.holes || []).map(h => {
          const rad = (ang * Math.PI) / 180;
          const c = Math.cos(rad), s = Math.sin(rad);
          return h.map(p => ({ x: p.x * c - p.y * s + rO.dx, y: p.x * s + p.y * c + rO.dy }));
        });
        const b = polygonBounds(rO.points);
        return { ang, outer: rO.points, holes: rH, bounds: b };
      }).filter(v => v.bounds.width <= usableW && v.bounds.height <= usableH);

      if (!variants.length) {
        unplaced.push({ item, reason: `Parça (${materialGroup}) plaka ölçüsünden (${usableW}×${usableH} mm) büyük.` });
        continue;
      }

      let placedOk = false;
      for (const sheet of batchSheets) {
        const best = choose(sheet,variants);
        if (best) {
          sheet.placements.push(makePlacement(item, best));
          sheet.usedAreaMm2 += item.areaMm2;
          placedOk = true;
          break;
        }
      }

      if (!placedOk) {
        const newSheet = {
          index: allSheets.length + batchSheets.length + 1,
          materialGroup,
          widthMm: sheetWidthMm,
          heightMm: sheetHeightMm,
          marginMm,
          marginLeftMm: mL,
          marginRightMm: mR,
          marginTopMm: mT,
          marginBottomMm: mB,
          placements: [],
          usedAreaMm2: 0,
        };
        const best = choose(newSheet,variants);
        if (best) {
          newSheet.placements.push(makePlacement(item, best));
          newSheet.usedAreaMm2 += item.areaMm2;
          batchSheets.push(newSheet);
        } else {
          unplaced.push({ item, reason: 'Plakaya sığmadı.' });
        }
      }
    }

    for (const sh of batchSheets) {
      sh.index = allSheets.length + 1;
      allSheets.push(sh);
    }
  }

  let interlockedPairs = 0;
  let totalCutLengthMm = 0;
  for (const sh of allSheets) {
    validateSheetLayout(sh, minSep);
    for (let i = 0; i < sh.placements.length; i++) {
      for (let j = i + 1; j < sh.placements.length; j++) {
        const a = sh.placements[i].bounds;
        const b = sh.placements[j].bounds;
        if (!(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY)) interlockedPairs++;
      }
    }
    const usableArea = (sh.widthMm - sh.marginLeftMm - sh.marginRightMm) * (sh.heightMm - sh.marginTopMm - sh.marginBottomMm);
    for(const p of sh.placements)totalCutLengthMm+=ringLength(p.outer)+(p.holes||[]).reduce((sum,h)=>sum+ringLength(h),0);
    sh.usableAreaMm2 = usableArea;
    sh.utilizationPct = Math.min(100, (sh.usedAreaMm2 / Math.max(1, usableArea)) * 100);
    sh.scrapAreaM2 = Math.max(0, (sh.widthMm * sh.heightMm - sh.usedAreaMm2) / 1_000_000);
  }

  const totalUsableArea = allSheets.reduce((s, sh) => s + sh.usableAreaMm2, 0);
  const totalUsedArea = allSheets.reduce((s, sh) => s + sh.usedAreaMm2, 0);

  return {
    sheets: allSheets,
    unplaced,
    sheetCount: allSheets.length,
    interlockedPairs,
    overallUtilizationPct: totalUsableArea > 0 ? (totalUsedArea / totalUsableArea) * 100 : 0,
    totalScrapM2: allSheets.reduce((s, sh) => s + sh.scrapAreaM2, 0),
    totalCutLengthM: totalCutLengthMm / 1000,
    minSep,
  };
}

export function ringLength(r){let length=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];length+=Math.hypot(b.x-a.x,b.y-a.y);}return length;}
export function refreshNestingSheet(sheet,minSep){
  sheet.usedAreaMm2=sheet.placements.reduce((sum,p)=>sum+(p.areaMm2||0),0);
  const usable=(sheet.widthMm-(sheet.marginLeftMm??sheet.marginMm??15)-(sheet.marginRightMm??sheet.marginMm??15))*(sheet.heightMm-(sheet.marginBottomMm??sheet.marginMm??15)-(sheet.marginTopMm??sheet.marginMm??15));
  sheet.usableAreaMm2=Math.max(0,usable);sheet.utilizationPct=100*sheet.usedAreaMm2/Math.max(1,usable);
  sheet.scrapAreaM2=Math.max(0,(sheet.widthMm*sheet.heightMm-sheet.usedAreaMm2)/1e6);
  return validateSheetLayout(sheet,minSep);
}
export function editNestingPlacement(p,action,value){
  if(!p||p.locked||!Number.isFinite(value))return false;
  const b=p.bounds,x=b.minX,y=b.minY;
  let outer=p.outer,holes=p.holes||[],angle=p.angleDeg||0;
  if(action==='x'||action==='y'){
    const dx=action==='x'?value-x:0,dy=action==='y'?value-y:0;
    outer=translatePolygon(outer,dx,dy);holes=holes.map(h=>translatePolygon(h,dx,dy));
  }else if(action==='scale'){
    if(value<=0||value>100)return false;
    const scale=pt=>({x:x+(pt.x-x)*value,y:y+(pt.y-y)*value});
    outer=outer.map(scale);holes=holes.map(h=>h.map(scale));p.areaMm2*=value*value;
  }else if(action==='rot'){
    const d=(value-angle)*Math.PI/180,c=Math.cos(d),s=Math.sin(d);
    const rotate=pt=>({x:(pt.x-x)*c-(pt.y-y)*s,y:(pt.x-x)*s+(pt.y-y)*c});
    outer=outer.map(rotate);holes=holes.map(h=>h.map(rotate));
    const bounds=polygonBounds(outer),dx=x-bounds.minX,dy=y-bounds.minY;
    outer=translatePolygon(outer,dx,dy);holes=holes.map(h=>translatePolygon(h,dx,dy));angle=value;
  }else return false;
  p.outer=outer;p.holes=holes;p.bounds=polygonBounds(outer);p.xMm=p.bounds.minX;p.yMm=p.bounds.minY;p.angleDeg=angle;
  return true;
}
function makePlacement(item, best) {
  return {
    id: item.id,
    projectId: item.projectId,
    label: item.label,
    partType: item.partType,
    material: item.material,
    thicknessMm: item.thicknessMm,
    materialGroup: item.materialGroup,
    locked: !!item.locked,
    angleDeg: best.angleDeg,
    xMm: best.xMm,
    yMm: best.yMm,
    outer: best.outer,
    holes: best.holes,
    bounds: best.bounds,
    areaMm2: item.areaMm2,
    hasCollision: false,
  };
}

// Fast initial placement uses conservative non-overlapping bounding-box shelves.
 // Original paths are preserved; the explicit optimize action can run true-shape nesting later.
const quickShelves=new WeakMap();
function findQuickPlacement(sheet,variants,minX,minY,maxX,maxY,sep){
  const gap=sep+.001;
  let layout=quickShelves.get(sheet);
  if(!layout){
    let startY=minY;
    for(const p of sheet.placements)startY=Math.max(startY,p.bounds.maxY+gap);
    layout={shelves:[],nextY:startY};quickShelves.set(sheet,layout);
  }
  let pick=null;
  for(const shelf of layout.shelves)for(const v of variants){
    const w=v.bounds.width,h=v.bounds.height;
    if(h<=shelf.h+1e-6&&shelf.x+w<=maxX+1e-6){
      const score=(shelf.h-h)*w+(maxX-shelf.x-w)*.01;
      if(!pick||score<pick.score)pick={shelf,v,score};
    }
  }
  if(!pick){
    const options=variants.filter(v=>minX+v.bounds.width<=maxX+1e-6&&layout.nextY+v.bounds.height<=maxY+1e-6).sort((a,b)=>a.bounds.height-b.bounds.height||a.bounds.width-b.bounds.width);
    if(!options.length)return null;
    const v=options[0],shelf={x:minX,y:layout.nextY,h:v.bounds.height};
    layout.shelves.push(shelf);layout.nextY+=shelf.h+gap;pick={shelf,v};
  }
  const {shelf,v}=pick,x=shelf.x,y=shelf.y,w=v.bounds.width,h=v.bounds.height;
  shelf.x+=w+gap;
  return {angleDeg:v.ang,xMm:x,yMm:y,outer:translatePolygon(v.outer,x,y),holes:v.holes.map(r=>translatePolygon(r,x,y)),bounds:{minX:x,minY:y,maxX:x+w,maxY:y+h,width:w,height:h}};
}

function findBestPlacementOnSheet(sheet, variants, minX, minY, maxX, maxY, allowHoleNesting, fitsOnSheet, minSep = 5, strategy = 'compact',deadline=Infinity) {
  let best = null, bestScore = Infinity;
  const occupiedX = Math.max(minX, ...sheet.placements.map(p => p.bounds.maxX));
  const occupiedY = Math.max(minY, ...sheet.placements.map(p => p.bounds.maxY));
  const usableW = Math.max(1, maxX - minX), usableH = Math.max(1, maxY - minY);
  const sheetArea = usableW * usableH;
  const snap = value => Math.round(value * 10) / 10;

  const scoreAt = (x, y, v) => {
    if (strategy === 'bottomLeft') return (x - minX) + (y - minY) * 1.3;
    if (strategy === 'vertical') return (x - minX) * 3 + (y - minY) * 0.2;
    // Minimize the envelope occupied by parts, not the distance from the
    // bottom-left corner. This considers stacking parts above one another
    // when it avoids extending a long row across the sheet.
    const width = Math.max(occupiedX, x + v.bounds.width) - minX;
    const height = Math.max(occupiedY, y + v.bounds.height) - minY;
    return width * height +
      sheetArea * 0.012 * (width / usableW + height / usableH) +
      (x - minX + y - minY) * 0.001;
  };

  for (const v of variants) {
    const candX = new Set([minX]);
    const candY = new Set([minY]);
    const stepX = Math.max(35, usableW / 14);
    const stepY = Math.max(35, usableH / 12);
    for (let x = minX; x + v.bounds.width <= maxX + 1e-5; x += stepX) candX.add(snap(x));
    for (let y = minY; y + v.bounds.height <= maxY + 1e-5; y += stepY) candY.add(snap(y));
    for (const placed of sheet.placements) {
      const b = placed.bounds;
      // Exact edge-contact candidates improve on a coarse fixed grid.
      for (const x of [b.minX, b.maxX + minSep, b.minX - v.bounds.width - minSep, b.maxX - v.bounds.width]) {
        if (x >= minX - 1e-5 && x + v.bounds.width <= maxX + 1e-5) candX.add(snap(x));
      }
      for (const y of [b.minY, b.maxY + minSep, b.minY - v.bounds.height - minSep, b.maxY - v.bounds.height]) {
        if (y >= minY - 1e-5 && y + v.bounds.height <= maxY + 1e-5) candY.add(snap(y));
      }
      if (allowHoleNesting) for (const hole of placed.holes || []) {
        const hb = polygonBounds(hole);
        candX.add(snap(hb.minX + minSep));
        candY.add(snap(hb.minY + minSep));
      }
    }
    const xs = [...candX].filter(x => x >= minX && x + v.bounds.width <= maxX + 1e-5).sort((a,b)=>a-b);
    const ys = [...candY].filter(y => y >= minY && y + v.bounds.height <= maxY + 1e-5).sort((a,b)=>a-b);
    if(Number.isFinite(deadline)){
      const candidates=[];
      for(const x of xs)for(const y of ys)candidates.push({x,y,score:scoreAt(x,y,v)});
      // Sample contour vertex contacts (not an exact no-fit-polygon solver).
      const sample=pts=>pts.filter((_,i)=>i%Math.max(1,Math.ceil(pts.length/12))===0);
      for(const p of sheet.placements){
        for(const a of sample(p.outer))for(const b of sample(v.outer)){
          for(const [dx,dy] of [[minSep+.01,0],[-minSep-.01,0],[0,minSep+.01],[0,-minSep-.01]]){
            const x=a.x-b.x+dx,y=a.y-b.y+dy;
            if(x>=minX&&y>=minY&&x+v.bounds.width<=maxX+1e-5&&y+v.bounds.height<=maxY+1e-5)candidates.push({x,y,score:scoreAt(x,y,v)});
          }
        }
      }
      candidates.sort((a,b)=>a.score-b.score);
      let found=null,checks=0;const seen=new Set();
      for(const {x,y,score} of candidates){
        if(performance.now()>deadline)throw Error('NEST_BUDGET');
        const key=Math.round(x*10)+','+Math.round(y*10);if(seen.has(key))continue;seen.add(key);
        if(++checks>450)break;
        if(!fitsOnSheet(sheet,translatePolygon(v.outer,x,y),{minX:x,minY:y,maxX:x+v.bounds.width,maxY:y+v.bounds.height}))continue;
        found={x,y,score};break;
      }
      if(found){
        let cx=found.x,cy=found.y;
        const fits=(x,y)=>fitsOnSheet(sheet,translatePolygon(v.outer,x,y),{minX:x,minY:y,maxX:x+v.bounds.width,maxY:y+v.bounds.height});
        for(const delta of [12,3,1]){
          while(cx-delta>=minX&&fits(cx-delta,cy)){cx-=delta;if(performance.now()>deadline)throw Error('NEST_BUDGET');}
          while(cy-delta>=minY&&fits(cx,cy-delta)){cy-=delta;if(performance.now()>deadline)throw Error('NEST_BUDGET');}
        }
        const score=scoreAt(cx,cy,v);
        if(score<bestScore){bestScore=score;best={angleDeg:v.ang,xMm:cx,yMm:cy,outer:translatePolygon(v.outer,cx,cy),holes:v.holes.map(h=>translatePolygon(h,cx,cy)),bounds:{minX:cx,minY:cy,maxX:cx+v.bounds.width,maxY:cy+v.bounds.height,width:v.bounds.width,height:v.bounds.height}};}
      }
      continue;
    }
    for (const x of xs) {
      if(performance.now()>deadline)throw Error('NEST_BUDGET');
      for (const y of ys) {
        if(performance.now()>deadline)throw Error('NEST_BUDGET');
        const box = {minX:x,minY:y,maxX:x+v.bounds.width,maxY:y+v.bounds.height};
        const outline = translatePolygon(v.outer,x,y);
        if (!fitsOnSheet(sheet,outline,box)) continue;
        let cx=x,cy=y;
        // Snap tightly against neighboring shapes while preserving all cut
        // clearances and avoiding collision with actual polygon contours.
        for (const delta of [12,3,1]) {
          while (cx-delta >= minX) {
            const px=cx-delta, poly=translatePolygon(v.outer,px,cy);
            if (!fitsOnSheet(sheet,poly,{minX:px,maxX:px+v.bounds.width,minY:cy,maxY:cy+v.bounds.height})) break;
            cx=px;
          }
          while (cy-delta >= minY) {
            const py=cy-delta,poly=translatePolygon(v.outer,cx,py);
            if (!fitsOnSheet(sheet,poly,{minX:cx,maxX:cx+v.bounds.width,minY:py,maxY:py+v.bounds.height})) break;
            cy=py;
          }
        }
        const score = scoreAt(cx,cy,v);
        if (score + 1e-5 < bestScore) {
          bestScore=score;
          best={
            angleDeg:v.ang,xMm:cx,yMm:cy,
            outer:translatePolygon(v.outer,cx,cy),
            holes:v.holes.map(h=>translatePolygon(h,cx,cy)),
            bounds:{minX:cx,minY:cy,maxX:cx+v.bounds.width,maxY:cy+v.bounds.height,width:v.bounds.width,height:v.bounds.height}
          };
        }
      }
    }
  }
  return best;
}
