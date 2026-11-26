/**
 * Client Live 3D Share Link, URL-safe LZW Compression, WhatsApp Handoff & Timestamped Design Approval
 */

const APPROVALS_KEY = 'khs_client_approvals_v1';
const r1 = v => Math.round((Number(v) || 0) * 10) / 10;

function toBase64UrlBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64UrlBytes(token) {
  let b64 = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toBase64Url(str) {
  return toBase64UrlBytes(new TextEncoder().encode(str));
}

function fromBase64Url(token) {
  return new TextDecoder().decode(fromBase64UrlBytes(token));
}

// Self-contained URL-safe LZW compression over UTF-8 bytes so QR links remain compact & untruncated.
function compressShareString(str) {
  const utf8 = new TextEncoder().encode(str);
  const dict = new Map();
  for (let i = 0; i < 256; i++) dict.set(String.fromCharCode(i), i);
  let w = '';
  const codes = [];
  let nextCode = 256;
  for (let i = 0; i < utf8.length; i++) {
    const c = String.fromCharCode(utf8[i]);
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
    } else {
      codes.push(dict.get(w));
      if (nextCode < 4096) dict.set(wc, nextCode++);
      w = c;
    }
  }
  if (w !== '') codes.push(dict.get(w));

  // Pack 12-bit LZW codes into bytes (2 codes per 3 bytes)
  const out = [];
  for (let i = 0; i < codes.length; i += 2) {
    const a = codes[i];
    const b = i + 1 < codes.length ? codes[i + 1] : 0xfff;
    out.push((a >> 4) & 0xff, ((a & 0x0f) << 4) | ((b >> 8) & 0x0f), b & 0xff);
  }
  return toBase64UrlBytes(new Uint8Array(out));
}

function decompressShareString(b64Token) {
  const bytes = fromBase64UrlBytes(b64Token);
  const codes = [];
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const a = (bytes[i] << 4) | (bytes[i + 1] >> 4);
    const b = ((bytes[i + 1] & 0x0f) << 8) | bytes[i + 2];
    codes.push(a);
    if (b !== 0xfff) codes.push(b);
  }
  if (!codes.length) return '';
  const dict = new Map();
  for (let i = 0; i < 256; i++) dict.set(i, String.fromCharCode(i));
  let w = dict.get(codes[0]);
  const parts = [w];
  let nextCode = 256;
  for (let i = 1; i < codes.length; i++) {
    const k = codes[i];
    const entry = dict.has(k) ? dict.get(k) : (k === nextCode ? w + w[0] : '');
    if (!entry) throw new Error('Bozuk önizleme verisi');
    parts.push(entry);
    if (nextCode < 4096) dict.set(nextCode++, w + entry[0]);
    w = entry;
  }
  const joined = parts.join('');
  const out = new Uint8Array(joined.length);
  for (let i = 0; i < joined.length; i++) out[i] = joined.charCodeAt(i);
  return new TextDecoder().decode(out);
}

function decimateAndQuantizeRing(ring = [], maxPts = 56) {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const step = ring.length > maxPts ? Math.ceil(ring.length / maxPts) : 1;
  const flat = [];
  for (let i = 0; i < ring.length; i += step) {
    const pt = ring[i];
    if (!pt) continue;
    flat.push(r1(pt.x), r1(pt.y));
  }
  return flat.length >= 6 ? flat : [];
}

function extractCompactPolys(obj) {
  const srcPolys = obj.polygonsMm?.length
    ? obj.polygonsMm
    : (obj.logoData?.contours?.length
      ? obj.logoData.contours.map(c => ({
        outer: (c.outer || []).map(p => ({ x: p.x * (obj.heightMm || 400), y: p.y * (obj.heightMm || 400) })),
        holes: (c.holes || []).map(h => h.map(p => ({ x: p.x * (obj.heightMm || 400), y: p.y * (obj.heightMm || 400) }))),
      }))
      : null);
  if (!srcPolys?.length) return undefined;
  return srcPolys.slice(0, 24).map(p => [
    decimateAndQuantizeRing(p.outer),
    ...(p.holes || []).slice(0, 6).map(h => decimateAndQuantizeRing(h, 40)),
  ]).filter(arr => arr[0]?.length >= 6);
}

export function encodeClientShareState(state, costs = null) {
  const compact = {
    v: 2,
    p: state.projectName || 'Tabela Projesi',
    ct: state.constructionType || 'metal',
    sc: { night: state.scene?.night !== false, wallId: state.scene?.wallId || 'studioPremium' },
    lt: { enabled: state.lighting?.enabled !== false, mode: state.lighting?.mode || 'halo', colorHex: state.lighting?.colorHex || '#ffc982' },
    mt: { faceId: state.materials?.faceId, faceColor: state.materials?.faceColor, sideId: state.materials?.sideId, sideColor: state.materials?.sideColor },
    pr: costs ? { total: Math.round(costs.grandTotal || 0), cur: costs.currency || 'TRY' } : null,
    objs: (state.objects || []).slice(0, 12).map(o => {
      const item = {
        id: o.id, kind: o.kind, name: o.name, text: o.text, fontId: o.fontId,
        h: r1(o.heightMm || 400), d: r1(o.depthMm || 80),
        x: r1(o.xMm || 0), y: r1(o.yMm || 0), r: r1(o.rotationDeg || 0),
        ct: o.constructionType, fm: o.faceMaterial, fc: o.faceColor, lm: o.lightingMode,
      };
      if (o.widthMm) item.w = r1(o.widthMm);
      if (o.kind === 'logo' || o.kind === 'polygon') {
        const polys = extractCompactPolys(o);
        if (polys?.length) item.polys = polys;
      }
      return item;
    }),
  };
  const json = JSON.stringify(compact);
  const compressed = 'z2.' + compressShareString(json);
  const raw = toBase64Url(json);
  return compressed.length <= raw.length ? compressed : raw;
}

export function decodeClientShareState(token) {
  const rawToken = String(token || '').trim();
  const json = rawToken.startsWith('z2.')
    ? decompressShareString(rawToken.slice(3))
    : fromBase64Url(rawToken);
  const parsed = JSON.parse(json);
  if (!parsed || (parsed.v !== 1 && parsed.v !== 2)) throw new Error('Geçersiz müşteri önizleme bağlantısı.');
  if (Array.isArray(parsed.objs)) {
    parsed.objs = parsed.objs.map(o => {
      if (!o?.polys?.length) return o;
      const toRing = flat => {
        const out = [];
        for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
        return out;
      };
      return {
        ...o,
        polygonsMm: o.polys.map(rings => ({
          outer: toRing(rings[0] || []),
          holes: rings.slice(1).map(toRing).filter(r => r.length >= 3),
        })).filter(p => p.outer.length >= 3),
      };
    });
  }
  return parsed;
}

export function buildClientApprovalUrl(state, costs = null, baseHref = null) {
  const token = encodeClientShareState(state, costs);
  const base = baseHref || (typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : 'https://kutuharf.local/');
  return `${base}?clientPreview=${token}`;
}

export function buildWhatsAppShareUrl(approvalUrl, projectName = 'Tabela Tasarımı') {
  const msg = `Merhaba, "${projectName}" 3D tabela tasarımınızı inceleyip onaylamak için bağlantıya tıklayın:\n${approvalUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export function recordClientApproval(projectKey, approverName = 'Müşteri Yetkilisi', note = '') {
  const entry = {
    projectKey: String(projectKey || 'default'),
    approverName: String(approverName || 'Müşteri Yetkilisi').trim(),
    note: String(note || '').trim(),
    approvedAtIso: new Date().toISOString(),
    approvedAtLabel: new Date().toLocaleString('tr-TR'),
  };
  try {
    const all = JSON.parse(localStorage.getItem(APPROVALS_KEY) || '{}');
    all[entry.projectKey] = entry;
    localStorage.setItem(APPROVALS_KEY, JSON.stringify(all));
  } catch { /* ignore storage restrictions */ }
  return entry;
}

export function getClientApproval(projectKey) {
  try {
    const all = JSON.parse(localStorage.getItem(APPROVALS_KEY) || '{}');
    return all[String(projectKey || 'default')] || null;
  } catch {
    return null;
  }
}
