/**
 * Economical Signage-Specific AI Render Engine
 * Step 1: Expands user brief into a geometry-locked technical Master Prompt.
 * Step 2: Uses free Three.js perspective/composite alignment first, invoking image-to-image API
 *         (or instant local photorealistic blending fallback) only for final lighting/blending.
 */

const AI_CONFIG_KEY = 'khs_ai_config_v1';

export function loadAiConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || 'null');
    return {
      provider: raw?.provider === 'openai' ? 'openai' : 'gemini',
      apiKey: String(raw?.apiKey || ''),
      textModel: String(raw?.textModel || (raw?.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.0-flash')),
      imageModel: String(raw?.imageModel || (raw?.provider === 'openai' ? 'gpt-image-1' : 'gemini-2.0-flash-exp-image-generation')),
    };
  } catch {
    return { provider: 'gemini', apiKey: '', textModel: 'gemini-2.0-flash', imageModel: 'gemini-2.0-flash-exp-image-generation' };
  }
}

export function saveAiConfig(cfg) {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify({
      provider: cfg?.provider === 'openai' ? 'openai' : 'gemini',
      apiKey: String(cfg?.apiKey || '').trim(),
      textModel: String(cfg?.textModel || '').trim(),
      imageModel: String(cfg?.imageModel || '').trim(),
    }));
  } catch { /* ignore storage errors */ }
}

export function buildSignageMasterPrompt(userBrief, sceneContext = {}) {
  const brief = String(userBrief || '').trim() || 'Gerçekçi cephe montajı, doğal ışık ve gölgelerle fotorealistik sunum.';
  const objs = Array.isArray(sceneContext.objects) ? sceneContext.objects : [];
  const names = objs.map(o => o.text || o.name || 'Tabela').filter(Boolean).slice(0, 4).join(', ') || '3D Kutu Harf Tabela';
  const cType = sceneContext.constructionType || 'metal';
  const faceMat = sceneContext.faceMaterial || 'aynaAltin';
  const sideMat = sceneContext.sideMaterial || faceMat;
  const night = sceneContext.night !== false;
  const lightMode = sceneContext.lightingMode || 'halo';
  const lightColor = sceneContext.lightColor || '#ffc982';
  const widthMm = Math.round(sceneContext.widthMm || 1500);
  const heightMm = Math.round(sceneContext.heightMm || 400);
  const depthMm = Math.round(sceneContext.depthMm || 80);

  const modeLabel = lightMode === 'front' ? 'Önden LED Aydınlatmalı Pleksi'
    : lightMode === 'halo' ? 'Arkadan Duvar Vurgulu (Halo) LED'
    : lightMode === 'both' ? 'Ön + Arka Çift Yönlü LED'
    : 'Işıksız Doğal Metal';

  return [
    `[SİSTEM KİLİDİ — GEOMETRİ KORUMA]: Bu görseldeki "${names}" 3D kutu harf tabelanın ORİJİNAL LOGO GEOMETRİSİ, TİPOGRAFİSİ, HARF ORANLARI, KONUMU VE ${depthMm} mm DERİNLİĞİ KESİNLİKLE DEĞİŞTİRİLMEMELİDİR. Yeni harf ekleme veya şekli bozma yapma.`,
    `[TEKNİK ÖZELLİKLER]: Yapı: ${cType}, Ön Yüz: ${faceMat}, Yanak: ${sideMat}, Ölçü: ${widthMm}×${heightMm}×${depthMm} mm, Aydınlatma: ${modeLabel} (${lightColor}), Ortam: ${night ? 'Gece / Akşam Mimari Aydınlatma' : 'Gündüz Doğal Gün Işığı'}.`,
    `[MÜŞTERİ TALEBİ]: ${brief}`,
    `[FOTOREALİSTİK İŞLEME]: Three.js ile perspektife oturtulmuş kutu harfleri cephe malzemesiyle bütünleştir; fiziksel temas gölgeleri, duvar dokusuna göre doğal ortam rengi yansımaları, gerçekçi metalik/akrilik specular parlamalar ve temiz mimari fotoğraf kalitesi uygula.`,
  ].join('\n\n');
}

export async function refineMasterPromptWithLlm(draftPrompt, userBrief, config = loadAiConfig()) {
  if (!config?.apiKey) return { prompt: draftPrompt, source: 'local' };
  const sys = 'Sen profesyonel 3D kutu harf tabela görselleştirme uzmanısın. Kullanıcının kısa isteğini, verilen taslak Master Prompt yapısını ve geometri kilidi kuralını koruyarak tek paragraflık net bir Türkçe teknik render talimatına geliştir.';
  try {
    if (config.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.textModel || 'gpt-4o-mini',
          temperature: 0.3,
          max_tokens: 350,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: `Kısa Talep: ${userBrief}\n\nTaslak:\n${draftPrompt}` },
          ],
        }),
      });
      if (!res.ok) throw Error(`API ${res.status}`);
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content?.trim();
      if (text) return { prompt: text, source: 'api' };
    } else {
      const model = encodeURIComponent(config.textModel || 'gemini-2.0-flash');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: `Kısa Talep: ${userBrief}\n\nTaslak:\n${draftPrompt}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 350 },
        }),
      });
      if (!res.ok) throw Error(`API ${res.status}`);
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return { prompt: text, source: 'api' };
    }
  } catch {
    /* Fall back cleanly to deterministic Master Prompt */
  }
  return { prompt: draftPrompt, source: 'local' };
}

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
}

/**
 * Parses natural Turkish AI Studio commands cleanly without requiring a cloud LLM.
 */
export function parseLocalTurkishSignageIntent(brief = '') {
  const q = String(brief || '').toLocaleLowerCase('tr-TR');
  const shouldPlaceOnFascia = /yerleştir|mekan|cephe|tak|koy|alınlı[kğ]|tabela|vitrin|ekli/i.test(q) || !q.trim();
  const isNight = /gece|akşam|loş|karanlık|night|yağmur/i.test(q);
  const isDay = /gündüz|güneş|sabah|day/i.test(q) && !isNight;
  const night = isNight ? true : (isDay ? false : null);

  let lightingMode = null;
  if (/halo|arkadan/i.test(q)) lightingMode = 'halo';
  else if (/çift\s*yön|hem\s*ön/i.test(q)) lightingMode = 'both';
  else if (/ön\s*ışık|pleksi\s*ışık|front/i.test(q)) lightingMode = 'front';
  else if (/ışıksız/i.test(q)) lightingMode = 'none';

  let faceMaterial = null;
  if (/altın|gold|pirinç/i.test(q)) faceMaterial = 'aynaAltin';
  else if (/krom|gümüş|inox|paslanmaz/i.test(q)) faceMaterial = 'aynaKrom';
  else if (/siyah|black|antrasit/i.test(q)) faceMaterial = 'matSiyah';

  const rainy = /yağmur|ıslak|yansıma/i.test(q);
  const warm = /sıcak|gün\s*ışığı|altın|3000k|warm/i.test(q);

  return { shouldPlaceOnFascia, night, lightingMode, faceMaterial, rainy, warm };
}

/**
 * Scans the upper storefront zone (y: 12%..42%) of an uploaded photo RGBA buffer
 * to find the cleanest architectural signage fascia band instead of pasting in dead center.
 */
export function detectUpperFasciaBand(rgba, width, height) {
  const defaultQuad = [
    { x: 0.21, y: 0.18 },
    { x: 0.79, y: 0.18 },
    { x: 0.79, y: 0.34 },
    { x: 0.21, y: 0.34 },
  ];
  if (!rgba || !width || !height) return defaultQuad;

  const x0 = Math.floor(width * 0.16);
  const x1 = Math.floor(width * 0.84);
  const bandH = Math.max(8, Math.floor(height * 0.14));
  const yStartMin = Math.floor(height * 0.12);
  const yStartMax = Math.floor(height * 0.30);

  let bestY = Math.floor(height * 0.18);
  let bestScore = Infinity;

  for (let yTop = yStartMin; yTop <= yStartMax; yTop += Math.max(2, Math.floor(height * 0.015))) {
    let sum = 0;
    let sumSq = 0;
    let gradSum = 0;
    let count = 0;
    for (let y = yTop; y < Math.min(height - 1, yTop + bandH); y += 2) {
      for (let x = x0; x < Math.min(width - 2, x1); x += 3) {
        const i = (y * width + x) * 4;
        const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
        const lumR = 0.299 * rgba[i + 4] + 0.587 * rgba[i + 5] + 0.114 * rgba[i + 6];
        sum += lum;
        sumSq += lum * lum;
        gradSum += Math.abs(lum - lumR);
        count++;
      }
    }
    if (!count) continue;
    const mean = sum / count;
    const std = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
    const avgGrad = gradSum / count;
    // Prefer smooth flat fascia bands without extreme blown highlights or pitch black
    const extremePenalty = (mean < 18 || mean > 245) ? 18 : 0;
    const score = std + avgGrad * 1.6 + extremePenalty;
    if (score < bestScore) {
      bestScore = score;
      bestY = yTop;
    }
  }

  const yNorm0 = Math.max(0.10, Math.min(0.32, bestY / height));
  const yNorm1 = Math.min(0.44, yNorm0 + 0.155);
  return [
    { x: 0.21, y: Number(yNorm0.toFixed(3)) },
    { x: 0.79, y: Number(yNorm0.toFixed(3)) },
    { x: 0.79, y: Number(yNorm1.toFixed(3)) },
    { x: 0.21, y: Number(yNorm1.toFixed(3)) },
  ];
}

/**
 * Local zero-cost photorealistic atmospheric lighting, specular & shadow pass on the Three.js composite.
 */
async function localPhotorealisticPass(compositeDataUrl, masterPrompt) {
  const img = await loadImg(compositeDataUrl);
  const w = img.naturalWidth || 1280;
  const h = img.naturalHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const intent = parseLocalTurkishSignageIntent(masterPrompt);
  const isNight = intent.night !== null ? intent.night : /gece|akşam|loş|night|halo/i.test(masterPrompt);
  const isWarm = intent.warm || /3000k|4000k|altın/i.test(masterPrompt);

  ctx.drawImage(img, 0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = isNight ? 'multiply' : 'soft-light';
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.34, w * 0.12, w * 0.5, h * 0.45, w * 0.74);
  if (isNight) {
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(110,124,150,0.65)');
  } else {
    grad.addColorStop(0, 'rgba(255,250,242,0.22)');
    grad.addColorStop(1, 'rgba(180,190,205,0.18)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  if (intent.rainy) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const wetGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
    wetGrad.addColorStop(0, 'rgba(255,205,130,0)');
    wetGrad.addColorStop(1, 'rgba(255,205,130,0.18)');
    ctx.fillStyle = wetGrad;
    ctx.fillRect(0, h * 0.65, w, h * 0.35);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = isNight ? 0.16 : 0.06;
  ctx.fillStyle = isWarm ? '#ffbe73' : '#cfe3ff';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

export async function runHybridSignageRender({ compositeDataUrl, masterPrompt, config = loadAiConfig() }) {
  if (!compositeDataUrl) throw new Error('Önce cephe ve 3D sahne birleşimi oluşturulmalıdır.');
  if (config?.apiKey && config.provider === 'gemini') {
    try {
      const base64 = compositeDataUrl.split(',')[1];
      const mimeType = compositeDataUrl.match(/^data:([^;]+);/)?.[1] || 'image/png';
      const model = encodeURIComponent(config.imageModel || 'gemini-2.0-flash-exp-image-generation');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: masterPrompt },
              { inlineData: { mimeType, data: base64 } },
            ],
          }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const imgPart = json?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
        if (imgPart?.inlineData?.data) {
          return {
            imageUrl: `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`,
            source: 'api',
            note: 'AI görüntü motoru (Gece/Işık/Cephe harmanlama) ile oluşturuldu.',
          };
        }
      }
    } catch {
      /* Fallback to local photorealistic pass if API fails */
    }
  }

  const localUrl = await localPhotorealisticPass(compositeDataUrl, masterPrompt);
  return {
    imageUrl: localUrl,
    source: 'local',
    note: config?.apiKey
      ? 'API yanıtı alınamadığı için ücretsiz yerel fotorealistik harmanlama uygulandı.'
      : 'Ücretsiz yerel Three.js + atmosferik harmanlama uygulandı (API anahtarı girilirse bulut AI render çalışır).',
  };
}

/**
 * Estimates signage manufacturing & pricing parameters from an uploaded storefront/facade photo
 * or active AI brief so users can transfer parameters to Cost & Quote in 1 click.
 */
export function estimateSignageCostParams(state = {}, imageMeta = {}) {
  const hint = `${imageMeta.fileName || ''} ${imageMeta.brief || ''} ${state.projectName || ''}`.toLowerCase();
  const activeObj = (state.objects || [])[0] || {};
  const textVal = String(activeObj.text || '').trim();
  const detectedChars = textVal ? textVal.replace(/\s+/g, '').length : 8;
  const letterCount = Math.max(2, Math.min(28, Number(imageMeta.letterCount) || detectedChars));

  let constructionType = activeObj.constructionType || state.constructionType || 'metal';
  if (/fileli|alüminyum\s*file|trim/.test(hint)) constructionType = 'fileli';
  else if (/pleksi|akrilik|ışıklı/.test(hint)) constructionType = 'pleksi';
  else if (/halo|arkadan/.test(hint)) constructionType = 'halo';
  else if (/ışıksız|kompozit/.test(hint)) constructionType = 'isiksiz';

  let faceMaterial = activeObj.faceMaterial || state.materials?.faceId || 'aynaAltin';
  if (/krom|gümüş|inox|paslanmaz/.test(hint)) faceMaterial = 'aynaKrom';
  else if (/siyah|black|mat/.test(hint)) faceMaterial = 'matSiyah';
  else if (/altın|gold|pirinç/.test(hint)) faceMaterial = 'aynaAltin';

  let lightingMode = activeObj.lightingMode || state.lighting?.mode || 'halo';
  if (/ön\s*ışık|front|pleksi/.test(hint)) lightingMode = 'front';
  else if (/çift|both|hem/.test(hint)) lightingMode = 'both';
  else if (/ışıksız/.test(hint)) lightingMode = 'none';
  else if (/halo|gece|3000k/.test(hint)) lightingMode = 'halo';

  const aspect = (imageMeta.width && imageMeta.height) ? imageMeta.width / Math.max(1, imageMeta.height) : 1.78;
  const heightMm = Math.max(200, Math.min(1200, Math.round((activeObj.heightMm || state.dimensions?.heightMm || (aspect > 1.6 ? 400 : 350)) / 10) * 10));
  const estWidthMm = Math.max(400, Math.round(letterCount * heightMm * 0.62));
  const depthMm = Math.max(30, Math.min(160, Math.round(activeObj.depthMm || state.dimensions?.depthMm || 80)));

  const cLabels = { fileli: 'Fileli Kutu Harf', pleksi: 'Pleksi Kutu Harf', metal: 'Paslanmaz Metal', halo: 'Arkadan Halo', isiksiz: 'Işıksız Metal' };
  const lLabels = { front: 'Önden LED', halo: 'Arkadan Halo LED', both: 'Çift Yönlü LED', none: 'Işıksız' };

  return {
    letterCount,
    widthMm: estWidthMm,
    heightMm,
    depthMm,
    constructionType,
    faceMaterial,
    lightingMode,
    summaryLabel: `${letterCount} harf · ~${estWidthMm}×${heightMm}×${depthMm} mm · ${cLabels[constructionType] || constructionType} · ${lLabels[lightingMode] || lightingMode}`,
  };
}
