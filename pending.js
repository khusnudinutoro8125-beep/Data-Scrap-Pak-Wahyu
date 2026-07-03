/* ============================================================
 *  PENDING PAGE  —  daftar diambil langsung dari server
 * ============================================================ */
(() => {
  let items = [];
  const $ = (id) => document.getElementById(id);

  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function render(filter) {
    const list = $("list");
    const q = (filter || "").trim().toUpperCase();
    const rows = items.filter((r) => !q || String(r.partNumber).toUpperCase().includes(q));
    if (rows.length === 0) {
      list.innerHTML =
        '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
        '<h3>Tidak ada pending</h3><p>Semua part sudah lengkap atau belum ada yang dijeda.</p></div>';
      return;
    }
    list.innerHTML = "";
    rows.forEach((r) => {
      const thumbId = (r.beforeIds || [])[0];
      const thumb = thumbId ? ("https://drive.google.com/thumbnail?id=" + thumbId + "&sz=w200") : "";
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML =
        (thumb ? `<img class="thumb" src="${thumb}" onerror="this.style.visibility='hidden'"/>` : '<div class="thumb"></div>') +
        `<div class="meta">
          <div class="t">${UI.esc(r.partNumber)}</div>
          <div class="s">${UI.esc(r.partName || "")} · QTY ${UI.esc(r.qty)} · ${(r.beforeIds||[]).length} foto before</div>
          <div class="s">${fmtTime(r.createdAt)}</div>
        </div>
        <span class="pill pill-pending">Pending</span>
        <svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>`;
      el.onclick = () => openItem(r);
      list.appendChild(el);
    });
  }

  async function openItem(r) {
    const html = `
      <h3>${UI.esc(r.partNumber)}</h3>
      <p class="sub">${UI.esc(r.partName || "")} · QTY ${UI.esc(r.qty)}</p>
      <div class="btn-row">
        <button class="btn btn-danger" id="pDel">Hapus</button>
        <button class="btn btn-primary" id="pGo">Lanjut isi After</button>
      </div>`;
    const p = UI.modal(html);
    const ov = document.querySelector(".overlay:last-child");
    ov.querySelector("#pGo").onclick = () => {
      sessionStorage.setItem("resumeDraft", JSON.stringify(r));
      location.href = "index.html";
    };
    ov.querySelector("#pDel").onclick = async () => {
      ov._close(null);
      if (!confirm("Hapus draft " + r.partNumber + "?")) return;
      try {
        UI.showLoader("Menghapus…");
        await API.deleteData(r.draftId);
        UI.hideLoader();
        UI.toast("Draft dihapus", "ok");
        load();
      } catch (e) { UI.hideLoader(); UI.toast(e.message, "err"); }
    };
    await p;
  }

  async function load() {
    const list = $("list");
    list.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div><p style="margin-top:14px">Memuat pending…</p></div>';
    try {
      const res = await API.getPending();
      items = (res && res.rows) || [];
      render($("search").value);
    } catch (e) {
      list.innerHTML = `<div class="empty"><h3>Gagal memuat</h3><p>${UI.esc(e.message)}</p></div>`;
    }
  }

  $("search").addEventListener("input", (e) => render(e.target.value));
  $("refresh").onclick = load;
  MasterSync.start();
  load();
})();
