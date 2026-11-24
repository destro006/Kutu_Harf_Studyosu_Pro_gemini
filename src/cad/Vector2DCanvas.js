import {isTextDoubleClick} from './TextEditing.js';
import { restoreLogoShape } from '../geometry/LogoTracer.js';
import { layoutTextMm } from '../geometry/FontManager.js';
import { polygonBounds } from '../geometry/PolygonOffset.js';

/**
 * Interactive 2D Vector CAD Canvas for Workspace 1 ("2D Tasarım")
 * Operates on the exact same millimeter object data as the 3D SignEngine.
 */
export class Vector2DCanvas {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.view = { cx: 0, cy: 0, zoom: 0.35 }; // px per mm
    this.selectedNode = null; // { objId, polyIdx, nodeIdx }
    this.dragState = null;
    this.freehandPts = [];
    this.marquee = null;
    this.lastState = null;
    this.lastFontMap = null;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'vec2d-svg');
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.display = 'block';
    this.container.appendChild(this.svg);

    this._bindEvents();
  }

  _screenToMm(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    const xMm = (sx - r.width * 0.5) / this.view.zoom + this.view.cx;
    const yMm = -(sy - r.height * 0.5) / this.view.zoom + this.view.cy;
    return { xMm, yMm, sx, sy };
  }

  _snapMm(pt, state, excludeId = null) {
    let { xMm, yMm } = pt;
    const g = state.grid || {};
    if (g.snapToGrid && g.spacingMm > 0) {
      xMm = Math.round(xMm / g.spacingMm) * g.spacingMm;
      yMm = Math.round(yMm / g.spacingMm) * g.spacingMm;
    }
    if (g.snapToCenters) {
      if (Math.abs(xMm) < 12) xMm = 0;
      if (Math.abs(yMm) < 12) yMm = 0;
    }
    if (g.snapToObjects) {
      for (const o of (state.objects || [])) {
        if (o.id === excludeId || !o.visible) continue;
        if (Math.abs(xMm - (o.xMm || 0)) < 10) xMm = o.xMm || 0;
        if (Math.abs(yMm - (o.yMm || 0)) < 10) yMm = o.yMm || 0;
      }
    }
    return { xMm: Math.round(xMm * 10) / 10, yMm: Math.round(yMm * 10) / 10 };
  }

  fitAll(state) {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 500;
    const pw = state?.pageLayout?.widthMm || 2000;
    const ph = state?.pageLayout?.heightMm || 1000;
    this.view.cx = 0;
    this.view.cy = 0;
    const points=[];for(const o of state?.objects||[])if(o.visible!==false)for(const p of this._getObjectPolysWorld(o,this.lastFontMap||{}))points.push(...p.outer);
    const b=points.length?polygonBounds(points):{minX:-pw/2,maxX:pw/2,minY:-ph/2,maxY:ph/2};
    const minX=Math.min(-pw/2,b.minX),maxX=Math.max(pw/2,b.maxX),minY=Math.min(-ph/2,b.minY),maxY=Math.max(ph/2,b.maxY);
    this.view.cx=(minX+maxX)/2;this.view.cy=(minY+maxY)/2;
    this.view.zoom=Math.max(.005,Math.min(2.5,Math.min(Math.max(20,w-64)/Math.max(1,maxX-minX),Math.max(20,h-64)/Math.max(1,maxY-minY))));
    if (this.lastState) this.render(this.lastState, this.lastFontMap);
  }

  zoomBy(factor) {
    this.view.zoom = Math.max(0.05, Math.min(8, this.view.zoom * factor));
    if (this.lastState) this.render(this.lastState, this.lastFontMap);
  }

  _getObjectPolysWorld(obj, fontMap) {
    const sx = (obj.scaleX ?? 1) * (obj.mirrorX ? -1 : 1);
    const sy = (obj.scaleY ?? 1) * (obj.mirrorY ? -1 : 1);
    const ox = obj.xMm || 0;
    const oy = obj.yMm || 0;
    const rot = ((obj.rotationDeg || 0) * Math.PI) / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const xf = (x, y) => {
      const lx = x * sx, ly = y * sy;
      return { x: ox + lx * cos - ly * sin, y: oy + lx * sin + ly * cos };
    };

    const polys = [];
    if (obj.kind === 'polygon' && obj.polygonsMm?.length) {
      for (const p of obj.polygonsMm) {
        polys.push({
          outer: p.outer.map(pt => xf(pt.x, pt.y)),
          holes: (p.holes || []).map(h => h.map(pt => xf(pt.x, pt.y))),
        });
      }
    } else if (obj.kind === 'rect') {
      const hw = (obj.widthMm || 320) * 0.5;
      const hh = (obj.heightMm || 160) * 0.5;
      const r = Math.min(hw, hh, Math.max(0, obj.cornerRadiusMm || 0));
      const pts = [];
      if (r > 0.5) {
        const corners = [
          { cx: hw - r, cy: -hh + r, a0: -Math.PI / 2 },
          { cx: hw - r, cy: hh - r, a0: 0 },
          { cx: -hw + r, cy: hh - r, a0: Math.PI / 2 },
          { cx: -hw + r, cy: -hh + r, a0: Math.PI },
        ];
        for (const c of corners) {
          for (let i = 0; i <= 4; i++) {
            const a = c.a0 + (i / 4) * (Math.PI / 2);
            pts.push(xf(c.cx + Math.cos(a) * r, c.cy + Math.sin(a) * r));
          }
        }
      } else {
        pts.push(xf(-hw, -hh), xf(hw, -hh), xf(hw, hh), xf(-hw, hh));
      }
      polys.push({ outer: pts, holes: [] });
    } else if (obj.kind === 'ellipse') {
      const rx = (obj.widthMm || 240) * 0.5;
      const ry = (obj.heightMm || 240) * 0.5;
      const pts = [];
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        pts.push(xf(Math.cos(a) * rx, Math.sin(a) * ry));
      }
      polys.push({ outer: pts, holes: [] });
    } else if (obj.kind === 'text' && fontMap) {
      const fl = fontMap.get(obj.fontId || 'cinzel');
      if (fl) {
        const layout = layoutTextMm(fl, obj.text || '', obj.heightMm || 400, obj.letterSpacingMm || 0, obj.lineSpacingMult ?? 1.25, obj.textAlign || 'center');
        const allPts = layout.glyphs.flatMap(g => g.shapes.flatMap(s => s.getPoints(6)));
        const b = allPts.length ? polygonBounds(allPts) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        const cx = (b.minX + b.maxX) * 0.5;
        const cy = (b.minY + b.maxY) * 0.5;
        for (const g of layout.glyphs) {
          for (const s of g.shapes) {
            polys.push({
              outer: s.getPoints(6).map(p => xf(p.x - cx, p.y - cy)),
              holes: (s.holes || []).map(h => h.getPoints(6).map(p => xf(p.x - cx, p.y - cy))),
            });
          }
        }
      }
    } else if (obj.kind === 'logo' && obj.logoData?.parts?.length) {
      const hMm = obj.heightMm || 500;
      for (const part of obj.logoData.parts) {
        for (const raw of part.shapes) {
          const s=restoreLogoShape(raw);
          polys.push({
            outer: s.getPoints(6).map(p => xf(p.x * hMm, p.y * hMm)),
            holes: (s.holes || []).map(h => h.getPoints(6).map(p => xf(p.x * hMm, p.y * hMm))),
          });
        }
      }
    }
    return polys;
  }

  render(state, fontMap) {
    this.lastState = state;
    this.lastFontMap = fontMap;
    const w = this.container.clientWidth || 900;
    const h = this.container.clientHeight || 600;
    const z = this.view.zoom;
    const vbX = this.view.cx - (w * 0.5) / z;
    const vbY = -this.view.cy - (h * 0.5) / z;
    const vbW = w / z;
    const vbH = h / z;
    this.svg.setAttribute('viewBox', `${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}`);

    const pw = state.pageLayout?.widthMm || 2000;
    const ph = state.pageLayout?.heightMm || 1000;
    const gridOn = state.grid?.visible !== false;
    const gStep = Math.max(10, state.grid?.spacingMm || 50);

    let gridSvg = '';
    if (gridOn) {
      const x0 = Math.floor(vbX / gStep) * gStep;
      const x1 = vbX + vbW;
      const y0 = Math.floor(vbY / gStep) * gStep;
      const y1 = vbY + vbH;
      const lines = [];
      for (let gx = x0; gx <= x1; gx += gStep) {
        const major = Math.abs(gx) < 0.01;
        lines.push(`<line x1="${gx}" y1="${vbY}" x2="${gx}" y2="${vbY + vbH}" stroke="${major ? 'rgba(255,181,71,0.28)' : 'rgba(255,255,255,0.05)'}" stroke-width="${(major ? 1.5 : 1) / z}" />`);
      }
      for (let gy = y0; gy <= y1; gy += gStep) {
        const major = Math.abs(gy) < 0.01;
        lines.push(`<line x1="${vbX}" y1="${gy}" x2="${vbX + vbW}" y2="${gy}" stroke="${major ? 'rgba(255,181,71,0.28)' : 'rgba(255,255,255,0.05)'}" stroke-width="${(major ? 1.5 : 1) / z}" />`);
      }
      gridSvg = lines.join('');
    }

    const pageSvg = `<rect x="${-pw / 2}" y="${-ph / 2}" width="${pw}" height="${ph}" fill="rgba(255,255,255,0.015)" stroke="rgba(255,181,71,0.45)" stroke-dasharray="${8 / z} ${6 / z}" stroke-width="${1.5 / z}" />`;

    const selSet = new Set(state.selectedIds || []);
    const objsSvg = [];
    let selMinX = Infinity, selMaxX = -Infinity, selMinY = Infinity, selMaxY = -Infinity;

    for (const obj of (state.objects || [])) {
      if (!obj.visible) continue;
      const polys = this._getObjectPolysWorld(obj, fontMap);
      if (!polys.length) continue;
      const isSel = selSet.has(obj.id);
      const ringD = (pts) => 'M ' + pts.map(p => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' L ') + ' Z';
      const d = polys.map(p => [ringD(p.outer), ...(p.holes || []).map(ringD)].join(' ')).join(' ');
      const fillCol = obj.faceColor || '#f5c66a';
      objsSvg.push(`
        <g data-v2d-id="${obj.id}" style="cursor:${obj.locked ? 'not-allowed' : 'move'}">
          <path d="${d}" fill="${fillCol}" fill-opacity="${isSel ? 0.34 : 0.2}" stroke="${isSel ? '#ffb547' : '#cbd5e1'}" stroke-width="${(isSel ? 2.2 : 1.3) / z}" fill-rule="evenodd" />
        </g>
      `);
      if (isSel) {
        for (const p of polys) {
          for (const pt of p.outer) {
            if (pt.x < selMinX) selMinX = pt.x;
            if (pt.x > selMaxX) selMaxX = pt.x;
            if (-pt.y < selMinY) selMinY = -pt.y;
            if (-pt.y > selMaxY) selMaxY = -pt.y;
          }
        }
      }
    }

    // Selection bounding box & resize handles
    let selSvg = '';
    if (Number.isFinite(selMinX) && state.activeTool !== 'node') {
      const bw = selMaxX - selMinX;
      const bh = selMaxY - selMinY;
      const hs = 8 / z;
      const handles = [
        { k: 'nw', x: selMinX, y: selMinY },
        { k: 'ne', x: selMaxX, y: selMinY },
        { k: 'se', x: selMaxX, y: selMaxY },
        { k: 'sw', x: selMinX, y: selMaxY },
      ];
      selSvg = `
        <rect x="${selMinX}" y="${selMinY}" width="${bw}" height="${bh}" fill="none" stroke="#ffb547" stroke-width="${1.2 / z}" stroke-dasharray="${5 / z} ${4 / z}" pointer-events="none" />
        ${handles.map(hd => `<rect data-v2d-handle="${hd.k}" x="${hd.x - hs / 2}" y="${hd.y - hs / 2}" width="${hs}" height="${hs}" fill="#ffb547" stroke="#111" stroke-width="${1 / z}" style="cursor:nwse-resize" />`).join('')}
      `;
    }

    // Node editing overlay when activeTool === 'node'
    let nodesSvg = '';
    if (state.activeTool === 'node') {
      const selObj = state.objects.find(o => selSet.has(o.id) && o.kind === 'polygon' && o.polygonsMm?.length);
      if (selObj) {
        const sx = (selObj.scaleX ?? 1) * (selObj.mirrorX ? -1 : 1);
        const sy = (selObj.scaleY ?? 1) * (selObj.mirrorY ? -1 : 1);
        const ox = selObj.xMm || 0;
        const oy = selObj.yMm || 0;
        const nr = 5 / z;
        selObj.polygonsMm.forEach((poly, pIdx) => {
          poly.outer.forEach((pt, nIdx) => {
            const wx = ox + pt.x * sx;
            const wy = -(oy + pt.y * sy);
            const activeNode = this.selectedNode?.objId === selObj.id && this.selectedNode?.polyIdx === pIdx && this.selectedNode?.nodeIdx === nIdx;
            nodesSvg += `<rect data-v2d-node="${pIdx}:${nIdx}" x="${wx - nr}" y="${wy - nr}" width="${nr * 2}" height="${nr * 2}" fill="${activeNode ? '#38bdf8' : '#ffffff'}" stroke="#0f172a" stroke-width="${1.2 / z}" style="cursor:pointer" />`;
          });
        });
      }
    }

    this.svg.innerHTML = `${gridSvg}${pageSvg}${objsSvg.join('')}${selSvg}${nodesSvg}`;
    if (this.marquee) this._drawMarquee();
  }

  _drawMarquee() {
    this.svg.querySelector('[data-pick-marquee]')?.remove();
    if (!this.marquee) return;
    const { start, end } = this.marquee;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('data-pick-marquee', '1');
    rect.setAttribute('x', String(Math.min(start.xMm, end.xMm)));
    rect.setAttribute('y', String(-Math.max(start.yMm, end.yMm)));
    rect.setAttribute('width', String(Math.abs(end.xMm - start.xMm)));
    rect.setAttribute('height', String(Math.abs(end.yMm - start.yMm)));
    rect.setAttribute('fill', 'rgba(233,185,119,.12)');
    rect.setAttribute('stroke', '#e9b977');
    rect.setAttribute('stroke-dasharray', '7 5');
    rect.setAttribute('stroke-width', String(1.2 / this.view.zoom));
    rect.setAttribute('pointer-events', 'none');
    this.svg.appendChild(rect);
  }

  _finishMarquee(selection) {
    const { start, end, additive, crossing } = selection;
    const minX = Math.min(start.xMm, end.xMm), maxX = Math.max(start.xMm, end.xMm);
    const minY = Math.min(start.yMm, end.yMm), maxY = Math.max(start.yMm, end.yMm);
    const ids = [];
    for (const obj of this.lastState?.objects || []) {
      if (!obj.visible || obj.locked) continue;
      const polys = this._getObjectPolysWorld(obj, this.lastFontMap);
      if (!polys.length) continue;
      const points = polys.flatMap(p => [p.outer, ...(p.holes || [])].flat());
      if (!points.length) continue;
      const b = { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) };
      // Corel-style left-to-right: fully enclosed. Right-to-left or Alt: crossing selection.
      const isCrossing = crossing || end.xMm < start.xMm;
      const matches = isCrossing
        ? b.minX <= maxX && b.maxX >= minX && b.minY <= maxY && b.maxY >= minY
        : b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;
      if (matches) ids.push(obj.id);
    }
    this.callbacks.onSelectObjects?.(ids, additive);
  }

  _bindEvents() {
    let lastTextClick=null,pressedText=null;
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY > 0 ? 0.88 : 1.14);
    }, { passive: false });

    this.svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const objEl = e.target.closest('[data-v2d-id]');
      this.callbacks.onContextMenu?.(e, objEl ? objEl.getAttribute('data-v2d-id') : null);
    });

    this.svg.addEventListener('dblclick', (e) => {
      if (this.lastState?.activeTool !== 'node') return;
      const objEl = e.target.closest('[data-v2d-id]');
      if (objEl) {
        this.callbacks.onAddNode?.(objEl.getAttribute('data-v2d-id'), this._screenToMm(e.clientX, e.clientY));
      }
    });

    this.svg.addEventListener('pointerdown', (e) => {
      if (!this.lastState) return;
      const tool = this.lastState.activeTool;
      const target=e.target.closest('[data-v2d-id]'),id=target?.getAttribute('data-v2d-id');
      const textObj=this.lastState.objects.find(o=>o.id===id&&o.kind==='text'&&!o.locked&&o.visible!==false);
      pressedText=null;
      if(e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&['select','move','text'].includes(tool)&&textObj){
        const click={id,x:e.clientX,y:e.clientY,time:performance.now()};
        if(isTextDoubleClick(lastTextClick,click)){
          lastTextClick=null;this.dragState=null;e.preventDefault();e.stopPropagation();
          this.callbacks.onEditText?.(id);return;
        }
        pressedText=click;
      }else lastTextClick=null;
      const pt = this._screenToMm(e.clientX, e.clientY);

      if (e.button === 1 || tool === 'pan' || e.shiftKey && e.button === 2) {
        e.preventDefault();
        this.dragState = { type: 'pan', startX: e.clientX, startY: e.clientY, origCx: this.view.cx, origCy: this.view.cy };
        return;
      }
      if (e.button !== 0) return;

      // Node drag
      const nodeEl = e.target.closest('[data-v2d-node]');
      if (nodeEl && tool === 'node') {
        const [pIdx, nIdx] = nodeEl.getAttribute('data-v2d-node').split(':').map(Number);
        const selObj = this.lastState.objects.find(o => this.lastState.selectedIds.includes(o.id));
        if (selObj && !selObj.locked) {
          this.selectedNode = { objId: selObj.id, polyIdx: pIdx, nodeIdx: nIdx };
          this.callbacks.onSelectNode?.(this.selectedNode);
          this.callbacks.onTransformStart?.();
          this.dragState = { type: 'node', objId: selObj.id, polyIdx: pIdx, nodeIdx: nIdx };
          this.render(this.lastState, this.lastFontMap);
        }
        return;
      }

      // Handle resize
      const hEl = e.target.closest('[data-v2d-handle]');
      if (hEl) {
        const selObj = this.lastState.objects.find(o => this.lastState.selectedIds.includes(o.id));
        if (selObj && !selObj.locked) {
          this.callbacks.onTransformStart?.();
          this.dragState = { type: 'scale', objId: selObj.id, startX: pt.xMm, origSx: selObj.scaleX ?? 1, origSy: selObj.scaleY ?? 1 };
        }
        return;
      }

      // Freehand drawing
      if (tool === 'freehand') {
        this.freehandPts = [pt];
        this.dragState = { type: 'freehand' };
        return;
      }

      // Object click / move
      const objEl = e.target.closest('[data-v2d-id]');
      if (objEl) {
        const id = objEl.getAttribute('data-v2d-id');
        this.callbacks.onSelectObject?.(id, e.ctrlKey || e.shiftKey);
        const obj = this.lastState.objects.find(o => o.id === id);
        if (obj && !obj.locked && ['select', 'move'].includes(tool)) {
          this.callbacks.onTransformStart?.();
          this.dragState = { type: 'move', objId: id, startMm: pt, origX: obj.xMm || 0, origY: obj.yMm || 0, moved: false };
        }
      } else if (tool === 'select') {
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        if (!additive) this.callbacks.onSelectObject?.(null, false);
        this.marquee = { start: pt, end: pt, additive, crossing: e.altKey };
        this.dragState = { type: 'marquee', startClientX: e.clientX, startClientY: e.clientY };
        this._drawMarquee();
      }
    });

    window.addEventListener('pointermove', (e) => {
      if(pressedText&&Math.hypot(e.clientX-pressedText.x,e.clientY-pressedText.y)>5){pressedText=null;lastTextClick=null;}
      if (!this.dragState || !this.lastState) return;
      const pt = this._screenToMm(e.clientX, e.clientY);
      if (this.dragState.type === 'marquee') {
        if (this.marquee) { this.marquee.end = pt; this._drawMarquee(); }
      } else if (this.dragState.type === 'pan') {
        this.view.cx = this.dragState.origCx - (e.clientX - this.dragState.startX) / this.view.zoom;
        this.view.cy = this.dragState.origCy + (e.clientY - this.dragState.startY) / this.view.zoom;
        this.render(this.lastState, this.lastFontMap);
      } else if (this.dragState.type === 'move') {
        if(!this.dragState.moved&&Math.hypot(pt.sx-this.dragState.startMm.sx,pt.sy-this.dragState.startMm.sy)<5)return;
        const dx = pt.xMm - this.dragState.startMm.xMm;
        const dy = pt.yMm - this.dragState.startMm.yMm;
        const snapped = this._snapMm({ xMm: this.dragState.origX + dx, yMm: this.dragState.origY + dy }, this.lastState, this.dragState.objId);
        this.dragState.moved = true;
        this.callbacks.onLiveMove?.(this.dragState.objId, snapped.xMm, snapped.yMm);
      } else if (this.dragState.type === 'scale') {
        const factor = Math.max(0.1, 1 + (pt.xMm - this.dragState.startX) / 400);
        this.dragState.moved = true;
        this.callbacks.onLiveScale?.(this.dragState.objId, this.dragState.origSx * factor, this.dragState.origSy * factor);
      } else if (this.dragState.type === 'node') {
        this.dragState.moved = true;
        this.callbacks.onLiveNodeMove?.(this.dragState.objId, this.dragState.polyIdx, this.dragState.nodeIdx, pt.xMm, pt.yMm);
      } else if (this.dragState.type === 'freehand') {
        const last = this.freehandPts[this.freehandPts.length - 1];
        if (!last || Math.hypot(pt.xMm - last.xMm, pt.yMm - last.yMm) > 8) {
          this.freehandPts.push(pt);
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      if(pressedText){lastTextClick=Math.hypot(e.clientX-pressedText.x,e.clientY-pressedText.y)<=5?{...pressedText,time:performance.now()}:null;pressedText=null;}
      if (!this.dragState) return;
      const ds = this.dragState;
      this.dragState = null;
      if (ds.type === 'marquee') {
        const selection = this.marquee;
        this.marquee = null;
        this.svg.querySelector('[data-pick-marquee]')?.remove();
        if (selection && Math.hypot(selection.end.sx - selection.start.sx, selection.end.sy - selection.start.sy) >= 4) {
          this._finishMarquee(selection);
        }
      } else if (ds.type === 'freehand' && this.freehandPts.length >= 3) {
        this.callbacks.onFinishFreehand?.(this.freehandPts);
        this.freehandPts = [];
      } else if (ds.moved) {
        this.callbacks.onTransformCommit?.();
      }else if(['move','scale','node'].includes(ds.type))this.callbacks.onTransformNoop?.();
    });
  }
}
