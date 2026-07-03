/* ============================================================
 *  DATA PAGE
 *  - Filter: Part Number, Part Name, Waktu (Dari-Sampai)
 *  - "Sampai" otomatis mengikuti "Dari"
 *  - Sortir: klik judul kolom (Part Number/Name/QTY = abjad/angka,
 *    Waktu = kronologis). Klik lagi untuk membalik arah.
 *  - Conteng baris (persist lintas filter) -> Unduh Excel / Hapus
 *  - Foto bisa diperbesar (lightbox + zoom/pinch)
 *  - Auto-refresh incremental tiap 60 detik (saat tab aktif)
 * ============================================================ */
(() => {
  const C = window.APP_CONFIG;
  let rows = [];                 // seluruh data DONE termuat
  let view = [];                 // baris yang sedang tampil (filter + sort)
  let lastServerTime = 0;        // untuk polling incremental
  let pollTimer = null;
  const selected = new Set();    // draftId yang diconteng (bertahan lintas filter)
  let sortKey = "createdAt";     // default: waktu
  let sortDir = "desc";          // default: terbaru dulu
  const $ = (id) => document.getElementById(id);

  function fmtTime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function thumb(id) { return "https://drive.google.com/thumbnail?id=" + id + "&sz=w200"; }
  function big(id) { return "https://drive.google.com/thumbnail?id=" + id + "&sz=w1200"; }

  /* ----------------------- FILTER + SORT ----------------------- */
  function dayStart(str) { if (!str) return null; const p = str.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).getTime(); }
  function dayEnd(str) { if (!str) return null; const p = str.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999).getTime(); }

  function getFiltered() {
    const pnq = $("fPN").value.trim().toUpperCase();
    const nmq = $("fName").value.trim().toUpperCase();
    const from = dayStart($("fFrom").value);
    const to = dayEnd($("fTo").value);
    return rows.filter((r) => {
      if (pnq && !String(r.partNumber).toUpperCase().includes(pnq)) return false;
      if (nmq && !String(r.partName || "").toUpperCase().includes(nmq)) return false;
      const t = r.createdAt || 0;
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });
  }

  function getSorted(list) {
    const arr = list.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "qty") return ((Number(a.qty) || 0) - (Number(b.qty) || 0)) * dir;
      if (sortKey === "createdAt") return ((a.createdAt || 0) - (b.createdAt || 0)) * dir;
      const x = String(a[sortKey] || "").toLowerCase();
      const y = String(b[sortKey] || "").toLowerCase();
      return x < y ? -1 * dir : x > y ? 1 * dir : 0;
    });
    return arr;
  }

  function setSort(key) {
    if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
    else { sortKey = key; sortDir = key === "createdAt" ? "desc" : "asc"; }
    render();
  }

  function arrow(key) {
    if (sortKey !== key) return '<span class="arrow dim">⇅</span>';
    return '<span class="arrow">' + (sortDir === "asc" ? "↑" : "↓") + "</span>";
  }

  /* ----------------------- RENDER ----------------------- */
  function render() {
    const area = $("tableArea");
    view = getSorted(getFiltered());
    $("resultInfo").textContent = view.length + " dari " + rows.length + " data";

    if (view.length === 0) {
      area.innerHTML =
        '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/></svg>' +
        '<h3>Tidak ada data</h3><p>' + (rows.length ? "Coba ubah / reset filter." : "Data lengkap akan muncul di sini.") + '</p></div>';
      updateSelUI();
      return;
    }
    let html = '<div class="table-wrap"><table><thead><tr>' +
      '<th class="chkcol"><input type="checkbox" id="selAll" title="Conteng semua (yang tampil)"></th>' +
      '<th>#</th>' +
      '<th class="sortable" data-sort="partNumber">Part Number ' + arrow("partNumber") + '</th>' +
      '<th class="sortable" data-sort="partName">Part Name ' + arrow("partName") + '</th>' +
      '<th class="sortable" data-sort="qty">QTY ' + arrow("qty") + '</th>' +
      '<th>Before</th><th>After</th>' +
      '<th class="sortable" data-sort="createdAt">Waktu ' + arrow("createdAt") + '</th>' +
      '<th class="delcol"></th>' +
      '</tr></thead><tbody>';
    view.forEach((r, i) => {
      const on = selected.has(r.draftId);
      const b = (r.beforeIds || []).map((id, j) => `<img class="cell-img" src="${thumb(id)}" data-r="${i}" data-type="before" data-i="${j}" onerror="this.style.display='none'"/>`).join("");
      const a = (r.afterIds || []).map((id, j) => `<img class="cell-img" src="${thumb(id)}" data-r="${i}" data-type="after" data-i="${j}" onerror="this.style.display='none'"/>`).join("");
      html += `<tr class="${on ? "row-selected" : ""}">` +
        `<td class="chkcol"><input type="checkbox" class="rowchk" data-id="${UI.esc(r.draftId)}" ${on ? "checked" : ""}></td>` +
        `<td>${i + 1}</td><td><b>${UI.esc(r.partNumber)}</b></td><td>${UI.esc(r.partName || "")}</td>` +
        `<td>${UI.esc(r.qty)}</td><td><div class="mini">${b}</div></td><td><div class="mini">${a}</div></td>` +
        `<td>${fmtTime(r.createdAt)}</td>` +
        `<td class="delcol"><button class="row-del" data-id="${UI.esc(r.draftId)}" title="Hapus data ini">` +
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>` +
        `</button></td></tr>`;
    });
    html += "</tbody></table></div>";
    area.innerHTML = html;
    updateSelUI();
  }

  /* ----------------------- SELEKSI (conteng) ----------------------- */
  function updateSelUI() {
    // checkbox header (tri-state, hanya untuk baris yang tampil)
    const sa = $("selAll");
    if (sa) {
      const all = view.length > 0 && view.every((r) => selected.has(r.draftId));
      const some = view.some((r) => selected.has(r.draftId));
      sa.checked = all;
      sa.indeterminate = !all && some;
    }
    const n = selected.size;
    const del = $("delete"), exp = $("export");
    if (del) { del.disabled = n === 0; del.textContent = "Hapus" + (n ? " (" + n + ")" : ""); }
    if (exp) exp.disabled = n === 0;
    const expN = $("expN"); if (expN) expN.textContent = n ? " (" + n + ")" : "";
    const grp = $("selGroup"); if (grp) grp.hidden = n === 0;
    const si = $("selInfo"); if (si) si.textContent = n + " dipilih";
  }

  function toggleAll() {
    const all = view.length > 0 && view.every((r) => selected.has(r.draftId));
    if (all) view.forEach((r) => selected.delete(r.draftId));   // batalkan hanya yang tampil
    else view.forEach((r) => selected.add(r.draftId));           // conteng hanya yang tampil
    render();
  }

  function pruneSelection() {
    // buang id yang sudah tidak ada di data (mis. sudah terhapus)
    const ids = new Set(rows.map((r) => r.draftId));
    [...selected].forEach((id) => { if (!ids.has(id)) selected.delete(id); });
  }

  /* ----------------------- LIGHTBOX ----------------------- */
  const Lightbox = (() => {
    let ov, imgEl, stage, scale = 1, tx = 0, ty = 0, list = [], idx = 0;

    function build() {
      ov = document.createElement("div");
      ov.className = "lightbox";
      ov.innerHTML =
        '<div class="lb-bar"><span class="lb-title"></span>' +
          '<div class="lb-tools">' +
            '<button type="button" data-a="out" title="Perkecil">−</button>' +
            '<button type="button" data-a="in" title="Perbesar">+</button>' +
            '<button type="button" data-a="reset" title="Reset">⤢</button>' +
            '<button type="button" data-a="close" title="Tutup">✕</button>' +
          '</div></div>' +
        '<button type="button" class="lb-nav lb-prev" data-a="prev">‹</button>' +
        '<div class="lb-stage"><img class="lb-img" alt="" draggable="false" /></div>' +
        '<button type="button" class="lb-nav lb-next" data-a="next">›</button>' +
        '<div class="lb-hint">Cubit / scroll untuk zoom • seret untuk geser • ‹ › untuk pindah</div>';
      document.body.appendChild(ov);
      imgEl = ov.querySelector(".lb-img");
      stage = ov.querySelector(".lb-stage");

      ov.addEventListener("click", (e) => {
        const a = e.target.getAttribute && e.target.getAttribute("data-a");
        if (a === "close" || e.target === ov) close();
        else if (a === "in") zoom(0.3);
        else if (a === "out") zoom(-0.3);
        else if (a === "reset") reset();
        else if (a === "prev") nav(-1);
        else if (a === "next") nav(1);
      });
      stage.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.25 : -0.25); }, { passive: false });
      imgEl.addEventListener("dblclick", () => { scale > 1 ? reset() : set(2.2); });

      let dragging = false, lx = 0, ly = 0;
      stage.addEventListener("mousedown", (e) => { if (scale <= 1) return; dragging = true; lx = e.clientX; ly = e.clientY; });
      window.addEventListener("mousemove", (e) => { if (!dragging) return; tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY; apply(); });
      window.addEventListener("mouseup", () => { dragging = false; });

      let ts = null;
      stage.addEventListener("touchstart", (e) => {
        if (e.touches.length === 2) ts = { d: dist(e.touches), s: scale };
        else if (e.touches.length === 1 && scale > 1) ts = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: tx, ty: ty, pan: true };
      }, { passive: false });
      stage.addEventListener("touchmove", (e) => {
        if (!ts) return;
        if (e.touches.length === 2) { e.preventDefault(); set(ts.s * dist(e.touches) / ts.d); }
        else if (ts.pan && e.touches.length === 1) { e.preventDefault(); tx = ts.tx + (e.touches[0].clientX - ts.x); ty = ts.ty + (e.touches[0].clientY - ts.y); apply(); }
      }, { passive: false });
      stage.addEventListener("touchend", () => { ts = null; });
    }

    function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function apply() { imgEl.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")"; }
    function set(s) { scale = Math.max(1, Math.min(5, s)); if (scale === 1) { tx = 0; ty = 0; } apply(); }
    function zoom(d) { set(scale + d); }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }
    function show() {
      const it = list[idx];
      imgEl.src = it.url;
      ov.querySelector(".lb-title").textContent = it.title || "";
      reset();
      ov.querySelector(".lb-prev").style.visibility = idx > 0 ? "visible" : "hidden";
      ov.querySelector(".lb-next").style.visibility = idx < list.length - 1 ? "visible" : "hidden";
    }
    function nav(d) { const n = idx + d; if (n < 0 || n >= list.length) return; idx = n; show(); }
    function open(items, start) { if (!ov) build(); list = items; idx = start || 0; document.body.style.overflow = "hidden"; ov.classList.add("show"); show(); }
    function close() { if (ov) ov.classList.remove("show"); document.body.style.overflow = ""; }

    document.addEventListener("keydown", (e) => {
      if (!ov || !ov.classList.contains("show")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") nav(-1);
      else if (e.key === "ArrowRight") nav(1);
      else if (e.key === "+" || e.key === "=") zoom(0.3);
      else if (e.key === "-") zoom(-0.3);
    });
    return { open };
  })();

  function openFromImg(img) {
    const r = view[Number(img.getAttribute("data-r"))];
    if (!r) return;
    const items = [];
    (r.beforeIds || []).forEach((id, j) => items.push({ url: big(id), title: "Before " + (j + 1) + " — " + r.partNumber }));
    (r.afterIds || []).forEach((id, j) => items.push({ url: big(id), title: "After " + (j + 1) + " — " + r.partNumber }));
    const type = img.getAttribute("data-type");
    const i = Number(img.getAttribute("data-i"));
    const start = type === "after" ? (r.beforeIds || []).length + i : i;
    Lightbox.open(items, start);
  }

  /* ----------------------- MODAL (konfirmasi) ----------------------- */
  function openModal(innerHTML) {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.className = "overlay show";
      ov.innerHTML = '<div class="modal">' + innerHTML + "</div>";
      document.body.appendChild(ov);
      const done = (v) => { ov.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      function onKey(e) { if (e.key === "Escape") done(null); }
      ov.addEventListener("click", (e) => {
        if (e.target === ov) return done(null);
        const b = e.target.closest("[data-v]");
        if (b) done(b.getAttribute("data-v"));
      });
      document.addEventListener("keydown", onKey);
    });
  }

  function detailRow(label, val) {
    return '<div class="dl-row"><span>' + label + '</span><b>' + UI.esc(val) + "</b></div>";
  }

  /* ----------------------- HAPUS ----------------------- */
  async function onDeleteRow(id) {
    const r = rows.find((x) => x.draftId === id);
    if (!r) return;
    const html =
      '<div class="modal-icon danger"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg></div>' +
      '<h3>Hapus data ini?</h3>' +
      '<p class="sub">Periksa detail di bawah sebelum menghapus.</p>' +
      '<div class="detail-box">' +
        detailRow("Part Number", r.partNumber) +
        detailRow("Part Name", r.partName || "-") +
        detailRow("QTY", r.qty) +
        detailRow("Waktu", fmtTime(r.createdAt)) +
      '</div>' +
      '<p class="warn-text">⚠️ Tindakan ini tidak bisa dibatalkan. Folder foto akan dipindahkan ke Trash Google Drive.</p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-v="0">Batal</button><button class="btn btn-danger" data-v="1">Hapus</button></div>';
    const v = await openModal(html);
    if (v === "1") await doDelete([id]);
  }

  async function onDeleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) { UI.toast("Conteng dulu data yang ingin dihapus", "err"); return; }
    const items = ids.map((id) => rows.find((r) => r.draftId === id)).filter(Boolean);
    const listHtml = items.map((r) =>
      '<div class="del-item"><div class="di-main"><b>' + UI.esc(r.partNumber) + '</b><span>' + UI.esc(r.partName || "-") + '</span></div>' +
      '<span class="qty-badge">QTY: ' + UI.esc(r.qty) + "</span></div>"
    ).join("");
    const html =
      '<div class="modal-icon danger"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg></div>' +
      '<h3>Hapus ' + items.length + ' data?</h3>' +
      '<p class="sub">Berikut daftar yang akan dihapus. Gulir untuk memeriksa.</p>' +
      '<div class="del-list">' + listHtml + '</div>' +
      '<p class="warn-text">⚠️ Tindakan ini tidak bisa dibatalkan. Folder foto akan dipindahkan ke Trash Google Drive.</p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-v="0">Batal</button><button class="btn btn-danger" data-v="1">Hapus ' + items.length + ' data</button></div>';
    const v = await openModal(html);
    if (v === "1") await doDelete(ids);
  }

  async function doDelete(ids) {
    UI.showLoader("Menghapus data…", "0 dari " + ids.length);
    let done = 0, fail = 0;
    for (const id of ids) {
      try {
        await API.deleteData(id);
        rows = rows.filter((r) => r.draftId !== id);
        selected.delete(id);
      } catch (e) { fail++; }
      done++;
      UI.updateLoader("Menghapus data…", done / ids.length);
      UI.setLoaderSub(done + " dari " + ids.length + (fail ? " • " + fail + " gagal" : ""));
    }
    UI.hideLoader();
    render();
    if (fail) UI.toast(fail + " data gagal dihapus", "err");
    else UI.toast(ids.length + " data berhasil dihapus 🗑️", "ok");
  }

  /* ----------------------- LOAD + POLLING ----------------------- */
  async function load() {
    const area = $("tableArea");
    area.innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto"></div><p style="margin-top:14px">Memuat data…</p></div>';
    try {
      const res = await API.getData(0);
      rows = (res && res.rows) || [];
      lastServerTime = (res && res.serverTime) || Date.now();
      pruneSelection();
      render();
    } catch (e) {
      area.innerHTML = `<div class="empty"><h3>Gagal memuat</h3><p>${UI.esc(e.message)}</p></div>`;
    }
  }

  function mergeRows(list) {
    const map = {};
    rows.forEach((r) => { map[r.draftId] = r; });
    list.forEach((r) => { map[r.draftId] = r; });
    rows = Object.keys(map).map((k) => map[k]);
  }

  async function poll() {
    if (document.visibilityState !== "visible") return;
    if (!API.isConfigured()) return;
    try {
      const res = await API.getData(lastServerTime);
      if (res && res.serverTime) lastServerTime = res.serverTime;
      const nw = (res && res.rows) || [];
      if (nw.length) { mergeRows(nw); render(); UI.toast(nw.length + " data baru masuk", "ok"); }
    } catch (e) { /* diam */ }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(poll, C.DATA_POLL_MS || 60000);
  }

  /* ----------------------- EXPORT EXCEL (data terconteng) ----------------------- */
  const IMG_PX = 105;
  const ROW_H_PT = 85;
  const COL_W_IMG = 16;

  async function exportExcel() {
    const data = rows.filter((r) => selected.has(r.draftId));
    if (data.length === 0) { UI.toast("Conteng dulu data yang ingin diunduh", "err"); return; }
    const maxBefore = Math.min(C.MAX_PHOTOS, Math.max(1, ...data.map((r) => (r.beforeIds || []).length)));
    const maxAfter = Math.min(C.MAX_PHOTOS, Math.max(1, ...data.map((r) => (r.afterIds || []).length)));

    UI.showLoader("Menyiapkan Excel…", "Mengunduh foto dari server");
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
      const cols = [
        { header: "No", key: "no", width: 6 },
        { header: "Part Number", key: "pn", width: 20 },
        { header: "Part Name", key: "pname", width: 26 },
        { header: "QTY", key: "qty", width: 8 },
        { header: "Waktu", key: "time", width: 20 }
      ];
      for (let i = 0; i < maxBefore; i++) cols.push({ header: "Before " + (i + 1), key: "b" + i, width: COL_W_IMG });
      for (let i = 0; i < maxAfter; i++) cols.push({ header: "After " + (i + 1), key: "a" + i, width: COL_W_IMG });
      ws.columns = cols;

      const head = ws.getRow(1);
      head.height = 22;
      head.eachCell((c) => {
        c.font = { bold: true, color: { argb: "FF2C2C2B" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0EFED" } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = borderAll();
      });

      const firstImgCol = 6;
      const cache = {};
      const totalImgs = data.reduce((s, r) => s + (r.beforeIds || []).length + (r.afterIds || []).length, 0);
      let done = 0;
      const tick = () => { done++; UI.updateLoader("Menyusun foto…", done / Math.max(1, totalImgs)); };

      const sorted = getSorted(data);
      for (let ri = 0; ri < sorted.length; ri++) {
        const r = sorted[ri];
        const excelRow = ri + 2;
        const row = ws.getRow(excelRow);
        row.height = ROW_H_PT;
        row.getCell(1).value = ri + 1;
        row.getCell(2).value = r.partNumber;
        row.getCell(3).value = r.partName || "";
        row.getCell(4).value = r.qty;
        row.getCell(5).value = fmtTime(r.createdAt);
        for (let c = 1; c <= 5; c++) {
          row.getCell(c).alignment = { vertical: "middle", horizontal: c === 3 ? "left" : "center", wrapText: true };
          row.getCell(c).border = borderAll();
        }
        for (let c = firstImgCol; c < firstImgCol + maxBefore + maxAfter; c++) row.getCell(c).border = borderAll();
        await placePhotos(wb, ws, r.beforeIds || [], excelRow, firstImgCol, cache, tick);
        await placePhotos(wb, ws, r.afterIds || [], excelRow, firstImgCol + maxBefore, cache, tick);
      }

      UI.updateLoader("Membuat file…", 0.99);
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = "Part_Inspection_" + stamp + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      UI.hideLoader();
      UI.toast("Excel (" + data.length + " data) berhasil diunduh ✅", "ok");
    } catch (e) {
      UI.hideLoader();
      UI.toast(e.message || "Gagal membuat Excel", "err");
    }
  }

  function borderAll() {
    const s = { style: "thin", color: { argb: "FFE6E5E3" } };
    return { top: s, left: s, bottom: s, right: s };
  }

  async function placePhotos(wb, ws, ids, excelRow, startCol, cache, onEach) {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        if (!cache[id]) cache[id] = await API.getPhoto(id);
        const p = cache[id];
        const ext = (p.mime && p.mime.indexOf("png") >= 0) ? "png" : "jpeg";
        const imgId = wb.addImage({ base64: p.base64, extension: ext });
        const col0 = startCol - 1 + i;
        const row0 = excelRow - 1;
        ws.addImage(imgId, {
          tl: { col: col0 + 0.08, row: row0 + 0.06 },
          ext: { width: IMG_PX, height: IMG_PX },
          editAs: "oneCell"
        });
      } catch (e) { /* lewati foto gagal */ }
      if (onEach) onEach();
    }
  }

  /* ----------------------- EVENTS ----------------------- */
  $("fPN").addEventListener("input", render);
  $("fName").addEventListener("input", render);
  $("fFrom").addEventListener("change", () => {
    $("fTo").value = $("fFrom").value;   // "Sampai" otomatis mengikuti "Dari"
    $("fTo").min = $("fFrom").value || "";
    render();
  });
  $("fTo").addEventListener("change", render);
  $("fReset").onclick = () => {
    $("fPN").value = ""; $("fName").value = ""; $("fFrom").value = ""; $("fTo").value = ""; $("fTo").min = "";
    render();   // contengan sengaja TIDAK dihapus
  };
  $("refresh").onclick = load;
  $("export").onclick = exportExcel;
  $("delete").onclick = onDeleteSelected;
  $("clearSel").onclick = () => { selected.clear(); render(); };

  $("tableArea").addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (th) { setSort(th.getAttribute("data-sort")); return; }
    const del = e.target.closest(".row-del");
    if (del) { onDeleteRow(del.getAttribute("data-id")); return; }
    const img = e.target.closest(".cell-img");
    if (img) { openFromImg(img); return; }
  });
  $("tableArea").addEventListener("change", (e) => {
    if (e.target.id === "selAll") { toggleAll(); return; }
    const chk = e.target.closest(".rowchk");
    if (chk) {
      const id = chk.getAttribute("data-id");
      if (chk.checked) selected.add(id); else selected.delete(id);
      const tr = chk.closest("tr"); if (tr) tr.classList.toggle("row-selected", chk.checked);
      updateSelUI();
    }
  });

  load();
  startPolling();
})();
