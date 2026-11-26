import { loadAiConfig } from './SignageAiEngine.js';

/**
 * "App Expert" Interactive Turkish AI Assistant
 * Supports low-cost Gemini Flash / GPT-4o-mini function calling + local deterministic engine
 * + animated visual guide cursor highlighting exact UI controls.
 */

export const APP_EXPERT_SYSTEM_PROMPT = `Sen "Kutu Harf Stüdyosu" CAD/CAM ve 3D Tabela Tasarım uygulamasının yerleşik Uygulama Uzmanı asistanısın.
Kurallar:
- YALNIZCA Türkçe yanıt ver.
- Son derece kısa, net ve doğrudan çözüme odaklı ol. Sohbet dolgusu veya gereksiz nezaket cümlesi yazma.
- Kullanıcı doğrudan bir işlem istiyorsa (malzeme, ışık, duvar, ölçü, nesting, sekme değişimi) mutlaka uygun aracı (function call) çağır.
- Kullanıcı bir ayar/buton yerini soruyorsa ilgili sekmeye git ve highlight_ui_element ile butonu/paneli işaretle.

Sekmeler:
1. 2D Tasarım (design2d): 2B vektör çizim, düğüm düzenleme (F10), kalem (F5), hizalama, harflere ayırma (Ctrl+K), eğriye çevirme (Ctrl+Q).
2. 3D Kutu Harf (model3d): 3D harf önizleme, Gündüz/Gece, Işık aç/kapat, duvar seçimi, Mağaza/Cephe Fotoğrafı Yükle, 📏 Ölçüleri Göster, 🎬 Sunum Videosu, sağ tık -> AI ile Devam Et.
3. Malzeme ve Aydınlatma (materials): Ayna Altın, Saten Altın, Fırçalı Altın, Rose Gold, Ayna Krom, Saten Paslanmaz, Fırçalı 304, Siyah Krom, Mat Siyah, Boyalı Alüminyum, Opal/Renkli Pleksi; Önden/Halo/Çift/Işıksız LED modları.
4. Image Tracer (tracer): Düşük kaliteli raster görselleri büyütüp gürültüden arındırarak temiz SVG/DXF vektörüne çevirir ve 3D/Nesting'e gönderir.
5. Nesting (nesting): True-Shape NFP levha yerleştirme, Gelişmiş Yerleşim Ayarları (Objelerin İçine Ekle, Dönüş Açısı, Yerleşim Yönü), Ctrl+Scroll yakınlaştırma, Corel'e Aktar, ⚡ CNC'ye Aktar.
6. Üretim / CNC (cnc): 42 makine profili, kerf/takım telafisi, G-Code/DXF/PLT indirme, Atölye Otomasyon (1:1 Montaj Şablonu, Akıllı LED/Trafo, Bobin Hesabı) ve 🔄 Büküm Simülatörü.
7. Maliyet ve Teklif (cost): Alış/satış birim fiyat kataloğu, KDV/marj, QR kodlu müşteri teklif PDF'i.

Kısayollar: Ctrl+I İçe Aktar (.cdr/.ai/.svg/.dxf/.png), Ctrl+E Dışa Aktar, Ctrl+D Çoğalt, Ctrl+A Tümünü Seç, Ctrl+G Grupla, F4 Ekrana Sığdır, P Sayfaya Ortala.`;

export const ASSISTANT_TOOLS = [
  {
    name: 'switch_workspace',
    description: 'Uygulamanın ana çalışma sekmesine geçer.',
    parameters: {
      type: 'object',
      properties: {
        workspace: { type: 'string', enum: ['design2d', 'model3d', 'materials', 'tracer', 'nesting', 'cnc', 'cost'] },
      },
      required: ['workspace'],
    },
  },
  {
    name: 'set_material',
    description: 'Seçili veya tüm harflerin yüzey/yanak malzemesini değiştirir.',
    parameters: {
      type: 'object',
      properties: {
        materialId: { type: 'string', enum: ['aynaAltin', 'satenAltin', 'fircaliAltin', 'sampanyaAltin', 'roseGold', 'bronz', 'aynaKrom', 'matKrom', 'fircali304', 'siyahKrom', 'matSiyah', 'boyaliAluminyum', 'opalPleksi', 'renkliPleksi'] },
      },
      required: ['materialId'],
    },
  },
  {
    name: 'set_lighting',
    description: 'Aydınlatma modunu veya gündüz/gece sahne ortamını ayarlar.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['front', 'halo', 'both', 'none'] },
        night: { type: 'boolean' },
        enabled: { type: 'boolean' },
      },
    },
  },
  {
    name: 'set_wall',
    description: '3D arka plan duvarını değiştirir.',
    parameters: {
      type: 'object',
      properties: {
        wallId: { type: 'string', enum: ['studioPremium', 'traverten', 'kompozit', 'siyahMermer', 'cevizPanel', 'beyazSiva', 'tugla', 'beton', 'ahsap', 'siva', 'mermer', 'vitrin', 'resepsiyon', 'karanlikCephe', 'studioNotr'] },
      },
      required: ['wallId'],
    },
  },
  {
    name: 'set_dimensions',
    description: 'Harf yüksekliği veya derinliğini (mm) günceller.',
    parameters: {
      type: 'object',
      properties: {
        heightMm: { type: 'number' },
        depthMm: { type: 'number' },
      },
    },
  },
  {
    name: 'run_nesting',
    description: 'Nesting sekmesini açar ve otomatik yerleşimi çalıştırır.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'toggle_3d_dimensions',
    description: '3D sahnede toplam ölçü çizgilerini açar veya kapatır.',
    parameters: {
      type: 'object',
      properties: { visible: { type: 'boolean' } },
      required: ['visible'],
    },
  },
  {
    name: 'highlight_ui_element',
    description: 'Kullanıcıya ayar veya butonun yerini göstermek için ekranda animasyonlu rehber imleç açar.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        workspace: { type: 'string' },
        tip: { type: 'string' },
      },
      required: ['selector', 'tip'],
    },
  },
];

export function resolveLocalExpertIntent(query) {
  const q = String(query || '').toLocaleLowerCase('tr-TR').trim();
  if (!q) return { reply: 'Ne yapmak istediğinizi yazın. Örn: "Ayna altın yap", "Nesting çalıştır", "Corel aktar nerede?"', toolCalls: [] };

  const toolCalls = [];
  const actions = [];

  // Material commands
  if (/ayna\s*alt[ıi]n|gold/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'aynaAltin' } }); actions.push('Ayna Altın Krom'); }
  else if (/f[ıi]r[çc]al[ıi]\s*alt[ıi]n/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'fircaliAltin' } }); actions.push('Fırçalı Altın'); }
  else if (/rose\s*gold|pembe\s*alt[ıi]n/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'roseGold' } }); actions.push('Rose Gold'); }
  else if (/siyah\s*krom/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'siyahKrom' } }); actions.push('Siyah Krom'); }
  else if (/ayna\s*krom|krom/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'aynaKrom' } }); actions.push('Ayna Paslanmaz Krom'); }
  else if (/f[ıi]r[çc]al[ıi]\s*(304|paslanmaz|krom)/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'fircali304' } }); actions.push('Fırçalı 304 Paslanmaz'); }
  else if (/mat\s*siyah/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'matSiyah' } }); actions.push('Mat Siyah Metal'); }
  else if (/bronz/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'bronz' } }); actions.push('Fırçalı Bronz'); }

  // Lighting & Day/Night
  if (/g[üu]nd[üu]z/.test(q) && !/video/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { night: false } }); actions.push('Gündüz modu'); }
  else if (/gece/.test(q) && !/video/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { night: true } }); actions.push('Gece modu'); }
  if (/halo|[ıi][şs][ıi]k\s*arkadan|arkadan/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { mode: 'halo', enabled: true } }); actions.push('Halo (Arka) aydınlatma'); }
  else if (/[öo]nden\s*[ıi][şs][ıi]k|pleksi\s*[ıi][şs][ıi]k/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { mode: 'front', enabled: true } }); actions.push('Önden aydınlatma'); }
  else if (/[ıi][şs][ıi]ks[ıi]z|[ıi][şs][ıi][ğg][ıi]\s*kapat/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { mode: 'none', enabled: false } }); actions.push('Işıksız'); }

  // Walls
  if (/traverten/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'traverten' } }); actions.push('Bej Traverten duvar'); }
  else if (/mermer|nero/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'siyahMermer' } }); actions.push('Nero Mermer duvar'); }
  else if (/kompozit|antrasit/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'kompozit' } }); actions.push('Antrasit Kompozit'); }
  else if (/ceviz|ah[şs]ap/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'cevizPanel' } }); actions.push('Ceviz Panel'); }
  else if (/tu[ğg]la/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'tugla' } }); actions.push('Loft Tuğla'); }

  // Dimensions numeric parse
  const hMatch = q.match(/(?:y[üu]kseklik|boy)\s*[:=]?\s*(\d{2,4})/);
  const dMatch = q.match(/(?:derinlik|kal[ıi]nl[ıi]k)\s*[:=]?\s*(\d{2,3})/);
  if (hMatch || dMatch) {
    const args = {};
    if (hMatch) { args.heightMm = Number(hMatch[1]); actions.push(`Yükseklik ${args.heightMm} mm`); }
    if (dMatch) { args.depthMm = Number(dMatch[1]); actions.push(`Derinlik ${args.depthMm} mm`); }
    toolCalls.push({ name: 'set_dimensions', args });
  }

  // Nesting action
  if (/nesting\s*(yap|ba[şs]lat|[çc]al[ıi][şs]t[ıi]r|yerle[şs]tir)|otomatik\s*yerle[şs]tir/.test(q)) {
    toolCalls.push({ name: 'run_nesting', args: {} });
    return { reply: 'Nesting sekmesi açıldı ve otomatik yerleşim başlatıldı.', toolCalls };
  }

  // 3D Dimensions toggle
  if (/[öo]l[çc][üu](leri)?\s*(g[öo]ster|a[çc])/.test(q)) {
    toolCalls.push({ name: 'switch_workspace', args: { workspace: 'model3d' } });
    toolCalls.push({ name: 'toggle_3d_dimensions', args: { visible: true } });
    return { reply: '3D ölçü çizgileri açıldı.', toolCalls };
  }
  if (/[öo]l[çc][üu](leri)?\s*(gizle|kapat)/.test(q)) {
    toolCalls.push({ name: 'toggle_3d_dimensions', args: { visible: false } });
    return { reply: '3D ölçüler gizlendi.', toolCalls };
  }

  if (toolCalls.length) {
    return { reply: `Uygulandı: ${actions.join(', ')}.`, toolCalls };
  }

  // Guided UI highlights / Troubleshooting
  if (/corel|cdr\s*aktar/.test(q)) {
    return {
      reply: 'Nesting sekmesi üst çubuğundaki "✦ Corel\'e Aktar" butonuna tıklayın.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'nesting', selector: '#cwsSendCorel', tip: 'CorelDRAW\'a tek tıkla aktarmak için buraya tıklayın' } }],
    };
  }
  if (/cnc|gcode|dxf\s*kesim/.test(q)) {
    return {
      reply: 'Nesting üst çubuğundaki "⚡ CNC\'ye Aktar" ile hızlı çıktı alabilir veya Üretim / CNC sekmesinden profil seçebilirsiniz.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'nesting', selector: '#cwsSendCncQuick', tip: 'Hızlı CNC / DXF aktarımı için tıklayın' } }],
    };
  }
  if (/b[üu]k[üu]m|sim[üu]lat[öo]r|kanal/.test(q)) {
    return {
      reply: 'Üretim / CNC sekmesine geçip "🔄 Büküm Simülatörü" alt sekmesini açın.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'cnc', selector: '[data-cnc-tab="bending"]', tip: 'Büküm Simülatörü sekmesini buradan açın' } }],
    };
  }
  if (/video|sunum/.test(q)) {
    return {
      reply: 'Sağ üst araç çubuğundaki "🎬 Sunum Videosu" butonuna tıklayıp kaydı başlatın.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'model3d', selector: '#btnOpenVideoModal', tip: 'Sinematik sunum videosu oluşturmak için tıklayın' } }],
    };
  }
  if (/teklif|maliyet|fiyat/.test(q)) {
    return {
      reply: 'Maliyet ve Teklif sekmesinden metraj, birim fiyat ve QR kodlu PDF teklif oluşturabilirsiniz.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'cost', selector: '#costCenterWrap', tip: 'Maliyet ve teklif araçları burada yer alır' } }],
    };
  }
  if (/ai\s*dosya|cdr|svg|logo\s*y[üu]kle|i[çc]e\s*aktar/.test(q)) {
    return {
      reply: '3D Kutu Harf sekmesindeyken "⇩ İçe Aktar" (Ctrl+I) ile .ai, .cdr, .svg, .dxf veya .png dosyanızı seçin; doğrudan 3D sahneye gelir.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'model3d', selector: '#btnOpenImport', tip: 'Logo veya .ai/.cdr/.svg dosyasını buradan 3D sahneye yükleyin (Ctrl+I)' } }],
    };
  }
  if (/foto|cephe|fotomontaj/.test(q)) {
    return {
      reply: 'Alt çubuktaki "Mağaza / Cephe Fotoğrafı Yükle" ile fotoğraf ekleyin, 4 köşeyi ayarlayın veya nesneye sağ tıklayıp "AI ile Devam Et" seçin.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'model3d', selector: '.stage-upload-photo', tip: 'Müşteri cephe fotoğrafını buradan yükleyin' } }],
    };
  }
  if (/k[ıi]sayol/.test(q)) {
    return {
      reply: 'Ctrl+I İçe Aktar · Ctrl+E Dışa Aktar · Ctrl+D Çoğalt · Ctrl+K Harflere Ayır · Ctrl+Q Eğriye Çevir · F4 Sığdır · Nesting\'de Ctrl+Scroll Yakınlaştır.',
      toolCalls: [],
    };
  }

  return {
    reply: 'Bunu doğrudan yapabilirim: örn. "Ayna altın yap", "Gündüz moduna geç", "Ölçüleri göster", "Nesting çalıştır", "Corel aktar nerede?" veya "Büküm simülatörü nerede?" yazın.',
    toolCalls: [],
  };
}

export async function askAppExpert(userMessage, chatHistory = [], config = loadAiConfig()) {
  if (!config?.apiKey) {
    return { ...resolveLocalExpertIntent(userMessage), source: 'local' };
  }
  try {
    if (config.provider === 'openai') {
      const messages = [
        { role: 'system', content: APP_EXPERT_SYSTEM_PROMPT },
        ...chatHistory.slice(-6),
        { role: 'user', content: userMessage },
      ];
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.textModel || 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 300,
          messages,
          tools: ASSISTANT_TOOLS.map(t => ({ type: 'function', function: t })),
          tool_choice: 'auto',
        }),
      });
      if (!res.ok) throw Error(`API ${res.status}`);
      const json = await res.json();
      const msg = json?.choices?.[0]?.message;
      const toolCalls = (msg?.tool_calls || []).map(tc => {
        try { return { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') }; }
        catch { return null; }
      }).filter(Boolean);
      const reply = msg?.content?.trim() || (toolCalls.length ? 'İşlem uygulandı.' : '');
      if (reply || toolCalls.length) return { reply, toolCalls, source: 'api' };
    } else {
      const model = encodeURIComponent(config.textModel || 'gemini-2.0-flash');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: APP_EXPERT_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          tools: [{ functionDeclarations: ASSISTANT_TOOLS }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
        }),
      });
      if (!res.ok) throw Error(`API ${res.status}`);
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts || [];
      const toolCalls = parts.filter(p => p.functionCall).map(p => ({
        name: p.functionCall.name,
        args: p.functionCall.args || {},
      }));
      const reply = parts.filter(p => p.text).map(p => p.text).join('\n').trim() || (toolCalls.length ? 'İşlem uygulandı.' : '');
      if (reply || toolCalls.length) return { reply, toolCalls, source: 'api' };
    }
  } catch {
    /* Seamless fallback to local intent engine */
  }
  return { ...resolveLocalExpertIntent(userMessage), source: 'local' };
}

let activeGuideCleanup = null;
export function showGuideCursor(selector, tipText = 'Buraya tıklayın') {
  activeGuideCleanup?.();
  if (typeof document === 'undefined' || !selector) return false;
  const el = document.querySelector(selector);
  if (!el) return false;
  el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

  const rect = el.getBoundingClientRect();
  const ring = document.createElement('div');
  ring.id = 'aiGuideSpotlight';
  ring.className = 'ai-guide-spotlight';
  ring.style.left = `${Math.max(4, rect.left - 4)}px`;
  ring.style.top = `${Math.max(4, rect.top - 4)}px`;
  ring.style.width = `${Math.max(24, rect.width + 8)}px`;
  ring.style.height = `${Math.max(24, rect.height + 8)}px`;

  const tip = document.createElement('div');
  tip.className = 'ai-guide-tip';
  tip.innerHTML = `<span class="ai-guide-arrow">➜</span><span>${String(tipText).replace(/[<>&]/g, '')}</span>`;
  ring.appendChild(tip);
  document.body.appendChild(ring);

  const cleanup = () => {
    clearTimeout(timer);
    el.removeEventListener('click', cleanup);
    ring.remove();
    if (activeGuideCleanup === cleanup) activeGuideCleanup = null;
  };
  const timer = setTimeout(cleanup, 7000);
  el.addEventListener('click', cleanup, { once: true });
  activeGuideCleanup = cleanup;
  return true;
}
