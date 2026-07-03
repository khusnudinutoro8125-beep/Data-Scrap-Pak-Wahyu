/* =============================================================================
 *  PART INSPECTION  —  Backend Google Apps Script (GAS)  —  v2
 *  Struktur: Spreadsheet  <-  GAS (API)  <-  Web (GitHub Pages)
 *
 *  BARU di v2:
 *  - Foto disusun rapi: 1 folder per submit "PN - NAME - DD-MM-YY HH:mm",
 *    isi file "Before 1.jpg", "After 1.jpg", dst. Folder di-rename saat submit
 *    (Opsi A) memakai TANGGAL SUBMIT.
 *  - Menu "Part Inspection > Isi ID Otomatis" untuk melengkapi ID/lastModified/
 *    deleted setelah import bulk (paste banyak baris / File > Import).
 *  - onEdit diperbaiki agar menangani paste multi-baris.
 *
 *  CARA PAKAI:
 *  1. Extensions > Apps Script, tempel seluruh file ini (ganti yang lama).
 *  2. Run setup() sekali. Izinkan akses. Salin TOKEN dari log / sheet Config.
 *  3. Deploy > Manage deployments > Edit (pensil) > Version: New version > Deploy.
 *  4. Tempel URL /exec & TOKEN ke config.js
 * ========================================================================== */

var SHEET_MASTER = "Master";
var SHEET_DATA = "Data";
var SHEET_CONFIG = "Config";
var FOLDER_NAME = "Part Inspection Photos";
var TZ = "Asia/Jakarta";
var DATE_FMT = "dd-MM-yy HH:mm";

var MASTER_HEADERS = ["ID", "Part Number", "Part Name", "lastModified", "deleted"];
var DATA_HEADERS = ["draftId", "Part Number", "Part Name", "QTY",
  "Before IDs", "After IDs", "status", "createdAt", "updatedAt"];

/* ------------------------------ MENU ------------------------------------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Part Inspection")
    .addItem("Isi ID Otomatis (Master)", "fillMasterIds")
    .addSeparator()
    .addItem("Setup / Perbaiki", "setup")
    .addToUi();
}

/* ----------------------------- SETUP (Run ini) ---------------------------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ensureSheet(ss, SHEET_MASTER, MASTER_HEADERS);
  ensureSheet(ss, SHEET_DATA, DATA_HEADERS);
  var config = ensureSheet(ss, SHEET_CONFIG, ["Key", "Value"]);

  var props = PropertiesService.getScriptProperties();

  var token = props.getProperty("TOKEN");
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, "").slice(0, 24);
    props.setProperty("TOKEN", token);
  }
  var folderId = props.getProperty("FOLDER_ID");
  if (!folderId) {
    var folder = DriveApp.createFolder(FOLDER_NAME);
    folderId = folder.getId();
    props.setProperty("FOLDER_ID", folderId);
  }
  if (!props.getProperty("MASTER_SEQ")) props.setProperty("MASTER_SEQ", "0");

  writeConfig(config, "TOKEN", token);
  writeConfig(config, "FOLDER_ID", folderId);
  writeConfig(config, "WEB_APP_URL", "(isi setelah Deploy > Web app)");

  ensureEditTrigger();

  Logger.log("==================================================");
  Logger.log("SETUP SELESAI ✔");
  Logger.log("TOKEN  : " + token);
  Logger.log("FOLDER : " + folderId);
  Logger.log("Salin TOKEN ke config.js, lalu Deploy sebagai Web app.");
  Logger.log("==================================================");
}

function ensureSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var firstRow = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var empty = firstRow.every(function (c) { return c === "" || c === null; });
  if (empty) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function writeConfig(sh, key, value) {
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

function ensureEditTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onEditInstallable") return;
  }
  ScriptApp.newTrigger("onEditInstallable")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit().create();
}

/* ------- Auto ID + lastModified saat master diisi manual (multi-baris) ---- */
function onEditInstallable(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== SHEET_MASTER) return;
    var startRow = e.range.getRow();
    var numRows = e.range.getNumRows();
    var now = new Date().getTime();
    for (var r = startRow; r < startRow + numRows; r++) {
      if (r === 1) continue;
      var pn = sh.getRange(r, 2).getValue();
      if (!pn) continue;
      if (!sh.getRange(r, 1).getValue()) sh.getRange(r, 1).setValue(nextMasterId());
      sh.getRange(r, 4).setValue(now);
      var del = sh.getRange(r, 5).getValue();
      if (del === "" || del === null) sh.getRange(r, 5).setValue(false);
    }
  } catch (err) { /* diam */ }
}

/* ------- Isi ID Otomatis untuk import bulk (jalankan dari menu) ----------- */
function fillMasterIds() {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sh = sheet(SHEET_MASTER);
    var last = sh.getLastRow();
    if (last < 2) { SpreadsheetApp.getActive().toast("Master masih kosong."); return; }
    var rng = sh.getRange(2, 1, last - 1, 5);
    var vals = rng.getValues();
    var now = new Date().getTime();
    var props = PropertiesService.getScriptProperties();
    var seq = Math.max(maxNumIn(vals), parseInt(props.getProperty("MASTER_SEQ") || "0", 10));
    var count = 0;
    for (var i = 0; i < vals.length; i++) {
      var pn = vals[i][1];
      if (pn === "" || pn === null) continue;
      if (vals[i][0] === "" || vals[i][0] === null) { seq++; vals[i][0] = fmtId(seq); count++; }
      if (vals[i][3] === "" || vals[i][3] === null) vals[i][3] = now;
      if (vals[i][4] === "" || vals[i][4] === null) vals[i][4] = false;
      if (vals[i][2] !== "" && vals[i][2] !== null) vals[i][2] = String(vals[i][2]).toUpperCase();
    }
    props.setProperty("MASTER_SEQ", String(seq));
    rng.setValues(vals);
    SpreadsheetApp.getActive().toast(count + " ID baru diisi. Master siap disinkron.", "Selesai", 6);
  } finally { lock.releaseLock(); }
}

function maxNumIn(vals) {
  var mx = 0;
  for (var i = 0; i < vals.length; i++) {
    var m = String(vals[i][0] || "").match(/(\d+)/);
    if (m) { var n = parseInt(m[1], 10); if (n > mx) mx = n; }
  }
  return mx;
}
function fmtId(n) { return "PN-" + ("000000" + n).slice(-6); }

function _nextMasterIdNoLock() {
  var props = PropertiesService.getScriptProperties();
  var sh = sheet(SHEET_MASTER);
  var last = sh.getLastRow();
  var maxNum = 0;
  if (last >= 2) maxNum = maxNumIn(sh.getRange(2, 1, last - 1, 1).getValues());
  var n = Math.max(maxNum, parseInt(props.getProperty("MASTER_SEQ") || "0", 10)) + 1;
  props.setProperty("MASTER_SEQ", String(n));
  return fmtId(n);
}
function nextMasterId() {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return _nextMasterIdNoLock(); } finally { lock.releaseLock(); }
}

/* ------------------------------- ROUTER ---------------------------------- */
function doPost(e) { return handle(e); }
function doGet(e) { return handle(e); }

function handle(e) {
  try {
    var req = {};
    if (e && e.postData && e.postData.contents) req = JSON.parse(e.postData.contents);
    else if (e && e.parameter) req = e.parameter;
    checkToken(req.token);
    var action = req.action;
    var data;
    switch (action) {
      case "getMasterSince": data = getMasterSince(Number(req.since) || 0); break;
      case "addMaster":      data = addMaster(req.partNumber, req.partName); break;
      case "updateMaster":   data = updateMaster(req.id, req.partNumber, req.partName); break;
      case "deleteMaster":   data = deleteMaster(req.id); break;
      case "getPending":     data = getRows("PENDING"); break;
      case "getData":        data = getRows("DONE", Number(req.since) || 0); break;
      case "savePending":    data = upsertData(req.row, "PENDING"); break;
      case "submitData":     data = upsertData(req.row, "DONE"); break;
      case "deleteData":     data = deleteData(req.draftId); break;
      case "uploadPhoto":    data = uploadPhoto(req); break;
      case "getPhoto":       data = getPhoto(req.id); break;
      default: throw new Error("Aksi tidak dikenal: " + action);
    }
    return json({ ok: true, data: data });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function checkToken(token) {
  var real = PropertiesService.getScriptProperties().getProperty("TOKEN");
  if (!real) throw new Error("Server belum di-setup. Jalankan setup().");
  if (token !== real) throw new Error("Token tidak valid.");
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

/* ------------------------------- MASTER ---------------------------------- */
function getMasterSince(since) {
  var sh = sheet(SHEET_MASTER);
  var vals = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] && !r[1]) continue;
    var lm = Number(r[3]) || 0;
    if (lm > since) {
      rows.push({
        id: String(r[0]), partNumber: String(r[1]), partName: String(r[2]),
        lastModified: lm, deleted: (r[4] === true || r[4] === "TRUE" || r[4] === "true")
      });
    }
  }
  return { rows: rows, serverTime: new Date().getTime() };
}

function findMasterRow(sh, predicate) {
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (predicate(vals[i], i)) return { row: i + 1, values: vals[i] };
  }
  return null;
}

function addMaster(partNumber, partName) {
  partNumber = String(partNumber || "").trim();
  partName = String(partName || "").trim().toUpperCase();
  if (!partNumber || !partName) throw new Error("Part Number & Part Name wajib.");
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet(SHEET_MASTER);
    var key = partNumber.toUpperCase();
    var found = findMasterRow(sh, function (v) {
      return String(v[1]).trim().toUpperCase() === key && !(v[4] === true || v[4] === "TRUE");
    });
    var now = new Date().getTime();
    if (found) return { row: rowObj(found.values) };
    var id = _nextMasterIdNoLock();
    sh.appendRow([id, partNumber, partName, now, false]);
    return { row: { id: id, partNumber: partNumber, partName: partName, lastModified: now, deleted: false } };
  } finally { lock.releaseLock(); }
}

function updateMaster(id, partNumber, partName) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet(SHEET_MASTER);
    var found = findMasterRow(sh, function (v) { return String(v[0]) === String(id); });
    if (!found) throw new Error("Master tidak ditemukan.");
    var now = new Date().getTime();
    sh.getRange(found.row, 2).setValue(String(partNumber).trim());
    sh.getRange(found.row, 3).setValue(String(partName).trim().toUpperCase());
    sh.getRange(found.row, 4).setValue(now);
    return { row: { id: String(id), partNumber: String(partNumber).trim(), partName: String(partName).trim().toUpperCase(), lastModified: now, deleted: false } };
  } finally { lock.releaseLock(); }
}

function deleteMaster(id) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet(SHEET_MASTER);
    var found = findMasterRow(sh, function (v) { return String(v[0]) === String(id); });
    if (!found) throw new Error("Master tidak ditemukan.");
    var now = new Date().getTime();
    sh.getRange(found.row, 4).setValue(now);
    sh.getRange(found.row, 5).setValue(true);
    return { id: String(id), deleted: true };
  } finally { lock.releaseLock(); }
}

function rowObj(v) {
  return { id: String(v[0]), partNumber: String(v[1]), partName: String(v[2]),
    lastModified: Number(v[3]) || 0, deleted: (v[4] === true || v[4] === "TRUE") };
}

/* -------------------------------- DATA ----------------------------------- */
function getRows(status, since) {
  since = since || 0;
  var sh = sheet(SHEET_DATA);
  var vals = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    if (String(r[6]) !== status) continue;
    var updatedAt = Number(r[8]) || 0;
    if (since && updatedAt <= since) continue; // incremental: hanya yang berubah
    rows.push({
      draftId: String(r[0]), partNumber: String(r[1]), partName: String(r[2]),
      qty: r[3], beforeIds: splitIds(r[4]), afterIds: splitIds(r[5]),
      status: String(r[6]), createdAt: Number(r[7]) || null, updatedAt: updatedAt || null
    });
  }
  rows.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  return { rows: rows, serverTime: new Date().getTime() };
}

function splitIds(s) {
  if (!s) return [];
  return String(s).split(",").map(function (x) { return x.trim(); }).filter(String);
}

function findDataRow(sh, draftId) {
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(draftId)) return { row: i + 1, values: vals[i] };
  }
  return null;
}

function upsertData(row, status) {
  if (!row || !row.draftId) throw new Error("draftId wajib.");
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet(SHEET_DATA);
    var found = findDataRow(sh, row.draftId);
    var now = new Date().getTime();
    var beforeIds = (row.beforeIds || []).join(",");
    var afterIds = (row.afterIds || []).join(",");
    if (found) {
      var createdAt = Number(found.values[7]) || now;
      var finalBefore = beforeIds || String(found.values[4] || "");
      sh.getRange(found.row, 1, 1, DATA_HEADERS.length).setValues([[
        row.draftId, row.partNumber, row.partName, row.qty,
        finalBefore, afterIds, status, createdAt, now
      ]]);
    } else {
      sh.appendRow([row.draftId, row.partNumber, row.partName, row.qty,
        beforeIds, afterIds, status, now, now]);
    }
    // Opsi A: saat SUBMIT (DONE), rename folder pakai TANGGAL SUBMIT sekarang
    if (status === "DONE") {
      renameDraftFolder(row.draftId, row.partNumber, row.partName, new Date());
    }
    return { draftId: row.draftId, status: status };
  } finally { lock.releaseLock(); }
}

function deleteData(draftId) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet(SHEET_DATA);
    var found = findDataRow(sh, draftId);
    if (found) sh.deleteRow(found.row);
    // buang folder foto draft ini
    var props = PropertiesService.getScriptProperties();
    var key = "DF_" + draftId;
    var fid = props.getProperty(key);
    if (fid) { try { DriveApp.getFolderById(fid).setTrashed(true); } catch (e) {} props.deleteProperty(key); }
    return { draftId: draftId, deleted: true };
  } finally { lock.releaseLock(); }
}

/* -------------------------------- FOTO ----------------------------------- */
function getFolder() {
  var id = PropertiesService.getScriptProperties().getProperty("FOLDER_ID");
  return DriveApp.getFolderById(id);
}

function folderName(pn, name, dateObj) {
  var d = Utilities.formatDate(dateObj || new Date(), TZ, DATE_FMT);
  return String(pn || "NO-PN") + " - " + String(name || "").toUpperCase() + " - " + d;
}

function getOrCreateDraftFolder(draftId, pn, name) {
  var props = PropertiesService.getScriptProperties();
  var key = "DF_" + draftId;
  var fid = props.getProperty(key);
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) {} }
  var folder = getFolder().createFolder(folderName(pn, name, new Date()));
  props.setProperty(key, folder.getId());
  return folder;
}

function renameDraftFolder(draftId, pn, name, dateObj) {
  var props = PropertiesService.getScriptProperties();
  var fid = props.getProperty("DF_" + draftId);
  if (!fid) return;
  try { DriveApp.getFolderById(fid).setName(folderName(pn, name, dateObj)); } catch (e) {}
}

function uploadPhoto(req) {
  var dataUrl = req.dataUrl || "";
  var m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error("Format foto tidak valid.");
  var mime = m[1];
  var bytes = Utilities.base64Decode(m[2]);
  var folder = getOrCreateDraftFolder(req.draftId, req.partNumber || req.draftId, req.partName || "");
  var label = (req.kind === "after" ? "After " : "Before ") + ((Number(req.index) || 0) + 1);
  var filename = label + ".jpg";
  // ganti file lama dengan nama sama (hindari duplikat saat retry)
  var ex = folder.getFilesByName(filename);
  while (ex.hasNext()) ex.next().setTrashed(true);
  var blob = Utilities.newBlob(bytes, mime, filename);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { id: file.getId() };
}

function getPhoto(id) {
  var file = DriveApp.getFileById(id);
  var blob = file.getBlob();
  return { base64: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() };
}
