/* ============================================================
 *  IndexedDB  —  KHUSUS cache MASTER (Part Number + Part Name)
 *  Ini satu-satunya data yang disimpan lokal, supaya autofill
 *  Part Name nyaris tanpa loading. Data input/foto TIDAK disimpan
 *  lokal (semua langsung ke server).
 * ============================================================ */
const DB = (() => {
  const DB_NAME = "partInspectionDB";
  const DB_VER = 1;
  const STORE_MASTER = "master";
  const STORE_META = "meta";
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MASTER)) {
          const s = db.createObjectStore(STORE_MASTER, { keyPath: "id" });
          s.createIndex("pnKey", "pnKey", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  // normalisasi PN untuk pencocokan case-insensitive
  function norm(pn) { return String(pn || "").trim().toUpperCase(); }

  async function upsertMany(rows) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_MASTER, "readwrite");
      const s = t.objectStore(STORE_MASTER);
      rows.forEach((r) => {
        if (r.deleted === true || r.deleted === "TRUE") {
          s.delete(r.id);
        } else {
          s.put({ id: r.id, partNumber: r.partNumber, partName: r.partName, pnKey: norm(r.partNumber) });
        }
      });
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
    });
  }

  async function getAll() {
    const s = await tx(STORE_MASTER, "readonly");
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function findByPN(pn) {
    const key = norm(pn);
    const s = await tx(STORE_MASTER, "readonly");
    return new Promise((resolve, reject) => {
      const idx = s.index("pnKey");
      const req = idx.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function count() {
    const s = await tx(STORE_MASTER, "readonly");
    return new Promise((resolve, reject) => {
      const req = s.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getMeta(key) {
    const s = await tx(STORE_META, "readonly");
    return new Promise((resolve) => {
      const req = s.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    });
  }

  async function setMeta(key, value) {
    const s = await tx(STORE_META, "readwrite");
    return new Promise((resolve, reject) => {
      const req = s.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  return { upsertMany, getAll, findByPN, count, getMeta, setMeta, norm };
})();
