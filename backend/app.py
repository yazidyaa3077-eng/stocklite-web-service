from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import logging
import threading
import urllib.parse

app = Flask(__name__)
# Mengizinkan frontend Live Server (port 5500/5501/5502/dll) mengakses REST API.
CORS(app)

# Lock untuk mencegah race condition saat dua pelanggan checkout bersamaan
inventory_lock = threading.Lock()

# Middleware: mencatat setiap request sebelum endpoint diproses.
@app.before_request
def log_request():
    logging.info("[%s] %s %s", datetime.now().isoformat(timespec="seconds"),
                 request.method, request.path)

# Helper untuk membuat gambar SVG data-URI lokal yang rapi agar selalu tampil tanpa bergantung internet eksternal
def make_product_image(label, accent="#6558e8", bg="#f0efff"):
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320' viewBox='0 0 480 320'>
      <rect width='480' height='320' fill='{bg}'/>
      <circle cx='390' cy='60' r='90' fill='{accent}' fill-opacity='0.10'/>
      <circle cx='80' cy='270' r='110' fill='{accent}' fill-opacity='0.08'/>
      <rect x='175' y='72' width='130' height='110' rx='22' fill='{accent}' fill-opacity='0.16'/>
      <rect x='198' y='96' width='84' height='62' rx='12' fill='{accent}'/>
      <circle cx='222' cy='118' r='7' fill='#ffffff'/>
      <path d='M206 148 L228 128 L244 142 L256 132 L274 148 Z' fill='#ffffff'/>
      <text x='240' y='222' font-family='Arial, sans-serif' font-size='20' font-weight='700' fill='#172033' text-anchor='middle'>{label}</text>
      <text x='240' y='248' font-family='Arial, sans-serif' font-size='13' fill='#64748b' text-anchor='middle'>StockLite Official Catalog</text>
    </svg>"""
    return "data:image/svg+xml;utf8," + urllib.parse.quote(svg)

# Sumber data tunggal (Single Source of Truth) untuk StockLite Admin & StockLite Customer
items = [
    {
        "id": 1,
        "nama": "Buku Sistem Terdistribusi",
        "stok": 10,
        "harga": 125000,
        "deskripsi": "Buku referensi komprehensif arsitektur sistem terdistribusi, komunikasi antar-proses, RESTful Web Service, replikasi data, dan konsistensi transaksi.",
        "gambar": make_product_image("Buku Sistem Terdistribusi", "#6558e8", "#f0efff")
    },
    {
        "id": 2,
        "nama": "Flashdisk 32 GB",
        "stok": 5,
        "harga": 75000,
        "deskripsi": "Media penyimpanan portabel USB 3.2 berkecepatan tinggi dengan bodi metal ringkas, cocok untuk backup tugas kuliah dan transfer file proyek.",
        "gambar": make_product_image("Flashdisk 32 GB", "#4c91db", "#eaf4ff")
    },
    {
        "id": 3,
        "nama": "Router WiFi",
        "stok": 3,
        "harga": 340000,
        "deskripsi": "Router Dual-Band AC1200 dengan 4 antena eksternal berdaya jangkau luas untuk koneksi stabil di rumah, kos, maupun ruang kerja.",
        "gambar": make_product_image("Router WiFi", "#258b62", "#eaf8f1")
    }
]

# Logging aktivitas barang di terminal beserta keterangan produk
def log_item_action(action, item):
    harga = item.get("harga")
    harga_fmt = f"Rp {int(harga):,}".replace(",", ".") if isinstance(harga, (int, float)) else "-"
    keterangan = item.get("deskripsi") or "-"
    print("\n" + "=" * 44)
    print(f"[WEB SERVICE] {action}")
    print(f"ID Barang   : {item['id']}")
    print(f"Nama Barang : {item['nama']}")
    print(f"Harga       : {harga_fmt}")
    print(f"Stok        : {item['stok']} unit")
    print(f"Keterangan  : {keterangan}")
    print("Status      : Berhasil")
    print("=" * 44 + "\n", flush=True)

# Penyimpanan sementara di memori untuk pesanan & profil pelanggan
orders = []
profiles = {}

def normalize_email(email):
    if not isinstance(email, str):
        return ""
    return email.strip().lower()

def is_valid_email(email):
    e = normalize_email(email)
    return "@" in e and "." in e.split("@")[-1] and len(e) >= 5

def enrich_item_fields(item, body, is_create=False):
    """Memastikan field tambahan (harga, deskripsi, gambar) tetap valid namun kompatibel dengan payload lama Admin."""
    if is_create:
        raw_harga = body.get("harga", 50000)
        raw_deskripsi = body.get("deskripsi", "")
        raw_gambar = body.get("gambar", "")
    else:
        raw_harga = body.get("harga", item.get("harga", 50000))
        raw_deskripsi = body.get("deskripsi", item.get("deskripsi", ""))
        raw_gambar = body.get("gambar", item.get("gambar", ""))

    if isinstance(raw_harga, bool) or not isinstance(raw_harga, (int, float)) or raw_harga < 0:
        return None, "Harga harus berupa angka 0 atau lebih"

    nama_bersih = item["nama"]
    deskripsi_final = raw_deskripsi.strip() if isinstance(raw_deskripsi, str) and raw_deskripsi.strip() else f"Produk {nama_bersih} tersedia langsung dari inventaris StockLite."
    gambar_final = raw_gambar.strip() if isinstance(raw_gambar, str) and raw_gambar.strip() else make_product_image(nama_bersih[:26])

    item["harga"] = int(raw_harga)
    item["deskripsi"] = deskripsi_final
    item["gambar"] = gambar_final
    return item, None

@app.get("/")
def home():
    return jsonify({
        "pesan": "RESTful API StockLite aktif (Admin & Customer terintegrasi)",
        "endpoints": {
            "items": "/api/items",
            "customer_orders": "/api/customer/orders",
            "customer_profile": "/api/customer/profile"
        }
    })

# =========================================================
# ENDPOINT STOCKLITE ADMIN (DIPERTAHANKAN & KOMPATIBEL PENUH)
# =========================================================

@app.get("/api/items")
def get_items():
    return jsonify({"status": "success", "data": items}), 200

@app.get("/api/items/<int:item_id>")
def get_item(item_id):
    item = next((x for x in items if x["id"] == item_id), None)
    if item is None:
        return jsonify({"status": "error", "pesan": "Data tidak ditemukan"}), 404
    return jsonify({"status": "success", "data": item}), 200

@app.post("/api/items")
def create_item():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"status": "error", "pesan": "Body harus berupa JSON"}), 400
    nama, stok = body.get("nama"), body.get("stok")
    if not isinstance(nama, str) or not nama.strip():
        return jsonify({"status": "error", "pesan": "Nama barang wajib diisi"}), 400
    if not isinstance(stok, int) or isinstance(stok, bool) or stok < 0:
        return jsonify({"status": "error", "pesan": "Stok harus angka 0 atau lebih"}), 400

    with inventory_lock:
        new_id = max((x["id"] for x in items), default=0) + 1
        item = {"id": new_id, "nama": nama.strip(), "stok": stok}
        enriched, err = enrich_item_fields(item, body, is_create=True)
        if err:
            return jsonify({"status": "error", "pesan": err}), 400
        items.append(enriched)

    log_item_action("BARANG BERHASIL DITAMBAHKAN", item)
    return jsonify({"status": "success", "pesan": "Barang berhasil ditambahkan", "data": item}), 201

@app.put("/api/items/<int:item_id>")
def update_item(item_id):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"status": "error", "pesan": "Body harus berupa JSON"}), 400

    with inventory_lock:
        item = next((x for x in items if x["id"] == item_id), None)
        if item is None:
            return jsonify({"status": "error", "pesan": "Data tidak ditemukan"}), 404

        nama = body.get("nama", item["nama"])
        stok = body.get("stok", item["stok"])
        if not isinstance(nama, str) or not nama.strip():
            return jsonify({"status": "error", "pesan": "Nama barang tidak valid"}), 400
        if not isinstance(stok, int) or isinstance(stok, bool) or stok < 0:
            return jsonify({"status": "error", "pesan": "Stok harus angka 0 atau lebih"}), 400

        old_default = make_product_image(item["nama"][:26])
        item["nama"] = nama.strip()
        item["stok"] = stok
        if "gambar" not in body and item.get("gambar") == old_default:
            item["gambar"] = make_product_image(item["nama"][:26])

        _, err = enrich_item_fields(item, body, is_create=False)
        if err:
            return jsonify({"status": "error", "pesan": err}), 400

    log_item_action("BARANG BERHASIL DIPERBARUI", item)
    return jsonify({"status": "success", "pesan": "Barang berhasil diperbarui", "data": item}), 200

@app.delete("/api/items/<int:item_id>")
def delete_item(item_id):
    with inventory_lock:
        item = next((x for x in items if x["id"] == item_id), None)
        if item is None:
            return jsonify({"status": "error", "pesan": "Data tidak ditemukan"}), 404

        deleted_item = item.copy()
        items.remove(item)

    log_item_action("BARANG BERHASIL DIHAPUS", deleted_item)
    return jsonify({
        "status": "success",
        "pesan": "Barang berhasil dihapus",
        "data": deleted_item
    }), 200

# =========================================================
# ENDPOINT STOCKLITE CUSTOMER (TERINTEGRASI DENGAN ITEMS)
# =========================================================

@app.get("/api/customer/profile")
def get_customer_profile():
    email = normalize_email(request.args.get("email", ""))
    if not email:
        return jsonify({"status": "error", "pesan": "Parameter email wajib diisi"}), 400
    profile = profiles.get(email)
    if not profile:
        return jsonify({
            "status": "success",
            "data": {
                "nama": "",
                "email": email,
                "telepon": "",
                "alamat": ""
            }
        }), 200
    return jsonify({"status": "success", "data": profile}), 200

@app.post("/api/customer/profile")
def save_customer_profile():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"status": "error", "pesan": "Body harus berupa JSON"}), 400

    nama = body.get("nama", "")
    email = normalize_email(body.get("email", ""))
    telepon = body.get("telepon", "")
    alamat = body.get("alamat", "")

    if not isinstance(nama, str) or not nama.strip():
        return jsonify({"status": "error", "pesan": "Nama lengkap wajib diisi"}), 400
    if not is_valid_email(email):
        return jsonify({"status": "error", "pesan": "Format email tidak valid"}), 400
    if not isinstance(telepon, str) or not telepon.strip():
        return jsonify({"status": "error", "pesan": "Nomor telepon wajib diisi"}), 400
    if not isinstance(alamat, str) or not alamat.strip():
        return jsonify({"status": "error", "pesan": "Alamat wajib diisi"}), 400

    profile_data = {
        "nama": nama.strip(),
        "email": email,
        "telepon": telepon.strip(),
        "alamat": alamat.strip(),
        "updated_at": datetime.now().isoformat(timespec="seconds")
    }
    profiles[email] = profile_data
    return jsonify({
        "status": "success",
        "pesan": "Profil pelanggan berhasil disimpan",
        "data": profile_data
    }), 200

@app.get("/api/customer/orders")
def get_customer_orders():
    email = normalize_email(request.args.get("email", ""))
    if not email:
        return jsonify({"status": "error", "pesan": "Parameter email wajib diisi untuk melihat riwayat pesanan"}), 400
    customer_orders = [o for o in orders if o["customer"]["email"] == email]
    customer_orders_sorted = list(reversed(customer_orders))
    return jsonify({"status": "success", "data": customer_orders_sorted}), 200

@app.post("/api/customer/orders")
def create_customer_order():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"status": "error", "pesan": "Body harus berupa JSON"}), 400

    nama = body.get("nama", "")
    email = normalize_email(body.get("email", ""))
    telepon = body.get("telepon", "")
    alamat = body.get("alamat", "")
    cart_items = body.get("items", [])

    if not isinstance(nama, str) or not nama.strip():
        return jsonify({"status": "error", "pesan": "Nama pelanggan wajib diisi"}), 400
    if not is_valid_email(email):
        return jsonify({"status": "error", "pesan": "Alamat email tidak valid"}), 400
    if not isinstance(telepon, str) or not telepon.strip():
        return jsonify({"status": "error", "pesan": "Nomor telepon wajib diisi"}), 400
    if not isinstance(alamat, str) or not alamat.strip():
        return jsonify({"status": "error", "pesan": "Alamat pengiriman wajib diisi"}), 400
    if not isinstance(cart_items, list) or len(cart_items) == 0:
        return jsonify({"status": "error", "pesan": "Keranjang belanja tidak boleh kosong"}), 400

    aggregated_qty = {}
    for entry in cart_items:
        if not isinstance(entry, dict):
            return jsonify({"status": "error", "pesan": "Format item keranjang tidak valid"}), 400
        item_id = entry.get("id")
        qty = entry.get("qty")
        if not isinstance(item_id, int) or isinstance(item_id, bool):
            return jsonify({"status": "error", "pesan": "ID produk tidak valid"}), 400
        if not isinstance(qty, int) or isinstance(qty, bool) or qty <= 0:
            return jsonify({"status": "error", "pesan": "Jumlah pembelian harus minimal 1"}), 400
        aggregated_qty[item_id] = aggregated_qty.get(item_id, 0) + qty

    # Validasi dan pengurangan stok secara ATOMIK menggunakan lock
    with inventory_lock:
        validated_lines = []
        # Fase 1: Validasi seluruh item terlebih dahulu sebelum mengubah stok apa pun
        for item_id, qty in aggregated_qty.items():
            product = next((x for x in items if x["id"] == item_id), None)
            if product is None:
                return jsonify({
                    "status": "error",
                    "pesan": f"Produk dengan ID #{item_id} tidak ditemukan atau telah dihapus oleh Admin."
                }), 404
            if product["stok"] < qty:
                return jsonify({
                    "status": "error",
                    "pesan": f"Stok '{product['nama']}' tidak mencukupi (tersisa {product['stok']} unit, diminta {qty} unit). Pesanan dibatalkan dan stok tidak berubah."
                }), 400

            harga_satuan = int(product.get("harga", 0))
            subtotal = harga_satuan * qty
            validated_lines.append({
                "product_ref": product,
                "id": product["id"],
                "nama": product["nama"],
                "harga": harga_satuan,
                "qty": qty,
                "subtotal": subtotal
            })

        # Fase 2: Semua item lolos validasi -> kurangi stok di daftar items Admin
        order_items_snapshot = []
        total_harga = 0
        total_qty = 0
        for line in validated_lines:
            line["product_ref"]["stok"] -= line["qty"]
            log_item_action(f"STOK BERKURANG (-{line['qty']}) VIA CHECKOUT", line["product_ref"])
            total_harga += line["subtotal"]
            total_qty += line["qty"]
            order_items_snapshot.append({
                "id": line["id"],
                "nama": line["nama"],
                "harga": line["harga"],
                "qty": line["qty"],
                "subtotal": line["subtotal"]
            })

        order_number = f"ORD-{datetime.now().strftime('%Y%m%d')}-{(len(orders) + 1):04d}"
        new_order = {
            "order_number": order_number,
            "tanggal": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "customer": {
                "nama": nama.strip(),
                "email": email,
                "telepon": telepon.strip(),
                "alamat": alamat.strip()
            },
            "items": order_items_snapshot,
            "total_qty": total_qty,
            "total": total_harga,
            "status": "Pesanan Diproses"
        }
        orders.append(new_order)

        if email not in profiles:
            profiles[email] = {
                "nama": nama.strip(),
                "email": email,
                "telepon": telepon.strip(),
                "alamat": alamat.strip(),
                "updated_at": datetime.now().isoformat(timespec="seconds")
            }

    return jsonify({
        "status": "success",
        "pesan": "Pesanan berhasil dibuat dan stok inventaris telah diperbarui",
        "data": new_order
    }), 201

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    print("REST API StockLite aktif di http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)
