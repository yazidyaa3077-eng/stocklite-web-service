# StockLite Project — Admin & Customer Terintegrasi (RESTful Web Service)

Proyek ini terdiri dari **satu backend REST API Python Flask** (`http://127.0.0.1:5000`) yang menjadi sumber data tunggal (*Single Source of Truth*) bagi dua aplikasi frontend terpisah:
1. **StockLite Admin** (`admin/`) — Manajemen inventaris barang (`GET`, `POST`, `PUT`, `DELETE`).
2. **StockLite Customer** (`customer/`) — Toko online pelanggan yang mengambil katalog barang secara langsung dari daftar `items` yang sama dan mengurangi stok Admin secara otomatis saat checkout.

## Struktur Folder Proyek
```text
StockLite_Project/
├── .vscode/
│   └── settings.json
├── backend/
│   ├── app.py
│   └── requirements.txt
├── admin/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── customer/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── README.md
```

## Panduan Instalasi & Menjalankan Sistem

### 1. Menjalankan Backend Flask (`:5000`)
```bash
cd StockLite_Project/backend
pip install -r requirements.txt
python app.py
```
Server aktif di `http://127.0.0.1:5000`.

### 2. Menjalankan StockLite Admin (Live Server)
1. Buka folder `StockLite_Project` di VS Code.
2. Klik kanan `admin/index.html` → **Open with Live Server** (port `5502` sesuai `.vscode/settings.json`).

### 3. Menjalankan StockLite Customer (Live Server)
1. Klik kanan `customer/index.html` → **Open with Live Server**.
2. Kedua halaman akan terhubung ke backend yang sama (`http://127.0.0.1:5000`).

## Catatan Prototipe
- Penyimpanan data barang, pesanan, dan profil pelanggan menggunakan memori Python sementara (*in-memory*), sehingga data kembali ke kondisi awal apabila server Flask dimatikan.
- Belum mencakup sistem pembayaran online nyata maupun autentikasi kata sandi/JWT.
