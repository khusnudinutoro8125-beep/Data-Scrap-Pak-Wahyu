/* ============================================================
 *  INPUT PAGE
 * ============================================================ */
(() => {
  const C = window.APP_CONFIG;
  const beforePhotos = []; // dataURL[]
  const afterPhotos = [];  // dataURL[]
  let resumeDraftId = null;      // jika melanjutkan dari Pending
  let resumeBeforeIds = null;    // fileId before yang sudah di server

  const $ = (id) => document.getElementById(id);
  const pn = $("pn"), pname = $("pname"), qty = $("qty");

  /* ---------- QTY stepper ---------- */
  $("qtyMinus").onclick = () => { qty.value = Math.max(1, (parseInt(qty.value) || 1) - 1); };
  $("qtyPlus").onclick = () => { qty.value = (parseInt(qty.value) || 0) + 1; };

  /* ---------- Autofill Part Name dari cache master ---------- */
  let matched = null;
  async function refreshDatalist() {
    const all = await DB.getAll();
    const dl = $("pnList");
    dl.innerHTML = all.slice(0, 500).map((r) => `<option value="${UI.esc(r.partNumber)}"></option>`).join("");
  }
  async function lookup() {
    const val = pn.value.trim();
    if (!val) { matched = null; pname.value = ""; pname.readOnly = true; setHint(""); return; }
    matched = await DB.findByPN(val);
    if (matched) {
      pname.value = matched.partName; pname.readOnly = true;
      setHint("Part terdaftar di master.", "ok");
    } else {
      pname.value = ""; pname.readOnly = true;
      setHint("Part number belum terdaftar — akan dikonfirmasi saat simpan.", "warn");
    }
  }
  function setHint(msg, type) {
    const h = $("pnHint");
    h.textContent = msg || "Ketik untuk mencari. Part Name terisi otomatis bila terdaftar.";
    h.className = "hint" + (type === "warn" ? " warn" : "");
  }
  pn.addEventListener("input", lookup);
  pn.addEventListener("change", lookup);
  window.addEventListener("master:updated", refreshDatalist);

  /* ---------- Foto grid ---------- */
  function renderGrid(gridId, arr, countId, kind) {
    const grid = $(gridId);
    grid.innerHTML = "";
    arr.forEach((src, i) => {
      const tile = document.createElement("div");
      tile.className = "photo-tile";
      tile.innerHTML = `<img src="${src}" /><button type="button" class="remove" data-i="${i}">×</button>`;
      tile.querySelector(".remove").onclick = () => { arr.splice(i, 1); renderGrid(gridId, arr, countId, kind); updateMainBtn(); };
      grid.appendChild(tile);
    });
    if (arr.length < C.MAX_PHOTOS) {
      const add = document.createElement("div");
      add.className = "photo-add";
      add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Tambah';
      add.onclick = () => $(kind + "Input").click();
      grid.appendChild(add);
    }
    $(countId).textContent = arr.length + "/" + C.MAX_PHOTOS;
  }

  async function handleFiles(files, arr, gridId, countId, kind) {
    const list = Array.from(files);
    for (const f of list) {
      if (arr.length >= C.MAX_PHOTOS) { UI.toast("Maksimal " + C.MAX_PHOTOS + " foto", "err"); break; }
      try { arr.push(await UI.compress(f)); } catch (e) { UI.toast("Gagal memproses foto", "err"); }
    }
    renderGrid(gridId, arr, countId, kind);
    updateMainBtn();
  }
  $("beforeInput").onchange = (e) => { handleFiles(e.target.files, beforePhotos, "beforeGrid", "beforeCount", "before"); e.target.value = ""; };
  $("afterInput").onchange  = (e) => { handleFiles(e.target.files, afterPhotos,  "afterGrid",  "afterCount",  "after"); e.target.value = ""; };

  /* ---------- Tombol utama: dinamis ---------- */
  function updateMainBtn() {
    const btn = $("mainBtn");
    if (afterPhotos.length > 0) {
      btn.textContent = "Submit"; btn.className = "btn btn-success btn-block btn-lg";
    } else {
      btn.textContent = "Simpan sebagai Pending"; btn.className = "btn btn-primary btn-block btn-lg";
    }
  }

  /* ---------- Popup PN manual ---------- */
  async function confirmManualPN(pnValue) {
    const html = `
      <div class="modal-icon warn"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></div>
      <h3>Part Number Baru</h3>
      <p class="sub"><b>${UI.esc(pnValue)}</b> belum terdaftar di master. Isi Part Name untuk menambahkannya.</p>
      <div class="field"><label>Part Name</label>
        <input class="input" id="mName" placeholder="NAMA PART" style="text-transform:uppercase" /></div>
      <div class="btn-row" style="margin-top:8px">
        <button type="button" class="btn btn-secondary" id="mCancel">Batal</button>
        <button type="button" class="btn btn-primary" id="mOk">Tambah ke Master</button>
      </div>`;
    const p = UI.modal(html);
    const ov = document.querySelector(".overlay:last-child");
    const nameEl = ov.querySelector("#mName");
    nameEl.addEventListener("input", () => { nameEl.value = nameEl.value.toUpperCase(); });
    ov.querySelector("#mCancel").onclick = () => ov._close(null);
    ov.querySelector("#mOk").onclick = () => {
      const nm = nameEl.value.trim().toUpperCase();
      if (!nm) { nameEl.focus(); return; }
      ov._close(nm);
    };
    return p; // null (batal) atau string partName
  }

  /* ---------- Upload foto (blocking + progress) ---------- */
  async function uploadAll(draftId, kind, arr, startRatio, span, meta) {
    const ids = [];
    for (let i = 0; i < arr.length; i++) {
      UI.updateLoader("Mengunggah foto " + kind + " (" + (i + 1) + "/" + arr.length + ")", startRatio + span * (i / Math.max(1, arr.length)));
      const r = await API.uploadPhoto({ draftId, kind, index: i, dataUrl: arr[i], partNumber: meta.pn, partName: meta.name });
      ids.push(r.id);
    }
    return ids;
  }

  /* ---------- Aksi utama ---------- */
  $("mainBtn").onclick = async () => {
    const pnVal = pn.value.trim();
    if (!pnVal) { UI.toast("Part Number wajib diisi", "err"); pn.focus(); return; }
    const qtyVal = parseInt(qty.value) || 0;
    if (qtyVal < 1) { UI.toast("QTY minimal 1", "err"); return; }
    if (beforePhotos.length === 0 && !resumeDraftId) { UI.toast("Tambahkan minimal 1 Foto Before", "err"); return; }
    const isSubmit = afterPhotos.length > 0;

    // Resolusi Part Name / master
    let finalName = pname.value.trim();
    if (!matched) {
      const nm = await confirmManualPN(pnVal);
      if (nm === null) return; // dibatalkan
      finalName = nm;
    }

    try {
      UI.showLoader("Menyimpan…", "Mohon tunggu sampai selesai");
      // 1) Tambah master baru bila perlu
      if (!matched) {
        UI.updateLoader("Menambah part baru ke master…", 0.05);
        const m = await API.addMaster(pnVal, finalName);
        if (m && m.row) await DB.upsertMany([m.row]);
      }
      // 2) Upload foto
      const draftId = resumeDraftId || UI.uid("D");
      const photoMeta = { pn: pnVal, name: finalName };
      let beforeIds = resumeBeforeIds || [];
      if (!resumeDraftId) beforeIds = await uploadAll(draftId, "before", beforePhotos, 0.10, 0.45, photoMeta);
      const afterIds = isSubmit ? await uploadAll(draftId, "after", afterPhotos, 0.55, 0.35, photoMeta) : [];
      // 3) Tulis baris
      UI.updateLoader("Menyimpan ke spreadsheet…", 0.95);
      const row = { draftId, partNumber: pnVal, partName: finalName, qty: qtyVal, beforeIds, afterIds };
      if (isSubmit) await API.submitData(row); else await API.savePending(row);
      UI.updateLoader("Selesai", 1);
      UI.hideLoader();
      UI.toast(isSubmit ? "Data berhasil disubmit ✅" : "Tersimpan ke Pending ⏳", "ok");
      resetForm();
    } catch (e) {
      UI.hideLoader();
      UI.toast(e.message || "Gagal menyimpan", "err");
    }
  };

  function resetForm() {
    pn.value = ""; pname.value = ""; qty.value = "1"; matched = null;
    beforePhotos.length = 0; afterPhotos.length = 0;
    resumeDraftId = null; resumeBeforeIds = null;
    renderGrid("beforeGrid", beforePhotos, "beforeCount", "before");
    renderGrid("afterGrid", afterPhotos, "afterCount", "after");
    setHint("");
    updateMainBtn();
    document.querySelector(".page-head h1").textContent = "Input Part";
  }

  /* ---------- Resume dari Pending (via sessionStorage) ---------- */
  async function tryResume() {
    const raw = sessionStorage.getItem("resumeDraft");
    if (!raw) return;
    sessionStorage.removeItem("resumeDraft");
    let d; try { d = JSON.parse(raw); } catch (e) { return; }
    resumeDraftId = d.draftId;
    resumeBeforeIds = d.beforeIds || [];
    pn.value = d.partNumber; await lookup();
    if (!matched) { pname.value = d.partName || ""; }
    qty.value = d.qty || 1;
    // tampilkan before yang sudah ada sebagai thumbnail (dari server)
    (d.beforeIds || []).forEach((id) => {
      beforePhotos.push("https://drive.google.com/thumbnail?id=" + id + "&sz=w400");
    });
    // beforePhotos disini hanya utk tampilan; tidak diupload ulang
    renderGrid("beforeGrid", beforePhotos, "beforeCount", "before");
    document.querySelector(".page-head h1").textContent = "Lengkapi Foto After";
    UI.toast("Melanjutkan " + d.partNumber + " — tambahkan Foto After", "");
    updateMainBtn();
  }

  /* ---------- Init ---------- */
  renderGrid("beforeGrid", beforePhotos, "beforeCount", "before");
  renderGrid("afterGrid", afterPhotos, "afterCount", "after");
  updateMainBtn();
  refreshDatalist();
  MasterSync.start();
  tryResume();
})();
