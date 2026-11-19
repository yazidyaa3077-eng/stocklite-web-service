const API_BASE = 'http://127.0.0.1:5000';
let allItems = [];
let editingId = null;
const body = document.getElementById('itemsBody');
const modal = document.getElementById('modalBackdrop');
const form = document.getElementById('itemForm');
const nameInput = document.getElementById('itemName');
const priceInput = document.getElementById('itemPrice');
const stockInput = document.getElementById('itemStock');
const descInput = document.getElementById('itemDesc');
const imageInput = document.getElementById('itemImage');
const errorBox = document.getElementById('formError');

function formatRupiah(num) {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {'Content-Type': 'application/json'},
    ...options
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.pesan || 'Terjadi kesalahan pada server');
  return result;
}

function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderItems() {
  const keyword = document.getElementById('searchInput').value.toLowerCase();
  const filtered = allItems.filter(x => x.nama.toLowerCase().includes(keyword));
  document.getElementById('totalItems').textContent = allItems.length;
  document.getElementById('totalStock').textContent = allItems.reduce((sum, x) => sum + x.stok, 0);
  document.getElementById('lowStock').textContent = allItems.filter(x => x.stok <= 5).length;
  document.getElementById('tableCount').textContent = `Menampilkan ${filtered.length} dari ${allItems.length} barang`;
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Data barang tidak ditemukan.</td></tr>';
    return;
  }
  body.innerHTML = filtered.map(item => `
    <tr>
      <td>#${item.id.toString().padStart(3, '0')}</td>
      <td>${escapeHtml(item.nama)}</td>
      <td>${formatRupiah(item.harga)}</td>
      <td><span class="stock">${item.stok}</span> unit</td>
      <td><span class="pill ${item.stok <= 5 ? 'low' : 'good'}">${item.stok === 0 ? 'Habis' : (item.stok <= 5 ? 'Stok menipis' : 'Tersedia')}</span></td>
      <td><div class="actions">
        <button class="action" onclick="editItem(${item.id})">Edit</button>
        <button class="action delete" onclick="removeItem(${item.id})">Hapus</button>
      </div></td>
    </tr>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadItems() {
  body.innerHTML = '<tr><td colspan="6" class="empty">Memuat data dari server...</td></tr>';
  try {
    const result = await api(`${API_BASE}/api/items`);
    allItems = result.data;
    renderItems();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message)}. Pastikan server aktif.</td></tr>`;
    notify('Gagal mengambil data dari API');
  }
}

function openModal(item = null) {
  editingId = item ? item.id : null;
  document.getElementById('modalTitle').textContent = item ? 'Edit Barang' : 'Tambah Barang';
  document.getElementById('saveBtn').textContent = item ? 'Simpan Perubahan' : 'Simpan Barang';
  nameInput.value = item ? item.nama : '';
  priceInput.value = item ? (item.harga ?? 50000) : 50000;
  stockInput.value = item ? item.stok : '';
  descInput.value = item ? (item.deskripsi || '') : '';
  imageInput.value = (item && item.gambar && !item.gambar.startsWith('data:image/svg+xml')) ? item.gambar : '';
  errorBox.textContent = '';
  modal.classList.add('show');
  nameInput.focus();
}

function closeModal() { modal.classList.remove('show'); }

function editItem(id) {
  const item = allItems.find(x => x.id === id);
  if (item) openModal(item);
}

async function removeItem(id) {
  const item = allItems.find(x => x.id === id);
  if (!item || !confirm(`Hapus "${item.nama}" dari daftar barang?`)) return;
  try {
    await api(`${API_BASE}/api/items/${id}`, {method:'DELETE'});
    notify('Barang berhasil dihapus');
    await loadItems();
  } catch (error) { notify(error.message); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const nama = nameInput.value.trim();
  const harga = Number(priceInput.value);
  const stok = Number(stockInput.value);
  const deskripsi = descInput.value.trim();
  const gambar = imageInput.value.trim();

  if (!nama || !Number.isInteger(stok) || stok < 0 || Number.isNaN(harga) || harga < 0) {
    errorBox.textContent = 'Nama wajib diisi, harga >= 0, dan stok harus angka 0 atau lebih.';
    return;
  }

  const payload = { nama, harga: Math.round(harga), stok };
  if (deskripsi) payload.deskripsi = deskripsi;
  if (gambar) payload.gambar = gambar;

  const url = editingId ? `${API_BASE}/api/items/${editingId}` : `${API_BASE}/api/items`;
  const method = editingId ? 'PUT' : 'POST';
  try {
    await api(url, {method, body:JSON.stringify(payload)});
    closeModal();
    notify(editingId ? 'Data barang berhasil diperbarui' : 'Barang baru berhasil ditambahkan');
    await loadItems();
  } catch (error) { errorBox.textContent = error.message; }
});

document.getElementById('addBtn').addEventListener('click', () => openModal());
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('refreshBtn').addEventListener('click', loadItems);
document.getElementById('searchInput').addEventListener('input', renderItems);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
loadItems();
