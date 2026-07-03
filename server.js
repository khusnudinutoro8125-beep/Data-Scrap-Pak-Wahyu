/* ============================================================
 *  Server uji lokal (Node.js) — tanpa dependency apa pun
 *
 *  CARA PAKAI:
 *  1. Taruh file ini di dalam folder "webapp" (sejajar index.html).
 *  2. Pastikan Node.js sudah terpasang (cek: node -v).
 *  3. Jalankan:  node server.js
 *  4. Buka di browser:  http://localhost:8080
 *
 *  Ini menghindari masalah membuka index.html lewat file:// (klik dobel),
 *  sehingga permintaan ke GAS berjalan normal seperti di GitHub Pages.
 * ============================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(ROOT, urlPath);
  // Cegah keluar dari folder root (path traversal)
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 — Tidak ditemukan: " + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log("\n  Part Inspection — server uji lokal");
  console.log("  Buka di browser:  http://localhost:" + PORT + "\n");
});
