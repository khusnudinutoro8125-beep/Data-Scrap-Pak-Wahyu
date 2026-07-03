/* ============================================================
 *  MASTER PAGE  —  tambah / edit / hapus part
 * ============================================================ */
(() => {
  let items = [];
  const $ = (id) => document.getElementById(id);

  async function refreshFromCache() {
    items = await DB.getAll();
    items.sort((a, b) => String(a.partNumber).localeCompare(String(b.partNumber)));
    render($("search").value);
  }

  function render(filter) {
    const list = $("list");
    const q = (filter || "").trim().toUpperCase();
    const rows = items.filter((r) =>
      !q || String(r.partNumber).toUpperCase().includes(q) || String(r.partName).toUpperCase().includes(q));
    if (rows.length === 0) {
      list.innerHTML =
        '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/></svg>' +
        '<h3>Master kosong</h3><p>Tambahkan part number pertama Anda.</p></div>';
      return;
    }
    list.innerHTML = "";
    rows.forEach((r) => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML =
        `<div class="meta"><div class="t">${UI.esc(r.partNumber)}</div><div class="s">${UI.esc(r.partName || "")}</div>
          <div class="s" style="font-size:11px;opacity:.7">ID: ${UI.esc(r.id)}</div></div>
        <span class="pill pill-blue">Edit</span>`;
      el.onclick = () => editModal(r);
      list.appendChild(el);
    });
  }

  function formHtml(title, pnVal, nameVal, showDelete) {
    return `
      <h3>${title}</h3>
      <div class="field" style="margin-top:14px"><label>Part Number</label>
        <input class="input" id="fPN" value="${UI.esc(pnVal)}" placeholder="cth. ABC-123"/></div>
      <div class="field"><label>Part Name</label>
        <input class="input" id="fName" value="${UI.esc(nameVal)}" placeholder="NAMA PART" style="text-transform:uppercase"/></div>
      <div class="btn-row" style="margin-top:6px">
        ${showDelete ? '<button class="btn btn-danger" id="fDel">Hapus</button>' : '<button class="btn btn-secondary" id="fCancel">Batal</button>'}
        <button class="btn btn-primary" id="fSave">Simpan</button>
      </div>`;
  }

  async function addModal() {
    UI.modal(formHtml("Tambah Part", "", "", false));
    const ov = document.querySelector(".overlay:last-child");
    const nameEl = ov.querySelector("#fName");
    nameEl.addEventListener("input", () => nameEl.value = nameEl.value.toUpperCase());
    ov.querySelector("#fCancel").onclick = () => ov._close(null);
    ov.querySelector("#fSave").onclick = async () => {
      const pnv = ov.querySelector("#fPN").value.trim();
      const nmv = nameEl.value.trim().toUpperCase();
      if (!pnv || !nmv) { UI.toast("Isi Part Number & Part Name", "err"); return; }
      const dup = await DB.findByPN(pnv);
      if (dup) { UI.toast("Part number sudah ada di master", "err"); return; }
      ov._close(null);
      try {
        UI.showLoader("Menambah part…");
        const m = await API.addMaster(pnv, nmv);
        if (m && m.row) await DB.upsertMany([m.row]);
        UI.hideLoader(); UI.toast("Part ditambahkan ✅", "ok");
        refreshFromCache();
      } catch (e) { UI.hideLoader(); UI.toast(e.message, "err"); }
    };
  }

  async function editModal(r) {
    UI.modal(formHtml("Edit Part", r.partNumber, r.partName, true));
    const ov = document.querySelector(".overlay:last-child");
    const nameEl = ov.querySelector("#fName");
    nameEl.addEventListener("input", () => nameEl.value = nameEl.value.toUpperCase());
    ov.querySelector("#fSave").onclick = async () => {
      const pnv = ov.querySelector("#fPN").value.trim();
      const nmv = nameEl.value.trim().toUpperCase();
      if (!pnv || !nmv) { UI.toast("Isi Part Number & Part Name", "err"); return; }
      ov._close(null);
      try {
        UI.showLoader("Menyimpan perubahan…");
        const m = await API.updateMaster(r.id, pnv, nmv);
        if (m && m.row) await DB.upsertMany([m.row]);
        UI.hideLoader(); UI.toast("Perubahan disimpan ✅", "ok");
        refreshFromCache();
      } catch (e) { UI.hideLoader(); UI.toast(e.message, "err"); }
    };
    ov.querySelector("#fDel").onclick = async () => {
      ov._close(null);
      if (!confirm("Hapus " + r.partNumber + " dari master?")) return;
      try {
        UI.showLoader("Menghapus…");
        await API.deleteMaster(r.id);
        await DB.upsertMany([{ id: r.id, deleted: true }]);
        UI.hideLoader(); UI.toast("Part dihapus", "ok");
        refreshFromCache();
      } catch (e) { UI.hideLoader(); UI.toast(e.message, "err"); }
    };
  }

  $("addBtn").onclick = addModal;
  $("search").addEventListener("input", (e) => render(e.target.value));
  window.addEventListener("master:updated", refreshFromCache);
  MasterSync.start();
  refreshFromCache();
})();
