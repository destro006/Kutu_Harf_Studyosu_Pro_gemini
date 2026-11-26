import { loadAiConfig } from './SignageAiEngine.js';

/**
 * Omniscient "Uygulama Uzmanı" AI Assistant
 * - Centralized APP_UI_MAP + APP_ACTION_REGISTRY covering 100% of tabs, sub-tabs, exporters, facades, and video studio
 * - Supports Gemini Flash / GPT-4o-mini function calling + local deterministic Turkish intent engine
 * - Animated guide cursor pointing directly to any exact UI control
 */

export const APP_UI_MAP = Object.freeze({
  tabs: {
    design2d: { label: '2D Tasarım', selector: '[data-main-ws="design2d"]' },
    model3d: { label: '3D Kutu Harf', selector: '[data-main-ws="model3d"]' },
    materials: { label: 'Malzeme ve Aydınlatma', selector: '[data-main-ws="materials"]' },
    tracer: { label: 'Image Tracer', selector: '[data-main-ws="tracer"]' },
    nesting: { label: 'Nesting', selector: '[data-main-ws="nesting"]' },
    aistudio: { label: 'AI Stüdyo', selector: '[data-main-ws="aistudio"]' },
    cnc: { label: 'Üretim / CNC', selector: '[data-main-ws="cnc"]' },
    cost: { label: 'Maliyet ve Teklif', selector: '[data-main-ws="cost"]' },
  },
  cncSubTabs: {
    cnc: { label: 'CNC / Lazer Kesim', selector: '[data-cnc-subtab="cnc"]' },
    workshop: { label: 'Atölye Otomasyon', selector: '[data-cnc-subtab="workshop"]' },
    bending: { label: 'Yan Bant Büküm Simülatörü', selector: '[data-cnc-subtab="bending"]' },
  },
  controls: {
    importFile: { workspace: 'model3d', selector: '#btnOpenImport', tip: 'Logo, CDR, AI, SVG veya DXF içe aktarın (Ctrl+I)' },
    exportFile: { workspace: 'model3d', selector: '#btnOpenExport', tip: '2D / 3D / İmalat çıktılarını buradan dışa aktarın (Ctrl+E)' },
    toggleDims: { workspace: 'model3d', selector: '#btnToggle3DDims', tip: 'Ölçü çizgilerini açıp kapatın' },
    videoStudio: { workspace: 'model3d', selector: '#btnOpenVideoModal', tip: 'Çoklu klip Video Stüdyosunu açın' },
    splitCompare: { workspace: 'model3d', selector: '#btnSplitCompare', tip: 'İki tasarım/malzeme seçeneğini yan yana karşılaştırın' },
    clientShareAr: { workspace: 'model3d', selector: '#btnClientShareAr', tip: 'WhatsApp onay bağlantısı ve telefon AR çıktısı alın' },
    kioskMode: { workspace: 'model3d', selector: '#btnKioskMode', tip: 'Müşteri Modunu açın' },
    corelExport: { workspace: 'nesting', selector: '#cwsSendCorel', tip: 'CorelDRAW\'a tek tıkla aktarın' },
    cncQuickExport: { workspace: 'nesting', selector: '#cwsSendCncQuick', tip: 'Hızlı DXF / CNC aktarımı' },
    bendingTab: { workspace: 'cnc', selector: '[data-cnc-subtab="bending"]', tip: 'Yan Bant Büküm Simülatörünü açın' },
    workshopTab: { workspace: 'cnc', selector: '[data-cnc-subtab="workshop"]', tip: '1:1 Montaj Şablonu ve LED/Bobin hesabını açın' },
    facadePool: { workspace: 'model3d', selector: '[data-ws-tab="bg"]', tip: '35 Hazır Mağaza Cephesi ve duvarlar' },
  },
});

export const APP_ACTION_REGISTRY = Object.freeze([
  'switch_workspace',
  'open_cnc_subtab',
  'set_material',
  'set_lighting',
  'set_wall',
  'select_facade',
  'set_dimensions',
  'run_nesting',
  'toggle_3d_dimensions',
  'add_video_clip',
  'apply_industry_preset',
  'toggle_kiosk_mode',
  'highlight_ui_element',
]);

export const APP_EXPERT_SYSTEM_PROMPT = `Sen "Kutu Harf Stüdyosu" uygulamasının her sekme, araç, cephe havuzu, video editörü ve CNC/büküm aracına hakim yerleşik Uygulama Uzmanısın.
Kurallar:
- YALNIZCA Türkçe yanıt ver. Kısa, net ve doğrudan çözüme odaklı ol.
- Kullanıcı işlem isterse mutlaka tool çağır (sekme aç, malzeme/duvar/cephe değiştir, büküm bobini seç, videoya klip ekle, müşteri modunu/ölçüleri aç-kapat).
- Kullanıcı ayar/buton yeri sorarsa highlight_ui_element ile tam sekme ve hedef öğeyi göster.

Ana Sekmeler: 2D Tasarım (design2d), 3D Kutu Harf (model3d), Malzeme ve Aydınlatma (materials), Image Tracer (tracer), Nesting (nesting), AI Stüdyo (aistudio), Üretim / CNC (cnc), Maliyet ve Teklif (cost).
Üretim / CNC Alt Sekmeleri: cnc (Lazer/Router), workshop (1:1 Saplama Montaj Şablonu, Akıllı LED/Trafo, Bobin), bending (Yan Bant Büküm Simülatörü: alu_08/10/12, ss_06/08, galv_08, trimcap_alu).
Cephe Havuzu: 35 mağaza cephesi (otel girişi, mermer alınlıklı mağaza, restoran teras, butik, kafe, otomobil showroom vb.).
Video Stüdyosu: 6 rol (luxury_arch, night_led, tech_dims, detail_closeup, orbit_360, reels_vertical).
Kısayollar: Ctrl+I İçe Aktar, Ctrl+E Dışa Aktar, Ctrl+D Çoğalt, Ctrl+K Harflere Ayır, Ctrl+Q Eğri, F4 Sığdır.`;

export const ASSISTANT_TOOLS = [
  {
    name: 'switch_workspace',
    description: 'Ana çalışma sekmelerinden birine geçer.',
    parameters: {
      type: 'object',
      properties: {
        workspace: { type: 'string', enum: ['design2d', 'model3d', 'materials', 'tracer', 'nesting', 'aistudio', 'cnc', 'cost'] },
      },
      required: ['workspace'],
    },
  },
  {
    name: 'open_cnc_subtab',
    description: 'Üretim / CNC alt sekmesini açar (Lazer, Atölye Otomasyon veya Büküm Simülatörü) ve isteğe bağlı bobin seçer.',
    parameters: {
      type: 'object',
      properties: {
        subTab: { type: 'string', enum: ['cnc', 'workshop', 'bending'] },
        coilId: { type: 'string', enum: ['alu_08', 'alu_10', 'alu_12', 'ss_06', 'ss_08', 'galv_08', 'trimcap_alu'] },
        machineId: { type: 'string' },
      },
      required: ['subTab'],
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
    description: '3D prosedürel arka plan duvarını değiştirir.',
    parameters: {
      type: 'object',
      properties: {
        wallId: { type: 'string', enum: ['studioPremium', 'traverten', 'kompozit', 'siyahMermer', 'cevizPanel', 'beyazSiva', 'tugla', 'beton', 'ahsap', 'siva', 'mermer', 'vitrin', 'resepsiyon', 'karanlikCephe', 'studioNotr'] },
      },
      required: ['wallId'],
    },
  },
  {
    name: 'select_facade',
    description: 'Cephe Havuzundaki 35 hazır işletme/mağaza cephesinden birini arayıp sahneye uygular.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'set_dimensions',
    description: 'Harf yüksekliği veya derinliğini (mm) günceller.',
    parameters: {
      type: 'object',
      properties: { heightMm: { type: 'number' }, depthMm: { type: 'number' } },
    },
  },
  {
    name: 'run_nesting',
    description: 'Nesting sekmesini açar ve otomatik yerleşimi çalıştırır.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'toggle_3d_dimensions',
    description: '2D ve 3D görünümlerde ölçü çizgilerini açar veya kapatır.',
    parameters: {
      type: 'object',
      properties: { visible: { type: 'boolean' } },
      required: ['visible'],
    },
  },
  {
    name: 'add_video_clip',
    description: 'Video Stüdyosuna yeni bir kamera senaryosu klibi ekler ve zaman çizelgesini açar.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['luxury_arch', 'night_led', 'tech_dims', 'detail_closeup', 'orbit_360', 'reels_vertical'] },
        durationSec: { type: 'number' },
        openModal: { type: 'boolean' },
      },
      required: ['role'],
    },
  },
  {
    name: 'apply_industry_preset',
    description: 'Hazır sektörel sahne ayarını uygular.',
    parameters: {
      type: 'object',
      properties: {
        presetId: { type: 'string', enum: ['luxury_cafe', 'clinic_pharmacy', 'plaza_office', 'jewelry_boutique', 'travertine_villa'] },
      },
      required: ['presetId'],
    },
  },
  {
    name: 'toggle_kiosk_mode',
    description: 'Müşteri Modunu (Kiosk) açar veya kapatır.',
    parameters: {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled'],
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
  if (!q) return { reply: 'Ne yapmak istediğinizi yazın. Örn: "Büküm simülatörünü aç ve paslanmaz 0.8mm seç", "Cepheyi otel girişi yap".', toolCalls: [] };

  const toolCalls = [];
  const actions = [];
  const isAskingLocation = /nerede|nasıl|hangisi|bulam[ıi]yorum/.test(q);

  // 1. Video clip sequencer commands
  if (/videoya|video.*ekle|360\s*tur|reels\s*ekle|klip\s*ekle/.test(q)) {
    let role = 'luxury_arch';
    if (/360/.test(q)) role = 'orbit_360';
    else if (/reels|dikey/.test(q)) role = 'reels_vertical';
    else if (/gece|led/.test(q)) role = 'night_led';
    else if (/detay|yak[ıi]n/.test(q)) role = 'detail_closeup';
    else if (/teknik|[öo]l[çc][üu]/.test(q)) role = 'tech_dims';
    const durM = q.match(/(\d{1,2})\s*(?:sn|saniye|s\b)/);
    toolCalls.push({ name: 'add_video_clip', args: { role, durationSec: durM ? Number(durM[1]) : 5, openModal: true } });
    return { reply: 'Video Stüdyosu açıldı ve yeni klip zaman çizelgesine eklendi.', toolCalls };
  }

  // 2. Bending Simulator & CNC sub-tab commands
  if (!isAskingLocation && (/b[üu]k[üu]m|sim[üu]lat[öo]r/.test(q) || /paslanmaz\s*0[.,][68]|galvaniz|trimcap/.test(q))) {
    let coilId;
    if (/paslanmaz.*0[.,]8|0[.,]8\s*mm.*paslanmaz/.test(q)) coilId = 'ss_08';
    else if (/paslanmaz.*0[.,]6|0[.,]6/.test(q)) coilId = 'ss_06';
    else if (/paslanmaz/.test(q)) coilId = 'ss_08';
    else if (/al[üu]minyum.*1[.,]2/.test(q)) coilId = 'alu_12';
    else if (/al[üu]minyum.*1[.,]0|1\s*mm/.test(q)) coilId = 'alu_10';
    else if (/galvaniz/.test(q)) coilId = 'galv_08';
    else if (/trimcap/.test(q)) coilId = 'trimcap_alu';
    toolCalls.push({ name: 'open_cnc_subtab', args: { subTab: 'bending', ...(coilId ? { coilId } : {}) } });
    return { reply: coilId ? `Büküm Simülatörü açıldı ve bobin profili seçildi (${coilId}).` : 'Yan Bant Büküm Simülatörü açıldı.', toolCalls };
  }
  if (/at[öo]lye|saplama|montaj\s*[şs]ablon|trafo\s*hesab/.test(q) && !isAskingLocation) {
    toolCalls.push({ name: 'open_cnc_subtab', args: { subTab: 'workshop' } });
    return { reply: 'Atölye Otomasyon (1:1 Montaj Şablonu & LED/Bobin) açıldı.', toolCalls };
  }

  // 3. Kiosk / Client mode toggle
  if (/m[üu][şs]teri\s*modu|kiosk/.test(q)) {
    const off = /kapat|[çc][ıi]k|d[öo]n/.test(q);
    toolCalls.push({ name: 'toggle_kiosk_mode', args: { enabled: !off } });
    return { reply: off ? 'Müşteri Modu kapatıldı.' : 'Müşteri Modu açıldı.', toolCalls };
  }

  // 4. Direct workspace navigation
  if (/ai\s*st[üu]dyo|yapay\s*zeka\s*sekme|master\s*prompt/.test(q)) {
    toolCalls.push({ name: 'switch_workspace', args: { workspace: 'aistudio' } });
    return { reply: 'AI Stüdyo sekmesi açıldı.', toolCalls };
  }
  if (/2d\s*tasar[ıi]m|2b/.test(q)) {
    toolCalls.push({ name: 'switch_workspace', args: { workspace: 'design2d' } });
    return { reply: '2D Tasarım sekmesi açıldı.', toolCalls };
  }
  if (/tracer|vekt[öo]re?\s*[çc]evir/.test(q)) {
    toolCalls.push({ name: 'switch_workspace', args: { workspace: 'tracer' } });
    return { reply: 'Image Tracer sekmesi açıldı.', toolCalls };
  }

  // 5. Dimensions toggle
  if (/[öo]l[çc][üu](leri)?\s*(g[öo]ster|a[çc])/.test(q)) {
    toolCalls.push({ name: 'switch_workspace', args: { workspace: 'model3d' } });
    toolCalls.push({ name: 'toggle_3d_dimensions', args: { visible: true } });
    return { reply: 'Ölçü çizgileri 2D ve 3D görünümlerde açıldı.', toolCalls };
  }
  if (/[öo]l[çc][üu](leri)?\s*(gizle|kapat)/.test(q)) {
    toolCalls.push({ name: 'toggle_3d_dimensions', args: { visible: false } });
    return { reply: 'Ölçü çizgileri tüm görünümlerde kapatıldı.', toolCalls };
  }

  // 6. Facade Pool matching ("Cepheyi otel girişi yap", "restoran teras cephesi seç"...)
  const facadeKeywords = /otel|showroom|butik|restoran|f[ıi]r[ıi]n|pastane|klinik|kafe|market|garaj|kurumsal|cadde|[çc]i[çc]ek[çc]i|cepheyi/;
  if (facadeKeywords.test(q) && !isAskingLocation) {
    const cleaned = q
      .replace(/\b(cepheyi|arka\s*plan[ıi]|cephesi|yap|se[çc]|uygula|a[çc]|g[öo]ster)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    toolCalls.push({ name: 'select_facade', args: { query: cleaned || q } });
    return { reply: `Cephe Havuzundan "${cleaned || q}" cephesi uygulanıyor.`, toolCalls };
  }

  // 7. Material commands
  if (/ayna\s*alt[ıi]n|gold/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'aynaAltin' } }); actions.push('Ayna Altın Krom'); }
  else if (/f[ıi]r[çc]al[ıi]\s*alt[ıi]n/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'fircaliAltin' } }); actions.push('Fırçalı Altın'); }
  else if (/rose\s*gold|pembe\s*alt[ıi]n/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'roseGold' } }); actions.push('Rose Gold'); }
  else if (/siyah\s*krom/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'siyahKrom' } }); actions.push('Siyah Krom'); }
  else if (/ayna\s*krom|krom/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'aynaKrom' } }); actions.push('Ayna Paslanmaz Krom'); }
  else if (/f[ıi]r[çc]al[ıi]\s*(304|paslanmaz|krom)/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'fircali304' } }); actions.push('Fırçalı 304 Paslanmaz'); }
  else if (/mat\s*siyah/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'matSiyah' } }); actions.push('Mat Siyah Metal'); }
  else if (/bronz/.test(q)) { toolCalls.push({ name: 'set_material', args: { materialId: 'bronz' } }); actions.push('Fırçalı Bronz'); }

  // 8. Lighting & Day/Night
  if (/g[üu]nd[üu]z/.test(q) && !/video/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { night: false } }); actions.push('Gündüz modu'); }
  else if (/gece/.test(q) && !/video/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { night: true } }); actions.push('Gece modu'); }
  if (/halo|[ıi][şs][ıi]k\s*arkadan|arkadan/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { mode: 'halo', enabled: true } }); actions.push('Halo (Arka) aydınlatma'); }
  else if (/[öo]nden\s*[ıi][şs][ıi]k|pleksi\s*[ıi][şs][ıi]k/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { mode: 'front', enabled: true } }); actions.push('Önden aydınlatma'); }
  else if (/[ıi][şs][ıi]ks[ıi]z|[ıi][şs][ıi][ğg][ıi]\s*kapat/.test(q)) { toolCalls.push({ name: 'set_lighting', args: { mode: 'none', enabled: false } }); actions.push('Işıksız'); }

  // 9. Procedural Walls
  if (/traverten/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'traverten' } }); actions.push('Bej Traverten duvar'); }
  else if (/mermer|nero/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'siyahMermer' } }); actions.push('Nero Mermer duvar'); }
  else if (/kompozit|antrasit/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'kompozit' } }); actions.push('Antrasit Kompozit'); }
  else if (/ceviz|ah[şs]ap/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'cevizPanel' } }); actions.push('Ceviz Panel'); }
  else if (/tu[ğg]la/.test(q)) { toolCalls.push({ name: 'set_wall', args: { wallId: 'tugla' } }); actions.push('Loft Tuğla'); }

  // 10. Dimensions numeric parse
  const hMatch = q.match(/(?:y[üu]kseklik|boy)\s*[:=]?\s*(\d{2,4})/);
  const dMatch = q.match(/(?:derinlik|kal[ıi]nl[ıi]k)\s*[:=]?\s*(\d{2,3})/);
  if (hMatch || dMatch) {
    const args = {};
    if (hMatch) { args.heightMm = Number(hMatch[1]); actions.push(`Yükseklik ${args.heightMm} mm`); }
    if (dMatch) { args.depthMm = Number(dMatch[1]); actions.push(`Derinlik ${args.depthMm} mm`); }
    toolCalls.push({ name: 'set_dimensions', args });
  }

  // 11. Nesting run
  if (/nesting\s*(yap|ba[şs]lat|[çc]al[ıi][şs]t[ıi]r|yerle[şs]tir)|otomatik\s*yerle[şs]tir/.test(q)) {
    toolCalls.push({ name: 'run_nesting', args: {} });
    return { reply: 'Nesting sekmesi açıldı ve otomatik yerleşim başlatıldı.', toolCalls };
  }

  if (toolCalls.length) {
    return { reply: `Uygulandı: ${actions.join(', ')}.`, toolCalls };
  }

  // 12. Guided UI Highlights / Troubleshooting
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
      reply: 'Üretim / CNC sekmesine geçip "🔄 Yan Bant Büküm Simülatörü" alt sekmesini açın.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'cnc', selector: '[data-cnc-subtab="bending"]', tip: 'Büküm Simülatörü sekmesini buradan açın' } }],
    };
  }
  if (/video|sunum/.test(q)) {
    return {
      reply: 'Sağ üst araç çubuğundaki "🎬 Sunum Videosu" butonuyla çoklu klip video stüdyosunu açın.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'model3d', selector: '#btnOpenVideoModal', tip: 'Video Stüdyosunu açmak için tıklayın' } }],
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
      reply: '3D Kutu Harf sekmesindeyken "⇩ İçe Aktar" (Ctrl+I) ile .ai, .cdr, .svg, .dxf veya .png seçin; doğrudan 3D sahneye gelir.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'model3d', selector: '#btnOpenImport', tip: 'Logo veya .ai/.cdr/.svg dosyasını buradan yükleyin (Ctrl+I)' } }],
    };
  }
  if (/ar|onay|qr/.test(q)) {
    return {
      reply: 'Sağ üstteki "📱 Onay & AR" butonu ile müşteriye canlı 3D onay bağlantısı, QR kod ve mobil AR (GLB/USDZ) paylaşabilirsiniz.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'model3d', selector: '#btnClientShareAr', tip: 'Canlı 3D Müşteri Onayı & AR ekranı' } }],
    };
  }
  if (/foto|cephe|fotomontaj/.test(q)) {
    return {
      reply: 'Sağdaki Arka Plan panelindeki "Cephe Havuzu"ndan 35 hazır mağaza cephesi seçebilir veya fotoğraf yükleyebilirsiniz.',
      toolCalls: [{ name: 'highlight_ui_element', args: { workspace: 'model3d', selector: '[data-ws-tab="bg"]', tip: '35 Hazır Cephe ve Fotoğraf Yükleme paneli' } }],
    };
  }
  if (/k[ıi]sayol/.test(q)) {
    return {
      reply: 'Ctrl+I İçe Aktar · Ctrl+E Dışa Aktar · Ctrl+D Çoğalt · Ctrl+K Harflere Ayır · Ctrl+Q Eğri · F4 Sığdır · Nesting\'de Ctrl+Scroll Yakınlaştır.',
      toolCalls: [],
    };
  }

  return {
    reply: 'Şunları yapabilirim: "Büküm simülatörünü aç ve paslanmaz 0.8mm seç", "Videoya 360 tur ekle", "Cepheyi otel girişi yap", "Ölçüleri kapat" veya "Corel aktar nerede?" yazın.',
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
