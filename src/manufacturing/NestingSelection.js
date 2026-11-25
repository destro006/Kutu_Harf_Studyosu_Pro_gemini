import {refreshNestingSheet,editNestingPlacement} from './NestingEngine.js';
import {polygonBounds} from '../geometry/PolygonOffset.js';

/** Selection is confined to the currently displayed nesting sheet. */
export function nextNestingSelection(orderedIds,current,anchor,id,{toggle=false,range=false,addRange=false,preserve=false}={}){
 const ids=new Set(orderedIds),selected=new Set([...current].filter(x=>ids.has(x)));
 if(id==null||!ids.has(id))return {ids:[],anchor:null,primary:null};
 if(preserve&&selected.has(id)&&!toggle&&!range)return {ids:[...selected],anchor:anchor??id,primary:id};
 if(range&&ids.has(anchor)){
  const a=orderedIds.indexOf(anchor),b=orderedIds.indexOf(id);
  const span=orderedIds.slice(Math.min(a,b),Math.max(a,b)+1);
  const result=addRange?[...new Set([...selected,...span])]:span;
  return {ids:result,anchor,primary:id};
 }
 if(toggle){
  if(selected.has(id))selected.delete(id);else selected.add(id);
  const result=[...selected];
  return {ids:result,anchor:id,primary:selected.has(id)?id:result.at(-1)??null};
 }
 return {ids:[id],anchor:id,primary:id};
}

/** Only the current nesting job is changed; overrides prevent repack resurrection. */
export function deleteNestingParts(n,sheetIndex,ids,minSep){
 const sheet=n.sheets?.[sheetIndex];
 if(!sheet)return [];
 const wanted=new Set(ids);
 const removed=sheet.placements.filter(p=>wanted.has(p.id)&&!p.locked).map(p=>p.id);
 if(!removed.length)return [];
 const removedSet=new Set(removed);
 n.partOverrides||={};
 for(const id of removed)n.partOverrides[id]={...(n.partOverrides[id]||{}),deleted:true};
 sheet.placements=sheet.placements.filter(p=>!removedSet.has(p.id));
 n.unplaced=(n.unplaced||[]).filter(x=>!removedSet.has(x.item?.id||x.id));
 n.optimizationInfo=null;
 refreshNestingSheet(sheet,minSep);
 return removed;
}

export function moveNestingParts(n,sheetIndex,ids,dx,dy,minSep){
 const sheet=n.sheets?.[sheetIndex];
 if(!sheet||!Number.isFinite(dx)||!Number.isFinite(dy)||(!dx&&!dy))return [];
 const wanted=new Set(ids),moved=[];
 for(const p of sheet.placements){
  if(p.locked||!wanted.has(p.id))continue;
  editNestingPlacement(p,'x',p.bounds.minX+dx);
  editNestingPlacement(p,'y',p.bounds.minY+dy);
  moved.push(p.id);
 }
  if(moved.length){n.optimizationInfo=null;refreshNestingSheet(sheet,minSep);}
 return moved;
}

/** Rotate 1 or multiple unlocked nesting placements around their combined center. */
export function rotateNestingParts(n, sheetIndex, ids, deltaDeg, minSep = 5) {
  const sheet = n?.sheets?.[sheetIndex];
  if (!sheet || n.enforceGrainDirection || !Number.isFinite(deltaDeg) || Math.abs(deltaDeg) < 1e-6) return [];
  const wanted = new Set(ids);
  const targets = sheet.placements.filter(p => wanted.has(p.id) && !p.locked);
  if (!targets.length) return [];

  if (targets.length === 1) {
    const p = targets[0];
    editNestingPlacement(p, 'rot', (p.angleDeg || 0) + deltaDeg);
  } else {
    const cx = (Math.min(...targets.map(p => p.bounds.minX)) + Math.max(...targets.map(p => p.bounds.maxX))) * 0.5;
    const cy = (Math.min(...targets.map(p => p.bounds.minY)) + Math.max(...targets.map(p => p.bounds.maxY))) * 0.5;
    const rad = (deltaDeg * Math.PI) / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    const rotPt = pt => ({ x: cx + (pt.x - cx) * c - (pt.y - cy) * s, y: cy + (pt.x - cx) * s + (pt.y - cy) * c });
    for (const p of targets) {
      p.outer = p.outer.map(rotPt);
      p.holes = (p.holes || []).map(h => h.map(rotPt));
      p.bounds = polygonBounds(p.outer);
      p.xMm = p.bounds.minX;
      p.yMm = p.bounds.minY;
      p.angleDeg = ((((p.angleDeg || 0) + deltaDeg) % 360) + 360) % 360;
    }
  }
  n.optimizationInfo = null;
  refreshNestingSheet(sheet, minSep);
  return targets.map(p => p.id);
}

/** CorelDRAW-compatible alignment & distribution for selected nesting parts on a sheet. */
export function alignNestingParts(n, sheetIndex, ids, command, minSep = 5) {
  const sheet = n?.sheets?.[sheetIndex];
  if (!sheet || !command) return [];
  const byId = new Map(sheet.placements.map(p => [p.id, p]));
  const entries = (ids || []).map(id => byId.get(id)).filter(p => p && !p.locked);
  if (!entries.length) return [];

  const moved = [];
  const applyDelta = (p, dx, dy) => {
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
    if (Math.abs(dx) >= 1e-6) editNestingPlacement(p, 'x', p.bounds.minX + dx);
    if (Math.abs(dy) >= 1e-6) editNestingPlacement(p, 'y', p.bounds.minY + dy);
    moved.push(p.id);
  };
  const cx = b => (b.minX + b.maxX) * 0.5;
  const cy = b => (b.minY + b.maxY) * 0.5;

  if (command === 'page') {
    const mL = sheet.marginLeftMm ?? sheet.marginMm ?? 15;
    const mR = sheet.marginRightMm ?? sheet.marginMm ?? 15;
    const mT = sheet.marginTopMm ?? sheet.marginMm ?? 15;
    const mB = sheet.marginBottomMm ?? sheet.marginMm ?? 15;
    const usableCx = (mL + (sheet.widthMm - mR)) * 0.5;
    const usableCy = (mB + (sheet.heightMm - mT)) * 0.5;
    const all = {
      minX: Math.min(...entries.map(p => p.bounds.minX)),
      maxX: Math.max(...entries.map(p => p.bounds.maxX)),
      minY: Math.min(...entries.map(p => p.bounds.minY)),
      maxY: Math.max(...entries.map(p => p.bounds.maxY)),
    };
    const dx = usableCx - cx(all), dy = usableCy - cy(all);
    for (const p of entries) applyDelta(p, dx, dy);
  } else {
    const props = {
      left: ['x', b => b.minX],
      right: ['x', b => b.maxX],
      centerX: ['x', cx],
      top: ['y', b => b.maxY],
      bottom: ['y', b => b.minY],
      centerY: ['y', cy],
    };
    const isDist = command.startsWith('dist');
    const mode = isDist ? command.slice(4, 5).toLowerCase() + command.slice(5) : command;
    if (!isDist) {
      if (entries.length < 2 || !props[mode]) return [];
      const [axis, value] = props[mode];
      const targetVal = value(entries.at(-1).bounds);
      for (const p of entries) {
        const d = targetVal - value(p.bounds);
        applyDelta(p, axis === 'x' ? d : 0, axis === 'y' ? d : 0);
      }
    } else {
      if (entries.length < 3) return [];
      if (mode === 'gapX' || mode === 'gapY') {
        const axis = mode === 'gapX' ? 'x' : 'y';
        const lo = axis === 'x' ? 'minX' : 'minY';
        const hi = axis === 'x' ? 'maxX' : 'maxY';
        const sorted = entries.slice().sort((a, b) => a.bounds[lo] - b.bounds[lo]);
        const first = sorted[0].bounds[lo];
        const last = Math.max(...sorted.map(p => p.bounds[hi]));
        const totalSize = sorted.reduce((sum, p) => sum + (p.bounds[hi] - p.bounds[lo]), 0);
        const gap = (last - first - totalSize) / (sorted.length - 1);
        let next = first;
        for (const p of sorted) {
          const d = next - p.bounds[lo];
          applyDelta(p, axis === 'x' ? d : 0, axis === 'y' ? d : 0);
          next += (p.bounds[hi] - p.bounds[lo]) + gap;
        }
      } else if (props[mode]) {
        const [axis, value] = props[mode];
        const sorted = entries.slice().sort((a, b) => value(a.bounds) - value(b.bounds));
        const first = value(sorted[0].bounds);
        const step = (value(sorted.at(-1).bounds) - first) / (sorted.length - 1);
        sorted.forEach((p, i) => {
          const d = first + i * step - value(p.bounds);
          applyDelta(p, axis === 'x' ? d : 0, axis === 'y' ? d : 0);
        });
      }
    }
  }

  if (moved.length) {
    n.optimizationInfo = null;
    refreshNestingSheet(sheet, minSep);
  }
  return moved;
}

/** Creates deep, mutable clones of nesting placements for Cut/Copy/Paste & Duplicate. */
export function cloneNestingPlacements(placements) {
  return (placements || []).filter(p => p && Array.isArray(p.outer) && p.outer.length >= 3).map(p => ({
    baseId: String(p.id || 'part').replace(/_copy_[a-z0-9_]+$/i, ''),
    label: p.label,
    partType: p.partType,
    partGroup: p.partGroup || 'body',
    partGroupLabel: p.partGroupLabel,
    partColor: p.partColor || null,
    dxfLayer: p.dxfLayer || null,
    operation: p.operation || 'CUT_OUTER',
    material: p.material,
    thicknessMm: p.thicknessMm,
    materialGroup: p.materialGroup,
    angleDeg: p.angleDeg || 0,
    areaMm2: p.areaMm2 || 0,
    outer: p.outer.map(pt => ({ x: pt.x, y: pt.y })),
    holes: (p.holes || []).map(h => h.map(pt => ({ x: pt.x, y: pt.y }))),
    bounds: { ...polygonBounds(p.outer) },
  }));
}

export function pasteNestingParts(n, sheetIndex, clipItems, { offsetX = 25, offsetY = 25, minSep = 5 } = {}) {
  const sheet = n?.sheets?.[sheetIndex];
  if (!sheet || !Array.isArray(clipItems) || !clipItems.length) return [];
  const mL = sheet.marginLeftMm ?? sheet.marginMm ?? 15;
  const mR = sheet.marginRightMm ?? sheet.marginMm ?? 15;
  const mT = sheet.marginTopMm ?? sheet.marginMm ?? 15;
  const mB = sheet.marginBottomMm ?? sheet.marginMm ?? 15;
  const maxAllowedX = Math.max(mL, sheet.widthMm - mR);
  const maxAllowedY = Math.max(mB, sheet.heightMm - mT);
  const stamp = Date.now().toString(36);
  const existing = new Set(sheet.placements.map(p => p.id));
  const addedIds = [];

  clipItems.forEach((src, i) => {
    const b = src.bounds || polygonBounds(src.outer);
    const dx = Math.max(mL - b.minX, Math.min(maxAllowedX - b.maxX, offsetX));
    const dy = Math.max(mB - b.minY, Math.min(maxAllowedY - b.maxY, offsetY));
    const outer = src.outer.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
    const holes = (src.holes || []).map(h => h.map(pt => ({ x: pt.x + dx, y: pt.y + dy })));
    const newBounds = polygonBounds(outer);
    let pid = `${src.baseId}_copy_${stamp}_${i}`;
    let seq = 1;
    while (existing.has(pid)) pid = `${src.baseId}_copy_${stamp}_${i}_${seq++}`;
    existing.add(pid);
    sheet.placements.push({
      id: pid,
      label: `${src.label}`,
      partType: src.partType,
      partGroup: src.partGroup || 'body',
      partGroupLabel: src.partGroupLabel,
      partColor: src.partColor || null,
      dxfLayer: src.dxfLayer || null,
      operation: src.operation || 'CUT_OUTER',
      material: src.material,
      thicknessMm: src.thicknessMm,
      materialGroup: src.materialGroup,
      angleDeg: src.angleDeg || 0,
      areaMm2: src.areaMm2 || 0,
      xMm: newBounds.minX,
      yMm: newBounds.minY,
      outer,
      holes,
      bounds: newBounds,
      locked: false,
    });
    addedIds.push(pid);
  });

  if (addedIds.length) {
    n.optimizationInfo = null;
    refreshNestingSheet(sheet, minSep);
  }
  return addedIds;
}
