import THREE from '../vendor/three.js';
import { createSignMaterial } from './MaterialLibrary.js';
import { EnvironmentManager, ENVIRONMENT_PRESETS } from './EnvironmentManager.js';
import { buildSceneLights, createHaloTexture } from './LightingSystem.js';
import { getWallTextures } from '../photomontage/BackgroundLibrary.js';
import { buildChannelComponent } from '../geometry/ChannelLetterGeometry.js';
import { layoutTextMm } from '../geometry/FontManager.js';

/**
 * Core Three.js r187 3D Signage Rendering Engine
 * - Physically-based rendering (MeshPhysicalMaterial, PMREM HDR environments, ACESFilmicToneMapping)
 * - Smooth damped orbit/zoom/pan camera controls + preset angles
 * - Real Raycaster 3D object selection
 * - Transparent & high-res PNG capture (including for photomontage)
 * - Quality presets (performance, balanced, high, ultra)
 */

const QUALITY_PROFILES = {
  performance: { dprMax: 1.0, shadowSize: 512, shadows: false },
  balanced: { dprMax: 1.5, shadowSize: 1024, shadows: true },
  high: { dprMax: 2.0, shadowSize: 2048, shadows: true },
  ultra: { dprMax: 2.5, shadowSize: 2048, shadows: true },
};

export class SignEngine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.05, 100);
    this.camera.position.set(1.0, 0.05, 4.0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x060608, 1);

    this.container.innerHTML = '';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.container.appendChild(this.renderer.domElement);

    this.envManager = new EnvironmentManager(this.renderer);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Scene groups
    this.wallGroup = new THREE.Group();
    this.lightsGroup = new THREE.Group();
    this.signGroup = new THREE.Group();
    this.scene.add(this.wallGroup, this.lightsGroup, this.signGroup);

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

    this.disposables = [];
    this.selectableRoots = [];
    this.lastSizeM = { w: 2.0, h: 0.4 };
    this.quality = 'high';
    this.isDisposed = false;

    this._bindEvents();
    this._resize();
    this._startLoop();
  }

  _bindEvents() {
    const dom = this.renderer.domElement;

    this._onPointerDown = (e) => {
      if (e.button === 2 || e.shiftKey) {
        this.orbit.panning = true;
      } else {
        this.orbit.dragging = true;
      }
      this.orbit.lastX = e.clientX;
      this.orbit.lastY = e.clientY;
      this.orbit.movedDist = 0;
      dom.setPointerCapture?.(e.pointerId);
    };

    this._onPointerMove = (e) => {
      if (!this.orbit.dragging && !this.orbit.panning) return;
      const dx = e.clientX - this.orbit.lastX;
      const dy = e.clientY - this.orbit.lastY;
      this.orbit.lastX = e.clientX;
      this.orbit.lastY = e.clientY;
      this.orbit.movedDist += Math.hypot(dx, dy);

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
      const wasClick = this.orbit.movedDist < 5 && !this.orbit.panning;
      this.orbit.dragging = false;
      this.orbit.panning = false;
      dom.releasePointerCapture?.(e.pointerId);

      if (wasClick && this.callbacks.onSelectObject) {
        const rect = dom.getBoundingClientRect();
        this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObjects(this.signGroup.children, true);
        if (hits.length) {
          let obj = hits[0].object;
          while (obj && !obj.userData?.layerId && obj.parent) obj = obj.parent;
          if (obj?.userData?.layerId) {
            this.callbacks.onSelectObject(obj.userData.layerId, e.ctrlKey || e.metaKey || e.shiftKey);
          }
        }
      }
    };

    this._onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.09 : 0.92;
      const minR = Math.max(0.6, this.orbit.fitRadius * 0.32);
      const maxR = Math.max(6, this.orbit.fitRadius * 2.2);
      this.orbit.targetRadius = Math.max(minR, Math.min(maxR, this.orbit.targetRadius * factor));
    };

    this._onContextMenu = (e) => e.preventDefault();

    dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onContextMenu);

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.container);
  }

  _resize() {
    const w = Math.max(100, this.container.clientWidth);
    const h = Math.max(100, this.container.clientHeight);
    const prof = QUALITY_PROFILES[this.quality] || QUALITY_PROFILES.high;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prof.dprMax));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setCameraPreset(presetId) {
    const map = {
      front: { az: 0, pol: Math.PI / 2, mult: 0.95 },
      left: { az: -0.75, pol: Math.PI / 2 - 0.08, mult: 0.95 },
      right: { az: 0.75, pol: Math.PI / 2 - 0.08, mult: 0.95 },
      hero: { az: 0.42, pol: Math.PI / 2 - 0.08, mult: 1.0 },
      top: { az: 0, pol: 1.05, mult: 1.05 },
    };
    const p = map[presetId] || map.hero;
    this.orbit.targetAzimuth = p.az;
    this.orbit.targetPolar = p.pol;
    this.orbit.target.set(0, 0, 0);
    if (this.orbit.fitRadius) {
      this.orbit.targetRadius = this.orbit.fitRadius * p.mult;
    }
  }

  zoomBy(factor) {
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
    while (group.children.length) {
      const c = group.children.pop();
      c.traverse?.((node) => {
        if (node.geometry) node.geometry.dispose?.();
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const m of mats) {
            if (m.map && m.map._disposeOnClear) m.map.dispose();
            m.dispose?.();
          }
        }
      });
    }
  }

  /**
   * Rebuilds the 3D scene from the unified application state & loaded fonts.
   */
  updateScene(state, fontMap) {
    if (this.isDisposed) return;

    this.quality = state.quality || 'high';
    const prof = QUALITY_PROFILES[this.quality] || QUALITY_PROFILES.high;
    this.renderer.shadowMap.enabled = prof.shadows;
    this.renderer.toneMappingExposure = state.render?.exposure ?? 1.0;

    // Environment & background
    const envPresetId = state.render?.envPreset || 'luxuryGold';
    const night = state.scene?.night ?? true;
    const envPreset = ENVIRONMENT_PRESETS[envPresetId] || ENVIRONMENT_PRESETS.luxuryGold;
    const envTarget = state.render?.useCustomEnv && this.envManager.customTarget
      ? this.envManager.customTarget
      : this.envManager.getEnvironment(envPresetId, night);

    this.scene.environment = envTarget.texture;
    const rotRad = ((state.render?.envRotationDeg || 0) * Math.PI) / 180;
    this.scene.environmentRotation.set(0, rotRad, 0);
    this.scene.environmentIntensity = (state.render?.envIntensity ?? 1.0) * (night ? 0.72 : 1.05);

    const transparentBg = !!state.scene?.transparentBg;
    if (transparentBg) {
      this.renderer.setClearColor(0x000000, 0);
      this.scene.background = null;
    } else {
      const bgHex = night ? envPreset.bgNight : envPreset.bgDay;
      this.renderer.setClearColor(bgHex, 1);
      this.scene.background = new THREE.Color(bgHex);
    }

    // Rebuild sign objects
    this._clearGroup(this.signGroup);
    const metricsList = [];
    const warnings = [];
    const allShapesMForHalo = [];

    let minXM = Infinity, maxXM = -Infinity, minYM = Infinity, maxYM = -Infinity;

    for (const obj of state.objects) {
      if (!obj.visible) continue;

      const objGroup = new THREE.Group();
      objGroup.userData.layerId = obj.id;

      const lightOn = state.lighting?.enabled ?? true;
      const mode = lightOn ? (obj.lightingMode || state.lighting?.mode || 'halo') : 'none';
      const hasFront = mode === 'front' || mode === 'both';
      const hasHalo = mode === 'halo' || mode === 'both';

      const wallDistMm = hasHalo ? (state.lighting?.wallDistanceMm ?? 35) : 4;
      const zOffsetM = wallDistMm * 0.001;

      const matOverrides = {
        metalness: state.materialOverrides?.metalness,
        roughness: state.materialOverrides?.roughness,
        envMapIntensity: state.render?.reflectionIntensity,
        brushDirection: state.materialOverrides?.brushDirection,
        brushScale: state.materialOverrides?.brushScale,
        brushIntensity: state.materialOverrides?.brushIntensity,
        textureStrength: state.materialOverrides?.textureStrength,
        acrylicOpacity: state.materialOverrides?.acrylicOpacity,
        acrylicTransmission: state.materialOverrides?.acrylicTransmission,
      };

      const glowHex = state.lighting?.colorHex || '#ffc982';
      const frontInt = state.lighting?.frontIntensity ?? 1.0;

      const faceMat = createSignMaterial(
        obj.faceMaterial || state.materials.faceId,
        { ...matOverrides, color: obj.faceColor || state.materials.faceColor },
        { lit: hasFront && obj.constructionType !== 'fileli', night, glowHex, lightIntensity: frontInt }
      );
      const sideMat = createSignMaterial(
        obj.sideFollowsFace ? (obj.faceMaterial || state.materials.faceId) : (obj.sideMaterial || state.materials.sideId),
        { ...matOverrides, color: obj.sideFollowsFace ? (obj.faceColor || state.materials.faceColor) : (obj.sideColor || state.materials.sideColor) },
        { lit: false, night, isOpaqueMetal: true }
      );
      const fileMat = createSignMaterial(
        obj.fileMaterial || state.fileli?.fileMaterial || state.materials.faceId,
        { ...matOverrides, color: obj.fileColor || state.fileli?.fileColor },
        { lit: false, night, isOpaqueMetal: true }
      );
      const acrylicMat = createSignMaterial(
        obj.acrylicMaterial || 'opalPleksi',
        { ...matOverrides, color: obj.acrylicColor || state.fileli?.acrylicColor || '#f3f3ee' },
        { lit: hasFront, night, glowHex, lightIntensity: frontInt }
      );

      let shapesMmGroups = [];

      if (obj.kind === 'text') {
        const fontList = fontMap.get(obj.fontId || 'cinzel');
        if (fontList) {
          const layout = layoutTextMm(fontList, obj.text || '', obj.heightMm || 400, obj.letterSpacingMm || 0);
          shapesMmGroups = layout.glyphs.map(g => ({ label: g.char, shapes: g.shapes }));
        }
      } else if (obj.kind === 'logo' && obj.logoData) {
        const hMm = obj.heightMm || 500;
        const mat3 = new THREE.Matrix3().set(hMm, 0, 0, 0, hMm, 0, 0, 0, 1);
        shapesMmGroups = obj.logoData.parts.map((part, idx) => ({
          label: part.partName || `Logo-${idx + 1}`,
          color: part.color,
          shapes: part.shapes.map(s => {
            const ns = new THREE.Shape(s.getPoints(12).map(p => p.clone().applyMatrix3(mat3)));
            ns.holes = (s.holes || []).map(h => new THREE.Path(h.getPoints(12).map(p => p.clone().applyMatrix3(mat3))));
            return ns;
          }),
        }));
      } else if (obj.kind === 'rect') {
        const w = obj.widthMm || 300, h = obj.heightMm || 150, r = Math.min(obj.cornerRadiusMm || 0, w / 2, h / 2);
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
        const s = new THREE.Shape();
        s.absellipse(rx, ry, rx, ry, 0, Math.PI * 2, false, 0);
        shapesMmGroups = [{ label: obj.name, shapes: [s] }];
      } else if (obj.kind === 'polygon' && obj.polygonsMm?.length) {
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
      objGroup.position.set(oxM, oyM, zOffsetM);
      objGroup.rotation.z = ((obj.rotationDeg || 0) * Math.PI) / 180;
      const sx = (obj.scaleX ?? 1) * (obj.mirrorX ? -1 : 1);
      const sy = (obj.scaleY ?? 1) * (obj.mirrorY ? -1 : 1);
      objGroup.scale.set(sx, sy, 1);

      const compMeshGroup = new THREE.Group();
      compMeshGroup.position.set(-cxMm * 0.001, -cyMm * 0.001, 0);
      objGroup.add(compMeshGroup);

      const cType = obj.constructionType || state.constructionType || 'fileli';
      const buildCfg = {
        constructionType: cType,
        depthMm: obj.depthMm ?? state.dimensions.depthMm ?? 80,
        bevelMm: state.materialOverrides?.bevelMm ?? 1.8,
        fileWidthMm: obj.fileWidthMm ?? state.fileli?.fileWidthMm ?? 8,
        fileThicknessMm: state.fileli?.fileThicknessMm ?? 2,
        borderBevelMm: state.fileli?.borderBevelMm ?? 0.8,
        acrylicInsetMm: state.fileli?.acrylicInsetMm ?? 2.5,
        acrylicThicknessMm: state.fileli?.acrylicThicknessMm ?? 3,
      };

      for (const grp of shapesMmGroups) {
        const built = buildChannelComponent(grp.shapes, buildCfg);
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

        for (const geo of built.outerGeos) {
          const mats = (cType === 'fileli' || cType === 'pleksi') ? [sideMat, sideMat] : [faceMat, sideMat];
          const mesh = new THREE.Mesh(geo, mats);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.layerId = obj.id;
          compMeshGroup.add(mesh);
        }
        for (const geo of built.fileGeos) {
          const mesh = new THREE.Mesh(geo, [fileMat, sideMat]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.layerId = obj.id;
          compMeshGroup.add(mesh);
        }
        for (const geo of built.acrylicGeos) {
          const mesh = new THREE.Mesh(geo, [acrylicMat, acrylicMat]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.layerId = obj.id;
          compMeshGroup.add(mesh);
        }

        // Collect world-space shapes for halo plane
        if (hasHalo || hasFront) {
          for (const poly of built.polygonsMm) {
            const sh = new THREE.Shape();
            poly.outer.forEach((p, idx) => {
              const wx = (p.x - cxMm) * 0.001 * sx + oxM;
              const wy = (p.y - cyMm) * 0.001 * sy + oyM;
              if (idx === 0) sh.moveTo(wx, wy);
              else sh.lineTo(wx, wy);
            });
            sh.closePath();
            for (const h of poly.holes) {
              const hp = new THREE.Path();
              h.forEach((p, idx) => {
                const wx = (p.x - cxMm) * 0.001 * sx + oxM;
                const wy = (p.y - cyMm) * 0.001 * sy + oyM;
                if (idx === 0) hp.moveTo(wx, wy);
                else hp.lineTo(wx, wy);
              });
              hp.closePath();
              sh.holes.push(hp);
            }
            allShapesMForHalo.push(sh);
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
    }

    const sizeM = {
      w: Number.isFinite(minXM) ? Math.max(0.2, maxXM - minXM) : 1.6,
      h: Number.isFinite(minYM) ? Math.max(0.2, maxYM - minYM) : 0.4,
    };
    this.lastSizeM = sizeM;

    // Halo / wall illumination glow plane
    const lightOn = state.lighting?.enabled ?? true;
    const anyHalo = lightOn && state.objects.some(o => o.visible && ((o.lightingMode || state.lighting?.mode) === 'halo' || (o.lightingMode || state.lighting?.mode) === 'both'));
    const anyFront = lightOn && state.objects.some(o => o.visible && ((o.lightingMode || state.lighting?.mode) === 'front' || (o.lightingMode || state.lighting?.mode) === 'both'));

    if ((anyHalo || anyFront) && allShapesMForHalo.length && !transparentBg) {
      const boundsM = { minX: minXM, maxX: maxXM, minY: minYM, maxY: maxYM };
      const halo = createHaloTexture(allShapesMForHalo, boundsM, {
        wallDistanceMm: state.lighting?.wallDistanceMm ?? 35,
        haloSpread: state.lighting?.haloSpread ?? 1.0,
        falloff: state.lighting?.falloff ?? 1.0,
        letterHeightM: sizeM.h,
      });
      halo.texture._disposeOnClear = true;
      const glowHex = state.lighting?.colorHex || '#ffc982';
      const backInt = state.lighting?.backIntensity ?? 1.0;
      const frontInt = state.lighting?.frontIntensity ?? 1.0;
      const scalar = anyHalo
        ? (night ? 2.9 : 1.1) * backInt
        : (night ? 0.65 : 0.2) * frontInt;

      const haloMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(halo.widthM, halo.heightM),
        new THREE.MeshBasicMaterial({
          map: halo.texture,
          color: new THREE.Color(glowHex).multiplyScalar(scalar),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      haloMesh.position.set(halo.cxM, halo.cyM, 0.0015);
      haloMesh.renderOrder = 2;
      this.signGroup.add(haloMesh);
    }

    // Wall background mesh (hidden if transparent PNG export mode)
    this._clearGroup(this.wallGroup);
    if (!transparentBg) {
      const wallW = Math.max(16, sizeM.w * 3.5);
      const wallH = Math.max(10, sizeM.h * 5.0);
      const wt = getWallTextures(state.scene?.wallId || 'tugla', wallW, wallH);
      wt.map._disposeOnClear = true;
      wt.bumpMap._disposeOnClear = true;
      const wallMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(wallW, wallH),
        new THREE.MeshStandardMaterial({
          map: wt.map,
          bumpMap: wt.bumpMap,
          bumpScale: wt.bumpScale,
          roughness: wt.roughness,
        })
      );
      wallMesh.receiveShadow = true;
      this.wallGroup.add(wallMesh);
    }

    // Scene lighting
    this._clearGroup(this.lightsGroup);
    this.lightsGroup.add(buildSceneLights(night, sizeM));

    this._fitCamera(sizeM);

    return {
      sizeM,
      metricsList,
      warnings: [...new Set(warnings)],
    };
  }

  /**
   * Captures a high-resolution PNG (or transparent PNG with no wall).
   */
  capturePng(width = 2400, height = 1500) {
    const prevW = this.container.clientWidth;
    const prevH = this.container.clientHeight;
    const prevAspect = this.camera.aspect;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    // Restore
    this.camera.aspect = prevAspect;
    this.camera.updateProjectionMatrix();
    this._resize();
    return dataUrl;
  }

  _startLoop() {
    const tick = () => {
      if (this.isDisposed) return;
      requestAnimationFrame(tick);

      const o = this.orbit;
      o.azimuth += (o.targetAzimuth - o.azimuth) * 0.14;
      o.polar += (o.targetPolar - o.polar) * 0.14;
      o.radius += (o.targetRadius - o.radius) * 0.14;

      const x = o.target.x + o.radius * Math.sin(o.polar) * Math.sin(o.azimuth);
      const y = o.target.y + o.radius * Math.cos(o.polar);
      const z = o.target.z + o.radius * Math.sin(o.polar) * Math.cos(o.azimuth);

      this.camera.position.set(x, y, z);
      this.camera.lookAt(o.target);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }

  dispose() {
    this.isDisposed = true;
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    dom.removeEventListener('wheel', this._onWheel);
    dom.removeEventListener('contextmenu', this._onContextMenu);
    this._ro?.disconnect();
    this._clearGroup(this.signGroup);
    this._clearGroup(this.wallGroup);
    this._clearGroup(this.lightsGroup);
    this.envManager.dispose();
    this.renderer.dispose();
  }
}
