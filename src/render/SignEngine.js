import THREE from '../vendor/three.js';
import { restoreLogoShape } from '../geometry/LogoTracer.js';
import { resolveObjectLighting } from '../core/ObjectLighting.js';
import { createSignMaterial } from './MaterialLibrary.js';
import { resolveChannelMaterialBinding } from './ChannelMaterialBinding.js';
import { EnvironmentManager, ENVIRONMENT_PRESETS } from './EnvironmentManager.js';
import { buildSceneLights, createHaloTexture } from './LightingSystem.js';
import { PostProcessor } from './PostProcessor.js';
import { loadWallPixels, createWallTextures, computeWallRepeat, normalizeWallId } from '../photomontage/BackgroundLibrary.js';
import { buildChannelComponent } from '../geometry/ChannelLetterGeometry.js';
import { layoutTextMm } from '../geometry/FontManager.js';

const _refIds = new WeakMap();
let _nextRefId = 1;
function getRefId(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  let id = _refIds.get(obj);
  if (!id) {
    id = _nextRefId++;
    _refIds.set(obj, id);
  }
  return id;
}

/**
 * Core Three.js r187 3D Signage Rendering Engine
 * - Physically-based rendering (MeshPhysicalMaterial, PMREM HDR environments, ACESFilmicToneMapping)
 * - Smooth damped orbit/zoom/pan camera controls + preset angles
 * - Real Raycaster 3D object selection
 * - Transparent & high-res PNG capture (including for photomontage)
 * - Quality presets (performance, balanced, high, ultra)
 */

export const QUALITY_PROFILES = {
  performance: { dprMax: 1, renderScale: 0.8, shadowSize: 512, shadows: false },
  balanced: { dprMax: 1.35, renderScale: 1, shadowSize: 1024, shadows: true },
  high: { dprMax: 2, renderScale: 1.35, shadowSize: 2048, shadows: true },
  ultra: { dprMax: 2.5, renderScale: 1.9, shadowSize: 4096, shadows: true },
};
// The internal render resolution differs even on ordinary 1x desktop screens.
// Bound the framebuffer to 8MP to avoid exhausting mobile GPU memory.
export function computeQualityPixelRatio(id, deviceDpr = 1, width = 1200, height = 800) {
  const prof = QUALITY_PROFILES[id] || QUALITY_PROFILES.high;
  const desired = Math.max(0.5, Number(deviceDpr) || 1) * prof.renderScale;
  const memoryCap = Math.sqrt(8_000_000 / Math.max(1, width * height));
  return Math.max(0.5, Math.min(desired, prof.dprMax, memoryCap));
}

export class SignEngine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.05, 100);
    this.camera.position.set(1.0, 0.05, 4.0);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      this.isDisposed = true;
      this.container.innerHTML = `<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;color:#e5e7eb;background:#111318"><div><strong>3D WebGL Başlatılamadı</strong><p style="color:#a9b0bb;font-size:13px;max-width:360px;line-height:1.6;margin:10px auto 14px">Tarayıcıda WebGL açılamadı. 2D çizim, ölçülendirme ve nesting kullanılabilir; metal yansımaları için donanım hızlandırmasını etkinleştirin.</p><button type="button" id="khsSwitch2D" style="background:#ddb27c;border:1px solid #f5d9ae;color:#1d1713;padding:10px 16px;border-radius:9px;font-weight:700;cursor:pointer">2D Tasarıma Geç</button></div></div>`;
      return;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate=false;
    this.renderer.shadowMap.needsUpdate=true;
    this._renderDirty=true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x060608, 1);

    this.container.innerHTML = '';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.envManager = new EnvironmentManager(this.renderer);
    this.postProcessor = new PostProcessor(this.renderer);
    this._geomCache = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Scene groups
    this.wallGroup = new THREE.Group();
    this.lightsGroup = new THREE.Group();
    this.signGroup = new THREE.Group();
    this.pageGroup = new THREE.Group();
    this.selectionGroup = new THREE.Group();
    this.scene.add(this.wallGroup, this.lightsGroup, this.pageGroup, this.signGroup, this.selectionGroup);

    // Camera spherical orbit state
    this.orbit = {
      azimuth: 0.42,
      polar: Math.PI / 2 - 0.08,
      radius: 4.0,
      targetAzimuth: 0.42,
      targetPolar: Math.PI / 2 - 0.08,
      targetRadius: 4.0,
      target: new THREE.Vector3(0, 0, 0),
      dragging: false,
      panning: false,
      lastX: 0,
      lastY: 0,
      movedDist: 0,
    };

    this.activeTool = 'select';
    this.activePointers = new Map();
    this.lastPinchDist = 0;
    this.draggingObjId = null;
    this.pickMarquee = null;
    this.disposables = [];
    this.selectableRoots = [];
    this.lastSizeM = { w: 2.0, h: 0.4 };
    this._wallScale = 1.0;
    this._wallDims = null;
    this.quality = 'high';
    this.isDisposed = false;

    this._bindEvents();
    this._resize();
    this._startLoop();
  }

  _updatePickMarquee() {
    this.pickMarqueeEl?.remove();
    this.pickMarqueeEl = null;
    if (!this.pickMarquee || !this.container) return;
    const p = this.pickMarquee;
    const bounds = this.container.getBoundingClientRect();
    const r = document.createElement('div');
    r.className = 'three-pick-marquee';
    r.style.left = `${Math.min(p.startX, p.endX) - bounds.left}px`;
    r.style.top = `${Math.min(p.startY, p.endY) - bounds.top}px`;
    r.style.width = `${Math.abs(p.endX - p.startX)}px`;
    r.style.height = `${Math.abs(p.endY - p.startY)}px`;
    this.container.appendChild(r);
    this.pickMarqueeEl = r;
  }

  _getIdsInMarquee(m) {
    const dom = this.renderer.domElement;
    const r = dom.getBoundingClientRect();
    const left = Math.min(m.startX, m.endX), right = Math.max(m.startX, m.endX);
    const top = Math.min(m.startY, m.endY), bottom = Math.max(m.startY, m.endY);
    const crossing = m.crossing || m.endX < m.startX;
    const ids = [];
    for (const child of this.signGroup.children) {
      const id = child.userData?.layerId;
      if (!id || !child.visible) continue;
      const b = new THREE.Box3().setFromObject(child);
      if (b.isEmpty()) continue;
      let lx = Infinity, ly = Infinity, rx = -Infinity, by = -Infinity;
      for (const x of [b.min.x,b.max.x]) for (const y of [b.min.y,b.max.y]) for (const z of [b.min.z,b.max.z]) {
        const v = new THREE.Vector3(x,y,z).project(this.camera);
        const sx = r.left + (v.x + 1)*r.width/2;
        const sy = r.top + (1 - v.y)*r.height/2;
        lx = Math.min(lx,sx); rx = Math.max(rx,sx);
        ly = Math.min(ly,sy); by = Math.max(by,sy);
      }
      const inside = crossing
        ? lx <= right && rx >= left && ly <= bottom && by >= top
        : lx >= left && rx <= right && ly >= top && by <= bottom;
      if (inside) ids.push(id);
    }
    return [...new Set(ids)];
  }

  _bindEvents() {
    const dom = this.renderer.domElement;

    const getPinchDist = () => {
      const pts = [...this.activePointers.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    this._onPointerDown = (e) => {
      this.invalidate();
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 2) {
        this.orbit.dragging = false;
        this.orbit.panning = false;
        this.lastPinchDist = getPinchDist();
        return;
      }

      const isTransformTool = ['select', 'move', 'rotate', 'scale'].includes(this.activeTool);
      let hitLayerId = null;
      if (isTransformTool && e.button === 0) {
        const rect = dom.getBoundingClientRect();
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.signGroup.children, true);
        // A halo/lighting mesh may be hit first. Skip non-selectable meshes.
        for (const hit of hits) {
          let obj = hit.object;
          while (obj && !obj.userData?.layerId && obj.parent) obj = obj.parent;
          if (obj?.userData?.layerId) { hitLayerId = obj.userData.layerId; break; }
        }
      }
      this.pointerDownSelectedId = hitLayerId;

      if (hitLayerId && this.activeTool === 'select') {
        this.callbacks.onSelectObject?.(hitLayerId, e.ctrlKey || e.metaKey || e.shiftKey);
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !this.signGroup.children.find(c=>c.userData?.layerId===hitLayerId)?.userData?.locked) {
          this.activeTool = 'move';
          this.draggingObjId = hitLayerId;
          this.dragMode = 'move';
          this.dragAccum = { dxMm: 0, dyMm: 0, dRotX: 0, dRotY: 0, dRotZ: 0, dScale: 1, moved: false };
          this.callbacks.onAutoMoveTool?.(hitLayerId);
          this.callbacks.onTransformStart?.(hitLayerId, 'move');
        }
      } else if (e.button === 0 && this.activeTool === 'select' && !hitLayerId) {
        // Start 3D pick-marquee on empty canvas; camera orbit stays on middle mouse / Pan.
        this.pickMarquee = { startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY, additive: e.ctrlKey || e.metaKey || e.shiftKey, crossing: e.altKey };
        this._updatePickMarquee();
      } else if (['move', 'rotate', 'scale'].includes(this.activeTool) && e.button === 0 && hitLayerId && !this.signGroup.children.find(c=>c.userData?.layerId===hitLayerId)?.userData?.locked) {
        this.callbacks.onSelectObject?.(hitLayerId, false);
        this.draggingObjId = hitLayerId;
        this.dragMode = this.activeTool;
        this.dragAccum = { dxMm: 0, dyMm: 0, dRotX: 0, dRotY: 0, dRotZ: 0, dScale: 1, moved: false };
        this.callbacks.onTransformStart?.(hitLayerId, this.activeTool);
      }

      if (e.button === 1) {
        // Middle mouse wheel click + drag ALWAYS orbits 3D camera
        e.preventDefault();
        this.draggingObjId = null;
        this.orbit.panning = false;
        this.orbit.dragging = true;
      } else if (this.activeTool === 'pan' || e.button === 2 || e.shiftKey) {
        this.orbit.panning = true;
      } else if (!this.draggingObjId && !this.pickMarquee) {
        this.orbit.dragging = true;
      }
      this.orbit.lastX = e.clientX;
      this.orbit.lastY = e.clientY;
      this.orbit.movedDist = 0;
      try { dom.setPointerCapture?.(e.pointerId); } catch {}
    };

    this._onPointerMove = (e) => {
      if(!this.activePointers.has(e.pointerId))return;
      this.invalidate();
      if (this.activePointers.has(e.pointerId)) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this.pickMarquee) {
        this.pickMarquee.endX = e.clientX;
        this.pickMarquee.endY = e.clientY;
        this._updatePickMarquee();
        return;
      }
      if (this.activePointers.size === 2) {
        const d = getPinchDist();
        if (this.lastPinchDist > 0 && d > 0) this.zoomBy(this.lastPinchDist / d);
        this.lastPinchDist = d;
        return;
      }

      if (!this.orbit.dragging && !this.orbit.panning && !this.draggingObjId) return;
      const dx = e.clientX - this.orbit.lastX;
      const dy = e.clientY - this.orbit.lastY;
      this.orbit.lastX = e.clientX;
      this.orbit.lastY = e.clientY;
      this.orbit.movedDist += Math.hypot(dx, dy);

      if (this.draggingObjId) {
        this.invalidate(true);
        const targetMesh = this.signGroup.children.find(c => c.userData?.layerId === this.draggingObjId);
        const haloMesh = this._objectLightRefs?.get(this.draggingObjId)?.halo;
        if (this.dragMode === 'move') {
          const mmPerPx = (this.orbit.radius * 0.56) * 1000 / Math.max(200, this.container.clientHeight);
          const mx = dx * mmPerPx;
          const my = -dy * mmPerPx;
          this.dragAccum.dxMm += mx;
          this.dragAccum.dyMm += my;
          if (Math.abs(mx) > 0.01 || Math.abs(my) > 0.01) this.dragAccum.moved = true;
          if (targetMesh) {
            targetMesh.position.x += mx * 0.001;
            targetMesh.position.y += my * 0.001;
          }
          if (haloMesh) {
            haloMesh.position.x += mx * 0.001;
            haloMesh.position.y += my * 0.001;
          }
          this.callbacks.onTransformLive?.(this.draggingObjId, 'move', { dxMm: mx, dyMm: my }, false);
        } else if (this.dragMode === 'rotate') {
          const dRotX = e.shiftKey ? 0 : dy * 0.55;
          const dRotY = e.shiftKey ? 0 : dx * 0.55;
          const dRotZ = e.shiftKey ? -dx * 0.6 : 0;
          this.dragAccum.dRotX += dRotX;
          this.dragAccum.dRotY += dRotY;
          this.dragAccum.dRotZ += dRotZ;
          this.dragAccum.moved = true;
          if (targetMesh) {
            targetMesh.rotation.x += (dRotX * Math.PI) / 180;
            targetMesh.rotation.y += (dRotY * Math.PI) / 180;
            targetMesh.rotation.z += (dRotZ * Math.PI) / 180;
          }
          if (haloMesh && dRotZ) {
            haloMesh.rotation.z += (dRotZ * Math.PI) / 180;
          }
          this.callbacks.onTransformLive?.(this.draggingObjId, 'rotate', { dRotX, dRotY, dRotZ }, false);
        } else if (this.dragMode === 'scale') {
          const factor = Math.max(0.9, Math.min(1.1, 1 + (dx - dy) * 0.004));
          this.dragAccum.dScale *= factor;
          this.dragAccum.moved = true;
          if (targetMesh) {
            targetMesh.scale.x *= factor;
            targetMesh.scale.y *= factor;
          }
          if (haloMesh) {
            haloMesh.scale.x *= factor;
            haloMesh.scale.y *= factor;
          }
          this.callbacks.onTransformLive?.(this.draggingObjId, 'scale', { factor }, false);
        }
        return;
      }

      if (this.orbit.panning) {
        const panSpeed = this.orbit.radius * 0.0012;
        this.orbit.target.x -= dx * panSpeed;
        this.orbit.target.y += dy * panSpeed;
      } else {
        this.orbit.targetAzimuth = Math.max(-1.25, Math.min(1.25, this.orbit.targetAzimuth - dx * 0.006));
        this.orbit.targetPolar = Math.max(0.85, Math.min(2.15, this.orbit.targetPolar - dy * 0.005));
      }
    };

    this._onPointerUp = (e) => {
      if(!this.activePointers.has(e.pointerId))return;
      this.activePointers.delete(e.pointerId);
      this.invalidate();
      if (this.activePointers.size < 2) this.lastPinchDist = 0;

      if (this.pickMarquee) {
        const mark = this.pickMarquee;
        mark.endX = e.clientX;
        mark.endY = e.clientY;
        this.pickMarquee = null;
        this._updatePickMarquee();
        this.orbit.dragging = false;
        this.orbit.panning = false;
        if (dom.hasPointerCapture?.(e.pointerId)) dom.releasePointerCapture(e.pointerId);
        if (Math.hypot(mark.endX - mark.startX, mark.endY - mark.startY) < 5) {
          if (!mark.additive) this.callbacks.onDeselectObject?.();
        } else {
          this.callbacks.onSelectObjects?.(this._getIdsInMarquee(mark), mark.additive);
        }
        return;
      }

      if (this.draggingObjId) {
        const id = this.draggingObjId;
        const mode = this.dragMode;
        this.draggingObjId = null;
        this.callbacks.onTransformLive?.(id, mode, this.dragAccum, true);
        if (dom.hasPointerCapture?.(e.pointerId)) dom.releasePointerCapture(e.pointerId);
        return;
      }

      const wasClick = this.orbit.movedDist < 5 && !this.orbit.panning;
      this.orbit.dragging = false;
      this.orbit.panning = false;
      if (dom.hasPointerCapture?.(e.pointerId)) dom.releasePointerCapture(e.pointerId);

      if (wasClick && e.button === 0) {
        const rect = dom.getBoundingClientRect();
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.signGroup.children, true);
        if (hits.length) {
          for (const hit of hits) {
            let obj = hit.object;
            while (obj && !obj.userData?.layerId && obj.parent) obj = obj.parent;
            if (obj?.userData?.layerId) {
              // Pointer-down already selected this object. Avoid double Ctrl/Shift toggle.
              if (obj.userData.layerId !== this.pointerDownSelectedId) {
                this.callbacks.onSelectObject?.(obj.userData.layerId, e.ctrlKey || e.metaKey || e.shiftKey);
              }
              break;
            }
          }
        } else if (['select', 'move', 'rotate', 'scale'].includes(this.activeTool)) {
          // CorelDRAW-style Pick: clicking outside any object clears the selection.
          // The orbit camera remains available using middle mouse or the Pan tool.
          this.callbacks.onDeselectObject?.();
          if (this.activeTool !== 'select') this.callbacks.onConfirmTool?.();
        } else {
          this.callbacks.onConfirmTool?.();
        }
      }
    };

    this._onWheel = (e) => {
      this.invalidate();
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.09 : 0.92;
      const minR = Math.max(0.6, (this.orbit.fitRadius || 2) * 0.32);
      const maxR = Math.max(6, (this.orbit.fitRadius || 4) * 2.2);
      this.orbit.targetRadius = Math.max(minR, Math.min(maxR, this.orbit.targetRadius * factor));
    };

    this._onDoubleClick=e=>{
      if(this._paused||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||!['select','move','text'].includes(this.activeTool))return;
      const rect=dom.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      for(const hit of this.raycaster.intersectObjects(this.signGroup.children,true)){
        let obj=hit.object;while(obj&&!obj.userData?.layerId&&obj.parent)obj=obj.parent;
        if(obj?.userData?.layerId){if(!obj.userData.locked&&this.callbacks.onEditText?.(obj.userData.layerId)){e.preventDefault();e.stopPropagation();}break;}
      }
    };
    dom.addEventListener('dblclick',this._onDoubleClick);
    this._onContextMenu = (e) => e.preventDefault();
    this._onMouseDown = (e) => { if (e.button === 1) e.preventDefault(); };

    dom.addEventListener('mousedown', this._onMouseDown);
    dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onContextMenu);

    this._ro = new ResizeObserver(() => {
      if(this._resizeFrame!=null)return;
      this._resizeFrame=requestAnimationFrame(()=>{this._resizeFrame=null;if(!this.isDisposed)this._resize();});
    });
    this._ro.observe(this.container);
  }

  invalidate(shadows=false){this._renderDirty=true;if(shadows&&this.renderer)this.renderer.shadowMap.needsUpdate=true;}
  _resize(force=false) {
    if(!this.container.clientWidth||!this.container.clientHeight)return;
    const w=Math.max(100,this.container.clientWidth),h=Math.max(100,this.container.clientHeight);
    const dpr=computeQualityPixelRatio(this.quality,window.devicePixelRatio||1,w,h),key=w+'x'+h+'@'+dpr;
    if(!force&&this._sizeKey===key)return;
    this._sizeKey=key;this.renderer.setPixelRatio(dpr);this.invalidate();
    this.renderer.setSize(w, h, false);
    this.postProcessor?.setSize(Math.round(w * dpr), Math.round(h * dpr));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  getQualityInfo() {
    if (this.isDisposed) return null;
    const width = Math.max(100, this.container.clientWidth);
    const height = Math.max(100, this.container.clientHeight);
    const profile = QUALITY_PROFILES[this.quality] || QUALITY_PROFILES.high;
    return {pixelRatio:computeQualityPixelRatio(this.quality, window.devicePixelRatio || 1, width, height),
      shadowSize:profile.shadowSize, shadows:profile.shadows};
  }

  setCameraPreset(presetId) {
    this.invalidate();
    const map = {
      front: { az: 0, pol: Math.PI / 2, mult: 0.95 },
      left: { az: -0.75, pol: Math.PI / 2 - 0.08, mult: 0.95 },
      right: { az: 0.75, pol: Math.PI / 2 - 0.08, mult: 0.95 },
      hero: { az: 0.42, pol: Math.PI / 2 - 0.08, mult: 1.0 },
      top: { az: 0, pol: 1.05, mult: 1.05 },
      fit: { az: 0.42, pol: Math.PI / 2 - 0.08, mult: 1.05 },
    };
    const p = map[presetId] || map.hero;
    this.orbit.targetAzimuth = p.az;
    this.orbit.targetPolar = p.pol;
    this.orbit.target.set(0, 0, 0);
    if (this.orbit.fitRadius) {
      this.orbit.targetRadius = this.orbit.fitRadius * p.mult;
    }
  }


  cancelActiveDrag() {
    if (!this.draggingObjId) return false;
    this.draggingObjId = null;
    this.orbit.dragging = false;
    this.orbit.panning = false;
    this.callbacks.onTransformCancel?.();
    return true;
  }

  zoomBy(factor) {
    this.invalidate();
    const minR = Math.max(0.5, (this.orbit.fitRadius || 2) * 0.3);
    const maxR = Math.max(8, (this.orbit.fitRadius || 4) * 2.5);
    this.orbit.targetRadius = Math.max(minR, Math.min(maxR, this.orbit.targetRadius * factor));
  }

  _fitCamera(sizeM) {
    const aspect = this.camera.aspect || 1.6;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const pw = Math.max(0.4, sizeM.w) + 0.35;
    const ph = Math.max(0.25, sizeM.h) + 0.35;
    const dist = Math.max(pw / 2 / Math.tan(hFov / 2), ph / 2 / Math.tan(vFov / 2)) * 1.32;
    const firstFit = !this.orbit.fitRadius;
    this.orbit.fitRadius = dist;
    if (firstFit) {
      this.orbit.radius = this.orbit.targetRadius = dist;
    }
  }

  _clearGroup(group) {
    const geometries=new Set(),materials=new Set(),textures=new Set(),shadows=new Set();
    for(const child of [...group.children]){
      group.remove(child);
      child.traverse(node=>{
        if(node.geometry)geometries.add(node.geometry);
        if(node.shadow)shadows.add(node.shadow);
        for(const material of Array.isArray(node.material)?node.material:node.material?[node.material]:[]){
          materials.add(material);
          for(const value of Object.values(material))if(value?.isTexture&&value._disposeOnClear)textures.add(value);
        }
      });
    }
    for(const shadow of shadows){if(typeof shadow.dispose==='function')shadow.dispose();else{shadow.map?.dispose();shadow.mapPass?.dispose();}}
    for(const texture of textures)texture.dispose();
    for(const material of materials)material.dispose?.();
    for(const geometry of geometries)if(!geometry._cachedGeom)geometry.dispose?.();
  }

  _disposeGeomEntry(entry) {
    if (!entry) return;
    for (const g of [...(entry.outerGeos || []), ...(entry.fileGeos || []), ...(entry.acrylicGeos || [])]) {
      g.dispose?.();
    }
  }

  _applyEnvironmentAndPost(state) {
    const nextQuality = state.quality || 'high';
    if (nextQuality !== this.quality) {
      this.quality = nextQuality;
      this._resize();
    }
    const prof = QUALITY_PROFILES[this.quality] || QUALITY_PROFILES.high;
    this.renderer.shadowMap.enabled = prof.shadows;
    this.renderer.toneMappingExposure = state.render?.exposure ?? 1.0;

    const envPresetId = state.render?.envPreset || 'luxuryGold';
    const night = state.scene?.night ?? true;
    const envPreset = ENVIRONMENT_PRESETS[envPresetId] || ENVIRONMENT_PRESETS.luxuryGold;
    const envTarget = state.render?.useCustomEnv && this.envManager.customTarget
      ? this.envManager.customTarget
      : this.envManager.getEnvironment(envPresetId, night);

    this.scene.environment = envTarget.texture;
    const rotRad = ((state.render?.envRotationDeg || 0) * Math.PI) / 180;
    const pitchRad = ((state.render?.envPitchDeg || 0) * Math.PI) / 180;
    this.scene.environmentRotation.set(pitchRad, rotRad, 0);
    this.scene.environmentIntensity = (state.render?.envIntensity ?? 1.0) * (night ? 0.6 : 1.0);

    const transparentBg = !!state.scene?.transparentBg;
    if (transparentBg) {
      this.renderer.setClearColor(0x000000, 0);
      this.scene.background = null;
    } else {
      const bgHex = night ? envPreset.bgNight : envPreset.bgDay;
      this.renderer.setClearColor(bgHex, 1);
      this.scene.background = new THREE.Color(bgHex);
    }

    const anyLit = Boolean(state.lighting?.enabled !== false && (state.objects || []).some(o => {
      if (!o.visible) return false;
      const l = resolveObjectLighting(o, state);
      const m = l.mode;
      return (m === 'front' && l.frontIntensity > 0) || (m === 'halo' && l.backIntensity > 0) || (m === 'both' && (l.frontIntensity > 0 || l.backIntensity > 0));
    }));
    this.postProcessor?.setState({
      night,
      lit: anyLit,
      exposure: state.render?.exposure ?? 1.0,
      transparentBg,
      quality: this.quality,
    });
    return { prof, night, transparentBg };
  }

  /**
   * Fast path for render-only updates (environment, exposure, quality) without
   * rebuilding sign geometries or halo canvases.
   */
  updateRenderSettings(state) {
    if (this.isDisposed) return false;
    const { prof, night } = this._applyEnvironmentAndPost(state);
    const sizeM = this.lastSizeM || { w: 2.0, h: 0.4 };
    const lightsKey = [night, Math.round(sizeM.w * 10), Math.round(sizeM.h * 10), prof.shadowSize].join('|');
    if (this._lightsKey !== lightsKey) {
      this._clearGroup(this.lightsGroup);
      const lights = buildSceneLights(night, sizeM);
      lights.traverse(light => {
        if (light.shadow?.mapSize) light.shadow.mapSize.set(prof.shadowSize, prof.shadowSize);
      });
      this.lightsGroup.add(lights);
      this._lightsKey = lightsKey;
    }
    this.invalidate(true);
    return true;
  }

  /**
   * Rebuilds the 3D scene from the unified application state & loaded fonts.
   */
  updateScene(state, fontMap) {
    if (this.isDisposed) return { metricsList: [], warnings: ['WebGL kullanılamıyor.'], sizeM: { w: 1.6, h: 0.4 } };

    this.invalidate(true);
    const { prof, night, transparentBg } = this._applyEnvironmentAndPost(state);

    // Rebuild sign objects
    this._clearGroup(this.signGroup);
    const metricsList = [];
    const warnings = [];
    this._objectLightRefs=new Map();
    const haloJobs=[];
    const usedGeomKeys = new Set();

    let minXM = Infinity, maxXM = -Infinity, minYM = Infinity, maxYM = -Infinity;

    for (const obj of state.objects) {
      if (!obj.visible) continue;

      const objGroup = new THREE.Group();
      objGroup.userData.layerId = obj.id;
      objGroup.userData.locked=!!obj.locked;

      const light=resolveObjectLighting(obj,state);
      const mode=light.enabled?light.mode:'none';
      const objectHaloShapes=[];
      const hasFront = mode === 'front' || mode === 'both';
      const hasHalo = mode === 'halo' || mode === 'both';

      const wallDistMm = hasHalo ? light.wallDistanceMm : 4;
      const zOffsetM = wallDistMm * 0.001;

      const matOverrides = {
        metalness: state.materialOverrides?.metalness,
        roughness: state.materialOverrides?.roughness,
        envMapIntensity: state.render?.reflectionIntensity,
        brushDirection: state.materialOverrides?.brushDirection,
        brushScale: state.materialOverrides?.brushScale,
        brushIntensity: state.materialOverrides?.brushIntensity,
        textureStrength: state.materialOverrides?.textureStrength,
      };
      const acrylicOverrides = {
        envMapIntensity: state.render?.reflectionIntensity,
        acrylicOpacity: state.materialOverrides?.acrylicOpacity,
        acrylicTransmission: state.materialOverrides?.acrylicTransmission,
      };

      const glowHex = light.frontColor;
      const frontInt = light.frontIntensity;
      const cType = obj.constructionType || state.constructionType || 'fileli';
      const metalBinding = resolveChannelMaterialBinding(obj, state);

      const frontMats = [];
      let faceMat = null;
      let fileMat = null;
      let sideMat = null;
      let acrylicMat = null;

      if (cType === 'fileli') {
        fileMat = createSignMaterial(
          metalBinding.fileId,
          { ...matOverrides, color: metalBinding.fileColor },
          { lit: false, night, isOpaqueMetal: true }
        );
        sideMat = metalBinding.shareMetalMaterial ? fileMat : createSignMaterial(
          metalBinding.sideId,
          { ...matOverrides, color: metalBinding.sideColor },
          { lit: false, night, isOpaqueMetal: true }
        );
        acrylicMat = createSignMaterial(
          metalBinding.acrylicId || obj.acrylicMaterial || 'opalPleksi',
          { ...acrylicOverrides, color: metalBinding.acrylicColor || obj.acrylicColor || state.fileli?.acrylicColor || '#f3f3ee' },
          { lit: hasFront, night, glowHex, lightIntensity: frontInt }
        );
        if (typeof acrylicMat.userData?.updateLed === 'function') frontMats.push(acrylicMat);
      } else if (cType === 'pleksi') {
        acrylicMat = createSignMaterial(
          metalBinding.acrylicId || 'opalPleksi',
          { ...acrylicOverrides, color: metalBinding.acrylicColor || '#f3f3ee' },
          { lit: hasFront, night, glowHex, lightIntensity: frontInt }
        );
        sideMat = acrylicMat;
        if (typeof acrylicMat.userData?.updateLed === 'function') frontMats.push(acrylicMat);
      } else {
        faceMat = createSignMaterial(
          obj.faceMaterial || state.materials.faceId,
          { ...matOverrides, ...acrylicOverrides, color: obj.faceColor || state.materials.faceColor },
          { lit: hasFront, night, glowHex, lightIntensity: frontInt }
        );
        sideMat = createSignMaterial(
          metalBinding.sideId,
          { ...matOverrides, color: metalBinding.sideColor },
          { lit: false, night, isOpaqueMetal: true }
        );
        if (typeof faceMat.userData?.updateLed === 'function') frontMats.push(faceMat);
      }

      const lightRef = { front: frontMats, halo: null, points: [], night, mode };
      this._objectLightRefs.set(obj.id, lightRef);
      let shapesMmGroups = [];
      let objGeomIdentity = '';

      if (obj.kind === 'text') {
        const fontList = fontMap.get(obj.fontId || 'cinzel');
        objGeomIdentity = `text|${obj.fontId || 'cinzel'}|${getRefId(fontList)}|${obj.text || ''}|${obj.heightMm || 400}|${obj.letterSpacingMm || 0}|${obj.lineSpacingMult || 1.25}|${obj.textAlign || 'center'}`;
        if (fontList) {
          const layout = layoutTextMm(fontList, obj.text || '', obj.heightMm || 400, obj.letterSpacingMm || 0, obj.lineSpacingMult || 1.25, obj.textAlign || 'center');
          shapesMmGroups = layout.glyphs.map(g => ({ label: g.char, shapes: g.shapes }));
        }
      } else if (obj.kind === 'logo' && obj.logoData) {
        const hMm = obj.heightMm || 500;
        objGeomIdentity = `logo|${getRefId(obj.logoData)}|${hMm}`;
        const mat3 = new THREE.Matrix3().set(hMm, 0, 0, 0, hMm, 0, 0, 0, 1);
        shapesMmGroups = obj.logoData.parts.map((part, idx) => ({
          label: part.partName || `Logo-${idx + 1}`,
          color: part.color,
          shapes: part.shapes.map(raw => {
            const s=restoreLogoShape(raw);
            const ns = new THREE.Shape(s.getPoints(20).map(p => p.clone().applyMatrix3(mat3)));
            ns.holes = (s.holes || []).map(h => new THREE.Path(h.getPoints(20).map(p => p.clone().applyMatrix3(mat3))));
            return ns;
          }),
        }));
      } else if (obj.kind === 'rect') {
        const w = obj.widthMm || 300, h = obj.heightMm || 150, r = Math.min(obj.cornerRadiusMm || 0, w / 2, h / 2);
        objGeomIdentity = `rect|${w}|${h}|${r}`;
        const s = new THREE.Shape();
        if (r > 0.1) {
          s.moveTo(r, 0); s.lineTo(w - r, 0); s.quadraticCurveTo(w, 0, w, r);
          s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
          s.lineTo(r, h); s.quadraticCurveTo(0, h, 0, h - r);
          s.lineTo(0, r); s.quadraticCurveTo(0, 0, r, 0);
        } else {
          s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, h); s.lineTo(0, h); s.closePath();
        }
        shapesMmGroups = [{ label: obj.name, shapes: [s] }];
      } else if (obj.kind === 'ellipse') {
        const rx = (obj.widthMm || 240) / 2, ry = (obj.heightMm || 240) / 2;
        objGeomIdentity = `ellipse|${rx}|${ry}`;
        const s = new THREE.Shape();
        s.absellipse(rx, ry, rx, ry, 0, Math.PI * 2, false, 0);
        shapesMmGroups = [{ label: obj.name, shapes: [s] }];
      } else if (obj.kind === 'polygon' && obj.polygonsMm?.length) {
        objGeomIdentity = `poly|${getRefId(obj.polygonsMm)}`;
        const shapes = obj.polygonsMm.map(poly => {
          const s = new THREE.Shape();
          poly.outer.forEach((p, idx) => (idx === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
          s.closePath();
          for (const h of (poly.holes || [])) {
            const hp = new THREE.Path();
            h.forEach((p, idx) => (idx === 0 ? hp.moveTo(p.x, p.y) : hp.lineTo(p.x, p.y)));
            hp.closePath();
            s.holes.push(hp);
          }
          return s;
        });
        shapesMmGroups = [{ label: obj.name, shapes }];
      }

      // Scale physical contours before building parts; don't scale file widths/depth.
      const scaleX=(obj.scaleX??1)*(obj.mirrorX?-1:1),scaleY=(obj.scaleY??1)*(obj.mirrorY?-1:1);
      if(scaleX!==1||scaleY!==1){
        const pts=path=>path.getPoints(24).map(p=>new THREE.Vector2(p.x*scaleX,p.y*scaleY));
        shapesMmGroups=shapesMmGroups.map(g=>({...g,shapes:g.shapes.map(shape=>{
          const out=new THREE.Shape(pts(shape));out.holes=(shape.holes||[]).map(h=>new THREE.Path(pts(h)));return out;
        })}));
      }
      // Compute centering offset for the object's local origin
      const rawPts = shapesMmGroups.flatMap(g => g.shapes.flatMap(s => s.getPoints(6)));
      let lMinX = Infinity, lMaxX = -Infinity, lMinY = Infinity, lMaxY = -Infinity;
      for (const p of rawPts) {
        if (p.x < lMinX) lMinX = p.x;
        if (p.x > lMaxX) lMaxX = p.x;
        if (p.y < lMinY) lMinY = p.y;
        if (p.y > lMaxY) lMaxY = p.y;
      }
      const cxMm = rawPts.length ? (lMinX + lMaxX) * 0.5 : 0;
      const cyMm = rawPts.length ? (lMinY + lMaxY) * 0.5 : 0;

      const oxM = (obj.xMm || 0) * 0.001;
      const oyM = (obj.yMm || 0) * 0.001;
      const rotZRad = ((obj.rotationDeg || 0) * Math.PI) / 180;
      const cosZ = Math.cos(rotZRad);
      const sinZ = Math.sin(rotZRad);
      objGroup.position.set(oxM, oyM, zOffsetM);
      objGroup.rotation.set(((obj.rotXDeg || 0) * Math.PI) / 180, ((obj.rotYDeg || 0) * Math.PI) / 180, rotZRad);
      const sx=1,sy=1;
      objGroup.scale.set(1,1,1);

      const compMeshGroup = new THREE.Group();
      compMeshGroup.position.set(-cxMm * 0.001, -cyMm * 0.001, 0);
      objGroup.add(compMeshGroup);

      const buildCfg = {
        constructionType: cType,
        depthMm: obj.depthMm ?? state.dimensions.depthMm ?? 80,
        bevelMm: state.materialOverrides?.bevelMm ?? 2.2,
        fileWidthMm: obj.fileWidthMm ?? state.fileli?.fileWidthMm ?? 8,
        fileThicknessMm: state.fileli?.fileThicknessMm ?? 2,
        metalThicknessMm: state.fileli?.metalThicknessMm ?? 1,
        borderBevelMm: state.fileli?.borderBevelMm ?? 0.8,
        acrylicInsetMm: state.fileli?.acrylicInsetMm ?? 2.5,
        acrylicThicknessMm: state.fileli?.acrylicThicknessMm ?? 3,
      };
      const cfgKey = [
        cType, buildCfg.depthMm, buildCfg.bevelMm, buildCfg.fileWidthMm,
        buildCfg.fileThicknessMm, buildCfg.metalThicknessMm, buildCfg.borderBevelMm,
        buildCfg.acrylicInsetMm, buildCfg.acrylicThicknessMm, scaleX, scaleY,
      ].join('|');

      for (let gIdx = 0; gIdx < shapesMmGroups.length; gIdx++) {
        const grp = shapesMmGroups[gIdx];
        const gKey = `${obj.id}#${gIdx}|${objGeomIdentity}|${cfgKey}`;
        usedGeomKeys.add(gKey);
        let built = this._geomCache.get(gKey);
        if (!built) {
          built = buildChannelComponent(grp.shapes, buildCfg);
          for (const g of [...built.outerGeos, ...built.fileGeos, ...built.acrylicGeos]) g._cachedGeom = true;
          this._geomCache.set(gKey, built);
        }
        if (built.warnings.length) warnings.push(...built.warnings);

        metricsList.push({
          objectId: obj.id,
          label: grp.label,
          ...built.metrics,
          depthMm: buildCfg.depthMm,
          constructionType: cType,
          lightingMode: mode,
          polygonsMm: built.polygonsMm,
          exportContours: built.exportContours,
          offsetXMm: (obj.xMm || 0) - cxMm,
          offsetYMm: (obj.yMm || 0) - cyMm,
        });

        let partFaceMat = faceMat;
        if (obj.kind === 'logo' && obj.logoColorMode === 'original' && grp.color && cType !== 'fileli' && cType !== 'pleksi') {
          partFaceMat = createSignMaterial('boyaliAluminyum', { color: grp.color }, { lit: false, night });
          if (hasFront) {
            partFaceMat.userData.updateLed = (hex, intensity) => {
              partFaceMat.emissive.set(grp.color);
              partFaceMat.emissiveIntensity = (night ? 2.2 : 0.8) * Math.max(0, intensity);
            };
            partFaceMat.userData.updateLed(glowHex, frontInt);
            lightRef.front.push(partFaceMat);
          }
        }

        for (const geo of built.outerGeos) {
          const mats = (cType === 'fileli' || cType === 'pleksi') ? [sideMat, sideMat] : [partFaceMat, sideMat];
          const mesh = new THREE.Mesh(geo, mats);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.layerId = obj.id;
          compMeshGroup.add(mesh);
        }
        const expZ = state.render?.explodedView ? 0.045 : 0;
        for (const geo of built.fileGeos) {
          const mesh = new THREE.Mesh(geo, [fileMat, sideMat]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.position.z = expZ * 2;
          mesh.userData.layerId = obj.id;
          compMeshGroup.add(mesh);
        }
        for (const geo of built.acrylicGeos) {
          const mesh = new THREE.Mesh(geo, [acrylicMat, acrylicMat]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.position.z = expZ;
          mesh.userData.layerId = obj.id;
          compMeshGroup.add(mesh);
        }

        // Collect world-space shapes for halo plane (including object Z rotation)
        if (hasHalo) {
          const toWorld = p => {
            const lx = (p.x - cxMm) * 0.001 * sx;
            const ly = (p.y - cyMm) * 0.001 * sy;
            return {
              wx: oxM + lx * cosZ - ly * sinZ,
              wy: oyM + lx * sinZ + ly * cosZ,
            };
          };
          for (const poly of built.polygonsMm) {
            const sh = new THREE.Shape();
            poly.outer.forEach((p, idx) => {
              const { wx, wy } = toWorld(p);
              if (idx === 0) sh.moveTo(wx, wy);
              else sh.lineTo(wx, wy);
            });
            sh.closePath();
            for (const h of poly.holes) {
              const hp = new THREE.Path();
              h.forEach((p, idx) => {
                const { wx, wy } = toWorld(p);
                if (idx === 0) hp.moveTo(wx, wy);
                else hp.lineTo(wx, wy);
              });
              hp.closePath();
              sh.holes.push(hp);
            }
            objectHaloShapes.push(sh);
          }
        }
      }

      if (rawPts.length) {
        const halfW = ((lMaxX - lMinX) * 0.5 * Math.abs(sx)) * 0.001;
        const halfH = ((lMaxY - lMinY) * 0.5 * Math.abs(sy)) * 0.001;
        minXM = Math.min(minXM, oxM - halfW);
        maxXM = Math.max(maxXM, oxM + halfW);
        minYM = Math.min(minYM, oyM - halfH);
        maxYM = Math.max(maxYM, oyM + halfH);
      }

      this.signGroup.add(objGroup);
      if(hasHalo&&objectHaloShapes.length&&!transparentBg)haloJobs.push({obj,light,shapes:objectHaloShapes});
    }

    // Evict & dispose stale geometry cache entries
    for (const [k, entry] of this._geomCache.entries()) {
      if (!usedGeomKeys.has(k)) {
        this._disposeGeomEntry(entry);
        this._geomCache.delete(k);
      }
    }

    const sizeM = {
      w: Number.isFinite(minXM) ? Math.max(0.2, maxXM - minXM) : 1.6,
      h: Number.isFinite(minYM) ? Math.max(0.2, maxYM - minYM) : 0.4,
    };
    this.lastSizeM = sizeM;

    // Independent halo masks and bounded wall-wash lights.
    for(const job of haloJobs){
      const refs=this._objectLightRefs.get(job.obj.id),box=new THREE.Box2();
      for(const shape of job.shapes)for(const pt of shape.getPoints(6))box.expandByPoint(pt);
      if(box.isEmpty())continue;
      const height=Math.max(.05,box.max.y-box.min.y);
      const halo=createHaloTexture(job.shapes,{minX:box.min.x,maxX:box.max.x,minY:box.min.y,maxY:box.max.y},{wallDistanceMm:job.light.wallDistanceMm,haloSpread:job.light.haloSpread,falloff:job.light.falloff,letterHeightM:height});
      halo.texture._disposeOnClear=true;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(halo.widthM,halo.heightM),new THREE.MeshBasicMaterial({map:halo.texture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
      mesh.position.set(halo.cxM,halo.cyM,.002);mesh.renderOrder=2;mesh.raycast=()=>{};
      mesh.userData.isHalo=true;mesh.userData.haloOwnerId=job.obj.id;
      this.signGroup.add(mesh);refs.halo=mesh;
      // The contour mask alone illuminates the wall. Point lights create circular hotspots.
      refs.height=height;this.applyObjectLightAppearance(refs,job.light);
    }

    // The wall is loaded independently; geometry and controls remain responsive.
    this.requestWall(state.scene?.wallId,sizeM,transparentBg,state.scene?.wallScale??1.0);

    // Scene lighting
    const lightsKey=[night,Math.round(sizeM.w*10),Math.round(sizeM.h*10),prof.shadowSize].join('|');
    if(this._lightsKey!==lightsKey){
    this._clearGroup(this.lightsGroup);
    const lights = buildSceneLights(night, sizeM);
    lights.traverse(light => {
      if (light.shadow?.mapSize) light.shadow.mapSize.set(prof.shadowSize, prof.shadowSize);
    });
    this.lightsGroup.add(lights);
    this._lightsKey=lightsKey;
    }

    this.currentSelectedId = state.selectedIds?.[0] || null;

    // Render Page Layout Frame (in millimeters)
    this._clearGroup(this.pageGroup);
    if (state.pageLayout?.visible && !transparentBg) {
      const pw = (state.pageLayout.widthMm || 2000) * 0.001;
      const ph = (state.pageLayout.heightMm || 1000) * 0.001;
      const pts = [
        new THREE.Vector3(-pw / 2, -ph / 2, 0.003),
        new THREE.Vector3(pw / 2, -ph / 2, 0.003),
        new THREE.Vector3(pw / 2, ph / 2, 0.003),
        new THREE.Vector3(-pw / 2, ph / 2, 0.003),
        new THREE.Vector3(-pw / 2, -ph / 2, 0.003),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.75 });
      this.pageGroup.add(new THREE.Line(lineGeo, lineMat));
    }

    // Render 3D Selection Highlight Box
    this.updateSelectionBox(state);

    this._fitCamera(sizeM);

    return {
      sizeM,
      metricsList,
      warnings: [...new Set(warnings)],
    };
  }


  /**
   * Returns 2D screen bounding box (in container pixels) for selected object(s).
   */

  /**
   * Projects screen clientX/clientY onto the Z=0 sign wall plane in millimetres.
   */
  screenToWallMm(clientX, clientY) {
    const dom = this.renderer?.domElement;
    if (!dom) return { xMm: 0, yMm: 0 };
    const rect = dom.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hit)) {
      return { xMm: Math.round(hit.x * 1000), yMm: Math.round(hit.y * 1000) };
    }
    return { xMm: 0, yMm: 0 };
  }

  getSelectedScreenBounds(selectedIds) {
    if (!selectedIds?.length || !this.container || this.isDisposed || !this.signGroup) return null;
    const box = new THREE.Box3();
    let found = false;
    for (const child of this.signGroup.children) {
      if (selectedIds.includes(child.userData?.layerId)) {
        box.expandByObject(child);
        found = true;
      }
    }
    if (!found || box.isEmpty()) return null;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return null;

    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.camera.updateMatrixWorld();
    for (const c of corners) {
      c.project(this.camera);
      const px = (c.x * 0.5 + 0.5) * w;
      const py = (-c.y * 0.5 + 0.5) * h;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    const sizeM = new THREE.Vector3();
    box.getSize(sizeM);
    return {
      left: minX,
      right: maxX,
      top: minY,
      bottom: maxY,
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
      widthMm: Math.round(sizeM.x * 1000),
      heightMm: Math.round(sizeM.y * 1000),
      depthMm: Math.round(sizeM.z * 1000),
    };
  }

  /**
   * Captures a high-resolution PNG (or transparent PNG with no wall).
   */

  /**
   * Immediately updates only the 3D selection highlight box without rebuilding letter meshes.
   */
  updateSelectionBox(state) {
    this.invalidate();
    this._clearGroup(this.selectionGroup);
    if (!state?.scene?.transparentBg && state?.selectedIds?.length) {
      for (const child of this.signGroup.children) {
        if (state.selectedIds.includes(child.userData?.layerId)) {
          const box = new THREE.Box3().setFromObject(child);
          if (!box.isEmpty()) {
            const bSize = new THREE.Vector3();
            const bCenter = new THREE.Vector3();
            box.getSize(bSize);
            box.getCenter(bCenter);
            const helperGeo = new THREE.BoxGeometry(bSize.x + 0.02, bSize.y + 0.02, bSize.z + 0.01);
            const edges = new THREE.EdgesGeometry(helperGeo);
            helperGeo.dispose();
            const selLine = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#ffb547' }));
            selLine.position.copy(bCenter);
            this.selectionGroup.add(selLine);
          }
        }
      }
    }
  }

  capturePng(width = 2400, height = 1500, options = {}) {
    if (this.isDisposed || !this.renderer) throw new Error('3D WebGL kullanılamıyor.');
    const opts = options && typeof options === 'object' ? options : {};
    const selectedIds = opts.selectedIds ? new Set(opts.selectedIds) : null;
    if (selectedIds && !selectedIds.size) throw new Error('Dışa aktarılacak seçili nesne yok.');
    const cameraPos = this.camera.position.clone();
    const cameraQuat = this.camera.quaternion.clone();
    const prevAspect = this.camera.aspect;
    const previousBackground = this.scene.background;
    const previousClearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = this.renderer.getClearAlpha();
    const groups = [this.wallGroup, this.pageGroup, this.selectionGroup];
    const previousGroups = groups.map(g => g.visible);
    const children = this.signGroup.children.map(child => ({child, visible:child.visible}));
    const savedHalos = [];
    try {
      const haloMode = opts.haloMode || 'include';
      if (opts.transparent || selectedIds) {
        this.scene.background = null;
        this.renderer.setClearColor(0x000000, haloMode === 'only' ? 1 : 0);
        for (const group of groups) group.visible = false;
      }
      if(opts.transparent&&!selectedIds)for(const {child} of children)if(!child.userData?.layerId&&!child.userData?.isHalo)child.visible=false;
      if (selectedIds) {
        const bounds = new THREE.Box3();
        for (const {child} of children) {
          child.visible = child.visible && selectedIds.has(child.userData?.layerId || child.userData?.haloOwnerId);
          if (child.visible) bounds.expandByObject(child);
        }
        if (!bounds.isEmpty()) {
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          const aspect = width / height;
          const fov = THREE.MathUtils.degToRad(this.camera.fov);
          const distance = Math.max(size.y, size.x / Math.max(aspect, 0.1)) / Math.max(0.01,2*Math.tan(fov/2)) * 1.4 + size.z;
          const viewDirection = cameraPos.clone().sub(this.orbit.target).normalize();
          this.camera.position.copy(center).addScaledVector(viewDirection, Math.max(0.25, distance));
          this.camera.lookAt(center);
        }
      } else if (opts.fitToSign) {
        const bounds = new THREE.Box3();
        for (const { child } of children) {
          if (child.visible) bounds.expandByObject(child);
        }
        if (!bounds.isEmpty()) {
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          const aspect = width / Math.max(1, height);
          const fov = THREE.MathUtils.degToRad(this.camera.fov);
          const halfH = Math.max(size.y * 0.5, (size.x * 0.5) / Math.max(aspect, 0.1));
          const distance = (halfH / Math.max(0.01, Math.tan(fov * 0.5))) * 1.12 + size.z * 0.6;
          this.camera.position.set(center.x, center.y, center.z + Math.max(0.25, distance));
          this.camera.lookAt(center);
        }
      }
      if (haloMode === 'only') {
        for (const { child } of children) {
          if (!child.userData?.isHalo) child.visible = false;
          else if (child.visible && child.material && child.material.opacity > 0) {
            const mat = child.material;
            savedHalos.push({ mat, blending: mat.blending, opacity: mat.opacity, color: mat.color.clone() });
            mat.blending = THREE.AdditiveBlending;
            const peak = Math.max(1, mat.color.r, mat.color.g, mat.color.b);
            mat.color.multiplyScalar(1.25 / peak);
            mat.opacity = Math.min(1.0, Math.max(mat.opacity * 1.65, 0.84));
          }
        }
      } else if (haloMode === 'exclude') {
        for (const { child } of children) {
          if (child.userData?.isHalo) child.visible = false;
        }
      } else if (opts.transparent) {
        for (const { child } of children) {
          if (child.userData?.isHalo && child.visible && child.material && child.material.opacity > 0) {
            const mat = child.material;
            savedHalos.push({ mat, blending: mat.blending, opacity: mat.opacity, color: mat.color.clone() });
            mat.blending = THREE.NormalBlending;
            const peak = Math.max(1, mat.color.r, mat.color.g, mat.color.b);
            mat.color.multiplyScalar(1 / peak);
            mat.opacity = Math.min(0.96, Math.max(mat.opacity * 1.85, 0.62));
          }
        }
      }
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.shadowMap.needsUpdate=true;
      if (!opts.transparent && !selectedIds && this.postProcessor) {
        this.postProcessor.setSize(width, height);
        this.postProcessor.render(this.scene, this.camera);
      } else {
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.render(this.scene, this.camera);
      }
      return this.renderer.domElement.toDataURL('image/png');
    } finally {
      for (const h of savedHalos) {
        h.mat.blending = h.blending;
        h.mat.opacity = h.opacity;
        h.mat.color.copy(h.color);
      }
      this.camera.position.copy(cameraPos);
      this.camera.quaternion.copy(cameraQuat);
      this.camera.aspect = prevAspect;
      this.camera.updateProjectionMatrix();
      this.scene.background = previousBackground;
      this.renderer.setClearColor(previousClearColor, previousClearAlpha);
      groups.forEach((g,i) => {g.visible = previousGroups[i];});
      children.forEach(({child,visible}) => {child.visible = visible;});
      this._resize(true);
      this.invalidate(true);
    }
  }

  applyObjectLightAppearance(refs,light){
    for(const mat of refs.front)mat.userData.updateLed(light.frontColor,light.frontIntensity);
    const intensity=light.backIntensity,night=refs.night;
    if(refs.halo){
      refs.halo.visible=intensity>0;
      refs.halo.material.color.set(light.backColor).multiplyScalar((night ? 2.4 : 0.95) * intensity + 0.15);
      refs.halo.material.opacity=intensity>0?Math.min(.98,(night ? .34 : .22)*intensity+.08):0;
    }
    // No point-light hotspot; the selected intensity controls only the contour glow.
  }
  updateLightAppearance(state){
    if(this.isDisposed||this._paused||!this._objectLightRefs)return false;
    for(const obj of state.objects.filter(o=>o.visible)){
      const refs=this._objectLightRefs.get(obj.id),light=resolveObjectLighting(obj,state);
      if(!refs||refs.mode!==(light.enabled?light.mode:'none'))return false;
    }
    for(const obj of state.objects.filter(o=>o.visible))this.applyObjectLightAppearance(this._objectLightRefs.get(obj.id),resolveObjectLighting(obj,state));
    const anyLit = Boolean(state.lighting?.enabled !== false && state.objects.some(o => {
      if (!o.visible) return false;
      const l = resolveObjectLighting(o, state);
      const m = l.mode;
      return (m === 'front' && l.frontIntensity > 0) || (m === 'halo' && l.backIntensity > 0) || (m === 'both' && (l.frontIntensity > 0 || l.backIntensity > 0));
    }));
    this.postProcessor?.setState({
      night: state.scene?.night ?? true,
      lit: anyLit,
      exposure: state.render?.exposure ?? 1.0,
      transparentBg: !!state.scene?.transparentBg,
      quality: this.quality,
    });
    this.invalidate();return true;
  }
  cancelWallLoad(){
    this._wallRequest?.controller.abort();
    this._wallRequest=null;
    this.callbacks?.onWallLoad?.({phase:'idle'});
  }
  updateWallScale(wallScale=1.0){
    if(this.isDisposed)return;
    const scale=Math.max(0.08,Math.min(2.5,Number(wallScale)||1.0));
    this._wallScale=scale;
    if(!this._wallDims||!this.wallGroup?.children?.length)return;
    const {rx,ry}=computeWallRepeat(this._wallDims.id,this._wallDims.w,this._wallDims.h,scale);
    for(const child of this.wallGroup.children){
      const mat=child.material;
      if(!mat)continue;
      for(const tex of [mat.map,mat.bumpMap,mat.roughnessMap]){
        if(tex){tex.repeat.set(rx,ry);tex.needsUpdate=true;}
      }
    }
    this.invalidate(true);
  }
  requestWall(wallId,sizeM=this.lastSizeM,transparent=false,wallScale=this._wallScale){
    if(this.isDisposed||this._paused)return;
    const sc=Math.max(0.08,Math.min(2.5,Number(wallScale)||1.0));
    this._wallScale=sc;
    const id=normalizeWallId(wallId),w=Math.max(16,Math.ceil(sizeM.w*3.5)),h=Math.max(10,Math.ceil(sizeM.h*5));
    const key=transparent?'transparent':id+'|'+w+'|'+h;
    if(transparent){this.cancelWallLoad();this._clearGroup(this.wallGroup);this._wallKey=key;this._wallDims=null;this.invalidate(true);return;}
    if(this._wallKey===key){if(this._wallRequest)this.cancelWallLoad();this._wallDims={id,w,h};this.updateWallScale(sc);return;}
    if(this._wallRequest?.id===id){Object.assign(this._wallRequest,{key,w,h});return;}
    this.cancelWallLoad();
    const request={id,key,w,h,controller:new AbortController()};this._wallRequest=request;
    const valid=()=>this._wallRequest===request&&!this.isDisposed&&!this._paused&&!request.controller.signal.aborted;
    const publish=(phase,percent=0,message='')=>{if(valid())this.callbacks?.onWallLoad?.({id,phase,percent,message});};
    publish('loading',0);
    loadWallPixels(id,{signal:request.controller.signal,onProgress:p=>publish('loading',Math.min(99,p))}).then(pixels=>{
      if(!valid())return;
      this._wallDims={id,w:request.w,h:request.h};
      const wt=createWallTextures(id,request.w,request.h,pixels,this._wallScale);
      const planeGeo = new THREE.PlaneGeometry(request.w, request.h, 24, 16);
      const posAttr = planeGeo.getAttribute('position');
      const vCount = posAttr.count;
      const colors = new Float32Array(vCount * 3);
      const halfW = Math.max(0.5, request.w * 0.5);
      const halfH = Math.max(0.5, request.h * 0.5);
      for (let i = 0; i < vCount; i++) {
        const nx = posAttr.getX(i) / halfW;
        const ny = posAttr.getY(i) / halfH;
        const r = Math.min(1, Math.hypot(nx * 0.85, ny * 1.1));
        const shade = 1.0 - 0.32 * r * r;
        colors[i * 3] = shade;
        colors[i * 3 + 1] = shade;
        colors[i * 3 + 2] = shade;
      }
      planeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const wallMat = new THREE.MeshStandardMaterial({
        map: wt.map,
        bumpMap: wt.bumpMap,
        bumpScale: wt.bumpScale,
        roughnessMap: wt.roughnessMap || null,
        roughness: wt.roughness,
        metalness: wt.metalness || 0,
        envMapIntensity: wt.envMapIntensity ?? 0.55,
        vertexColors: true,
      });
      const wall=new THREE.Mesh(planeGeo,wallMat);
      wall.receiveShadow=true;
      this._clearGroup(this.wallGroup);this.wallGroup.add(wall);this._wallKey=request.key;this.invalidate(true);
      publish('done',100);this._wallRequest=null;
    }).catch(error=>{
      if(!valid())return;
      publish('error',0,String(error.message||error));this._wallRequest=null;
    });
  }
  setActive(active){
    if(this.isDisposed)return;
    if(active&&this._paused){this._paused=false;this._resize(true);this.invalidate();this._startLoop();}
    else if(!active&&!this._paused){this._paused=true;this.cancelWallLoad();cancelAnimationFrame(this._raf);this.activePointers.clear();this.orbit.dragging=false;this.orbit.panning=false;this.draggingObjId=null;}
  }
  _startLoop() {
    const tick=()=>{
      if(this.isDisposed||this._paused)return;
      this._raf=requestAnimationFrame(tick);
      if(document.hidden||!this.container.clientWidth||!this.container.clientHeight)return;
      const o=this.orbit;
      const moving=Math.abs(o.targetAzimuth-o.azimuth)+Math.abs(o.targetPolar-o.polar)+Math.abs(o.targetRadius-o.radius)>0.00015;
      if(!moving&&!this._renderDirty)return;
      if(moving){
        o.azimuth+=(o.targetAzimuth-o.azimuth)*.14;
        o.polar+=(o.targetPolar-o.polar)*.14;
        o.radius+=(o.targetRadius-o.radius)*.14;
      }else{o.azimuth=o.targetAzimuth;o.polar=o.targetPolar;o.radius=o.targetRadius;}
      this.camera.position.set(o.target.x+o.radius*Math.sin(o.polar)*Math.sin(o.azimuth),o.target.y+o.radius*Math.cos(o.polar),o.target.z+o.radius*Math.sin(o.polar)*Math.cos(o.azimuth));
      this.camera.lookAt(o.target);
      this._renderDirty=false;
      if(this.postProcessor)this.postProcessor.render(this.scene,this.camera);
      else this.renderer.render(this.scene,this.camera);
      this.callbacks.onFrame?.();
    };
    this._raf=requestAnimationFrame(tick);
  }

  dispose() {
    this.pickMarqueeEl?.remove();
    this.pickMarqueeEl = null;
    this.isDisposed = true;
    this.cancelWallLoad();
    cancelAnimationFrame(this._raf);
    if(!this.renderer)return;
    const dom = this.renderer.domElement;
    dom.removeEventListener('mousedown', this._onMouseDown);
    dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    dom.removeEventListener('wheel', this._onWheel);
    dom.removeEventListener('contextmenu', this._onContextMenu);
    dom.removeEventListener('dblclick',this._onDoubleClick);
    this._ro?.disconnect();if(this._resizeFrame!=null)cancelAnimationFrame(this._resizeFrame);
    this._clearGroup(this.signGroup);
    this._clearGroup(this.wallGroup);
    this._clearGroup(this.lightsGroup);
    this._clearGroup(this.selectionGroup);
    this._clearGroup(this.pageGroup);
    for (const entry of this._geomCache.values()) this._disposeGeomEntry(entry);
    this._geomCache.clear();
    this.postProcessor?.dispose();
    this.envManager.dispose();
    this.renderer.dispose();
  }
}
