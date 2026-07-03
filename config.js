/* ============================================================
 *  KONFIGURASI  —  isi 2 nilai di bawah setelah deploy GAS.
 * ============================================================
 *  1. GAS_URL : URL Web App dari Apps Script (Deploy > New deployment
 *               > Web app). Bentuknya: https://script.google.com/macros/s/XXXX/exec
 *  2. TOKEN   : token rahasia. Jalankan fungsi setup() di GAS, lalu
 *               salin token yang muncul di log ke sini.
 * ============================================================ */
window.APP_CONFIG = {
  GAS_URL: "PASTE_URL_WEB_APP_GAS_DI_SINI",
  TOKEN:   "PASTE_TOKEN_DI_SINI",

  // Pengaturan lanjutan (boleh dibiarkan default)
  DATA_POLL_MS: 60000,       // Lihat Data mengecek data baru tiap 60 detik
  MAX_PHOTOS: 5,             // maks foto before / after
  IMG_MAX_DIM: 1280,         // px sisi terpanjang setelah kompres
  IMG_QUALITY: 0.7,          // kualitas JPEG 0..1
  APP_NAME: "Part Inspection"
};
