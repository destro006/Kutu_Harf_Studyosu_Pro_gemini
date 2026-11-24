/**
 * Unified Application State Store (Single Source of Truth)
 * Drives 3D rendering, CAD layers, manufacturing metrics, nesting, costing, and exports.
 */

export function createObjectId(prefix = 'obj') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createDefaultState() {
  return {
    schemaVersion: 2,
    projectName: 'Yeni Tabela Projesi',
    mainWorkspace: 'model3d', // 'design2d' | 'model3d' | 'materials' | 'nesting' | 'cnc' | 'cost'
    activeDocker: 'properties', // 'objects' | 'properties' | 'layers' | 'materials' | 'manufacturing' | 'align'
    activeWorkspace: 'design',
    activeTool: 'select', // 'select' | 'move' | 'scale' | 'rotate' | 'pan' | 'zoom' | 'rect' | 'ellipse' | 'text' | 'pen' | 'node' | 'measure'
    quality: 'high', // 'performance' | 'balanced' | 'high' | 'ultra'
    constructionType: 'metal', // 'fileli' | 'pleksi' | 'metal' | 'halo' | 'isiksiz'

    dimensions: {
      heightMm: 400,
      depthMm: 80,
      letterSpacingMm: 8,
    },

    fileli: {
      fileWidthMm: 5,
      fileThicknessMm: 2,
      metalThicknessMm: 1, // Paslanmaz/alüminyum yanak sac kalınlığı; file yüksekliğinden bağımsız.
      fileMaterial: 'aynaAltin',
      fileColor: '#f5c66a',
      borderBevelMm: 0.8,
      acrylicInsetMm: 2.5,
      acrylicThicknessMm: 3,
      acrylicColor: '#f3f3ee',
    },

    materials: {
      faceId: 'aynaAltin',
      faceColor: '#f5c66a',
      sideId: 'aynaAltin',
      sideColor: '#f5c66a',
      sideFollowsFace: true,
    },

    materialOverrides: {
      metalness: null,
      roughness: null,
      brushDirection: 0,
      brushScale: 5,
      brushIntensity: 0.7,
      textureStrength: 0.25,
      bevelMm: 1.8,
      acrylicOpacity: 0.94,
      acrylicTransmission: 0.18,
    },

    ui: {
      stackMode: 'tabs', // 'tabs' | 'stacked'
      openSections: ['design', 'materials', 'lighting'],
      railExpanded: false,
      fullscreen: false,
    },

    pageLayout: {
      visible: false,
      preset: '2000x1000',
      displayUnit: 'mm', // Görüntüleme birimi; vektör/CNC koordinatları her zaman mm.
      widthMm: 2000,
      heightMm: 1000,
    },

    render: {
      envPreset: 'luxuryGold',
      envRotationDeg: 0,
      envPitchDeg: 0,
      envIntensity: 1.15,
      reflectionIntensity: 1.25,
      customCardScale: 1.0,
      exposure: 1.05,
      useCustomEnv: false,
    },

    lighting: {
      enabled: false,
      mode: 'none', // 'front' | 'halo' | 'both' | 'none'
      colorHex: '#ffc982',
      ledKind: 'mono', // 'mono' | 'rgb'
      frontIntensity: 1.0,
      backIntensity: 1.1,
      haloSpread: 1.0,
      falloff: 1.0,
      wallDistanceMm: 35,
    },

    scene: {
      night: true,
      wallId: 'tugla',
      transparentBg: false,
      cameraPreset: 'hero',
      showRuler: true,
      guidesMm: [],
    },

    photomontage: {
      photoUrl: null,
      photoName: '',
      cornersNorm: [
        { x: 0.22, y: 0.28 },
        { x: 0.78, y: 0.28 },
        { x: 0.78, y: 0.62 },
        { x: 0.22, y: 0.62 },
      ],
      wallShadow: 0.45,
      ambientMatch: 0.15,
    },

    grid: {
      visible: true,
      spacingMm: 50,
      snapToGrid: false,
      snapToObjects: true,
      snapToNodes: true,
      snapToCenters: true,
    },
    cnc: {
      kerfMm: 0.2,
      toolDiameterMm: 3.0,
      compensation: 'outside',
      sequence: 'hole_first',
      leadInMm: 3,
      leadOutMm: 2,
      microTabs: false,
      tabWidthMm: 2,
      commonLine: false,
      origin: 'bottom_left',
      profile: 'dxf_r2000',
      curveTolMm: 0.1,
    },
    activePageId: 'page_1',
    pages: [
      {
        id: 'page_1',
        name: 'Sayfa 1 — Ana Tabela',
        widthMm: 2000,
        heightMm: 1000,
        orientation: 'landscape',
        layers: [
          { id: 'layer_main', name: 'Ana Yazı Katmanı', visible: true, locked: false, exportable: true },
        ],
        objects: null,
      },
    ],
    selectedIds: ['obj_main_text'],
    objects: [
      {
        id: 'obj_main_text',
        layerId: 'layer_main',
        name: 'Ana Tabela Yazısı',
        kind: 'text',
        text: 'MARKANIZ',
        fontId: 'montserrat',
        heightMm: 400,
        depthMm: 80,
        letterSpacingMm: 8,
        lineSpacingMult: 1.25,
        textAlign: 'center',
        xMm: 0,
        yMm: 0,
        rotationDeg: 0,
        scaleX: 1,
        scaleY: 1,
        mirrorX: false,
        mirrorY: false,
        proportionalLock: true,
        visible: true,
        locked: false,
        groupId: null,
        constructionType: 'metal',
        fileWidthMm: 4,
        faceMaterial: 'aynaAltin',
        faceColor: '#f5c66a',
        sideMaterial: 'aynaAltin',
        sideColor: '#f5c66a',
        sideFollowsFace: true,
        fileMaterial: 'aynaAltin',
        fileColor: '#f5c66a',
        acrylicMaterial: 'opalPleksi',
        acrylicColor: '#f3f3ee',
        lightingMode: 'none',
      },
    ],

    nesting: {
      sheetWidthMm: 3000,
      sheetHeightMm: 1500,
      marginMm: 15,
      clearanceMm: 5,
      kerfMm: 0.4,
      allowedAngles: [0, 90, 180, 270],
      fineAngleStep: 0, // 0 = use allowedAngles, >0 = e.g. 45 or 15 deg steps
      rotationStepDeg: 90, // 0=fixed, 180=two positions, 90=quarter turns, 45=eighth turns
      placementStrategy: 'compact', // compact | vertical | bottomLeft
      previewColors: { body: '#246b83', holes: '#dca653' },
      copies: 1,
      grainDirection: 'none',
      targetPart: 'all',
      allowHoleNesting: true,
      groupByMaterial: true,
      marginLeftMm: 15,
      marginRightMm: 15,
      marginTopMm: 15,
      marginBottomMm: 15,
    },

    costConfig: {
      currency: 'TRY',
      rates: { TRY: 1, USD: 34.5, EUR: 37.2 },
      vatRate: 0.2,
      overheadPct: 12,
      pricingMode: 'unit', // 'unit' | 'markup' | 'margin'
      markupPct: 35,
      marginPct: 26,
      discountPct: 0,
      manualAdjustment: 0,
      mountingId: 'duvar', // 'duvar' | 'profil' | 'yok'
      priceBook: {}, // per-material independent buy/sell rates, keyed by face|side|file|acrylic|process
      extraItems: [], // custom project costs and customer sell amounts
      unitCosts: {
        acrylicPerM2: { value: 1450, currency: 'TRY' },
        metalFacePerM2: { value: 2200, currency: 'TRY' },
        fileBorderPerM2: { value: 2600, currency: 'TRY' },
        sidewallPerM2: { value: 1650, currency: 'TRY' },
        cuttingPerM: { value: 38, currency: 'TRY' },
        bendingPerM: { value: 65, currency: 'TRY' },
        weldingPerM: { value: 85, currency: 'TRY' },
        surfaceFinishing: { value: 450, currency: 'TRY' },
        polishing: { value: 380, currency: 'TRY' },
        paintingPerM2: { value: 620, currency: 'TRY' },
        ledModuleUnit: { value: 18, currency: 'TRY' },
        powerSupplyUnit: { value: 650, currency: 'TRY' },
        electricalInstall: { value: 550, currency: 'TRY' },
        laborHourly: { value: 350, currency: 'TRY' },
        estimatedHours: 6,
        machineUsage: { value: 480, currency: 'TRY' },
        transport: { value: 600, currency: 'TRY' },
        siteInstall: { value: 1200, currency: 'TRY' },
        otherExpenses: { value: 0, currency: 'TRY' },
      },
    },

    quote: {
      quoteNumber: 'KT-0001',
      companyLogoDataUrl: null,
      customerLogoDataUrl: null,
      customerAddress: '',
      paymentTerms: 'Ödeme koşulları karşılıklı anlaşma ile belirlenecektir.',
      companyName: 'Üretici Firma Adı',
      companyPhone: '',
      companyEmail: '',
      companyAddress: '',
      customerName: '',
      customerCompany: '',
      customerPhone: '',
      customerEmail: '',
      deliveryTerms: 'Atölye teslim veya yerinde montaj dahil',
      productionDays: 7,
      installationDetails: 'Duvara gizli saplama / şablonlu montaj',
      validityDays: 15,
      notes: 'Fiyatlara %20 KDV dahildir. Özel RAL ve elektrik hattı çekimi hariçtir.',
      locked: false,
      lockedSnapshot: null,
    },
  };
}

export class StateStore {
  constructor(initial) {
    this.state = initial || createDefaultState();
    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  set(nextState, meta = {}) {
    this.state = nextState;
    syncPageMirror(this.state);
    for (const fn of this.listeners) fn(this.state, meta);
  }

  update(updater, meta = {}) {
    const draft = structuredCloneSafe(this.state);
    updater(draft);
    this.set(draft, meta);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function syncPageMirror(state) {
  if (!state) return;
  if (!Array.isArray(state.pages) || !state.pages.length) {
    state.pages = [{
      id: 'page_1',
      name: 'Sayfa 1 — Ana Tabela',
      widthMm: state.pageLayout?.widthMm || 2000,
      heightMm: state.pageLayout?.heightMm || 1000,
      orientation: 'landscape',
      layers: [{ id: 'layer_main', name: 'Ana Yazı Katmanı', visible: true, locked: false, exportable: true }],
      objects: state.objects || [],
    }];
    state.activePageId = 'page_1';
  }
  const page = state.pages.find(p => p.id === state.activePageId) || state.pages[0];
  if (page) {
    state.activePageId = page.id;
    page.objects = state.objects || [];
    if (!page.layers?.length) {
      page.layers = [{ id: 'layer_main', name: 'Ana Yazı Katmanı', visible: true, locked: false, exportable: true }];
    }
  }
}
