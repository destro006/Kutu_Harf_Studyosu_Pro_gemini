/**
 * Client Live 3D Share Link, WhatsApp Handoff & Timestamped Design Approval
 */

const APPROVALS_KEY = 'khs_client_approvals_v1';

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(token) {
  let b64 = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeClientShareState(state, costs = null) {
  const compact = {
    v: 1,
    p: state.projectName || 'Tabela Projesi',
    ct: state.constructionType || 'metal',
    sc: { night: state.scene?.night !== false, wallId: state.scene?.wallId || 'studioPremium' },
    lt: { enabled: state.lighting?.enabled !== false, mode: state.lighting?.mode || 'halo', colorHex: state.lighting?.colorHex || '#ffc982' },
    mt: { faceId: state.materials?.faceId, faceColor: state.materials?.faceColor, sideId: state.materials?.sideId, sideColor: state.materials?.sideColor },
    pr: costs ? { total: Math.round(costs.grandTotal || 0), cur: costs.currency || 'TRY' } : null,
    objs: (state.objects || []).slice(0, 12).map(o => ({
      id: o.id, kind: o.kind, name: o.name, text: o.text, fontId: o.fontId,
      h: o.heightMm, d: o.depthMm, x: o.xMm, y: o.yMm, r: o.rotationDeg,
      ct: o.constructionType, fm: o.faceMaterial, fc: o.faceColor, lm: o.lightingMode,
    })),
  };
  return toBase64Url(JSON.stringify(compact));
}

export function decodeClientShareState(token) {
  const parsed = JSON.parse(fromBase64Url(token));
  if (!parsed || parsed.v !== 1) throw new Error('Geçersiz müşteri önizleme bağlantısı.');
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
