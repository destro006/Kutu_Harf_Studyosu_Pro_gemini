import THREE from '../vendor/three.js';
import { computeSignageDimensionData, renderDimensions2DOverlay } from './Dimensions3DOverlay.js';
import { createVideoAudioMuxer } from './VideoAudioEngine.js';

/**
 * Computes exact safe camera distance from a 3D Box3 size so both horizontal and vertical extents
 * remain 100% inside the target viewport (16:9 or 9:16) with at least 20% margin.
 */
export function computeFramedCameraDistance(boxSize = { w: 2, h: 0.45, d: 0.1 }, fovDeg = 32, aspect = 16 / 9, marginFactor = 1.22) {
  const w = Math.max(0.2, Number(boxSize.x ?? boxSize.w) || 2.0);
  const h = Math.max(0.15, Number(boxSize.y ?? boxSize.h) || 0.45);
  const d = Math.max(0.05, Number(boxSize.z ?? boxSize.d) || 0.1);
  const vFov = (Math.max(15, Math.min(75, Number(fovDeg) || 32)) * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * Math.max(0.25, aspect));
  const distV = ((h * 0.5) / Math.max(0.05, Math.tan(vFov * 0.5))) * marginFactor;
  const distH = ((w * 0.5) / Math.max(0.05, Math.tan(hFov * 0.5))) * marginFactor;
  return Math.max(0.9, Math.max(distV, distH) + d * 0.9);
}

export function computeSignGroupBox(signGroup, fallbackSizeM = { w: 2.0, h: 0.45 }) {
  if (signGroup) {
    const box = new THREE.Box3();
    signGroup.traverse?.(node => {
      if (node.isMesh && node.visible && !node.userData?.isHalo && !node.userData?.isFrontGlow) {
        box.expandByObject(node);
      }
    });
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      return {
        center: { x: center.x, y: center.y, z: center.z },
        size: { x: size.x, y: size.y, z: size.z },
      };
    }
  }
  return {
    center: { x: 0, y: 0, z: 0 },
    size: { x: fallbackSizeM?.w || 2.0, y: fallbackSizeM?.h || 0.45, z: 0.1 },
  };
}

/**
 * CapCut-Style Full-Screen 15-Scenario Studio Video Sequencer & Recorder
 * - 15 cinematic camera choreographies on smooth Catmull-Rom splines
 * - Exact wall-clock timing via performance.now()
 * - Multi-clip timeline sequencer with Cross-Dissolve, Dip-to-Black, Smooth Spline Blend, & Cut transitions
 * - Live Web Audio music track + custom MP3/WAV muxing via MediaStreamDestination
 * - Automatically hides selection boxes, gizmos, and page borders during export
 */
export const VIDEO_ROLES = [
  { id: 'luxury_arch', label: 'Lüks Mimari Süzülüş', desc: 'Geniş mimari açılış, akıcı süzülüş ve akşam geçişi', aspect: '16:9' },
  { id: 'night_led', label: 'Gece & LED Şovu', desc: 'Karanlık cephede parlak ön ve arkadan halo ışık şovu', aspect: '16:9' },
  { id: 'tech_dims', label: 'Teknik & Ölçülü Onay', desc: 'Önden net geçiş ile genişlik, yükseklik ve derinlik ölçüleri', aspect: '16:9' },
  { id: 'detail_closeup', label: 'Makro Pah & Metal Parıltısı', desc: 'Pah, fırça dokusu ve krom yansımalarda makro geçiş', aspect: '16:9' },
  { id: 'orbit_360', label: '360° Ürün Turu', desc: 'Tabela ekseni etrafında kesintisiz 360 derece ürün dönüşü', aspect: '16:9' },
  { id: 'reels_vertical', label: 'Sosyal Medya / Reels (9:16)', desc: 'Instagram / TikTok dikey formatında dinamik yakın çekim akışı', aspect: '9:16' },
  { id: 'drone_approach', label: 'Drone Cephe Yaklaşımı', desc: 'Yüksek açıdan mağaza cephesine alçalan sinematik yaklaşım', aspect: '16:9' },
  { id: 'hero_low_angle', label: 'Dramatik Alt Açı (Hero Low-Angle)', desc: 'Aşağıdan yukarı heybetli yükseliş ve kontrast sunum', aspect: '16:9' },
  { id: 'day_to_night_timelapse', label: 'Gündüzden Geceye Zaman Geçişi', desc: 'Gündüz doğal gölgesinden gece halo parlamasına akıcı geçiş', aspect: '16:9' },
  { id: 'dolly_track', label: 'Yatay Raylı Kamera (Dolly Track)', desc: 'Soldan sağa pürüzsüz raylı tarama ve harf derinliği', aspect: '16:9' },
  { id: 'halo_pulse', label: 'Halo Işık Nabız & Parlama', desc: 'Gece modunda kademeli arka halo ışık kreşendosu', aspect: '16:9' },
  { id: 'sidewall_depth', label: 'Derinlik & Yan Bant İncelemesi', desc: 'Yan profil 3D sac derinliği ve montaj yüzeyi vurgusu', aspect: '16:9' },
  { id: 'corner_perspective', label: 'Köşe Perspektif Sürüşü', desc: '45° cephe köşesinden tam ön hizaya sinematik dönüş', aspect: '16:9' },
  { id: 'commercial_cuts', label: 'Hızlı Ticari Reklam Kurgusu', desc: 'Çok açılı enerjik ticari vitrin ve marka finali', aspect: '16:9' },
  { id: 'studio_outro', label: 'Minimalist Stüdyo Kapanış', desc: 'Yavaş geriye çekilen dengeli prestij kapanışı', aspect: '16:9' },
];

export const VIDEO_TRANSITIONS = Object.freeze([
  { id: 'crossfade', label: 'Yumuşak Geçiş' },
  { id: 'dip_black', label: 'Kararma (Dip-to-Black)' },
  { id: 'spline_blend', label: 'Kesintisiz Kamera' },
  { id: 'cut', label: 'Ani Kesme' },
]);

export const DEFAULT_VIDEO_CLIPS = [
  { id: 'clip_1', role: 'detail_closeup', durationSec: 4, transition: 'crossfade' },
  { id: 'clip_2', role: 'night_led', durationSec: 5, transition: 'spline_blend' },
  { id: 'clip_3', role: 'tech_dims', durationSec: 4, transition: 'cut' },
];

export const CHOREOGRAPHY_STAGES = [
  { id: 'bevel_pan', label: 'Yakın Pah & Derinlik Taraması', start: 0.0, end: 0.25 },
  { id: 'orbital_sweep', label: 'Metalik Yansıma Yörünge Turu', start: 0.25, end: 0.55 },
  { id: 'day_to_night_reveal', label: 'Gündüzden Geceye LED Açılışı', start: 0.55, end: 0.80 },
  { id: 'hero_dimensions', label: 'Merkezi Sunum & Ölçü Gösterimi', start: 0.80, end: 1.0 },
];

function easeInOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function catmullRom(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * u +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * u3
  );
}

function sampleSplineTrack(keys, tNorm) {
  const t = Math.max(0, Math.min(1, tNorm));
  const segCount = keys.length - 1;
  const scaled = t * segCount;
  const idx = Math.min(segCount - 1, Math.floor(scaled));
  const u = scaled - idx;
  const k0 = keys[Math.max(0, idx - 1)];
  const k1 = keys[idx];
  const k2 = keys[Math.min(segCount, idx + 1)];
  const k3 = keys[Math.min(segCount, idx + 2)];
  return {
    azimuth: catmullRom(k0.az, k1.az, k2.az, k3.az, u),
    polar: catmullRom(k0.pol, k1.pol, k2.pol, k3.pol, u),
    radiusMult: catmullRom(k0.rad, k1.rad, k2.rad, k3.rad, u),
    targetOffsetX: catmullRom(k0.tx || 0, k1.tx || 0, k2.tx || 0, k3.tx || 0, u),
    targetOffsetY: catmullRom(k0.ty || 0, k1.ty || 0, k2.ty || 0, k3.ty || 0, u),
  };
}

const ROLE_TRACKS = {
  luxury_arch: [
    { az: -0.90, pol: 1.54, rad: 0.62, tx: -0.22 },
    { az: -0.45, pol: 1.46, rad: 0.72, tx: 0.14 },
    { az: 0.66, pol: 1.48, rad: 0.96, tx: 0.04 },
    { az: 0.30, pol: 1.49, rad: 1.03, tx: 0 },
    { az: 0.12, pol: 1.51, rad: 1.08, tx: 0 },
  ],
  night_led: [
    { az: -0.68, pol: 1.52, rad: 0.74, tx: -0.18 },
    { az: -0.15, pol: 1.44, rad: 0.85, tx: 0.08 },
    { az: 0.55, pol: 1.49, rad: 0.98, tx: 0 },
    { az: 0.18, pol: 1.52, rad: 1.04, tx: 0 },
    { az: 0.0, pol: 1.54, rad: 1.06, tx: 0 },
  ],
  tech_dims: [
    { az: -0.52, pol: 1.42, rad: 0.95, tx: -0.05 },
    { az: -0.18, pol: 1.50, rad: 1.02, tx: 0 },
    { az: 0.14, pol: 1.53, rad: 1.08, tx: 0 },
    { az: 0.0, pol: 1.57, rad: 1.12, tx: 0 },
  ],
  detail_closeup: [
    { az: -1.05, pol: 1.56, rad: 0.50, tx: -0.26, ty: -0.04 },
    { az: -0.55, pol: 1.44, rad: 0.54, tx: -0.05, ty: 0.03 },
    { az: 0.25, pol: 1.46, rad: 0.58, tx: 0.18, ty: -0.02 },
    { az: 0.75, pol: 1.50, rad: 0.68, tx: 0.08, ty: 0.02 },
    { az: 0.22, pol: 1.49, rad: 0.96, tx: 0, ty: 0 },
  ],
  orbit_360: [
    { az: 0.0, pol: 1.50, rad: 1.02 },
    { az: 1.57, pol: 1.45, rad: 1.08 },
    { az: 3.14, pol: 1.48, rad: 1.12 },
    { az: 4.71, pol: 1.45, rad: 1.08 },
    { az: 6.28, pol: 1.50, rad: 1.02 },
  ],
  reels_vertical: [
    { az: -0.78, pol: 1.55, rad: 0.68, tx: -0.18 },
    { az: -0.20, pol: 1.45, rad: 0.78, tx: 0.08 },
    { az: 0.42, pol: 1.49, rad: 0.92, tx: -0.04 },
    { az: 0.10, pol: 1.52, rad: 1.14, tx: 0 },
  ],
  drone_approach: [
    { az: -0.35, pol: 1.08, rad: 1.75, tx: -0.10, ty: 0.20 },
    { az: -0.18, pol: 1.24, rad: 1.38, tx: 0.04, ty: 0.10 },
    { az: 0.12, pol: 1.44, rad: 1.08, tx: 0.0, ty: 0.02 },
    { az: 0.0, pol: 1.54, rad: 0.98, tx: 0.0, ty: 0.0 },
  ],
  hero_low_angle: [
    { az: -0.58, pol: 1.82, rad: 0.92, tx: -0.12, ty: -0.08 },
    { az: -0.22, pol: 1.78, rad: 0.84, tx: 0.0, ty: -0.04 },
    { az: 0.24, pol: 1.72, rad: 0.88, tx: 0.06, ty: -0.02 },
    { az: 0.08, pol: 1.62, rad: 1.02, tx: 0.0, ty: 0.0 },
  ],
  day_to_night_timelapse: [
    { az: -0.62, pol: 1.45, rad: 1.10, tx: -0.08 },
    { az: -0.20, pol: 1.48, rad: 1.04, tx: 0.0 },
    { az: 0.25, pol: 1.50, rad: 1.02, tx: 0.04 },
    { az: 0.0, pol: 1.53, rad: 1.06, tx: 0.0 },
  ],
  dolly_track: [
    { az: -0.38, pol: 1.54, rad: 0.86, tx: -0.34, ty: 0.0 },
    { az: -0.12, pol: 1.53, rad: 0.86, tx: -0.10, ty: 0.0 },
    { az: 0.12, pol: 1.53, rad: 0.86, tx: 0.14, ty: 0.0 },
    { az: 0.34, pol: 1.54, rad: 0.92, tx: 0.30, ty: 0.0 },
  ],
  halo_pulse: [
    { az: -0.35, pol: 1.54, rad: 0.90, tx: 0.0 },
    { az: 0.0, pol: 1.56, rad: 0.82, tx: 0.0 },
    { az: 0.32, pol: 1.54, rad: 0.92, tx: 0.0 },
    { az: 0.0, pol: 1.55, rad: 1.04, tx: 0.0 },
  ],
  sidewall_depth: [
    { az: -1.18, pol: 1.54, rad: 0.72, tx: -0.12 },
    { az: -0.92, pol: 1.48, rad: 0.70, tx: 0.0 },
    { az: 0.92, pol: 1.48, rad: 0.70, tx: 0.0 },
    { az: 1.18, pol: 1.54, rad: 0.76, tx: 0.10 },
  ],
  corner_perspective: [
    { az: 0.88, pol: 1.46, rad: 0.88, tx: 0.16 },
    { az: 0.56, pol: 1.48, rad: 0.92, tx: 0.08 },
    { az: 0.24, pol: 1.52, rad: 0.98, tx: 0.02 },
    { az: 0.0, pol: 1.56, rad: 1.06, tx: 0.0 },
  ],
  commercial_cuts: [
    { az: -0.82, pol: 1.42, rad: 0.66, tx: -0.22 },
    { az: 0.64, pol: 1.62, rad: 0.74, tx: 0.18 },
    { az: -0.28, pol: 1.46, rad: 0.82, tx: -0.06 },
    { az: 0.0, pol: 1.55, rad: 1.02, tx: 0.0 },
  ],
  studio_outro: [
    { az: 0.24, pol: 1.50, rad: 0.76, tx: 0.0 },
    { az: 0.14, pol: 1.52, rad: 0.94, tx: 0.0 },
    { az: 0.06, pol: 1.54, rad: 1.15, tx: 0.0 },
    { az: 0.0, pol: 1.56, rad: 1.32, tx: 0.0 },
  ],
};

export function sampleChoreographyKeyframe(tNorm, options = {}) {
  const t = Math.max(0, Math.min(1, Number(tNorm) || 0));
  const showDimensions = options.showDimensions !== false;
  const role = options.role || 'luxury_arch';
  const track = ROLE_TRACKS[role] || ROLE_TRACKS.luxury_arch;
  const easedT = easeInOutCubic(t) * 0.65 + t * 0.35;
  const pos = sampleSplineTrack(track, easedT);
  const stage = CHOREOGRAPHY_STAGES.find(s => t >= s.start && t <= s.end) || CHOREOGRAPHY_STAGES[3];

  let night = true;
  let lightingEnabled = true;
  let dimsOpacity = 0;

  if (role === 'night_led' || role === 'halo_pulse') {
    night = true;
    lightingEnabled = t >= 0.08;
    dimsOpacity = showDimensions && t >= 0.75 ? Math.min(1, (t - 0.75) / 0.18) : 0;
  } else if (role === 'tech_dims') {
    night = false;
    lightingEnabled = false;
    dimsOpacity = showDimensions ? Math.min(1, t * 2.4) : 0;
  } else if (role === 'day_to_night_timelapse') {
    night = t >= 0.45;
    lightingEnabled = t >= 0.42;
    dimsOpacity = showDimensions && t >= 0.82 ? Math.min(1, (t - 0.82) / 0.15) : 0;
  } else if (role === 'studio_outro') {
    night = true;
    lightingEnabled = true;
    dimsOpacity = showDimensions ? Math.max(0, 1 - t * 1.4) : 0;
  } else {
    const switchAt = role === 'detail_closeup' ? 0.65 : 0.62;
    night = t >= switchAt;
    lightingEnabled = t >= switchAt;
    dimsOpacity = showDimensions && t >= 0.80 ? Math.min(1, (t - 0.80) / 0.14) : 0;
  }

  return {
    stage,
    role,
    azimuth: pos.azimuth,
    polar: pos.polar,
    radiusMult: pos.radiusMult,
    targetOffsetX: pos.targetOffsetX,
    targetOffsetY: pos.targetOffsetY,
    night,
    lightingEnabled,
    dimsOpacity,
  };
}

export function normalizeTransition(val) {
  if (val === 'cut') return 'cut';
  if (val === 'dip_black') return 'dip_black';
  if (val === 'spline_blend') return 'spline_blend';
  return 'crossfade';
}

export function computeSequenceTimeline(clips = []) {
  const list = Array.isArray(clips) && clips.length ? clips : DEFAULT_VIDEO_CLIPS;
  let cursor = 0;
  const segments = list.map((c, index) => {
    const dur = Math.max(2, Math.min(30, Number(c?.durationSec) || 4));
    const roleMeta = VIDEO_ROLES.find(r => r.id === c?.role) || VIDEO_ROLES[0];
    const seg = {
      id: c?.id || `clip_${index + 1}`,
      index,
      role: roleMeta.id,
      roleLabel: roleMeta.label,
      durationSec: dur,
      transition: normalizeTransition(c?.transition),
      startSec: cursor,
      endSec: cursor + dur,
    };
    cursor += dur;
    return seg;
  });
  return { totalDurationSec: cursor, segments };
}

export function sampleSequenceKeyframe(elapsedSec, timeline, options = {}) {
  const segs = timeline?.segments || [];
  if (!segs.length) return { ...sampleChoreographyKeyframe(0, options), clipIndex: 0, clipLabel: 'Klip 1', crossFadeAlpha: 1, dipBlackAlpha: 0 };
  const clamped = Math.max(0, Math.min(timeline.totalDurationSec, Number(elapsedSec) || 0));
  const seg = segs.find(s => clamped <= s.endSec) || segs[segs.length - 1];
  const localElapsed = clamped - seg.startSec;
  const localNorm = Math.max(0, Math.min(1, localElapsed / Math.max(0.1, seg.durationSec)));
  let kf = sampleChoreographyKeyframe(localNorm, { role: seg.role, showDimensions: options.showDimensions });
  const prevSeg = seg.index > 0 ? segs[seg.index - 1] : null;
  const nextSeg = seg.index < segs.length - 1 ? segs[seg.index + 1] : null;
  const transMode = prevSeg ? prevSeg.transition : 'cut';

  let crossFadeAlpha = 1;
  let dipBlackAlpha = 0;

  if (prevSeg && transMode === 'crossfade') {
    const fadeDur = 0.55;
    if (localElapsed < fadeDur) crossFadeAlpha = easeInOutCubic(localElapsed / fadeDur);
  } else if (prevSeg && transMode === 'spline_blend') {
    const blendDur = 0.60;
    if (localElapsed < blendDur) {
      const prevEnd = sampleChoreographyKeyframe(1.0, { role: prevSeg.role, showDimensions: options.showDimensions });
      const b = easeInOutCubic(localElapsed / blendDur);
      const lerp = (a, c) => a + (c - a) * b;
      kf = {
        ...kf,
        azimuth: lerp(prevEnd.azimuth, kf.azimuth),
        polar: lerp(prevEnd.polar, kf.polar),
        radiusMult: lerp(prevEnd.radiusMult, kf.radiusMult),
        targetOffsetX: lerp(prevEnd.targetOffsetX, kf.targetOffsetX),
        targetOffsetY: lerp(prevEnd.targetOffsetY, kf.targetOffsetY),
      };
    }
  } else if (prevSeg && transMode === 'dip_black') {
    if (localElapsed < 0.35) dipBlackAlpha = Math.max(0, 1 - easeInOutCubic(localElapsed / 0.35));
  }

  if (nextSeg && seg.transition === 'dip_black') {
    const rem = seg.endSec - clamped;
    if (rem < 0.35) dipBlackAlpha = Math.max(dipBlackAlpha, 1 - easeInOutCubic(rem / 0.35));
  }

  return {
    ...kf,
    clipIndex: seg.index,
    clipLabel: `${seg.index + 1}/${segs.length}: ${seg.roleLabel}`,
    clipRole: seg.role,
    transition: seg.transition,
    crossFadeAlpha,
    dipBlackAlpha,
  };
}

export function pickSupportedVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: '', ext: 'webm' };
}

export async function recordPresentationVideo({
  signEngine,
  state,
  fontMap,
  metrics,
  clips = null,
  width = 1280,
  height = 720,
  durationSec = 8,
  fps = 60,
  role = 'luxury_arch',
  showDimensions = true,
  audioConfig = null,
  onProgress = () => {},
  signal = null,
}) {
  if (!signEngine || signEngine.isDisposed || !signEngine.renderer) {
    throw new Error('Video kaydı için 3D WebGL görünümü açık olmalıdır.');
  }
  const picked = pickSupportedVideoMimeType();
  if (!picked) {
    throw new Error('Tarayıcı MediaRecorder video kaydını desteklemiyor.');
  }

  const timeline = computeSequenceTimeline(
    Array.isArray(clips) && clips.length ? clips : [{ id: 'single', role, durationSec, transition: 'cut' }]
  );

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext('2d');

  const prevClipCanvas = document.createElement('canvas');
  prevClipCanvas.width = width;
  prevClipCanvas.height = height;
  const prevClipCtx = prevClipCanvas.getContext('2d');

  const targetFps = Math.max(24, Math.min(60, Number(fps) || 60));
  const bitrate = (width >= 1920 || height >= 1920) ? 15_000_000 : 12_000_000;
  const videoStream = outCanvas.captureStream(targetFps);

  const audioMuxer = audioConfig && (audioConfig.trackId !== 'none' || audioConfig.customAudioBuffer)
    ? await createVideoAudioMuxer({ ...audioConfig, durationSec: timeline.totalDurationSec }).catch(() => null)
    : null;
  const combinedTracks = [
    ...videoStream.getVideoTracks(),
    ...(audioMuxer?.audioTracks || []),
  ];
  const stream = typeof MediaStream !== 'undefined' ? new MediaStream(combinedTracks) : videoStream;

  let recorder;
  try {
    recorder = picked.mimeType
      ? new MediaRecorder(stream, { mimeType: picked.mimeType, videoBitsPerSecond: bitrate })
      : new MediaRecorder(stream, { videoBitsPerSecond: bitrate });
  } catch {
    recorder = picked.mimeType
      ? new MediaRecorder(videoStream, { mimeType: picked.mimeType, videoBitsPerSecond: bitrate })
      : new MediaRecorder(videoStream, { videoBitsPerSecond: bitrate });
  }
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
  const stoppedPromise = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = e => reject(e?.error || new Error('Video kaydı başarısız.'));
  });

  const origOrbit = {
    az: signEngine.orbit.azimuth,
    pol: signEngine.orbit.polar,
    rad: signEngine.orbit.radius,
    taz: signEngine.orbit.targetAzimuth,
    tpol: signEngine.orbit.targetPolar,
    trad: signEngine.orbit.targetRadius,
    target: signEngine.orbit.target.clone(),
  };
  const origNight = state.scene?.night ?? true;
  const origLit = state.lighting?.enabled ?? true;
  const prevPaused = signEngine._paused;
  const origSelectionVis = signEngine.selectionGroup ? signEngine.selectionGroup.visible : true;
  const origPageVis = signEngine.pageGroup ? signEngine.pageGroup.visible : true;
  const hudEl = typeof document !== 'undefined' ? document.getElementById('canvasTransformHud') : null;
  const origHudHidden = hudEl ? hudEl.classList.contains('hidden') : true;

  const hideStudioSelectionHelpers = () => {
    if (signEngine.selectionGroup) signEngine.selectionGroup.visible = false;
    if (signEngine.pageGroup) signEngine.pageGroup.visible = false;
    if (hudEl) hudEl.classList.add('hidden');
  };

  const applySceneLightingState = (night, lit) => {
    const tempState = {
      ...state,
      scene: { ...state.scene, night },
      lighting: { ...state.lighting, enabled: lit },
    };
    signEngine.updateScene(tempState, fontMap);
    hideStudioSelectionHelpers();
  };

  let curNight = null;
  let curLit = null;

  try {
    signEngine.setActive(false);
    hideStudioSelectionHelpers();
    const recDpr = Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2);
    signEngine.renderer.setPixelRatio(recDpr);
    signEngine.renderer.setSize(width, height, false);
    signEngine.postProcessor?.setSize(Math.round(width * recDpr), Math.round(height * recDpr));
    signEngine.camera.aspect = width / height;
    signEngine.camera.updateProjectionMatrix();

    const baseRadius = signEngine.orbit.fitRadius || signEngine.orbit.radius || 3.5;
    const totalMs = Math.max(2000, timeline.totalDurationSec * 1000);
    const frameIntervalMs = 1000 / targetFps;
    recorder.start(250);

    const startTime = performance.now();
    let frameIndex = 0;
    let lastClipIdx = 0;

    while (true) {
      if (signal?.aborted) throw new DOMException('Video kaydı iptal edildi.', 'AbortError');
      const now = performance.now();
      const elapsedMs = now - startTime;
      const elapsedSec = Math.min(elapsedMs / 1000, timeline.totalDurationSec);
      const progress = Math.min(elapsedMs / totalMs, 1);
      const kf = sampleSequenceKeyframe(elapsedSec, timeline, { showDimensions });

      if (kf.clipIndex !== lastClipIdx) {
        prevClipCtx.clearRect(0, 0, width, height);
        prevClipCtx.drawImage(outCanvas, 0, 0, width, height);
        lastClipIdx = kf.clipIndex;
      }

      if (kf.night !== curNight || kf.lightingEnabled !== curLit) {
        curNight = kf.night;
        curLit = kf.lightingEnabled;
        applySceneLightingState(curNight, curLit);
      }
      hideStudioSelectionHelpers();

      const signBox = computeSignGroupBox(signEngine.signGroup, signEngine.lastSizeM);
      const safeDist = computeFramedCameraDistance(signBox.size, signEngine.camera.fov, width / Math.max(1, height), 1.22);
      const r = Math.max(safeDist * 0.92, safeDist * kf.radiusMult);
      const maxTx = signBox.size.x * 0.14;
      const tx = Math.max(-maxTx, Math.min(maxTx, kf.targetOffsetX * signBox.size.x * 0.35));
      const ty = kf.targetOffsetY;
      signEngine.camera.position.set(
        signBox.center.x + tx + r * Math.sin(kf.polar) * Math.sin(kf.azimuth),
        signBox.center.y + ty + r * Math.cos(kf.polar),
        signBox.center.z + r * Math.sin(kf.polar) * Math.cos(kf.azimuth)
      );
      signEngine.camera.lookAt(signBox.center.x + tx, signBox.center.y + ty, signBox.center.z);
      signEngine.renderer.shadowMap.needsUpdate = true;

      if (signEngine.postProcessor) signEngine.postProcessor.render(signEngine.scene, signEngine.camera);
      else signEngine.renderer.render(signEngine.scene, signEngine.camera);

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(signEngine.renderer.domElement, 0, 0, width, height);

      if (kf.crossFadeAlpha < 0.99 && kf.clipIndex > 0) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - kf.crossFadeAlpha);
        ctx.drawImage(prevClipCanvas, 0, 0, width, height);
        ctx.restore();
      }

      if (kf.dipBlackAlpha > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, kf.dipBlackAlpha).toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      if (kf.dimsOpacity > 0.01) {
        const dimData = computeSignageDimensionData(signEngine, state, metrics);
        renderDimensions2DOverlay(ctx, width, height, signEngine.camera, dimData, {
          opacity: kf.dimsOpacity,
          showDepth: true,
        });
      }

      onProgress({ percent: Math.round(progress * 100), stageLabel: `${kf.clipLabel} · ${kf.stage.label}` });
      if (progress >= 1) break;

      frameIndex++;
      const targetNextMs = frameIndex * frameIntervalMs;
      const waitMs = Math.max(4, Math.min(50, targetNextMs - (performance.now() - startTime)));
      await new Promise(res => setTimeout(res, waitMs));
    }

    recorder.stop();
    await stoppedPromise;
    const blob = new Blob(chunks, { type: picked.mimeType || 'video/webm' });
    return {
      blob,
      mimeType: blob.type || picked.mimeType || 'video/webm',
      ext: picked.ext,
      url: URL.createObjectURL(blob),
    };
  } finally {
    try { if (recorder.state !== 'inactive') recorder.stop(); } catch {}
    await audioMuxer?.dispose?.();
    if (signEngine.selectionGroup) signEngine.selectionGroup.visible = origSelectionVis;
    if (signEngine.pageGroup) signEngine.pageGroup.visible = origPageVis;
    if (hudEl && !origHudHidden) hudEl.classList.remove('hidden');
    signEngine.orbit.azimuth = origOrbit.az;
    signEngine.orbit.polar = origOrbit.pol;
    signEngine.orbit.radius = origOrbit.rad;
    signEngine.orbit.targetAzimuth = origOrbit.taz;
    signEngine.orbit.targetPolar = origOrbit.tpol;
    signEngine.orbit.targetRadius = origOrbit.trad;
    signEngine.orbit.target.copy(origOrbit.target);
    applySceneLightingState(origNight, origLit);
    signEngine._resize(true);
    if (!prevPaused) signEngine.setActive(true);
  }
}
