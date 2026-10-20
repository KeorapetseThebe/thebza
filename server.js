require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SHOP_NAME = process.env.SHOP_NAME || "BrandItWithBrandon";
const SHOP_WHATSAPP = (process.env.SHOP_WHATSAPP || "27685814380").replace(/\D/g, "");
const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "public", "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, "appointments.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_ref TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  price INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  appointment_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_slot ON appointments(appointment_date, start_time) WHERE status = 'confirmed';

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    description TEXT DEFAULT '',
    price INTEGER NOT NULL,
    image_url TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('clerk','owner')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const productColumns = new Set(
    db.prepare("PRAGMA table_info(products)").all().map(column => column.name)
);
if (!productColumns.has("category")) {
    db.exec("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'General'");
}

function loadJson(file) {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
}

function seedServices() {
    const count = db.prepare("SELECT COUNT(*) AS count FROM services").get().count;
    if (count > 0) return;
    const seed = loadJson("services.json");
    const insert = db.prepare(`INSERT INTO services (id,name,description,price,duration,active,sort_order) VALUES (?,?,?,?,?,?,?)`);
    const tx = db.transaction(items => items.forEach((s, i) => insert.run(s.id, s.name, s.description || "", Number(s.price), Number(s.duration), 1, i)));
    tx(seed);
}

function seedSettings() {
    const exists = db.prepare("SELECT 1 FROM settings WHERE key = 'hero_background'").get();
    if (!exists) db.prepare("INSERT INTO settings (key,value) VALUES ('hero_background',?)").run("");
}
const productsHeroExists = db
    .prepare("SELECT 1 FROM settings WHERE key = 'products_hero_background'")
    .get();

if (!productsHeroExists) {
    db.prepare("INSERT INTO settings (key,value) VALUES ('products_hero_background',?)")
        .run("");
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
    const [salt, key] = String(stored).split(":");
    if (!salt || !key) return false;
    const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(derived, "hex"));
}

function seedUser(username, name, role, password) {
    if (!password) return;
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (!existing) {
        db.prepare("INSERT INTO users (name,username,password_hash,role) VALUES (?,?,?,?)")
            .run(name, username, hashPassword(password), role);
    }
}

seedServices();
seedSettings();
seedUser(process.env.CLERK_USERNAME || "clerk", "Admin Clerk", "clerk", process.env.CLERK_PASSWORD || "Clerk123!");
seedUser(process.env.OWNER_USERNAME || "owner", "Owner", "owner", process.env.OWNER_PASSWORD || "Owner123!");

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function hours() { return loadJson("hours.json"); }

function services() {
    return db.prepare("SELECT id,name,description,price,duration FROM services WHERE active = 1 ORDER BY sort_order, name").all();
}

function allServices() {
    return db.prepare("SELECT id,name,description,price,duration,active,sort_order FROM services ORDER BY sort_order, name").all();
}

function getService(id) { return db.prepare("SELECT * FROM services WHERE id = ? AND active = 1").get(id); }

function timeToMinutes(time) { const [h, m] = String(time).split(":").map(Number); return h * 60 + m; }

function minutesToTime(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2,"0")}:${String(minutes % 60).padStart(2,"0")}`; }

function validDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")); }

function getDayName(date) { return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase(); }

function todayLocal() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getAvailability(date, serviceId) {
    if (!validDate(date)) return { slots: [], closed: true };
    const service = getService(serviceId);
    if (!service) return { slots: [], closed: true };
    const schedule = hours()[getDayName(date)];
    if (!schedule) return { slots: [], closed: true };

    const opening = timeToMinutes(schedule.open);
    const closing = timeToMinutes(schedule.close);
    const busy = db.prepare(`SELECT start_time,end_time FROM appointments WHERE appointment_date = ? AND status = 'confirmed'`).all(date)
        .map(a => ({ start: timeToMinutes(a.start_time), end: timeToMinutes(a.end_time) }));

    const now = new Date();
    const currentDate = todayLocal();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const slots = [];

    for (let start = opening; start + service.duration <= closing; start += 30) {
        const end = start + service.duration;
        const booked = busy.some(a => start < a.end && end > a.start);
        const passed = date === currentDate && start <= currentMinutes;
        slots.push({
            start: minutesToTime(start),
            end: minutesToTime(end),
            booked,
            disabled: booked || passed
        });
    }
    return { slots, closed: false };
}

function createWhatsAppMessage(booking) {
    return [
        `New Booking - ${SHOP_NAME}`, "",
        `Booking Reference: ${booking.booking_ref}`, "",
        `Service: ${booking.service_name}`,
        `Price: R${booking.price}`,
        `Duration: ${booking.duration} minutes`, "",
        `Date: ${booking.appointment_date}`,
        `Time: ${booking.start_time} - ${booking.end_time}`, "",
        `Customer: ${booking.customer_name}`,
        `Phone: ${booking.customer_phone}`, "",
        `Notes: ${booking.notes || "None"}`
    ].join("\n");
}

function createWhatsAppLink(message) { return `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(message)}`; }

async function sendWhatsAppCloud(message) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_API_VERSION || "v23.0";
    if (!token || !phoneNumberId) return false;
    try {
        const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", to: SHOP_WHATSAPP, type: "text", text: { body: message } })
        });
        if (!response.ok) { console.error("WhatsApp error:", await response.text()); return false; }
        return true;
    } catch (error) { console.error("WhatsApp connection error:", error); return false; }
}

function getSettings() {
    return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x => [x.key, x.value]));
}

function safeUser(user) { return { id: user.id, name: user.name, username: user.username, role: user.role }; }

function makeToken() { return crypto.randomBytes(32).toString("hex"); }

function tokenHash(token) { return crypto.createHash("sha256").update(token).digest("hex"); }

function setSessionCookie(res, token) {
    res.setHeader("Set-Cookie", `bib_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60*60*12}`);
}

function getCookie(req, name) {
    const raw = req.headers.cookie || "";
    const item = raw.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function currentUser(req) {
    const token = getCookie(req, "bib_session");
    if (!token) return null;
    const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).get(tokenHash(token), Date.now());
    return row || null;
}

function requireAuth(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: "Please log in." });
    req.user = user;
    next();
}

function requireOwner(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: "Please log in." });
    if (user.role !== "owner") return res.status(403).json({ error: "Owner access required." });
    req.user = user;
    next();
}

app.get("/api/config", (req, res) => res.json({ shopName: SHOP_NAME, whatsapp: SHOP_WHATSAPP, settings: getSettings() }));
app.get("/api/services", (req, res) => res.json(services()));
app.get("/api/products", (req, res) => {
    const products = db.prepare(`
        SELECT id, name, category, description, price, image_url
        FROM products
        WHERE active = 1
        ORDER BY sort_order, name
    `).all();

    res.json(products);
});
app.get("/api/availability", (req, res) => res.json(getAvailability(req.query.date, req.query.serviceId)));

app.post("/api/bookings", async(req, res) => {
    const { serviceId, date, startTime, customerName, customerPhone, notes = "" } = req.body;
    if (!serviceId || !date || !startTime || !customerName || !customerPhone) return res.status(400).json({ error: "Please complete all required fields." });
    const service = getService(serviceId);
    if (!service) return res.status(400).json({ error: "Invalid service." });
    if (!validDate(date) || date < todayLocal()) return res.status(400).json({ error: "Please choose a valid future date." });

    const availability = getAvailability(date, serviceId);
    const slot = availability.slots.find(s => s.start === startTime && !s.disabled);
    if (!slot) return res.status(409).json({ error: "That time is no longer available. Please select another time." });

    const bookingRef = `BIB-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    try {
        const insert = db.transaction(() => {
            const overlap = db.prepare(`SELECT id FROM appointments WHERE appointment_date=? AND status='confirmed' AND start_time < ? AND end_time > ? LIMIT 1`).get(date, slot.end, startTime);
            if (overlap) throw new Error("BOOKED");
            db.prepare(`INSERT INTO appointments (booking_ref,service_id,service_name,price,duration,appointment_date,start_time,end_time,customer_name,customer_phone,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
                .run(bookingRef, service.id, service.name, service.price, service.duration, date, startTime, slot.end, String(customerName).trim(), String(customerPhone).trim(), String(notes).trim());
        });
        insert();
    } catch (error) {
        if (error.message === "BOOKED" || String(error.message).includes("idx_active_slot")) return res.status(409).json({ error: "That appointment was just booked by another customer." });
        console.error(error);
        return res.status(500).json({ error: "Could not create booking." });
    }

    const booking = db.prepare("SELECT * FROM appointments WHERE booking_ref=?").get(bookingRef);
    const message = createWhatsAppMessage(booking);
    const whatsappSentAutomatically = await sendWhatsAppCloud(message);
    res.status(201).json({ booking, whatsappUrl: createWhatsAppLink(message), whatsappSentAutomatically });
});

app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(String(username || "").trim());
    if (!user || !verifyPassword(password || "", user.password_hash)) return res.status(401).json({ error: "Invalid username or password." });
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
    const token = makeToken();
    db.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").run(tokenHash(token), user.id, Date.now() + 12 * 60 * 60 * 1000);
    setSessionCookie(res, token);
    res.json({ user: safeUser(user) });
});
app.post("/api/auth/logout", requireAuth, (req, res) => {
    const token = getCookie(req, "bib_session");
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
    res.setHeader("Set-Cookie", "bib_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
    res.json({ success: true });
});
app.get("/api/auth/me", (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    res.json({ user: safeUser(user) });
});

app.get("/api/admin/bookings", requireAuth, (req, res) => {
    const { date, status } = req.query;
    let query = "SELECT * FROM appointments";
    const where = [];
    const params = [];
    if (date) {
        where.push("appointment_date=?");
        params.push(date);
    }
    if (status && ["confirmed", "cancelled", "completed"].includes(status)) {
        where.push("status=?");
        params.push(status);
    }
    if (where.length) query += ` WHERE ${where.join(" AND ")}`;
    query += " ORDER BY appointment_date ASC,start_time ASC";
    res.json(db.prepare(query).all(...params));
});

app.patch("/api/admin/bookings/:id/status", requireAuth, (req, res) => {
    const status = String(req.body.status || "");
    if (!["confirmed", "cancelled", "completed"].includes(status)) return res.status(400).json({ error: "Invalid status." });
    const result = db.prepare("UPDATE appointments SET status=? WHERE id=?").run(status, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Booking not found." });
    res.json({ success: true });
});

app.get("/api/admin/products", requireOwner, (req, res) => {
    const products = db.prepare(`
        SELECT *
        FROM products
        ORDER BY sort_order, name
    `).all();

    res.json(products);
});

app.post("/api/admin/products", requireOwner, (req, res) => {
    const {
        name,
        category = "General",
        description = "",
        price,
        image_url = "",
        imageData = "",
        active = true
    } = req.body;

    const cleanName = String(name || "").trim();
    const cleanCategory = String(category || "General").trim();
    const cleanDescription = String(description || "").trim();
    let cleanImageUrl = String(image_url || "").trim();

    if (imageData) {
        if (typeof imageData !== "string" || imageData.length > 11 * 1024 * 1024) {
            return res.status(400).json({ error: "Product image must be 8 MB or smaller." });
        }
        const match = imageData.match(/^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match) return res.status(400).json({ error: "Choose a valid JPEG, PNG, WebP or GIF image." });
        const imageBuffer = Buffer.from(match[2], "base64");
        if (imageBuffer.length > 8 * 1024 * 1024) {
            return res.status(400).json({ error: "Product image must be 8 MB or smaller." });
        }
        const extension = { jpeg: "jpg", png: "png", webp: "webp", gif: "gif" }[match[1]];
        const filename = `product-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
        fs.writeFileSync(path.join(uploadsDir, filename), imageBuffer);
        cleanImageUrl = `/uploads/${filename}`;
    }

    const productPrice = Number(price);

    if (!cleanName ||
        !Number.isFinite(productPrice) ||
        productPrice < 0
    ) {
        return res.status(400).json({
            error: "Enter a valid product name and price."
        });
    }

    const baseId = cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `product-${Date.now()}`;

    let id = baseId;
    let number = 2;

    while (db.prepare("SELECT 1 FROM products WHERE id=?").get(id)) {
        id = `${baseId}-${number++}`;
    }

    const maxSort = db
        .prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM products")
        .get().n;

    db.prepare(`
        INSERT INTO products (
            id,
            name,
            category,
            description,
            price,
            image_url,
            active,
            sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        cleanName,
        cleanCategory,
        cleanDescription,
        Math.round(productPrice),
        cleanImageUrl,
        active ? 1 : 0,
        maxSort + 1
    );

    res.status(201).json(
        db.prepare("SELECT * FROM products WHERE id=?").get(id)
    );
});
app.patch("/api/admin/products/:id", requireOwner, (req, res) => {
    const existing = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Product not found." });

    const name = req.body.name === undefined ? existing.name : String(req.body.name).trim();
    const price = req.body.price === undefined ? existing.price : Number(req.body.price);
    if (!name || !Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: "Enter a valid product name and price." });
    }

    db.prepare("UPDATE products SET name=?, price=? WHERE id=?")
        .run(name, Math.round(price), req.params.id);
    res.json(db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id));
});
app.delete("/api/admin/products/:id", requireOwner, (req, res) => {
    const product = db.prepare("SELECT image_url FROM products WHERE id=?").get(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });

    db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);

    const filename = path.basename(product.image_url || "");
    if (product.image_url.startsWith("/uploads/") && filename === product.image_url.slice("/uploads/".length) && /^product-[\w-]+\.(jpg|png|webp|gif)$/.test(filename)) {
        try {
            fs.unlinkSync(path.join(uploadsDir, filename));
        } catch (error) {
            if (error.code !== "ENOENT") console.error("Could not remove product image:", error);
        }
    }

    res.json({ success: true });
});
app.get("/api/admin/services", requireOwner, (req, res) => res.json(allServices()));
app.post("/api/admin/services", requireOwner, (req, res) => {
    const { name, description = "", price, duration, active = true } = req.body;
    const cleanName = String(name || "").trim();
    const p = Number(price),
        d = Number(duration);
    if (!cleanName || !Number.isFinite(p) || p < 0 || !Number.isFinite(d) || d <= 0) return res.status(400).json({ error: "Enter a valid service name, price and duration." });
    let id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `service-${Date.now()}`;
    let base = id,
        n = 2;
    while (db.prepare("SELECT 1 FROM services WHERE id=?").get(id)) { id = `${base}-${n++}`; }
    const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order),0) AS n FROM services").get().n;
    db.prepare("INSERT INTO services (id,name,description,price,duration,active,sort_order) VALUES (?,?,?,?,?,?,?)").run(id, cleanName, String(description).trim(), Math.round(p), Math.round(d), active ? 1 : 0, maxSort + 1);
    res.status(201).json(db.prepare("SELECT * FROM services WHERE id=?").get(id));
});
app.patch("/api/admin/services/:id", requireOwner, (req, res) => {
    const existing = db.prepare("SELECT * FROM services WHERE id=?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Service not found." });
    const name = String(req.body.name || existing.name).trim();
    const description = String(req.body.description || existing.description).trim();
    const price = Number(req.body.price || existing.price);
    const duration = Number(req.body.duration || existing.duration);
    const active = req.body.active === undefined ? existing.active : (req.body.active ? 1 : 0);
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(duration) || duration <= 0) return res.status(400).json({ error: "Invalid service details." });
    db.prepare("UPDATE services SET name=?,description=?,price=?,duration=?,active=? WHERE id=?").run(name, description, Math.round(price), Math.round(duration), active, req.params.id);
    res.json(db.prepare("SELECT * FROM services WHERE id=?").get(req.params.id));
});
app.delete("/api/admin/services/:id", requireOwner, (req, res) => {
    const result = db.prepare("UPDATE services SET active=0 WHERE id=?").run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Service not found." });
    res.json({ success: true });
});

app.get("/api/admin/settings", requireOwner, (req, res) => res.json(getSettings()));
app.post("/api/admin/settings/background", requireOwner, (req, res) => {
    const { imageData, extension = ".jpg" } = req.body;
    if (!imageData || typeof imageData !== "string") return res.status(400).json({ error: "Please select an image." });
    const match = imageData.match(/^data:image\/(jpeg|png|webp|gif);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "Unsupported image format." });
    const extMap = { jpeg: ".jpg", png: ".png", webp: ".webp", gif: ".gif" };
    const ext = extMap[match[1]] || extension;
    const filename = `hero-${Date.now()}${ext}`;
    const old = getSettings().hero_background;
    if (old && old.startsWith("/uploads/")) {
        const oldPath = path.join(__dirname, "public", old.replace(/^\//, ""));
        if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch {} }
    }
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(match[2], "base64"));
    const url = `/uploads/${filename}`;
    db.prepare("INSERT INTO settings(key,value) VALUES('hero_background',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(url);
    res.json({ success: true, url });
});
app.get("/api/admin/settings", requireOwner, (req, res) => res.json(getSettings()));
app.post(
    "/api/admin/settings/products-background",
    requireOwner,
    (req, res) => {

        const { imageData } = req.body;

        if (!imageData || typeof imageData !== "string") {
            return res.status(400).json({
                error: "No image supplied."
            });
        }

        if (!imageData.startsWith("data:image/")) {
            return res.status(400).json({
                error: "Invalid image."
            });
        }

        db.prepare(`
            INSERT INTO settings(key, value)
            VALUES('products_hero_background', ?)
            ON CONFLICT(key)
            DO UPDATE SET value = excluded.value
        `).run(imageData);

        res.json({
            success: true,
            products_hero_background: imageData
        });
    }
);

app.get("/api/admin/hours", requireAuth, (req, res) => res.json(hours()));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(400).json({ error: err.message || "Request failed." });
});

app.listen(PORT, () => console.log(`${SHOP_NAME} running at http://localhost:${PORT}`));
