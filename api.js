/* ============================================================
 *  API  —  komunikasi ke Google Apps Script (GAS)
 *  Memakai Content-Type text/plain agar TIDAK memicu CORS preflight.
 * ============================================================ */
const API = (() => {
  const C = window.APP_CONFIG;

  function isConfigured() {
    return C.GAS_URL && !C.GAS_URL.startsWith("PASTE") && C.TOKEN && !C.TOKEN.startsWith("PASTE");
  }

  async function call(action, payload = {}, { timeout = 60000 } = {}) {
    if (!isConfigured()) {
      throw new Error("Aplikasi belum dikonfigurasi. Isi GAS_URL & TOKEN di config.js");
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(C.GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, token: C.TOKEN, ...payload }),
        signal: ctrl.signal,
        redirect: "follow"
      });
    } catch (e) {
      clearTimeout(timer);
      throw new Error("Gagal terhubung ke server. Cek koneksi internet.");
    }
    clearTimeout(timer);
    let json;
    try { json = await res.json(); }
    catch (e) { throw new Error("Respon server tidak valid."); }
    if (!json.ok) throw new Error(json.error || "Terjadi kesalahan di server.");
    return json.data;
  }

  return {
    isConfigured,
    // ---- Master ----
    getMasterSince: (since) => call("getMasterSince", { since }),
    addMaster: (partNumber, partName) => call("addMaster", { partNumber, partName }),
    updateMaster: (id, partNumber, partName) => call("updateMaster", { id, partNumber, partName }),
    deleteMaster: (id) => call("deleteMaster", { id }),
    // ---- Data / Pending ----
    getPending: () => call("getPending"),
    getData: (since) => call("getData", { since: since || 0 }),
    savePending: (row) => call("savePending", { row }),
    submitData: (row) => call("submitData", { row }),
    deleteData: (draftId) => call("deleteData", { draftId }),
    // ---- Foto ----
    uploadPhoto: (p) => call("uploadPhoto", p, { timeout: 90000 }),
    getPhoto: (id) => call("getPhoto", { id }, { timeout: 90000 })
  };
})();
