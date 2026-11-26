/**
 * Built-in 35 Facade Image Library (Cephe Havuzu) + Custom Uploads + Non-Destructive Restore Defaults
 */

export const FACADE_STORAGE_KEY = 'khs_facade_pool_v1';

export const FACADE_CATEGORIES = [
  { id: 'all', label: 'Tümü (35)' },
  { id: '01_klasik_isletme_cepheleri', label: 'Klasik İşletme Cepheleri' },
  { id: '02_premium_isletme_cepheleri', label: 'Premium İşletme Cepheleri' },
  { id: '03_genis_premium_sahneler', label: 'Geniş Premium Sahneler' },
];

export const FACADE_FASCIA_PRESETS = Object.freeze({
  elegan_modern_klinik_vitrini: { ambient: 'day', fasciaCorners: [{ x: 0.21, y: 0.19 }, { x: 0.79, y: 0.19 }, { x: 0.79, y: 0.34 }, { x: 0.21, y: 0.34 }] },
  luks_altin_detayli_butik_cephesi: { ambient: 'golden', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.78, y: 0.18 }, { x: 0.78, y: 0.33 }, { x: 0.22, y: 0.33 }] },
  mahalle_marketinin_yesil_vitrini: { ambient: 'day', fasciaCorners: [{ x: 0.18, y: 0.17 }, { x: 0.82, y: 0.17 }, { x: 0.82, y: 0.33 }, { x: 0.18, y: 0.33 }] },
  modern_donanim_magazasi_cephesi: { ambient: 'day', fasciaCorners: [{ x: 0.20, y: 0.18 }, { x: 0.80, y: 0.18 }, { x: 0.80, y: 0.34 }, { x: 0.20, y: 0.34 }] },
  modern_endustriyel_garaj_magazasi: { ambient: 'night', fasciaCorners: [{ x: 0.22, y: 0.16 }, { x: 0.78, y: 0.18 }, { x: 0.78, y: 0.33 }, { x: 0.22, y: 0.32 }] },
  modern_kose_magaza_cephesi: { ambient: 'golden', fasciaCorners: [{ x: 0.20, y: 0.19 }, { x: 0.74, y: 0.15 }, { x: 0.74, y: 0.32 }, { x: 0.20, y: 0.34 }] },
  modern_magaza_cephesi_ve_sik_giris: { ambient: 'day', fasciaCorners: [{ x: 0.21, y: 0.18 }, { x: 0.79, y: 0.18 }, { x: 0.79, y: 0.33 }, { x: 0.21, y: 0.33 }] },
  sicak_isikli_buyuleyici_firin_vitrini: { ambient: 'night', fasciaCorners: [{ x: 0.22, y: 0.20 }, { x: 0.78, y: 0.20 }, { x: 0.78, y: 0.35 }, { x: 0.22, y: 0.35 }] },
  zarif_modern_butik_magazasi: { ambient: 'day', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.78, y: 0.18 }, { x: 0.78, y: 0.33 }, { x: 0.22, y: 0.33 }] },
  zarif_yesil_kafe_cephesi: { ambient: 'day', fasciaCorners: [{ x: 0.20, y: 0.19 }, { x: 0.80, y: 0.19 }, { x: 0.80, y: 0.34 }, { x: 0.20, y: 0.34 }] },
  art_deco_luks_mucevher_butigi: { ambient: 'night', fasciaCorners: [{ x: 0.23, y: 0.18 }, { x: 0.77, y: 0.18 }, { x: 0.77, y: 0.33 }, { x: 0.23, y: 0.33 }] },
  bej_travertenli_luks_moda_butigi: { ambient: 'golden', fasciaCorners: [{ x: 0.21, y: 0.17 }, { x: 0.79, y: 0.17 }, { x: 0.79, y: 0.32 }, { x: 0.21, y: 0.32 }] },
  endustriyel_siklikta_aksam_vitrini: { ambient: 'night', fasciaCorners: [{ x: 0.20, y: 0.18 }, { x: 0.80, y: 0.20 }, { x: 0.80, y: 0.35 }, { x: 0.20, y: 0.34 }] },
  luks_estetik_klinigi_girisi: { ambient: 'day', fasciaCorners: [{ x: 0.22, y: 0.17 }, { x: 0.78, y: 0.17 }, { x: 0.78, y: 0.32 }, { x: 0.22, y: 0.32 }] },
  mediterranean_restoranin_altin_saati_girisi: { ambient: 'golden', fasciaCorners: [{ x: 0.21, y: 0.19 }, { x: 0.79, y: 0.19 }, { x: 0.79, y: 0.34 }, { x: 0.21, y: 0.34 }] },
  modern_cam_magazasi_kosesi: { ambient: 'day', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.75, y: 0.15 }, { x: 0.75, y: 0.31 }, { x: 0.22, y: 0.33 }] },
  modern_premium_oto_detaylandirma_garaji: { ambient: 'night', fasciaCorners: [{ x: 0.19, y: 0.16 }, { x: 0.81, y: 0.16 }, { x: 0.81, y: 0.32 }, { x: 0.19, y: 0.32 }] },
  paris_sikliginda_zarif_pastane_cephesi: { ambient: 'golden', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.78, y: 0.18 }, { x: 0.78, y: 0.33 }, { x: 0.22, y: 0.33 }] },
  zarif_cicekci_butigi_cephesi: { ambient: 'day', fasciaCorners: [{ x: 0.21, y: 0.19 }, { x: 0.79, y: 0.19 }, { x: 0.79, y: 0.34 }, { x: 0.21, y: 0.34 }] },
  zeytin_yesili_zarif_kafe_cephesi: { ambient: 'day', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.78, y: 0.18 }, { x: 0.78, y: 0.33 }, { x: 0.22, y: 0.33 }] },
  alisveris_caddesi: { ambient: 'day', fasciaCorners: [{ x: 0.22, y: 0.17 }, { x: 0.78, y: 0.19 }, { x: 0.78, y: 0.34 }, { x: 0.22, y: 0.32 }] },
  bronz_sacakli_otel: { ambient: 'night', fasciaCorners: [{ x: 0.23, y: 0.21 }, { x: 0.77, y: 0.21 }, { x: 0.77, y: 0.35 }, { x: 0.23, y: 0.35 }] },
  cam_kurumsal_bina: { ambient: 'day', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.78, y: 0.18 }, { x: 0.78, y: 0.33 }, { x: 0.22, y: 0.33 }] },
  genis_restoran: { ambient: 'night', fasciaCorners: [{ x: 0.20, y: 0.17 }, { x: 0.80, y: 0.17 }, { x: 0.80, y: 0.32 }, { x: 0.20, y: 0.32 }] },
  kose_mermer_cephe: { ambient: 'golden', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.74, y: 0.15 }, { x: 0.74, y: 0.31 }, { x: 0.22, y: 0.33 }] },
  luks_moda_butigi: { ambient: 'night', fasciaCorners: [{ x: 0.23, y: 0.18 }, { x: 0.77, y: 0.18 }, { x: 0.77, y: 0.33 }, { x: 0.23, y: 0.33 }] },
  mermer_alinlikli_magaza: { ambient: 'day', fasciaCorners: [{ x: 0.21, y: 0.16 }, { x: 0.79, y: 0.16 }, { x: 0.79, y: 0.31 }, { x: 0.21, y: 0.31 }] },
  modern_showroom: { ambient: 'day', fasciaCorners: [{ x: 0.19, y: 0.16 }, { x: 0.81, y: 0.16 }, { x: 0.81, y: 0.31 }, { x: 0.19, y: 0.31 }] },
  otel_girisi: { ambient: 'night', fasciaCorners: [{ x: 0.23, y: 0.20 }, { x: 0.77, y: 0.20 }, { x: 0.77, y: 0.34 }, { x: 0.23, y: 0.34 }] },
  otomobil_showroom: { ambient: 'night', fasciaCorners: [{ x: 0.18, y: 0.15 }, { x: 0.82, y: 0.17 }, { x: 0.82, y: 0.32 }, { x: 0.18, y: 0.31 }] },
  premium_ticari_kompleks: { ambient: 'golden', fasciaCorners: [{ x: 0.21, y: 0.17 }, { x: 0.79, y: 0.17 }, { x: 0.79, y: 0.32 }, { x: 0.21, y: 0.32 }] },
  restoran_dogal_tas: { ambient: 'golden', fasciaCorners: [{ x: 0.21, y: 0.18 }, { x: 0.79, y: 0.18 }, { x: 0.79, y: 0.33 }, { x: 0.21, y: 0.33 }] },
  restoran_teras: { ambient: 'golden', fasciaCorners: [{ x: 0.22, y: 0.18 }, { x: 0.78, y: 0.18 }, { x: 0.78, y: 0.33 }, { x: 0.22, y: 0.33 }] },
  sampanya_metal_cephe: { ambient: 'day', fasciaCorners: [{ x: 0.20, y: 0.17 }, { x: 0.80, y: 0.17 }, { x: 0.80, y: 0.32 }, { x: 0.20, y: 0.32 }] },
  traverten_kurumsal_giris: { ambient: 'day', fasciaCorners: [{ x: 0.21, y: 0.16 }, { x: 0.79, y: 0.16 }, { x: 0.79, y: 0.31 }, { x: 0.21, y: 0.31 }] },
});

const DEFAULT_FASCIA_CORNERS = [
  { x: 0.21, y: 0.18 },
  { x: 0.79, y: 0.18 },
  { x: 0.79, y: 0.33 },
  { x: 0.21, y: 0.33 },
];

export function getFacadeFasciaPreset(facadeId) {
  const entry = FACADE_FASCIA_PRESETS[facadeId];
  return {
    ambient: entry?.ambient || 'day',
    fasciaCorners: (entry?.fasciaCorners || DEFAULT_FASCIA_CORNERS).map(c => ({ x: c.x, y: c.y })),
  };
}

export const DEFAULT_FACADES = Object.freeze([
  { id: 'elegan_modern_klinik_vitrini', label: 'Elegan Modern Klinik Vitrini', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/elegan_modern_klinik_vitrini.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/elegan_modern_klinik_vitrini.webp' },
  { id: 'luks_altin_detayli_butik_cephesi', label: 'Lüks Altın Detaylı Butik Cephesi', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/luks_altin_detayli_butik_cephesi.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/luks_altin_detayli_butik_cephesi.webp' },
  { id: 'mahalle_marketinin_yesil_vitrini', label: 'Mahalle Marketinin Yeşil Vitrini', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/mahalle_marketinin_yesil_vitrini.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/mahalle_marketinin_yesil_vitrini.webp' },
  { id: 'modern_donanim_magazasi_cephesi', label: 'Modern Donanım Mağazası Cephesi', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/modern_donanim_magazasi_cephesi.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/modern_donanim_magazasi_cephesi.webp' },
  { id: 'modern_endustriyel_garaj_magazasi', label: 'Modern Endüstriyel Garaj Mağazası', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/modern_endustriyel_garaj_magazasi.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/modern_endustriyel_garaj_magazasi.webp' },
  { id: 'modern_kose_magaza_cephesi', label: 'Modern Köşe Mağaza Cephesi', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/modern_kose_magaza_cephesi.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/modern_kose_magaza_cephesi.webp' },
  { id: 'modern_magaza_cephesi_ve_sik_giris', label: 'Modern Mağaza Cephesi Ve Şık Giriş', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/modern_magaza_cephesi_ve_sik_giris.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/modern_magaza_cephesi_ve_sik_giris.webp' },
  { id: 'sicak_isikli_buyuleyici_firin_vitrini', label: 'Sıcak Işıklı Büyüleyici Fırın Vitrini', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/sicak_isikli_buyuleyici_firin_vitrini.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/sicak_isikli_buyuleyici_firin_vitrini.webp' },
  { id: 'zarif_modern_butik_magazasi', label: 'Zarif Modern Butik Mağazası', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/zarif_modern_butik_magazasi.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/zarif_modern_butik_magazasi.webp' },
  { id: 'zarif_yesil_kafe_cephesi', label: 'Zarif Yeşil Kafe Cephesi', category: '01_klasik_isletme_cepheleri', src: './public/facades/01_klasik_isletme_cepheleri/zarif_yesil_kafe_cephesi.webp', thumb: './public/facades/thumbs/01_klasik_isletme_cepheleri/zarif_yesil_kafe_cephesi.webp' },
  { id: 'art_deco_luks_mucevher_butigi', label: 'Art Deco Lüks Mücevher Butiği', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/art_deco_luks_mucevher_butigi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/art_deco_luks_mucevher_butigi.webp' },
  { id: 'bej_travertenli_luks_moda_butigi', label: 'Bej Travertenli Lüks Moda Butiği', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/bej_travertenli_luks_moda_butigi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/bej_travertenli_luks_moda_butigi.webp' },
  { id: 'endustriyel_siklikta_aksam_vitrini', label: 'Endüstriyel Şıklıkta Akşam Vitrini', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/endustriyel_siklikta_aksam_vitrini.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/endustriyel_siklikta_aksam_vitrini.webp' },
  { id: 'luks_estetik_klinigi_girisi', label: 'Lüks Estetik Kliniği Girişi', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/luks_estetik_klinigi_girisi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/luks_estetik_klinigi_girisi.webp' },
  { id: 'mediterranean_restoranin_altin_saati_girisi', label: 'Mediterranean Restoranın Altın Saati Girişi', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/mediterranean_restoranin_altin_saati_girisi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/mediterranean_restoranin_altin_saati_girisi.webp' },
  { id: 'modern_cam_magazasi_kosesi', label: 'Modern Cam Mağazası Köşesi', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/modern_cam_magazasi_kosesi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/modern_cam_magazasi_kosesi.webp' },
  { id: 'modern_premium_oto_detaylandirma_garaji', label: 'Modern Premium Oto Detaylandırma Garajı', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/modern_premium_oto_detaylandirma_garaji.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/modern_premium_oto_detaylandirma_garaji.webp' },
  { id: 'paris_sikliginda_zarif_pastane_cephesi', label: 'Paris Şıklığında Zarif Pastane Cephesi', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/paris_sikliginda_zarif_pastane_cephesi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/paris_sikliginda_zarif_pastane_cephesi.webp' },
  { id: 'zarif_cicekci_butigi_cephesi', label: 'Zarif Çiçekçi Butiği Cephesi', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/zarif_cicekci_butigi_cephesi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/zarif_cicekci_butigi_cephesi.webp' },
  { id: 'zeytin_yesili_zarif_kafe_cephesi', label: 'Zeytin Yeşili Zarif Kafe Cephesi', category: '02_premium_isletme_cepheleri', src: './public/facades/02_premium_isletme_cepheleri/zeytin_yesili_zarif_kafe_cephesi.webp', thumb: './public/facades/thumbs/02_premium_isletme_cepheleri/zeytin_yesili_zarif_kafe_cephesi.webp' },
  { id: 'alisveris_caddesi', label: 'Alışveriş Caddesi', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/alisveris_caddesi.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/alisveris_caddesi.webp' },
  { id: 'bronz_sacakli_otel', label: 'Bronz Saçaklı Otel', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/bronz_sacakli_otel.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/bronz_sacakli_otel.webp' },
  { id: 'cam_kurumsal_bina', label: 'Cam Kurumsal Bina', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/cam_kurumsal_bina.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/cam_kurumsal_bina.webp' },
  { id: 'genis_restoran', label: 'Geniş Restoran', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/genis_restoran.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/genis_restoran.webp' },
  { id: 'kose_mermer_cephe', label: 'Köşe Mermer Cephe', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/kose_mermer_cephe.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/kose_mermer_cephe.webp' },
  { id: 'luks_moda_butigi', label: 'Lüks Moda Butiği', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/luks_moda_butigi.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/luks_moda_butigi.webp' },
  { id: 'mermer_alinlikli_magaza', label: 'Mermer Alınlıklı Mağaza', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/mermer_alinlikli_magaza.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/mermer_alinlikli_magaza.webp' },
  { id: 'modern_showroom', label: 'Modern Showroom', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/modern_showroom.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/modern_showroom.webp' },
  { id: 'otel_girisi', label: 'Otel Girişi', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/otel_girisi.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/otel_girisi.webp' },
  { id: 'otomobil_showroom', label: 'Otomobil Showroom', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/otomobil_showroom.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/otomobil_showroom.webp' },
  { id: 'premium_ticari_kompleks', label: 'Premium Ticari Kompleks', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/premium_ticari_kompleks.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/premium_ticari_kompleks.webp' },
  { id: 'restoran_dogal_tas', label: 'Restoran Doğal Taş', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/restoran_dogal_tas.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/restoran_dogal_tas.webp' },
  { id: 'restoran_teras', label: 'Restoran Teras', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/restoran_teras.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/restoran_teras.webp' },
  { id: 'sampanya_metal_cephe', label: 'Şampanya Metal Cephe', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/sampanya_metal_cephe.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/sampanya_metal_cephe.webp' },
  { id: 'traverten_kurumsal_giris', label: 'Traverten Kurumsal Giriş', category: '03_genis_premium_sahneler', src: './public/facades/03_genis_premium_sahneler/traverten_kurumsal_giris.webp', thumb: './public/facades/thumbs/03_genis_premium_sahneler/traverten_kurumsal_giris.webp' },
]);

function readPoolStore(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return { hiddenIds: [], custom: [] };
  try {
    const raw = JSON.parse(storage.getItem(FACADE_STORAGE_KEY) || 'null');
    return {
      hiddenIds: Array.isArray(raw?.hiddenIds) ? raw.hiddenIds : [],
      custom: Array.isArray(raw?.custom) ? raw.custom : [],
    };
  } catch {
    return { hiddenIds: [], custom: [] };
  }
}

function writePoolStore(pool, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return false;
  try {
    storage.setItem(FACADE_STORAGE_KEY, JSON.stringify({
      hiddenIds: [...new Set(pool.hiddenIds || [])],
      custom: pool.custom || [],
    }));
    return true;
  } catch {
    return false;
  }
}

export function getActiveFacades(storage) {
  const pool = readPoolStore(storage);
  const hidden = new Set(pool.hiddenIds);
  const builtins = DEFAULT_FACADES.filter(f => !hidden.has(f.id)).map(f => ({
    ...f,
    ...getFacadeFasciaPreset(f.id),
  }));
  return [...(pool.custom || []), ...builtins];
}

export function getHiddenDefaultCount(storage) {
  return readPoolStore(storage).hiddenIds.length;
}

export function deleteFacadeById(id, storage) {
  const pool = readPoolStore(storage);
  const isCustom = (pool.custom || []).some(c => c.id === id);
  if (isCustom) {
    pool.custom = pool.custom.filter(c => c.id !== id);
  } else if (DEFAULT_FACADES.some(f => f.id === id)) {
    pool.hiddenIds = [...new Set([...pool.hiddenIds, id])];
  }
  writePoolStore(pool, storage);
  return getActiveFacades(storage);
}

export function addCustomFacade({ label, dataUrl, category = '01_klasik_isletme_cepheleri' }, storage) {
  const pool = readPoolStore(storage);
  const entry = {
    id: `custom_facade_${Date.now().toString(36)}`,
    label: String(label || 'Özel Cephe').trim(),
    category,
    custom: true,
    src: dataUrl,
    thumb: dataUrl,
  };
  pool.custom = [entry, ...(pool.custom || [])].slice(0, 20);
  writePoolStore(pool, storage);
  return entry;
}

export function restoreDefaultFacades(storage) {
  const pool = readPoolStore(storage);
  pool.hiddenIds = [];
  writePoolStore(pool, storage);
  return getActiveFacades(storage);
}

const normTr = s => String(s || '')
  .toLocaleLowerCase('tr-TR')
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
  .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function findFacadeByQuery(query, storage) {
  const q = normTr(query);
  if (!q) return null;
  const list = getActiveFacades(storage);
  let best = null;
  let bestScore = 0;
  const words = q.split(' ').filter(Boolean);
  for (const f of list) {
    const target = `${normTr(f.label)} ${normTr(f.id.replace(/_/g, ' '))}`;
    if (target === q || f.id === q.replace(/\s+/g, '_')) return f;
    let score = 0;
    for (const w of words) {
      if (target.includes(w)) score += w.length * 2;
    }
    if (target.includes(q)) score += 20;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore > 0 ? best : null;
}
