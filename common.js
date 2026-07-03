/* ============================================================
 *  COMMON  —  util UI + kompres foto + sinkron master
 * ============================================================ */
const UI = (() => {
  // ---------- Toast ----------
  function toast(msg, type = "") {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(8px)"; t.style.transition = "all .3s"; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------- Blocking loader (di depan layar sampai selesai) ----------
  let loaderEl = null;
  function ensureLoader() {
    if (loaderEl) return loaderEl;
    loaderEl = document.createElement("div");
    loaderEl.className = "loader";
    loaderEl.innerHTML =
      '<div class="spinner"></div>' +
      '<div class="msg" id="ldMsg">Memproses…</div>' +
      '<div class="sub" id="ldSub"></div>' +
      '<div class="progress"><div class="bar" id="ldBar"></div></div>';
    document.body.appendChild(loaderEl);
    return loaderEl;
  }
  function showLoader(msg, sub) {
    ensureLoader();
    document.getElementById("ldMsg").textContent = msg || "Memproses…";
    document.getElementById("ldSub").textContent = sub || "";
    document.getElementById("ldBar").style.width = "0%";
    loaderEl.classList.add("show");
  }
  function updateLoader(msg, ratio) {
    if (!loaderEl) return;
    if (msg) document.getElementById("ldMsg").textContent = msg;
    if (typeof ratio === "number") document.getElementById("ldBar").style.width = Math.round(ratio * 100) + "%";
  }
  function setLoaderSub(sub) { if (loaderEl) document.getElementById("ldSub").textContent = sub || ""; }
  function hideLoader() { if (loaderEl) loaderEl.classList.remove("show"); }

  // ---------- Modal ----------
  function modal(html) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "overlay show";
      ov.innerHTML = '<div class="modal">' + html + '</div>';
      document.body.appendChild(ov);
      ov._close = (val) => { ov.remove(); resolve(val); };
      ov.addEventListener("click", (e) => { if (e.target === ov) ov._close(null); });
    });
  }

  // ---------- Kompres foto -> dataURL JPEG ----------
  function compress(file) {
    const C = window.APP_CONFIG;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;
        const max = C.IMG_MAX_DIM;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", C.IMG_QUALITY));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Gagal membaca gambar")); };
      img.src = url;
    });
  }

  function uid(prefix) {
    return (prefix || "D") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  return { toast, showLoader, updateLoader, setLoaderSub, hideLoader, modal, compress, uid, esc };
})();

/* ---------- Sinkron master (incremental, tambah/edit/hapus) ---------- */
const MasterSync = (() => {
  let timer = null;
  let syncing = false;

  function setDot(state) {
    const el = document.querySelector(".sync-dot");
    if (!el) return;
    el.classList.toggle("syncing", state === "syncing");
    const label = el.querySelector(".label");
    if (label) label.textContent = state === "syncing" ? "Menyinkron…" : "Master tersinkron";
  }

  async function syncOnce() {
    if (syncing || !API.isConfigured()) return;
    syncing = true; setDot("syncing");
    try {
      const since = (await DB.getMeta("lastSync")) || 0;
      const res = await API.getMasterSince(since);
      if (res && res.rows && res.rows.length) await DB.upsertMany(res.rows);
      if (res && res.serverTime) await DB.setMeta("lastSync", res.serverTime);
      window.dispatchEvent(new CustomEvent("master:updated"));
    } catch (e) {
      /* diam saja — ini proses latar belakang */
    } finally {
      syncing = false; setDot("idle");
    }
  }

  function start() {
    // Sinkron master HANYA saat halaman dibuka / refresh (tanpa polling otomatis).
    // Untuk update segera, pengguna cukup refresh browser / klik Muat ulang.
    syncOnce();
  }

  return { start, syncOnce };
})();

/* ---------- Navigasi aktif ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.getAttribute("data-nav") === page) a.classList.add("active");
  });
});
