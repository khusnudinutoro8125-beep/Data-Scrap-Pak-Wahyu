# Part Inspection Web — Panduan (v3, tanpa folder)

Web form statis (GitHub Pages) + Google Apps Script (GAS) + Google Spreadsheet.

## Struktur (semua file di ROOT — tidak ada folder)

```
index.html      → Input
pending.html    → Pending (isi Foto After)
data.html       → Lihat Data (filter, sortir, conteng, hapus, unduh Excel)
master.html     → Master Part
style.css       → tampilan
config.js       → SETELAN (isi GAS_URL & TOKEN di sini)
db.js api.js common.js input.js pending.js data.js master.js
Code.gs         → kode Google Apps Script (tempel ke editor Apps Script)
server.js       → server uji lokal (opsional, tidak dipakai GitHub Pages)
```

> Semua file berada di root repo. Tidak ada folder `assets`. Saat ada perbaikan,
> cukup **drag semua file sekaligus** ke GitHub → Commit (menimpa file lama).

## Setelan wajib

Buka `config.js`, isi:
- `GAS_URL` — URL Web App Apps Script (diakhiri `/exec`)
- `TOKEN`  — nilai TOKEN dari sheet Config

## Setup GAS (sekali saja)

1. Buka spreadsheet → Extensions → Apps Script.
2. Tempel isi `Code.gs`, Save.
3. Jalankan fungsi `setup()` sekali (beri izin).
4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy.
5. Salin URL `/exec` dan TOKEN (sheet Config) ke `config.js`.

> Setiap kali `Code.gs` diubah: Deploy → Manage deployments → Edit (pensil) → Version: New version → Deploy.

## Uji lokal (opsional, Node.js)

```
node server.js
```
lalu buka http://localhost:8080 (HP di wifi sama: http://IP-PC:8080).

## Impor master massal

Tempel Part Number & Part Name di sheet Master, lalu menu **Part Inspection ▸ Isi ID Otomatis (Master)**.

## Foto

Setiap submit membuat subfolder Drive `PN - NAMA - DD-MM-YY HH:mm`, file `Before N.jpg` / `After N.jpg`. Menghapus data memindahkan foldernya ke Trash Drive.
