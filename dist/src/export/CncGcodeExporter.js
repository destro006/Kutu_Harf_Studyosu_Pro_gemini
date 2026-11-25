/**
 * Validated Machine-Specific CNC / Laser / Plasma / Waterjet / Plotter Post-Processor & Production Validator
 * Consumes actual nested sheets (1:1 mm) — never rebuilds approximate geometry.
 */

const CAT_DXF = 'DXF · Lazer, Plazma, Su Jeti & Büküm';
const CAT_SVG = 'Vektör · 1:1 mm SVG';
const CAT_ROUTER = 'CNC Router G-Code';
const CAT_LASER_GCODE = 'Lazer, Plazma & Su Jeti G-Code';
const CAT_PLOTTER = 'Plotter / Folyo & Flatbed Kesim';

export const MACHINE_PROFILE_CATEGORIES = [
  CAT_DXF,
  CAT_SVG,
  CAT_ROUTER,
  CAT_LASER_GCODE,
  CAT_PLOTTER,
];

function routerProfile(id, label, ext, opts = {}) {
  return {
    id,
    category: CAT_ROUTER,
    label,
    ext,
    kind: 'gcode',
    mode: 'router',
    defaultKerfMm: opts.defaultKerfMm ?? 0.0,
    defaultToolDiaMm: opts.defaultToolDiaMm ?? 3.0,
    feed: opts.feed ?? 1400,
    plunge: opts.plunge ?? 400,
    safeZ: opts.safeZ ?? 15.0,
    cutZ: opts.cutZ ?? -3.2,
    spindleOrPower: opts.spindleOrPower ?? 18000,
    startCmd: opts.startCmd ?? null,
    endCmd: opts.endCmd ?? 'M5',
    pierceDelaySec: 0,
    airAssist: false,
    commentStyle: opts.commentStyle ?? 'paren',
    headerLines: opts.headerLines ?? ['G17 G21 G90 G40 G49'],
    footerLines: opts.footerLines ?? ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: opts.notes ?? 'Standart 3 eksen ISO CNC Router post-processor.',
  };
}

export const MACHINE_PROFILES = [
  // --- DXF · Lazer, Plazma, Su Jeti & Büküm ---
  {
    id: 'dxf_r2000',
    category: CAT_DXF,
    label: 'AutoCAD DXF R2000 (Genel Lazer / Router)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'dxf',
    defaultKerfMm: 0.2,
    defaultToolDiaMm: 3.0,
    notes: 'Tüm CAM, lazer ve router yazılımları için evrensel 1:1 mm katmanlı DXF.',
  },
  {
    id: 'dxf_cypcut',
    category: CAT_DXF,
    label: 'CypCut / BoChu Fiber Lazer (Bodor, HSG, Gweike, Nukon .dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.2,
    notes: 'CypCut / HypCut sac metal fiber lazer kesim için 1:1 mm kapalı kontur DXF.',
  },
  {
    id: 'dxf_rdworks',
    category: CAT_DXF,
    label: 'RDWorks / Ruida CO2 Lazer (Pleksi / Ahşap .dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.2,
    defaultToolDiaMm: 0.2,
    notes: 'Ruida RDC6442/RDC6445 CO2 lazerler için pleksi/MDF kesim katmanlı DXF.',
  },
  {
    id: 'dxf_lightburn',
    category: CAT_DXF,
    label: 'LightBurn Lazer CAM (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.18,
    defaultToolDiaMm: 0.2,
    notes: 'LightBurn CO2, Diyot ve Galvo lazerler için iç/dış katman ayrımlı DXF.',
  },
  {
    id: 'dxf_ezcad',
    category: CAT_DXF,
    label: 'EzCad2 / EzCad3 Galvo Fiber Lazer (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.05,
    defaultToolDiaMm: 0.05,
    notes: 'Galvo markalama ve ince metal kesim lazerleri için yüksek hassasiyetli DXF.',
  },
  {
    id: 'dxf_trocen',
    category: CAT_DXF,
    label: 'Trocen / AWC / Leetro CO2 Lazer (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.2,
    defaultToolDiaMm: 0.2,
    notes: 'Trocen LaserCAD ve Leetro kontrolörlü CO2 lazerler için 1:1 mm DXF.',
  },
  {
    id: 'dxf_bystronic',
    category: CAT_DXF,
    label: 'Bystronic BySoft / BySprint Fiber Lazer (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.15,
    notes: 'Bystronic BySoft7 / BySoft Cell CAM içe aktarımına uygun kapalı DXF.',
  },
  {
    id: 'dxf_trumpf',
    category: CAT_DXF,
    label: 'Trumpf TruTops / TruLaser (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.15,
    notes: 'Trumpf TruTops Boost / Classic sac kesim sistemleri için 1:1 mm DXF.',
  },
  {
    id: 'dxf_amada',
    category: CAT_DXF,
    label: 'Amada AP100 / Dr.ABE Lazer & Punch (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.15,
    notes: 'Amada lazer ve punch tezgahları için katmanlı kapalı polyline DXF.',
  },
  {
    id: 'dxf_mazak',
    category: CAT_DXF,
    label: 'Mazak Mazatrol / Optiplex Lazer (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.15,
    notes: 'Mazak Optiplex / SpaceGear fiber lazer CAM sistemleri için 1:1 mm DXF.',
  },
  {
    id: 'dxf_durma',
    category: CAT_DXF,
    label: 'Durma / Ermaksan / Nukon Lantek Lazer (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.15,
    notes: 'Lantek Expert / AlmaCAM kullanan yerli ve Avrupa fiber lazerler için DXF.',
  },
  {
    id: 'dxf_pronest',
    category: CAT_DXF,
    label: 'Hypertherm ProNest / FastCAM CNC Plazma (.dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'plasma',
    defaultKerfMm: 1.5,
    defaultToolDiaMm: 1.5,
    notes: 'CNC Plazma sac kesim (Hypertherm, AJAN, Kjellberg) için 1:1 mm DXF.',
  },
  {
    id: 'dxf_waterjet',
    category: CAT_DXF,
    label: 'Flow / OMAX / KMT Su Jeti (Waterjet .dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'waterjet',
    defaultKerfMm: 1.0,
    defaultToolDiaMm: 1.0,
    notes: 'Aşındırıcı su jeti (alüminyum, paslanmaz, taş, cam) kesim için DXF.',
  },
  {
    id: 'dxf_bender',
    category: CAT_DXF,
    label: 'Kutu Harf Büküm (AluBender / Acro / V-Bend / Channel Bender .dxf)',
    ext: 'dxf',
    kind: 'dxf',
    mode: 'dxf',
    defaultKerfMm: 0.1,
    defaultToolDiaMm: 0.1,
    notes: 'Otomatik harf yan bant büküm makineleri (AluBender, Acro, Super Channel) için DXF.',
  },

  // --- Vektör · 1:1 mm SVG ---
  {
    id: 'svg_1to1',
    category: CAT_SVG,
    label: '1:1 mm Katmanlı SVG (CorelDRAW / Illustrator / Inkscape)',
    ext: 'svg',
    kind: 'svg',
    mode: 'svg',
    defaultKerfMm: 0.2,
    defaultToolDiaMm: 3.0,
    notes: 'CorelDRAW, Adobe Illustrator ve Inkscape için birebir milimetre SVG.',
  },
  {
    id: 'svg_lightburn',
    category: CAT_SVG,
    label: 'LightBurn / xTool / Glowforge Lazer SVG',
    ext: 'svg',
    kind: 'svg',
    mode: 'laser',
    defaultKerfMm: 0.18,
    defaultToolDiaMm: 0.2,
    notes: 'İç delik ve dış kontur renk ayrımlı masaüstü/endüstriyel lazer SVG.',
  },
  {
    id: 'svg_shaper',
    category: CAT_SVG,
    label: 'Shaper Origin / Dijital Freze SVG',
    ext: 'svg',
    kind: 'svg',
    mode: 'router',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 3.175,
    notes: 'Shaper Origin ve SVG tabanlı dijital freze sistemleri için 1:1 mm SVG.',
  },

  // --- CNC Router G-Code ---
  routerProfile('gcode_router', 'Fanuc / Mach3 Standart CNC Router (.nc)', 'nc', {
    headerLines: ['%', 'G17 G21 G90 G40 G49'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30', '%'],
    notes: 'Fanuc 0i ve standart ISO CNC Router tezgahları için temel G-code.',
  }),
  routerProfile('gcode_mach3', 'Mach3 / Mach4 CNC Router (.tap)', 'tap', {
    feed: 1600,
    plunge: 450,
    headerLines: ['G90 G94 G91.1 G40 G49 G17', 'G21'],
    footerLines: ['M5', 'G28 G91 Z0', 'G90', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Mach3 / Mach4 tabela ve reklam CNC Router kontrolörü (.tap).',
  }),
  routerProfile('gcode_ncstudio', 'NcStudio / Weihong NK105 / NK260 (.nc)', 'nc', {
    feed: 1800,
    plunge: 500,
    headerLines: ['G90 G17 G21', 'G54'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Reklam atölyelerinde yaygın Weihong NcStudio / NK105 router postu.',
  }),
  routerProfile('gcode_syntec', 'Syntec 6MA / 6MB / 21MA Endüstriyel Router (.nc)', 'nc', {
    feed: 2200,
    plunge: 600,
    spindleOrPower: 18000,
    headerLines: ['%', 'O1001', 'G17 G21 G40 G49 G80 G90', 'G54'],
    footerLines: ['M5', 'G91 G28 Z0', 'G90', 'G0 X0.000 Y0.000', 'M30', '%'],
    notes: 'ATC magazini destekli Syntec endüstriyel CNC router kontrolörü.',
  }),
  routerProfile('gcode_richauto', 'RichAuto DSP A11 / A18 / B18 El Kumandası (.mmg)', 'mmg', {
    feed: 1500,
    plunge: 400,
    headerLines: ['G90', 'G21', 'G17'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'USB el kumandalı RichAuto A11/A18/B18 DSP CNC Router formatı (.mmg).',
  }),
  routerProfile('gcode_siemens', 'Siemens Sinumerik 808D / 828D / 840D (.mpf)', 'mpf', {
    feed: 1600,
    plunge: 450,
    commentStyle: 'semicolon',
    headerLines: ['G17 G71 G90 G40', 'G54'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Siemens Sinumerik ISO/G71 metrik post-processor (; yorum sözdizimi).',
  }),
  routerProfile('gcode_heidenhain', 'Heidenhain ISO CNC (.nc)', 'nc', {
    feed: 1500,
    plunge: 400,
    headerLines: ['%', 'G71 G17 G90 G40'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30', '%'],
    notes: 'Heidenhain TNC ISO modu için metrik CNC işleme programı.',
  }),
  routerProfile('gcode_linuxcnc', 'LinuxCNC / EMC2 Router (.ngc)', 'ngc', {
    feed: 1500,
    plunge: 400,
    headerLines: ['G17 G21 G40 G49 G54 G80 G90 G94', 'G64 P0.05'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M2'],
    notes: 'LinuxCNC / EMC2 sürekli yol (G64) destekli .ngc çıktısı.',
  }),
  routerProfile('gcode_grbl_router', 'GRBL 1.1 / FluidNC Masaüstü Router (.nc)', 'nc', {
    feed: 1000,
    plunge: 300,
    spindleOrPower: 12000,
    safeZ: 10.0,
    headerLines: ['G17 G21 G90 G94'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M2'],
    notes: 'GRBL 1.1, FluidNC, Shapeoko, X-Carve ve OpenBuilds router kontrolörleri.',
  }),
  routerProfile('gcode_biesse', 'Biesse Rover / bSolid ISO (.nc)', 'nc', {
    feed: 2500,
    plunge: 600,
    headerLines: ['G71 G90 G17', 'G54'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Biesse Rover CNC işleme merkezleri için metrik ISO taslak G-code.',
  }),
  routerProfile('gcode_homag', 'Homag / Weeke WoodWOP ISO (.nc)', 'nc', {
    feed: 2400,
    plunge: 600,
    headerLines: ['G71 G90 G17 G40'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Homag / Weeke CNC router sistemleri için standart metrik ISO çıktı.',
  }),
  routerProfile('gcode_multicam', 'MultiCam / AXYZ Tabela Router (.cnc)', 'cnc', {
    feed: 2000,
    plunge: 500,
    headerLines: ['M90', 'G90', 'G71', 'G75'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M02'],
    notes: 'MultiCam ve AXYZ reklam/tabela router tezgahları (.cnc).',
  }),
  routerProfile('gcode_shopbot', 'ShopBot / LNC / Delta Endüstriyel Router (.nc)', 'nc', {
    feed: 1800,
    plunge: 450,
    headerLines: ['G90 G21 G17', 'G54'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'LNC, Delta ve G-Code destekli ShopBot CNC Router kontrolörleri.',
  }),

  // --- Lazer, Plazma & Su Jeti G-Code ---
  {
    id: 'gcode_laser',
    category: CAT_LASER_GCODE,
    label: 'Fiber Lazer G-Code (M3/M5 Sabit Güç .nc)',
    ext: 'nc',
    kind: 'gcode',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.2,
    feed: 2400,
    plunge: 600,
    safeZ: 15.0,
    cutZ: 0,
    spindleOrPower: 1000,
    startCmd: 'M3 S1000',
    endCmd: 'M5',
    pierceDelaySec: 0,
    airAssist: false,
    commentStyle: 'paren',
    headerLines: ['G21', 'G90'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Standart M3/M5 sabit güçlü fiber / CO2 lazer kesim G-code.',
  },
  {
    id: 'gcode_grbl_laser',
    category: CAT_LASER_GCODE,
    label: 'GRBL / Diyot / CO2 Lazer (M4 Dinamik Güç .nc)',
    ext: 'nc',
    kind: 'gcode',
    mode: 'laser',
    defaultKerfMm: 0.15,
    defaultToolDiaMm: 0.2,
    feed: 1800,
    plunge: 600,
    safeZ: 5.0,
    cutZ: 0,
    spindleOrPower: 1000,
    startCmd: 'M4 S1000',
    endCmd: 'M5',
    pierceDelaySec: 0,
    airAssist: false,
    commentStyle: 'semicolon',
    headerLines: ['G21', 'G90', 'G94'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M2'],
    notes: 'GRBL 1.1+ Lazer Modu ($32=1) hız bağımlı M4 dinamik güç kontrolü.',
  },
  {
    id: 'gcode_co2_gcode',
    category: CAT_LASER_GCODE,
    label: 'CO2 Lazer G-Code (M3/M5 + Hava Destekli M8/M9 .nc)',
    ext: 'nc',
    kind: 'gcode',
    mode: 'laser',
    defaultKerfMm: 0.2,
    defaultToolDiaMm: 0.2,
    feed: 1600,
    plunge: 500,
    safeZ: 10.0,
    cutZ: 0,
    spindleOrPower: 850,
    startCmd: 'M3 S850',
    endCmd: 'M5',
    pierceDelaySec: 0.05,
    airAssist: true,
    commentStyle: 'paren',
    headerLines: ['G21', 'G90'],
    footerLines: ['M5', 'M9', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Pleksi/ahşap CO2 lazerler için M8/M9 hava üfleme destekli G-code.',
  },
  {
    id: 'gcode_plasma',
    category: CAT_LASER_GCODE,
    label: 'CNC Plazma THC (M3 + Delme Gecikmesi G4 .nc)',
    ext: 'nc',
    kind: 'gcode',
    mode: 'plasma',
    defaultKerfMm: 1.5,
    defaultToolDiaMm: 1.5,
    feed: 2200,
    plunge: 600,
    safeZ: 25.0,
    pierceZ: 4.0,
    cutZ: 1.5,
    spindleOrPower: 0,
    startCmd: 'M3',
    endCmd: 'M5',
    pierceDelaySec: 0.6,
    airAssist: false,
    commentStyle: 'paren',
    headerLines: ['G21', 'G90', 'G40'],
    footerLines: ['M5', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'CNC Plazma torç ateşleme (M3), delme gecikmesi (G4 P0.6) ve kesim yüksekliği.',
  },
  {
    id: 'gcode_waterjet',
    category: CAT_LASER_GCODE,
    label: 'CNC Su Jeti / Waterjet (M3/M8 Aşındırıcı .nc)',
    ext: 'nc',
    kind: 'gcode',
    mode: 'waterjet',
    defaultKerfMm: 1.0,
    defaultToolDiaMm: 1.0,
    feed: 600,
    plunge: 300,
    safeZ: 20.0,
    cutZ: 2.0,
    spindleOrPower: 0,
    startCmd: 'M3',
    endCmd: 'M5',
    pierceDelaySec: 0.5,
    airAssist: true,
    commentStyle: 'paren',
    headerLines: ['G21', 'G90', 'G40'],
    footerLines: ['M5', 'M9', 'G0 X0.000 Y0.000', 'M30'],
    notes: 'Yüksek basınç su + aşındırıcı (M8/M9) ve delme beklemesi içeren Waterjet G-code.',
  },

  // --- Plotter / Folyo & Flatbed Kesim ---
  {
    id: 'hpgl_plt',
    category: CAT_PLOTTER,
    label: 'Standart HPGL Plotter / Folyo Kesim (.plt)',
    ext: 'plt',
    kind: 'plt',
    mode: 'plt',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 0.25,
    hpglInit: ['IN;', 'SP1;'],
    notes: 'Evrensel 40 birim/mm HPGL/2 folyo kesim ve kalem plotter çıktısı.',
  },
  {
    id: 'plt_roland',
    category: CAT_PLOTTER,
    label: 'Roland CAMM-1 / GX / GR / VersaCAMM (.plt)',
    ext: 'plt',
    kind: 'plt',
    mode: 'plt',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 0.25,
    hpglInit: ['IN;', 'PA;', 'VS30;', 'SP1;'],
    notes: 'Roland CAMM-1, GS-24, GX-640 ve GR serisi folyo kesim plotterları.',
  },
  {
    id: 'plt_graphtec',
    category: CAT_PLOTTER,
    label: 'Graphtec FC9000 / CE7000 Serisi (.plt)',
    ext: 'plt',
    kind: 'plt',
    mode: 'plt',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 0.25,
    hpglInit: ['IN;', 'PA;', 'VS25;', 'SP1;'],
    notes: 'Graphtec GP-GL / HP-GL uyumlu FC8600, FC9000 ve CE7000 kesiciler.',
  },
  {
    id: 'plt_summa',
    category: CAT_PLOTTER,
    label: 'Summa S-Class / SummaCut (.plt)',
    ext: 'plt',
    kind: 'plt',
    mode: 'plt',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 0.25,
    hpglInit: ['IN;', 'PA;', 'SP1;'],
    notes: 'Summa teğet bıçaklı S-Class ve SummaCut vinil kesim sistemleri.',
  },
  {
    id: 'plt_mimaki',
    category: CAT_PLOTTER,
    label: 'Mimaki CG-SRIII / CG-FXII / CF Flatbed (.plt)',
    ext: 'plt',
    kind: 'plt',
    mode: 'plt',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 0.25,
    hpglInit: ['IN;', 'PA;', 'VS30;', 'SP1;'],
    notes: 'Mimaki CG rulo kesiciler ve CF serisi flatbed kesim masaları.',
  },
  {
    id: 'plt_zund',
    category: CAT_PLOTTER,
    label: 'Zünd G3 / S3 / Kongsberg / Esko Flatbed (.plt)',
    ext: 'plt',
    kind: 'plt',
    mode: 'plt',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 1.0,
    hpglInit: ['IN;', 'PA;', 'SP1;'],
    notes: 'Zünd, Kongsberg ve Esko dijital kesim masaları için HPGL kontur dosyası.',
  },
  {
    id: 'plt_gerber',
    category: CAT_PLOTTER,
    label: 'Gerber / Mutoh / GCC Jaguar Plotter (.plt)',
    ext: 'plt',
    kind: 'plt',
    mode: 'plt',
    defaultKerfMm: 0.0,
    defaultToolDiaMm: 0.25,
    hpglInit: ['IN;', 'PA;', 'VS25;', 'SP1;'],
    notes: 'Gerber, Mutoh ValueCut ve GCC Jaguar/Expert HPGL folyo plotterları.',
  },
];

export function getMachineProfile(id) {
  return MACHINE_PROFILES.find(p => p.id === id) || MACHINE_PROFILES[0];
}

export function validateNestedProduction(sheets, cncCfg) {
  const issues = [];
  if (!sheets?.length) {
    issues.push({ level: 'critical', msg: 'Nesting yerleşimi henüz oluşturulmadı. Önce Nesting sekmesinde yerleşim hesaplayın.' });
    return { valid: false, issues };
  }
  let totalParts = 0;
  for (const sh of sheets) {
    for (const p of (sh.placements || [])) {
      totalParts++;
      if (p.hasCollision) {
        issues.push({ level: 'critical', msg: `${sh.name || sh.materialLabel}: "${p.label}" parçasında çakışma var!` });
      }
      if (!p.outer || p.outer.length < 3) {
        issues.push({ level: 'critical', msg: `${sh.name || sh.materialLabel}: "${p.label}" kapalı kontur içermiyor.` });
      }
    }
  }
  if (totalParts === 0) {
    issues.push({ level: 'critical', msg: 'Üretilecek yerleşmiş parça bulunamadı.' });
  }
  if ((cncCfg?.kerfMm ?? 0) < 0 || (cncCfg?.toolDiameterMm ?? 0) < 0) {
    issues.push({ level: 'critical', msg: 'Kerf veya takım çapı negatif olamaz.' });
  }
  if ((cncCfg?.toolDiameterMm ?? 3) > 10) {
    issues.push({ level: 'warn', msg: 'Takım çapı 10 mm üzerinde — ince harf iç köşelerinde radyüs kalabilir.' });
  }
  const hasCritical = issues.some(i => i.level === 'critical');
  return { valid: !hasCritical, issues, totalParts };
}

/**
 * Generates machine-specific G-Code from actual nested sheet placements (1:1 mm).
 * Applies hole-first cutting sequence, dialect headers/footers, pierce delays, and safe Z plunges.
 */
export function generateNestedGcode(sheets, cncCfg = {}) {
  const requestedId = cncCfg.profile || 'gcode_laser';
  const requested = getMachineProfile(requestedId);
  const dialect = requested.kind === 'gcode'
    ? requested
    : getMachineProfile(requested.mode === 'laser' ? 'gcode_laser' : requested.mode === 'plasma' ? 'gcode_plasma' : requested.mode === 'waterjet' ? 'gcode_waterjet' : 'gcode_router');

  const mode = dialect.mode || 'router';
  const comment = text => (dialect.commentStyle === 'semicolon' ? `; ${text}` : `(${text})`);
  const safeZ = Number(dialect.safeZ ?? 15.0);
  const cutZ = Number(dialect.cutZ ?? -3.2);
  const pierceZ = Number(dialect.pierceZ ?? 4.0);
  const feed = Number(dialect.feed ?? (mode === 'laser' ? 2400 : 1200));
  const plunge = Number(dialect.plunge ?? 400);
  const kerf = Number(cncCfg.kerfMm ?? dialect.defaultKerfMm ?? 0.2);
  const toolDia = Number(cncCfg.toolDiameterMm ?? dialect.defaultToolDiaMm ?? 3);
  const leadIn = Number(cncCfg.leadInMm ?? 3);
  const holeFirst = cncCfg.sequence !== 'outer_first';

  const modeTitle = {
    laser: 'Lazer',
    plasma: 'Plazma THC',
    waterjet: 'Su Jeti (Waterjet)',
    router: 'CNC Router',
  }[mode] || 'CNC';

  const lines = [
    comment(`Kutu Harf Studyosu - ${modeTitle} Postprocessor`),
    comment(`Makine: ${dialect.label}`),
    comment(`Profil: ${requestedId} | Kerf: ${kerf}mm | Takim: ${toolDia}mm | Kompanzasyon: ${cncCfg.compensation || 'outside'}`),
    comment(`Lead-in: ${leadIn}mm | Sira: ${holeFirst ? 'Once Ic Delikler' : 'Once Dis Kontur'}`),
    ...(dialect.headerLines || ['G21', 'G90']),
    `G0 Z${safeZ.toFixed(2)}`,
  ];

  const emitLoop = (ring, label) => {
    if (!ring || ring.length < 3) return;
    lines.push(comment(`Parca: ${label}`));
    const p0 = ring[0];
    lines.push(`G0 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)}`);

    if (mode === 'laser') {
      if (dialect.airAssist) lines.push('M8');
      lines.push(dialect.startCmd || `M3 S${dialect.spindleOrPower ?? 1000}`);
      if (dialect.pierceDelaySec > 0) lines.push(`G4 P${dialect.pierceDelaySec}`);
    } else if (mode === 'plasma') {
      lines.push(`G0 Z${pierceZ.toFixed(2)}`);
      lines.push(dialect.startCmd || 'M3');
      if (dialect.pierceDelaySec > 0) lines.push(`G4 P${dialect.pierceDelaySec}`);
      lines.push(`G1 Z${cutZ.toFixed(2)} F${plunge}`);
    } else if (mode === 'waterjet') {
      lines.push(`G0 Z${cutZ.toFixed(2)}`);
      lines.push('M8');
      lines.push(dialect.startCmd || 'M3');
      if (dialect.pierceDelaySec > 0) lines.push(`G4 P${dialect.pierceDelaySec}`);
    } else {
      lines.push(dialect.startCmd || `M3 S${dialect.spindleOrPower ?? 18000}`);
      lines.push(`G1 Z${cutZ.toFixed(2)} F${plunge}`);
    }

    for (let i = 1; i < ring.length; i++) {
      lines.push(`G1 X${ring[i].x.toFixed(3)} Y${ring[i].y.toFixed(3)} F${feed}`);
    }
    lines.push(`G1 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)} F${feed}`);

    if (mode === 'laser') {
      lines.push(dialect.endCmd || 'M5');
      if (dialect.airAssist) lines.push('M9');
    } else if (mode === 'plasma') {
      lines.push(dialect.endCmd || 'M5');
      lines.push(`G0 Z${safeZ.toFixed(2)}`);
    } else if (mode === 'waterjet') {
      lines.push(dialect.endCmd || 'M5');
      lines.push('M9');
      lines.push(`G0 Z${safeZ.toFixed(2)}`);
    } else {
      lines.push(`G0 Z${safeZ.toFixed(2)}`);
    }
  };

  let sheetOffsetX = 0;
  for (const sh of sheets) {
    lines.push(comment(`=== ${sh.name || sh.materialLabel} ${sh.widthMm}x${sh.heightMm}mm ===`));
    for (const p of (sh.placements || [])) {
      const shift = r => r.map(pt => ({ x: pt.x + sheetOffsetX, y: pt.y }));
      if (holeFirst) {
        for (const h of (p.holes || [])) emitLoop(shift(h), `${p.label} [IC DELIK]`);
        emitLoop(shift(p.outer), `${p.label} [DIS]`);
      } else {
        emitLoop(shift(p.outer), `${p.label} [DIS]`);
        for (const h of (p.holes || [])) emitLoop(shift(h), `${p.label} [IC DELIK]`);
      }
    }
    sheetOffsetX += (sh.widthMm || 2000) + 100;
  }

  lines.push(`G0 Z${safeZ.toFixed(2)}`);
  lines.push(...(dialect.footerLines || ['M5', 'G0 X0.000 Y0.000', 'M30']));
  return lines.join('\n');
}

/**
 * Generates HPGL (.plt) plotter cut file from nested sheets.
 */
export function generateNestedHpgl(sheets, cncCfg = {}) {
  const profile = cncCfg?.profile ? getMachineProfile(cncCfg.profile) : null;
  const initCmds = profile?.kind === 'plt' && profile.hpglInit?.length ? [...profile.hpglInit] : ['IN;', 'SP1;'];
  const cmds = [...initCmds];
  const toHpgl = mm => Math.round(mm * 40); // 40 units/mm standard HPGL
  let offsetX = 0;
  for (const sh of sheets) {
    for (const p of (sh.placements || [])) {
      const rings = [...(p.holes || []), p.outer];
      for (const r of rings) {
        if (!r || r.length < 3) continue;
        cmds.push(`PU${toHpgl(r[0].x + offsetX)},${toHpgl(r[0].y)};`);
        const pts = r.slice(1).concat([r[0]]).map(pt => `${toHpgl(pt.x + offsetX)},${toHpgl(pt.y)}`).join(',');
        cmds.push(`PD${pts};`);
        cmds.push('PU;');
      }
    }
    offsetX += (sh.widthMm || 2000) + 100;
  }
  cmds.push('SP0;');
  return cmds.join('\n');
}
