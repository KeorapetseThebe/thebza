let user = null;
const $ = id => document.getElementById(id);
const loginPanel = $("loginPanel");
const dashboard = $("dashboard");
const alertEl = $("adminAlert");
const bookingsEl = $("bookings");
const filterDate = $("filterDate");
const filterStatus = $("filterStatus");
let adminProducts = [];

function money(value) { return `R${Number(value).toLocaleString("en-ZA")}`; }

function showAlert(message, success = false) {
    alertEl.textContent = message;
    alertEl.classList.remove("hidden");
    alertEl.classList.toggle("alert-success", success);
}

function clearAlert() { alertEl.classList.add("hidden"); }

function showProductAlert(message, success = false) {
    const productAlert = $("productAdminAlert");
    productAlert.textContent = message;
    productAlert.classList.remove("hidden");
    productAlert.classList.toggle("alert-success", success);
}

function esc(value) {
    return String(value || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : { error: `${response.status} ${response.statusText}` };
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
}

async function login() {
    clearAlert();
    const username = $("username").value.trim();
    const password = $("password").value;
    if (!username || !password) return showAlert("Enter your username and password.");
    try {
        const data = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        user = data.user;
        renderDashboard();
    } catch (e) { showAlert(e.message); }
}

function renderDashboard() {
    loginPanel.classList.add("hidden");
    dashboard.classList.remove("hidden");
    $("welcomeTitle").textContent = user.role === "owner" ? "Owner Dashboard" : "Appointments";
    $("roleText").textContent = `${user.name} • ${user.role === "owner" ? "Full owner access" : "Admin clerk access"}`;
    document.querySelectorAll(".owner-only").forEach(el => el.classList.toggle("hidden", user.role !== "owner"));
    if (user.role === "owner") {
        loadServices();
        loadAppearance();
        setupProductForm();
        loadProducts();
    }
    loadBookings();
}

async function loadBookings() {
    try {
        const params = new URLSearchParams();
        if (filterDate.value) params.set("date", filterDate.value);
        if (filterStatus.value) params.set("status", filterStatus.value);
        const data = await api(`/api/admin/bookings?${params}`);
        const confirmed = data.filter(x => x.status === "confirmed").length;
        const completed = data.filter(x => x.status === "completed").length;
        const cancelled = data.filter(x => x.status === "cancelled").length;
        $("bookingStats").innerHTML = `<div><strong>${data.length}</strong><span>Shown</span></div><div><strong>${confirmed}</strong><span>Confirmed</span></div><div><strong>${completed}</strong><span>Completed</span></div><div><strong>${cancelled}</strong><span>Cancelled</span></div>`;

        if (!data.length) {
            bookingsEl.innerHTML = `<div class="booking-card"><p class="muted">No appointments found.</p></div>`;
            return;
        }
        bookingsEl.innerHTML = data.map(booking => `
      <article class="booking-row">
        <div class="booking-main">
          <div>
            <div class="booking-time">${esc(booking.start_time)} – ${esc(booking.end_time)}</div>
            <div class="booking-ref">${esc(booking.appointment_date)}</div>
          </div>
          <div>
            <div class="booking-status status-${esc(booking.status)}">${esc(booking.status)}</div>
            <h3>${esc(booking.service_name)} · ${money(booking.price)}</h3>
            <p><strong>${esc(booking.customer_name)}</strong> · ${esc(booking.customer_phone)}</p>
            <p class="booking-notes">${esc(booking.notes || "No notes")} · Ref: ${esc(booking.booking_ref)}</p>
          </div>
        </div>
        <div class="booking-actions">
          ${booking.status === "confirmed" ? `<button class="button secondary small" onclick="setBookingStatus(${booking.id},'completed')">Complete</button><button class="button danger small" onclick="setBookingStatus(${booking.id},'cancelled')">Cancel</button>` : `<button class="button secondary small" onclick="setBookingStatus(${booking.id},'confirmed')">Mark confirmed</button>`}
        </div>
      </article>`).join("");
  } catch (e) { showAlert(e.message); }
}

async function setBookingStatus(id,status) {
  if (status === "cancelled" && !confirm("Cancel this appointment?")) return;
  try { await api(`/api/admin/bookings/${id}/status`, {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({status})}); await loadBookings(); }
  catch(e) { showAlert(e.message); }
}
window.setBookingStatus = setBookingStatus;

async function loadServices() {
  try {
    const data = await api("/api/admin/services");
    $("servicesAdmin").innerHTML = data.map(service => `
      <div class="service-admin-row">
        <div class="service-admin-fields">
          <label>Name<input data-field="name" value="${esc(service.name)}"></label>
          <label>Price (R)<input data-field="price" type="number" min="0" value="${service.price}"></label>
          <label>Duration<input data-field="duration" type="number" min="5" step="5" value="${service.duration}"></label>
          <label>Description<input data-field="description" value="${esc(service.description)}"></label>
        </div>
        <div class="service-admin-actions">
          <label class="check"><input data-field="active" type="checkbox" ${service.active ? "checked" : ""}> Active</label>
          <button class="button primary small" onclick="saveService('${esc(service.id)}', this)">Save</button>
          ${service.active ? `<button class="button danger small" onclick="deactivateService('${esc(service.id)}')">Hide</button>` : ""}
        </div>
      </div>`).join("");
  } catch(e) { showAlert(e.message); }
}

async function saveService(id,button) {
  const row = button.closest(".service-admin-row");
  const get = field => row.querySelector(`[data-field="${field}"]`);
  try {
    await api(`/api/admin/services/${encodeURIComponent(id)}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:get("name").value,price:get("price").value,duration:get("duration").value,description:get("description").value,active:get("active").checked})});
    showAlert("Service updated successfully.",true); await loadServices();
  } catch(e) { showAlert(e.message); }
}
window.saveService = saveService;

async function deactivateService(id) {
  if (!confirm("Hide this service from customers? Existing bookings are not changed.")) return;
  try { await api(`/api/admin/services/${encodeURIComponent(id)}`, {method:"DELETE"}); await loadServices(); }
  catch(e) { showAlert(e.message); }
}
window.deactivateService = deactivateService;

async function loadAppearance() {
    try {
        const settings = await api("/api/admin/settings");

        $("backgroundPreview").style.backgroundImage =
            settings.hero_background
                ? `url('${settings.hero_background}')`
                : "none";

        $("backgroundPreview").innerHTML =
            settings.hero_background
                ? ""
                : "No custom background uploaded yet";

        $("productsBackgroundPreview").style.backgroundImage =
            settings.products_hero_background
                ? `url('${settings.products_hero_background}')`
                : "none";

        $("productsBackgroundPreview").innerHTML =
            settings.products_hero_background
                ? ""
                : "No custom Products background uploaded yet";

    } catch (e) {
        showAlert(e.message);
    }
}
async function uploadProductsBackground(event) {
    event.preventDefault();

    const file = $("productsBackgroundFile").files[0];

    if (!file) {
        return showAlert("Choose an image first.");
    }

    if (file.size > 8 * 1024 * 1024) {
        return showAlert("Image must be 8 MB or smaller.");
    }

    const reader = new FileReader();

    reader.onload = async () => {
        try {
            await api("/api/admin/settings/products-background", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    imageData: reader.result
                })
            });

            showAlert("Products background uploaded.", true);

            $("productsBackgroundForm").reset();

            await loadAppearance();

        } catch (e) {
            showAlert(e.message);
        }
    };

    reader.readAsDataURL(file);
}

async function uploadBackground(event) {
  event.preventDefault();
  const file = $("backgroundFile").files[0];
  if (!file) return showAlert("Choose an image first.");
  if (file.size > 8 * 1024 * 1024) return showAlert("Image must be 8 MB or smaller.");
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await api("/api/admin/settings/background", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageData:reader.result})});
      showAlert("Background uploaded.",true); $("backgroundForm").reset(); await loadAppearance();
    } catch(e) { showAlert(e.message); }
  };
  reader.readAsDataURL(file);
}

async function logout() {
  await api("/api/auth/logout", {method:"POST"}).catch(()=>{});
  location.reload();
}

$("loginButton").addEventListener("click",login);
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")login();});
$("logoutButton").addEventListener("click",logout);
$("refresh").addEventListener("click",loadBookings);
$("filterDate").addEventListener("change",loadBookings);
$("filterStatus").addEventListener("change",loadBookings);
$("clearFilters").addEventListener("click",()=>{filterDate.value="";filterStatus.value="";loadBookings();});
$("addServiceForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try { await api("/api/admin/services",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:$("newName").value,price:$("newPrice").value,duration:$("newDuration").value,description:$("newDescription").value})}); e.target.reset(); $("newDuration").value=30; showAlert("Service added.",true); await loadServices(); }
  catch(err){showAlert(err.message);}
});
$("backgroundForm").addEventListener("submit",uploadBackground);
$("productsBackgroundForm").addEventListener(
    "submit",
    uploadProductsBackground
);
document.querySelectorAll(".admin-tab").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");document.querySelectorAll(".admin-tab-panel").forEach(x=>x.classList.add("hidden"));$("tab-"+tab.dataset.tab).classList.remove("hidden");}));
async function loadProducts() {
    try {
        const products = await api("/api/admin/products");
        adminProducts = products;
        const container = $("productsAdminList");

        if (!container) return;

        if (!products.length) {
            container.innerHTML = `
                <p class="muted">No products added yet.</p>
            `;
            return;
        }

        container.innerHTML = products.map(product => `
            <div class="service-admin-row">
                <div>
                    <h3>${esc(product.name)}</h3>
                    <p class="muted">
                        ${esc(product.category || "General")} · R${product.price}
                    </p>
                    <p>${esc(product.description || "")}</p>
                </div>
                <div class="admin-actions">
                    <button class="button secondary small" type="button" onclick="editProduct('${esc(product.id)}')">Edit</button>
                    <button class="button danger small" type="button" onclick="deleteProduct('${esc(product.id)}')">Delete</button>
                </div>
            </div>
        `).join("");

    } catch (err) {
        showProductAlert(err.message);
    }
}

function editProduct(id) {
    const product = adminProducts.find(item => item.id === id);
    if (!product) return showProductAlert("Could not find that product.");

    $("productId").value = product.id;
    $("productName").value = product.name;
    $("productCategory").value = product.category || "General";
    $("productPrice").value = product.price;
    $("productDescription").value = product.description || "";
    $("productFormTitle").textContent = "Edit Product";
    $("saveProductButton").textContent = "Save Changes";
    $("cancelProductEdit").classList.remove("hidden");
    $("productForm").scrollIntoView({ behavior: "smooth", block: "center" });
}
window.editProduct = editProduct;

async function deleteProduct(id) {
    const product = adminProducts.find(item => item.id === id);
    if (!product) return showProductAlert("Could not find that product.");
    if (!confirm(`Delete ${product.name}? This cannot be undone.`)) return;

    try {
        await api(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        if ($("productId").value === id) resetProductForm();
        showProductAlert("Product deleted.", true);
        await loadProducts();
    } catch (err) {
        showProductAlert(err.message);
    }
}
window.deleteProduct = deleteProduct;

function resetProductForm() {
    $("productForm").reset();
    $("productId").value = "";
    $("productFormTitle").textContent = "Add Product";
    $("saveProductButton").textContent = "Add Product";
    $("cancelProductEdit").classList.add("hidden");
}

function setupProductForm() {
    const form = $("productForm");

    if (!form) {
        console.log("Product form not found.");
        return;
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const button = $("saveProductButton");
        const file = $("productImage").files[0];

        if (file && file.size > 8 * 1024 * 1024) {
            return showProductAlert("Product image must be 8 MB or smaller.");
        }

        try {
            button.disabled = true;
            const imageData = file ? await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error("Could not read the selected image."));
                reader.readAsDataURL(file);
            }) : "";
            const product = {
                name: $("productName").value.trim(),
                category: $("productCategory")?.value || "General",
                price: $("productPrice").value,
                description: $("productDescription").value.trim(),
                imageData,
                active: true
            };

            const productId = $("productId").value;
            await api(productId ? `/api/admin/products/${encodeURIComponent(productId)}` : "/api/admin/products", {
                method: productId ? "PATCH" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(product)
            });

            showProductAlert(productId ? "Product updated successfully." : "Product added successfully.", true);
            resetProductForm();

            await loadProducts();

        } catch (err) {
            showProductAlert(err.message);
        } finally {
            button.disabled = false;
        }
    });
    $("cancelProductEdit").addEventListener("click", resetProductForm);
}

(async function init(){
    try {
        const data = await api("/api/auth/me");
        user = data.user;

        renderDashboard();

    } catch {
        loginPanel.classList.remove("hidden");
    }
})();
