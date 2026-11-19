const API_BASE = 'http://127.0.0.1:5000';

let products = [];
let selectedProductId = null;
let detailQty = 1;
let cart = JSON.parse(localStorage.getItem('stocklite_cart') || '[]');
let savedCustomerEmail = localStorage.getItem('stocklite_customer_email') || '';

const PAGE_META = {
  home: {
    eyebrow: 'STOCKLITE STOREFRONT',
    title: 'Beranda',
    sub: 'Belanja produk langsung dari inventaris StockLite Admin secara real-time.'
  },
  catalog: {
    eyebrow: 'KATALOG PRODUK',
    title: 'Katalog Produk',
    sub: 'Daftar lengkap barang yang disinkronkan dari backend StockLite Admin.'
  },
  detail: {
    eyebrow: 'INFORMASI PRODUK',
    title: 'Detail Produk',
    sub: 'Spesifikasi lengkap, harga, dan ketersediaan stok aktual.'
  },
  cart: {
    eyebrow: 'KERANJANG BELANJA',
    title: 'Keranjang',
    sub: 'Atur jumlah pembelian sebelum melanjutkan ke proses checkout.'
  },
  checkout: {
    eyebrow: 'PROSES PEMESANAN',
    title: 'Checkout',
    sub: 'Lengkapi data pengiriman dan konfirmasi pesanan Anda.'
  },
  history: {
    eyebrow: 'TRANSAKSI PELANGGAN',
    title: 'Riwayat Pesanan',
    sub: 'Pantau status dan rincian pesanan berdasarkan email pelanggan.'
  },
  profile: {
    eyebrow: 'PENGATURAN AKUN',
    title: 'Profil Saya',
    sub: 'Simpan dan perbarui identitas pengiriman Anda.'
  }
};

function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.pesan || 'Terjadi kesalahan pada server REST API');
  }
  return result;
}

function setApiOnlineState(online) {
  const badge = document.getElementById('apiStatusBadge');
  const pulse = document.getElementById('apiPulse');
  const title = document.getElementById('apiSideTitle');
  const sub = document.getElementById('apiSideSub');
  if (online) {
    badge.classList.remove('offline');
    badge.innerHTML = '<i></i> API Online';
    pulse.classList.remove('offline');
    title.textContent = 'Sinkronisasi Aktif';
    sub.textContent = 'Terhubung ke StockLite Admin';
  } else {
    badge.classList.add('offline');
    badge.innerHTML = '<i></i> API Terputus';
    pulse.classList.add('offline');
    title.textContent = 'Koneksi Gagal';
    sub.textContent = 'Jalankan backend port 5000';
  }
}

function saveCartState() {
  localStorage.setItem('stocklite_cart', JSON.stringify(cart));
  updateCartBadges();
}

function updateCartBadges() {
  const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById('sidebarCartBadge').textContent = totalQty;
  document.getElementById('topCartCount').textContent = totalQty;
}

// Sinkronisasi keranjang dengan stok terbaru dari Admin
function reconcileCartWithProducts() {
  let changed = false;
  const updatedCart = [];
  for (const entry of cart) {
    const prod = products.find(p => p.id === entry.id);
    if (!prod || prod.stok <= 0) {
      changed = true;
      continue;
    }
    if (entry.qty > prod.stok) {
      updatedCart.push({ id: prod.id, qty: prod.stok });
      changed = true;
    } else {
      updatedCart.push(entry);
    }
  }
  if (changed) {
    cart = updatedCart;
    saveCartState();
  }
}

async function fetchProducts(showToast = false) {
  try {
    const res = await apiRequest(`${API_BASE}/api/items`);
    products = res.data || [];
    setApiOnlineState(true);
    reconcileCartWithProducts();
    renderHome();
    renderCatalog();
    renderDetail();
    renderCart();
    renderCheckoutSummary();
    if (showToast) notify('Stok produk berhasil disinkronkan dari Admin');
  } catch (err) {
    setApiOnlineState(false);
    const errHtml = `<div class="empty-card">Gagal terhubung ke REST API (${escapeHtml(err.message)}). Pastikan server Flask berjalan di http://127.0.0.1:5000.</div>`;
    document.getElementById('homeProductGrid').innerHTML = errHtml;
    document.getElementById('catalogProductGrid').innerHTML = errHtml;
  }
}

function createProductCardHtml(item) {
  const outOfStock = item.stok <= 0;
  const lowStock = item.stok > 0 && item.stok <= 5;
  const badgeClass = outOfStock ? 'out' : (lowStock ? 'low' : 'in');
  const badgeText = outOfStock ? 'Stok Habis' : `Stok: ${item.stok}`;

  return `
    <article class="product-card">
      <img class="product-thumb" src="${escapeHtml(item.gambar)}" alt="${escapeHtml(item.nama)}">
      <div class="product-body">
        <div class="product-meta">
          <span class="product-id">#${String(item.id).padStart(3, '0')}</span>
          <span class="stock-badge ${badgeClass}">${badgeText}</span>
        </div>
        <h3 class="product-title">${escapeHtml(item.nama)}</h3>
        <div class="product-price">${formatRupiah(item.harga)}</div>
        <div class="product-actions">
          <button class="outline" onclick="openProductDetail(${item.id})">Detail</button>
          <button class="primary" ${outOfStock ? 'disabled' : ''} onclick="addToCart(${item.id}, 1)">
            ${outOfStock ? 'Habis' : '+ Keranjang'}
          </button>
        </div>
      </div>
    </article>
  `;
}

// 1. RENDER BERANDA
function renderHome() {
  const keyword = document.getElementById('homeSearchInput').value.trim().toLowerCase();
  const availableItems = products.filter(p => p.stok > 0);
  const totalUnits = products.reduce((sum, p) => sum + p.stok, 0);

  document.getElementById('homeAvailableProducts').textContent = availableItems.length;
  document.getElementById('homeTotalUnits').textContent = totalUnits;

  const filtered = products.filter(p => p.nama.toLowerCase().includes(keyword));
  document.getElementById('homeCatalogSummary').textContent =
    `Menampilkan ${filtered.length} produk (${availableItems.length} produk tersedia siap dibeli)`;

  const grid = document.getElementById('homeProductGrid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-card">Produk yang dicari tidak ditemukan.</div>';
    return;
  }
  grid.innerHTML = filtered.map(createProductCardHtml).join('');
}

// 2. RENDER KATALOG PRODUK
function renderCatalog() {
  const keyword = document.getElementById('catalogSearchInput').value.trim().toLowerCase();
  const filterMode = document.getElementById('stockFilterSelect').value;

  const filtered = products.filter(p => {
    const matchName = p.nama.toLowerCase().includes(keyword);
    if (!matchName) return false;
    if (filterMode === 'available') return p.stok > 0;
    if (filterMode === 'out') return p.stok <= 0;
    return true;
  });

  document.getElementById('catalogCountInfo').textContent =
    `Menampilkan ${filtered.length} dari ${products.length} produk terdaftar di StockLite Admin`;

  const grid = document.getElementById('catalogProductGrid');
  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-card">Tidak ada produk yang sesuai dengan filter pencarian.</div>';
    return;
  }
  grid.innerHTML = filtered.map(createProductCardHtml).join('');
}

// 3. DETAIL PRODUK
function openProductDetail(itemId) {
  selectedProductId = itemId;
  detailQty = 1;
  navigateTo('detail');
}

function changeDetailQty(delta) {
  const item = products.find(p => p.id === selectedProductId);
  if (!item || item.stok <= 0) return;
  const next = detailQty + delta;
  if (next >= 1 && next <= item.stok) {
    detailQty = next;
    renderDetail();
  }
}

function renderDetail() {
  const container = document.getElementById('productDetailContainer');
  if (!selectedProductId && products.length > 0) {
    selectedProductId = products[0].id;
  }
  const item = products.find(p => p.id === selectedProductId);
  if (!item) {
    container.innerHTML = '<div class="empty-card">Produk tidak ditemukan atau telah dihapus oleh Admin.</div>';
    return;
  }

  const outOfStock = item.stok <= 0;
  if (detailQty > item.stok) detailQty = Math.max(1, item.stok);

  container.innerHTML = `
    <div class="detail-grid">
      <img class="detail-image" src="${escapeHtml(item.gambar)}" alt="${escapeHtml(item.nama)}">
      <div class="detail-info">
        <span class="stock-badge ${outOfStock ? 'out' : 'in'}">
          ${outOfStock ? 'Stok Habis (0 unit)' : `Stok Tersedia: ${item.stok} unit`}
        </span>
        <h2>${escapeHtml(item.nama)}</h2>
        <div class="detail-price">${formatRupiah(item.harga)}</div>
        <p class="detail-desc">${escapeHtml(item.deskripsi || 'Produk resmi dari inventaris StockLite.')}</p>

        ${outOfStock ? `
          <button class="primary" disabled>Stok Habis — Tidak Dapat Dibeli</button>
        ` : `
          <div class="qty-selector">
            <span style="font-size:12px;font-weight:700;color:#556074">Jumlah Beli:</span>
            <div class="qty-box">
              <button type="button" onclick="changeDetailQty(-1)">−</button>
              <span>${detailQty}</span>
              <button type="button" onclick="changeDetailQty(1)">+</button>
            </div>
            <small style="color:#8c96a8">Maksimal ${item.stok} unit</small>
          </div>
          <button class="primary" onclick="addToCart(${item.id}, ${detailQty})">+ Tambah ke Keranjang</button>
        `}
      </div>
    </div>
  `;
}

// 4. KERANJANG BELANJA
function addToCart(itemId, qty = 1) {
  const product = products.find(p => p.id === itemId);
  if (!product) {
    notify('Produk tidak ditemukan');
    return;
  }
  if (product.stok <= 0) {
    notify('Maaf, stok produk ini sedang habis');
    return;
  }

  const existing = cart.find(c => c.id === itemId);
  const currentQty = existing ? existing.qty : 0;
  if (currentQty + qty > product.stok) {
    notify(`Jumlah melebihi stok tersedia (maksimal ${product.stok} unit)`);
    return;
  }

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id: itemId, qty });
  }

  saveCartState();
  renderCart();
  renderCheckoutSummary();
  notify(`"${product.nama}" ditambahkan ke keranjang`);
}

function updateCartQty(itemId, delta) {
  const product = products.find(p => p.id === itemId);
  const entry = cart.find(c => c.id === itemId);
  if (!entry || !product) return;

  const newQty = entry.qty + delta;
  if (newQty <= 0) {
    cart = cart.filter(c => c.id !== itemId);
  } else if (newQty > product.stok) {
    notify(`Stok tersedia hanya ${product.stok} unit`);
    return;
  } else {
    entry.qty = newQty;
  }

  saveCartState();
  renderCart();
  renderCheckoutSummary();
}

function removeFromCart(itemId) {
  cart = cart.filter(c => c.id !== itemId);
  saveCartState();
  renderCart();
  renderCheckoutSummary();
}

function renderCart() {
  const container = document.getElementById('cartItemsContainer');
  const checkoutBtn = document.getElementById('proceedCheckoutBtn');

  if (!cart.length) {
    container.innerHTML = '<div class="empty-card">Keranjang belanja Anda masih kosong. Silakan pilih produk dari Katalog.</div>';
    document.getElementById('cartTotalKinds').textContent = '0 jenis';
    document.getElementById('cartTotalQty').textContent = '0 unit';
    document.getElementById('cartGrandTotal').textContent = 'Rp 0';
    checkoutBtn.disabled = true;
    return;
  }

  let totalQty = 0;
  let grandTotal = 0;

  container.innerHTML = cart.map(entry => {
    const product = products.find(p => p.id === entry.id);
    if (!product) return '';
    const subtotal = product.harga * entry.qty;
    totalQty += entry.qty;
    grandTotal += subtotal;

    return `
      <div class="cart-item">
        <div class="cart-item-left">
          <img src="${escapeHtml(product.gambar)}" alt="${escapeHtml(product.nama)}">
          <div>
            <h4>${escapeHtml(product.nama)}</h4>
            <small>${formatRupiah(product.harga)} / unit · Tersedia: ${product.stok} unit</small>
          </div>
        </div>
        <div class="cart-item-right">
          <div class="qty-box">
            <button type="button" onclick="updateCartQty(${product.id}, -1)">−</button>
            <span>${entry.qty}</span>
            <button type="button" onclick="updateCartQty(${product.id}, 1)">+</button>
          </div>
          <div class="cart-subtotal">${formatRupiah(subtotal)}</div>
          <button type="button" class="outline" onclick="removeFromCart(${product.id})">Hapus</button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('cartTotalKinds').textContent = `${cart.length} jenis`;
  document.getElementById('cartTotalQty').textContent = `${totalQty} unit`;
  document.getElementById('cartGrandTotal').textContent = formatRupiah(grandTotal);
  checkoutBtn.disabled = false;
}

// 5. CHECKOUT
function renderCheckoutSummary() {
  const list = document.getElementById('checkoutSummaryList');
  if (!cart.length) {
    list.innerHTML = '<p style="font-size:12px;color:#8c96a8">Belum ada item di keranjang.</p>';
    document.getElementById('checkoutTotalQty').textContent = '0 unit';
    document.getElementById('checkoutGrandTotal').textContent = 'Rp 0';
    return;
  }

  let totalQty = 0;
  let grandTotal = 0;
  list.innerHTML = cart.map(entry => {
    const p = products.find(x => x.id === entry.id);
    if (!p) return '';
    const sub = p.harga * entry.qty;
    totalQty += entry.qty;
    grandTotal += sub;
    return `
      <div class="checkout-line">
        <span>${escapeHtml(p.nama)} (×${entry.qty})</span>
        <strong>${formatRupiah(sub)}</strong>
      </div>
    `;
  }).join('');

  document.getElementById('checkoutTotalQty').textContent = `${totalQty} unit`;
  document.getElementById('checkoutGrandTotal').textContent = formatRupiah(grandTotal);
}

async function fillCheckoutFromSavedProfile(silent = false) {
  const email = document.getElementById('checkoutEmail').value.trim() || savedCustomerEmail;
  if (!email) {
    if (!silent) notify('Masukkan email terlebih dahulu atau simpan profil Anda');
    return;
  }
  try {
    const res = await apiRequest(`${API_BASE}/api/customer/profile?email=${encodeURIComponent(email)}`);
    const data = res.data;
    if (data && data.nama) {
      document.getElementById('checkoutName').value = data.nama;
      document.getElementById('checkoutEmail').value = data.email;
      document.getElementById('checkoutPhone').value = data.telepon;
      document.getElementById('checkoutAddress').value = data.alamat;
      if (!silent) notify('Data pengiriman diisi dari Profil Saya');
    } else if (!silent) {
      notify('Profil untuk email tersebut belum tersimpan');
    }
  } catch (err) {
    if (!silent) notify(err.message);
  }
}

document.getElementById('checkoutForm').addEventListener('submit', async event => {
  event.preventDefault();
  const errorEl = document.getElementById('checkoutError');
  errorEl.textContent = '';

  if (!cart.length) {
    errorEl.textContent = 'Keranjang belanja masih kosong.';
    return;
  }

  const payload = {
    nama: document.getElementById('checkoutName').value.trim(),
    email: document.getElementById('checkoutEmail').value.trim(),
    telepon: document.getElementById('checkoutPhone').value.trim(),
    alamat: document.getElementById('checkoutAddress').value.trim(),
    items: cart.map(c => ({ id: c.id, qty: c.qty }))
  };

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Memproses Pesanan...';

  try {
    const res = await apiRequest(`${API_BASE}/api/customer/orders`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    savedCustomerEmail = payload.email.toLowerCase();
    localStorage.setItem('stocklite_customer_email', savedCustomerEmail);

    cart = [];
    saveCartState();
    await fetchProducts(false);

    notify(`Pesanan ${res.data.order_number} berhasil dibuat!`);
    document.getElementById('historyEmailInput').value = savedCustomerEmail;
    navigateTo('history');
    await loadOrderHistory(savedCustomerEmail);
  } catch (err) {
    errorEl.textContent = err.message;
    // Muat ulang stok terbaru agar tampilan sinkron jika stok baru saja berubah
    await fetchProducts(false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buat Pesanan Sekarang';
  }
});

// 6. RIWAYAT PESANAN
async function loadOrderHistory(email) {
  const container = document.getElementById('historyOrdersContainer');
  if (!email) {
    container.innerHTML = '<div class="empty-card">Masukkan email pelanggan untuk menampilkan riwayat pesanan.</div>';
    return;
  }
  container.innerHTML = '<div class="empty-card">Memuat riwayat pesanan...</div>';
  try {
    const res = await apiRequest(`${API_BASE}/api/customer/orders?email=${encodeURIComponent(email)}`);
    const orders = res.data || [];
    if (!orders.length) {
      container.innerHTML = `<div class="empty-card">Belum ada riwayat pesanan untuk email <b>${escapeHtml(email)}</b>.</div>`;
      return;
    }

    container.innerHTML = orders.map(order => `
      <article class="order-card">
        <div class="order-head">
          <div>
            <span class="order-no">${escapeHtml(order.order_number)}</span>
            <span class="order-date">${escapeHtml(order.tanggal)}</span>
          </div>
          <span class="order-status">${escapeHtml(order.status)}</span>
        </div>
        <div class="order-body">
          ${order.items.map(it => `
            <div style="display:flex;justify-content:space-between">
              <span>${escapeHtml(it.nama)} × ${it.qty} unit</span>
              <span>${formatRupiah(it.subtotal)}</span>
            </div>
          `).join('')}
        </div>
        <div class="order-foot">
          <span>Penerima: ${escapeHtml(order.customer.nama)} (${escapeHtml(order.customer.alamat)})</span>
          <strong>Total: ${formatRupiah(order.total)}</strong>
        </div>
      </article>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-card">${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('historyFilterForm').addEventListener('submit', event => {
  event.preventDefault();
  const email = document.getElementById('historyEmailInput').value.trim();
  savedCustomerEmail = email.toLowerCase();
  localStorage.setItem('stocklite_customer_email', savedCustomerEmail);
  loadOrderHistory(email);
});

// 7. PROFIL SAYA
async function loadProfileByEmail(email, notifyUser = true) {
  if (!email) {
    if (notifyUser) notify('Masukkan email terlebih dahulu');
    return;
  }
  try {
    const res = await apiRequest(`${API_BASE}/api/customer/profile?email=${encodeURIComponent(email)}`);
    const d = res.data;
    document.getElementById('profileEmail').value = d.email || email;
    document.getElementById('profileName').value = d.nama || '';
    document.getElementById('profilePhone').value = d.telepon || '';
    document.getElementById('profileAddress').value = d.alamat || '';
    if (notifyUser) {
      notify(d.nama ? 'Data profil berhasil dimuat' : 'Profil baru siap diisi');
    }
  } catch (err) {
    if (notifyUser) notify(err.message);
  }
}

document.getElementById('profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const errorEl = document.getElementById('profileError');
  errorEl.textContent = '';

  const payload = {
    nama: document.getElementById('profileName').value.trim(),
    email: document.getElementById('profileEmail').value.trim(),
    telepon: document.getElementById('profilePhone').value.trim(),
    alamat: document.getElementById('profileAddress').value.trim()
  };

  try {
    await apiRequest(`${API_BASE}/api/customer/profile`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    savedCustomerEmail = payload.email.toLowerCase();
    localStorage.setItem('stocklite_customer_email', savedCustomerEmail);
    notify('Profil pelanggan berhasil disimpan');
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// Navigasi antar halaman SPA
function navigateTo(pageKey) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav').forEach(n => n.classList.remove('active'));

  const targetView = document.getElementById(`view-${pageKey}`);
  const targetNav = document.querySelector(`.nav[data-page="${pageKey}"]`);
  if (targetView) targetView.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  const meta = PAGE_META[pageKey] || PAGE_META.home;
  document.getElementById('pageEyebrow').textContent = meta.eyebrow;
  document.getElementById('pageTitle').textContent = meta.title;
  document.getElementById('pageSub').textContent = meta.sub;

  if (pageKey === 'checkout') {
    renderCheckoutSummary();
    if (savedCustomerEmail && !document.getElementById('checkoutEmail').value) {
      document.getElementById('checkoutEmail').value = savedCustomerEmail;
      fillCheckoutFromSavedProfile(true);
    }
  } else if (pageKey === 'history' && savedCustomerEmail) {
    if (!document.getElementById('historyEmailInput').value) {
      document.getElementById('historyEmailInput').value = savedCustomerEmail;
    }
    loadOrderHistory(document.getElementById('historyEmailInput').value.trim());
  } else if (pageKey === 'profile' && savedCustomerEmail) {
    if (!document.getElementById('profileEmail').value) {
      loadProfileByEmail(savedCustomerEmail, false);
    }
  }
}

// Event Listeners
document.querySelectorAll('.nav[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

document.getElementById('topCartBtn').addEventListener('click', () => navigateTo('cart'));
document.getElementById('globalRefreshBtn').addEventListener('click', () => fetchProducts(true));
document.getElementById('homeSearchInput').addEventListener('input', renderHome);
document.getElementById('catalogSearchInput').addEventListener('input', renderCatalog);
document.getElementById('stockFilterSelect').addEventListener('change', renderCatalog);
document.getElementById('clearCartBtn').addEventListener('click', () => {
  cart = [];
  saveCartState();
  renderCart();
  renderCheckoutSummary();
  notify('Keranjang dikosongkan');
});
document.getElementById('fillFromProfileBtn').addEventListener('click', () => fillCheckoutFromSavedProfile(false));
document.getElementById('loadProfileBtn').addEventListener('click', () => {
  loadProfileByEmail(document.getElementById('profileEmail').value.trim(), true);
});

// Inisialisasi awal
updateCartBadges();
fetchProducts(false);
