// Irida Wellness — single-user PWA
// Storage: IndexedDB (sola Irida, su questo iPhone). Export JSON per backup.

const DB_NAME = "irida-wellness";
const DB_VERSION = 2;

const STORES = {
  food:        "food",        // { id, ts, category, portion, note }
  water:       "water",       // { id, ts, glasses }
  weight:      "weight",      // { id, ts, kg }
  cycle:       "cycle",       // { id, startDate, length }
  labs:        "labs",        // { id, ts, marker, value, unit }
  symptom:     "symptom",     // { id, ts, tag, intensity }
  supplements: "supplements", // { id (date:name), date, name, taken, ts }
  config:      "config",      // { key, value }
};

let db;

// Profilo Irida (precaricato al primo avvio)
const PROFILE_DEFAULTS = {
  name: "Irida",
  dob: "1979-07-14",   // 46 anni nel 2026
  height: 160,          // cm
  gender: "F",
  startWeight: 74,      // peso di partenza
  startDate: "2026-05-17",
};

// Integratori monitorati (uno solo per ora — facile estendere)
const SUPPLEMENTS = [
  { id: "sideral", label: "Sideral", icon: "medication", color: "text-secondary" },
];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      for (const name of Object.values(STORES)) {
        if (!d.objectStoreNames.contains(name)) {
          let keyPath = "id", autoIncrement = true;
          if (name === "config") { keyPath = "key"; autoIncrement = false; }
          if (name === "supplements") { keyPath = "id"; autoIncrement = false; } // id = "date:name"
          const s = d.createObjectStore(name, { keyPath, autoIncrement });
          if (name !== "config") {
            try { s.createIndex("ts", "ts"); } catch (e) {}
          }
        }
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}

function put(store, record) {
  return new Promise((resolve, reject) => {
    const r = tx(store, "readwrite").put(record);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const r = tx(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function getConfig(key, fallback = null) {
  return new Promise((resolve) => {
    const r = tx(STORES.config).get(key);
    r.onsuccess = () => resolve(r.result ? r.result.value : fallback);
    r.onerror = () => resolve(fallback);
  });
}

function setConfig(key, value) {
  return put(STORES.config, { key, value });
}

// ---------------- Routing ----------------

const views = ["home", "diary", "plan", "health"];

function route() {
  const hash = (location.hash || "#home").replace("#", "");
  const target = views.includes(hash) ? hash : "home";
  for (const v of views) {
    document.getElementById(`view-${v}`).classList.toggle("active", v === target);
  }
  document.querySelectorAll(".nav-link").forEach((el) => {
    const active = el.dataset.nav === target;
    el.classList.toggle("text-primary", active);
    el.classList.toggle("font-bold", active);
    el.classList.toggle("text-on-surface-variant", !active);
  });
  if (target === "home") { renderHome(); renderInsight(); }
}

window.addEventListener("hashchange", route);

// ---------------- Home rendering (placeholder) ----------------

function todayKey() { return dateKey(new Date()); }

async function renderHome() {
  const profile = await getProfile();

  // Greeting by hour + giorno settimana
  const h = new Date().getHours();
  const greet = h < 12 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  document.getElementById("homeGreeting").textContent = `${greet}, ${profile.name}`;
  const subtitle = document.getElementById("homeSubtitle");
  if (subtitle) {
    const day = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    subtitle.textContent = day.charAt(0).toUpperCase() + day.slice(1);
  }

  await renderSupplements();
  await renderReminders();
  await renderWater();
  await renderSymptomLog();
  await renderHomeQuickStats(profile);
}

// ---------------- Diary ----------------

// Categorie pensate per dieta mediterranea / single-user. Modifica liberamente.
const CATEGORIES = [
  { id: "verdura",       label: "Verdura",        icon: "eco",           color: "bg-tertiary-container text-on-tertiary-container" },
  { id: "frutta",        label: "Frutta",         icon: "nutrition",     color: "bg-secondary-fixed text-on-secondary-container" },
  { id: "frutti_secchi", label: "Frutta secca",   icon: "scatter_plot",  color: "bg-tertiary-container text-on-tertiary-container" },
  { id: "cereali_int",   label: "Cereali integ.", icon: "grain",         color: "bg-primary-fixed text-on-primary-fixed" },
  { id: "cereali_raf",   label: "Cereali raff.",  icon: "bakery_dining", color: "bg-surface-container-high text-on-surface" },
  { id: "legumi",        label: "Legumi",         icon: "spa",           color: "bg-tertiary-fixed text-on-tertiary-fixed" },
  { id: "pesce",         label: "Pesce azzurro",  icon: "set_meal",      color: "bg-tertiary-fixed text-on-tertiary-fixed" },
  { id: "carne_bianca",  label: "Carne bianca",   icon: "lunch_dining",  color: "bg-primary-fixed text-on-primary-fixed" },
  { id: "carne_rossa",   label: "Carne rossa",    icon: "kebab_dining",  color: "bg-secondary-fixed-dim text-on-secondary-fixed" },
  { id: "uova",          label: "Uova",           icon: "egg",           color: "bg-surface-container-high text-on-surface" },
  { id: "latticini",     label: "Latticini",      icon: "icecream",      color: "bg-surface-container-high text-on-surface" },
  { id: "grassi_buoni",  label: "EVO/Avocado",    icon: "oil_barrel",    color: "bg-tertiary-container text-on-tertiary-container" },
  { id: "dolci",         label: "Dolci",          icon: "cake",          color: "bg-secondary-fixed-dim text-on-secondary-fixed" },
  { id: "alcol",         label: "Alcol",          icon: "wine_bar",      color: "bg-error-container text-on-error-container" },
  { id: "snack_salati",  label: "Snack salati",   icon: "cookie",        color: "bg-surface-container-high text-on-surface" },
];

// Ideale settimanale = profilo ANTINFIAMMATORIO (porzioni/settimana).
// Privilegia: omega-3, polifenoli, fibre, crucifere, basso IG.
// Limita: zuccheri raffinati, ultra-processati, carni rosse, alcol.
const IDEAL_DEFAULT = {
  verdura: 28,       // 4 porzioni/die (almeno 1 crucifere/die + foglia verde)
  frutta: 14,        // 2/die — privilegia frutti rossi, agrumi
  frutti_secchi: 14, // 1 porzione/die (noci, mandorle, semi di lino/chia)
  cereali_int: 14,   // 2/die integrali (avena, farro, quinoa)
  cereali_raf: 1,    // quasi zero
  legumi: 5,         // proteine vegetali principali
  pesce: 4,          // 3 di cui pesce azzurro per omega-3
  carne_bianca: 2,
  carne_rossa: 1,    // massimo 1, meglio 0
  uova: 4,           // tuorlo = vit D dietetica
  latticini: 3,      // moderato, preferire yogurt/kefir
  grassi_buoni: 21,  // EVO ad ogni pasto + avocado
  dolci: 1,
  alcol: 0,
  snack_salati: 0,
};

const PORTION_FACTOR = { S: 0.5, M: 1, L: 1.5 };

let diaryDate = new Date(); // giorno visualizzato nel diario

function dateKey(d) {
  // Data locale (non UTC) per evitare slittamenti notturni
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function tsDateKey(ts) { return dateKey(new Date(ts)); }

async function getProfile() {
  return {
    name:   await getConfig("profile.name",   PROFILE_DEFAULTS.name),
    dob:    await getConfig("profile.dob",    PROFILE_DEFAULTS.dob),
    height: await getConfig("profile.height", PROFILE_DEFAULTS.height),
    gender: await getConfig("profile.gender", PROFILE_DEFAULTS.gender),
  };
}

function computeAge(dobIso) {
  const d = new Date(dobIso);
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age;
}

function computeBMI(kg, heightCm) {
  if (!kg || !heightCm) return null;
  const m = heightCm / 100;
  return kg / (m * m);
}

function bmiCategory(bmi) {
  if (bmi == null) return { label: "—", color: "text-on-surface-variant", bg: "bg-surface-container-high" };
  if (bmi < 18.5) return { label: "Sottopeso",   color: "text-tertiary",          bg: "bg-tertiary/15" };
  if (bmi < 25)   return { label: "Normopeso",   color: "text-tertiary",          bg: "bg-tertiary/15" };
  if (bmi < 30)   return { label: "Sovrappeso",  color: "text-secondary",         bg: "bg-secondary-fixed" };
  return            { label: "Obesità",       color: "text-error",             bg: "bg-error-container" };
}

function bmiHealthyWeightRange(heightCm) {
  const m = heightCm / 100;
  return { min: +(18.5 * m * m).toFixed(1), max: +(24.9 * m * m).toFixed(1) };
}

// First-run: pre-popola il peso di partenza se non c'e' alcun peso
async function seedFirstRun() {
  const seeded = await getConfig("seeded.v1", false);
  if (seeded) return;
  const weights = await getAll(STORES.weight);
  if (!weights.length) {
    const profile = await getProfile();
    const ts = new Date(profile.startDate).getTime();
    await put(STORES.weight, { ts, kg: profile.startWeight });
  }
  await setConfig("seeded.v1", true);
}

// Supplements
async function toggleSupplement(name, dateStr) {
  const id = `${dateStr}:${name}`;
  const existing = await new Promise((res) => {
    const r = tx(STORES.supplements).get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
  if (existing) {
    await new Promise((res) => {
      const r = tx(STORES.supplements, "readwrite").delete(id);
      r.onsuccess = res;
    });
    return false;
  }
  await put(STORES.supplements, { id, date: dateStr, name, taken: true, ts: Date.now() });
  return true;
}

async function isSupplementTaken(name, dateStr) {
  return new Promise((res) => {
    const r = tx(STORES.supplements).get(`${dateStr}:${name}`);
    r.onsuccess = () => res(!!r.result);
    r.onerror = () => res(false);
  });
}

async function supplementStreak(name) {
  // Conta giorni consecutivi fino a oggi (o ieri se oggi non ancora preso)
  const all = await getAll(STORES.supplements);
  const taken = new Set(all.filter((s) => s.name === name && s.taken).map((s) => s.date));
  let streak = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  // Se oggi non preso, controlla da ieri
  if (!taken.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (taken.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function startOfDay(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}

function rangeDays(daysBack) {
  const end = startOfDay(new Date()); end.setDate(end.getDate() + 1);
  const start = startOfDay(new Date()); start.setDate(start.getDate() - daysBack + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function renderCategoryChips() {
  const el = document.getElementById("categoryChips");
  if (!el) return;
  el.innerHTML = CATEGORIES.map((c) => `
    <button class="categoryChip flex items-center gap-1.5 px-3 py-2 rounded-full ${c.color} active:scale-95 transition-transform" data-cat="${c.id}">
      <span class="material-symbols-outlined text-base">${c.icon}</span>
      <span class="text-sm font-semibold">${c.label}</span>
    </button>`).join("");
  el.querySelectorAll(".categoryChip").forEach((btn) => {
    btn.addEventListener("click", () => openPortionPicker(btn.dataset.cat));
  });
}

let pickerCat = null;
function openPortionPicker(catId) {
  pickerCat = catId;
  const c = CATEGORIES.find((x) => x.id === catId);
  document.getElementById("pickerCategory").textContent = c.label;
  document.getElementById("portionPicker").classList.remove("hidden");
}
function closePortionPicker() {
  pickerCat = null;
  document.getElementById("portionPicker").classList.add("hidden");
}

async function logFood(portion) {
  if (!pickerCat) return;
  await put(STORES.food, { ts: Date.now(), category: pickerCat, portion });
  closePortionPicker();
  // Aggiorna immediatamente conteggio pasti Home + insight + reminders
  await renderHome();
  await renderInsight();
}

async function renderWater() {
  const goalEl = document.getElementById("waterGoal");
  if (!goalEl) return;
  const goal = await getConfig("waterGoal", 8);
  goalEl.textContent = goal;
  const waters = await getAll(STORES.water);
  const key = dateKey(new Date());
  const todayGlasses = waters
    .filter((w) => tsDateKey(w.ts) === key)
    .reduce((s, w) => s + (w.glasses || 1), 0);
  document.getElementById("waterCount").textContent = todayGlasses;

  const el = document.getElementById("waterGlasses");
  el.innerHTML = "";
  for (let i = 0; i < goal; i++) {
    const filled = i < todayGlasses;
    const btn = document.createElement("button");
    btn.className = `w-8 h-10 rounded-md flex items-center justify-center active:scale-90 transition-transform ${filled ? "bg-tertiary text-white" : "bg-surface-container-high text-on-surface-variant"}`;
    btn.innerHTML = `<span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' ${filled ? 1 : 0};">water_drop</span>`;
    btn.addEventListener("click", () => toggleWater(i, todayGlasses));
    el.appendChild(btn);
  }
}

async function toggleWater(idx, current) {
  const waters = await getAll(STORES.water);
  const key = dateKey(new Date());
  const todays = waters.filter((w) => tsDateKey(w.ts) === key);

  if (idx < current) {
    const last = todays.sort((a, b) => b.ts - a.ts)[0];
    if (last) {
      await new Promise((res) => {
        const r = tx(STORES.water, "readwrite").delete(last.id);
        r.onsuccess = res;
      });
    }
  } else {
    await put(STORES.water, { ts: Date.now(), glasses: 1 });
  }
  renderWater();
  renderReminders();
}

async function renderDiaryLog() {
  const foods = await getAll(STORES.food);
  const key = dateKey(diaryDate);
  const todays = foods
    .filter((f) => tsDateKey(f.ts) === key)
    .sort((a, b) => a.ts - b.ts);
  const el = document.getElementById("diaryLog");
  if (!todays.length) {
    el.innerHTML = `<p class="text-on-surface-variant text-sm italic">Nessun pasto registrato.</p>`;
    return;
  }
  el.innerHTML = todays.map((f) => {
    const c = CATEGORIES.find((x) => x.id === f.category) || { label: f.category, icon: "restaurant" };
    const portionLabel = { S: "Piccola", M: "Media", L: "Grande" }[f.portion] || f.portion;
    return `<div class="flex items-center justify-between py-2 border-b border-outline-variant/20 last:border-0">
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-primary text-lg">${c.icon}</span>
        <div>
          <p class="font-semibold text-on-surface">${c.label}</p>
          <p class="text-xs text-on-surface-variant">${portionLabel} • ${new Date(f.ts).toTimeString().slice(0,5)}</p>
        </div>
      </div>
      <button class="text-on-surface-variant active:scale-90" data-del="${f.id}"><span class="material-symbols-outlined text-base">delete</span></button>
    </div>`;
  }).join("");
  el.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.dataset.del);
      await new Promise((res) => {
        const r = tx(STORES.food, "readwrite").delete(id);
        r.onsuccess = res;
      });
      renderDiaryLog();
      renderIdealCompare();
      renderHome();
    });
  });
}

// Raggruppamento categorie per macro-aree (logica antinfiammatoria)
const CATEGORY_GROUPS = {
  promote: { label: "Da promuovere", icon: "trending_up", color: "text-tertiary",
             ids: ["verdura", "frutta", "frutti_secchi", "legumi", "pesce", "cereali_int", "grassi_buoni"] },
  moderate: { label: "Con moderazione", icon: "balance", color: "text-primary",
              ids: ["uova", "carne_bianca", "latticini"] },
  limit: { label: "Da limitare/evitare", icon: "trending_down", color: "text-error",
           ids: ["cereali_raf", "carne_rossa", "dolci", "alcol", "snack_salati"] },
};

function statusFor(target, real, isLimit) {
  // Per categorie "da limitare" la logica e' invertita: stare SOTTO target = ottimo
  if (isLimit) {
    if (target === 0) {
      return real === 0
        ? { color: "bg-tertiary", text: "text-tertiary", icon: "✓", label: "ottimo" }
        : { color: "bg-error", text: "text-error", icon: "!", label: "sopra" };
    }
    if (real <= target) return { color: "bg-tertiary", text: "text-tertiary", icon: "✓", label: "ok" };
    if (real <= target * 1.5) return { color: "bg-secondary-fixed-dim", text: "text-secondary", icon: "↑", label: "sopra" };
    return { color: "bg-error", text: "text-error", icon: "!!", label: "molto sopra" };
  }
  // Per categorie da promuovere: vicino al target = ottimo
  if (target === 0) return { color: "bg-surface-container-high", text: "text-on-surface-variant", icon: "—", label: "—" };
  const pct = (real / target) * 100;
  if (pct < 50)  return { color: "bg-error-container",      text: "text-error",      icon: "↓↓", label: "molto sotto" };
  if (pct < 80)  return { color: "bg-secondary-fixed",      text: "text-secondary",  icon: "↓",  label: "sotto" };
  if (pct <= 120) return { color: "bg-tertiary",            text: "text-tertiary",   icon: "✓",  label: "in target" };
  if (pct <= 150) return { color: "bg-primary-fixed-dim",   text: "text-primary",    icon: "↑",  label: "sopra" };
  return { color: "bg-secondary",                           text: "text-secondary",  icon: "↑↑", label: "molto sopra" };
}

async function renderIdealCompare() {
  const ideal = await getConfig("idealWeekly", IDEAL_DEFAULT);
  const foods = await getAll(STORES.food);
  const { start, end } = rangeDays(7);
  const inRange = foods.filter((f) => f.ts >= start && f.ts < end);

  const counts = {};
  for (const f of inRange) {
    counts[f.category] = (counts[f.category] || 0) + (PORTION_FACTOR[f.portion] || 1);
  }

  // Score globale: media pct nei "promote" + (100 - eccesso medio nei "limit")
  const promoteIds = CATEGORY_GROUPS.promote.ids.filter((id) => (ideal[id] || 0) > 0);
  const promoteScores = promoteIds.map((id) => {
    const t = ideal[id], r = counts[id] || 0;
    return Math.max(0, Math.min(100, (r / t) * 100));
  });
  const limitIds = CATEGORY_GROUPS.limit.ids;
  const limitPenalties = limitIds.map((id) => {
    const t = ideal[id] || 0, r = counts[id] || 0;
    if (t === 0) return r === 0 ? 0 : Math.min(100, r * 25);
    return r <= t ? 0 : Math.min(100, ((r - t) / t) * 50);
  });
  const promoteAvg = promoteScores.length ? promoteScores.reduce((a, b) => a + b, 0) / promoteScores.length : 0;
  const limitAvg = limitPenalties.length ? limitPenalties.reduce((a, b) => a + b, 0) / limitPenalties.length : 0;
  const globalScore = Math.round(Math.max(0, Math.min(100, promoteAvg - limitAvg)));

  // Summary header
  const summaryEl = document.getElementById("idealSummary");
  if (summaryEl) {
    let scoreColor = "text-error", scoreLabel = "da migliorare";
    if (globalScore >= 80) { scoreColor = "text-tertiary"; scoreLabel = "eccellente"; }
    else if (globalScore >= 60) { scoreColor = "text-tertiary"; scoreLabel = "buono"; }
    else if (globalScore >= 40) { scoreColor = "text-primary"; scoreLabel = "in cammino"; }
    else if (globalScore >= 20) { scoreColor = "text-secondary"; scoreLabel = "sotto"; }
    summaryEl.innerHTML = `
      <div class="flex items-end justify-between mb-2">
        <div>
          <p class="text-label-caps uppercase text-on-surface-variant">Punteggio settimana</p>
          <p class="font-serif text-display-lg ${scoreColor}">${globalScore}<span class="text-base text-on-surface-variant">/100</span></p>
        </div>
        <div class="text-right">
          <p class="text-label-caps uppercase text-on-surface-variant">Allineamento</p>
          <p class="font-bold ${scoreColor}">${scoreLabel}</p>
        </div>
      </div>
      <div class="h-3 rounded-full bg-surface-container-high overflow-hidden">
        <div class="h-full transition-all ${globalScore >= 60 ? 'bg-tertiary' : globalScore >= 40 ? 'bg-primary-fixed-dim' : 'bg-secondary-fixed-dim'}" style="width:${globalScore}%"></div>
      </div>
    `;
  }

  // Render gruppi
  const el = document.getElementById("idealCompare");
  el.innerHTML = "";
  for (const [groupKey, group] of Object.entries(CATEGORY_GROUPS)) {
    const isLimit = groupKey === "limit";
    const items = group.ids
      .map((id) => CATEGORIES.find((c) => c.id === id))
      .filter(Boolean)
      .filter((c) => (ideal[c.id] || 0) > 0 || (counts[c.id] || 0) > 0);

    if (!items.length) continue;

    const groupHtml = `<div class="mb-4">
      <div class="flex items-center gap-2 mb-2">
        <span class="material-symbols-outlined ${group.color} text-base">${group.icon}</span>
        <span class="text-label-caps uppercase ${group.color}">${group.label}</span>
      </div>
      <div class="flex flex-col gap-2">
        ${items.map((c) => {
          const target = ideal[c.id] || 0;
          const real = +(counts[c.id] || 0).toFixed(1);
          const status = statusFor(target, real, isLimit);
          const pct = target > 0 ? Math.min(120, (real / target) * 100) : (real > 0 ? 100 : 0);
          return `<div class="bg-surface-container-low rounded-lg p-3">
            <div class="flex justify-between items-center mb-1.5">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-on-surface-variant text-base">${c.icon}</span>
                <span class="font-semibold text-on-surface text-sm">${c.label}</span>
              </div>
              <div class="text-right">
                <span class="font-bold text-base ${status.text}">${real}<span class="text-on-surface-variant font-normal">/${target}</span></span>
                <span class="ml-1 font-bold ${status.text}">${status.icon}</span>
              </div>
            </div>
            <div class="h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div class="h-full ${status.color}" style="width:${Math.min(100, pct)}%"></div>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
    el.insertAdjacentHTML("beforeend", groupHtml);
  }
}

function renderDiaryHeader() {
  const today = dateKey(new Date());
  const key = dateKey(diaryDate);
  let label;
  if (key === today) label = "Oggi";
  else {
    const y = new Date(); y.setDate(y.getDate() - 1);
    label = key === dateKey(y) ? "Ieri" : diaryDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  }
  document.getElementById("diaryDateLabel").textContent = label;
}

function renderDiary() {
  renderDiaryHeader();
  renderDiaryLog();
  renderIdealCompare();
}

// Modal diario ideale
async function openIdealModal() {
  const ideal = await getConfig("idealWeekly", IDEAL_DEFAULT);
  const form = document.getElementById("idealForm");
  form.innerHTML = CATEGORIES.map((c) => `
    <label class="flex items-center justify-between gap-3">
      <span class="text-sm font-semibold text-on-surface">${c.label}</span>
      <input type="number" min="0" step="1" value="${ideal[c.id] ?? 0}" data-cat="${c.id}"
        class="w-20 text-right px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-low" />
    </label>`).join("");
  document.getElementById("idealModal").classList.remove("hidden");
}

async function saveIdeal() {
  const inputs = document.querySelectorAll("#idealForm input[data-cat]");
  const obj = {};
  inputs.forEach((i) => obj[i.dataset.cat] = parseInt(i.value) || 0);
  await setConfig("idealWeekly", obj);
  document.getElementById("idealModal").classList.add("hidden");
  renderIdealCompare();
}

function bindDiaryEvents() {
  document.getElementById("diaryPrevDay").addEventListener("click", () => {
    diaryDate.setDate(diaryDate.getDate() - 1); renderDiary();
  });
  document.getElementById("diaryNextDay").addEventListener("click", () => {
    const next = new Date(diaryDate); next.setDate(next.getDate() + 1);
    if (next > new Date()) return;
    diaryDate = next; renderDiary();
  });
  document.querySelectorAll(".portionBtn").forEach((btn) => {
    btn.addEventListener("click", () => logFood(btn.dataset.portion));
  });
  document.getElementById("cancelPicker").addEventListener("click", closePortionPicker);
  document.getElementById("editIdealBtn").addEventListener("click", openIdealModal);
  document.getElementById("closeIdealModal").addEventListener("click", () => {
    document.getElementById("idealModal").classList.add("hidden");
  });
  document.getElementById("saveIdeal").addEventListener("click", saveIdeal);

  // Quick add = vai in Home e scrolla al box cibo
  document.getElementById("quickAddBtn").addEventListener("click", () => {
    location.hash = "#home";
    setTimeout(() => document.getElementById("categoryChips")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  });
}

// ---------------- Health ----------------

const SYMPTOMS = [
  { id: "cramps",       label: "Crampi" },
  { id: "headache",     label: "Mal di testa" },
  { id: "bloat",        label: "Gonfiore" },
  { id: "fatigue",      label: "Stanchezza" },
  { id: "mood_low",     label: "Umore basso" },
  { id: "anxious",      label: "Ansia" },
  { id: "energy",       label: "Energica" },
  { id: "happy",        label: "Felice" },
  { id: "insomnia",     label: "Insonnia" },
  { id: "acne",         label: "Acne" },
  { id: "nausea",       label: "Nausea" },
  { id: "breast",       label: "Seno teso" },
  { id: "swollen_ankles", label: "Caviglie gonfie" },
  { id: "chest_heavy",  label: "Peso al petto" },
];

async function saveWeight(inputId) {
  const input = document.getElementById(inputId);
  const kg = parseFloat(input.value);
  if (!kg || kg < 20 || kg > 300) return;
  await put(STORES.weight, { ts: Date.now(), kg });
  input.value = "";
  renderHealth();
  renderHome();
}

async function renderWeight() {
  const profile = await getProfile();
  const range = bmiHealthyWeightRange(profile.height);
  const weights = (await getAll(STORES.weight)).sort((a, b) => a.ts - b.ts);
  const lastEl = document.getElementById("weightLast");
  const trendEl = document.getElementById("weightTrendLabel");
  const bmiBox = document.getElementById("bmiBox");

  if (!weights.length) {
    lastEl.textContent = "—";
    trendEl.textContent = "Aggiungi la prima misura";
    if (bmiBox) bmiBox.innerHTML = `<p class="text-sm text-on-surface-variant">Altezza: ${profile.height} cm · Range sano: ${range.min}–${range.max} kg</p>`;
    document.getElementById("weightChart").innerHTML = "";
    return;
  }
  const last = weights[weights.length - 1];
  lastEl.textContent = last.kg.toFixed(1);

  const bmi = computeBMI(last.kg, profile.height);
  const cat = bmiCategory(bmi);
  if (bmiBox) {
    // Posizione BMI sulla scala (15–40 → 0–100%)
    const pos = Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100));
    bmiBox.innerHTML = `
      <div class="flex justify-between items-baseline mb-2">
        <div>
          <p class="text-label-caps uppercase text-on-surface-variant">BMI</p>
          <p class="font-serif text-2xl ${cat.color}"><strong>${bmi.toFixed(1)}</strong> <span class="text-sm">· ${cat.label}</span></p>
        </div>
        <div class="text-right">
          <p class="text-label-caps uppercase text-on-surface-variant">Range sano</p>
          <p class="text-sm font-bold text-tertiary">${range.min}–${range.max} kg</p>
        </div>
      </div>
      <div class="relative h-3 rounded-full overflow-hidden flex">
        <div class="flex-[35] bg-tertiary/30"></div>
        <div class="flex-[65] bg-tertiary"></div>
        <div class="flex-[50] bg-secondary-fixed"></div>
        <div class="flex-[100] bg-error-container"></div>
        <div class="absolute top-0 -mt-0.5 -ml-1 w-1 h-4 bg-on-surface rounded-full" style="left:${pos}%"></div>
      </div>
      <div class="flex justify-between text-[10px] text-on-surface-variant mt-1">
        <span>18.5</span><span>25</span><span>30</span><span>40</span>
      </div>
      <p class="text-xs text-on-surface-variant mt-2">Altezza: ${profile.height} cm · Età: ${computeAge(profile.dob)} anni</p>
    `;
  }

  // Trend dal peso di partenza
  const fromStart = last.kg - profile.startWeight;
  const arrowS = fromStart > 0 ? "↑" : fromStart < 0 ? "↓" : "→";
  const colorS = fromStart > 0 ? "text-secondary" : fromStart < 0 ? "text-tertiary" : "text-on-surface-variant";
  const daysFromStart = Math.max(1, Math.floor((Date.now() - new Date(profile.startDate).getTime()) / 86400000));
  trendEl.innerHTML = `Da peso di partenza <strong>${profile.startWeight} kg</strong> · <span class="${colorS} font-bold">${arrowS} ${Math.abs(fromStart).toFixed(1)} kg</span> in ${daysFromStart} gg`;

  // SVG line chart
  const recent = weights.slice(-30);
  const w = 320, h = 120, pad = 10;
  const xs = recent.map((_, i) => pad + (i * (w - 2 * pad)) / Math.max(1, recent.length - 1));
  const kgs = recent.map((r) => r.kg);
  const minK = Math.min(...kgs) - 0.5, maxK = Math.max(...kgs) + 0.5;
  const ys = kgs.map((k) => h - pad - ((k - minK) * (h - 2 * pad)) / Math.max(0.1, maxK - minK));
  const path = recent.map((_, i) => (i === 0 ? "M" : "L") + xs[i] + "," + ys[i]).join(" ");
  const area = path + ` L${xs[xs.length - 1]},${h - pad} L${xs[0]},${h - pad} Z`;
  const dots = recent.map((_, i) => `<circle cx="${xs[i]}" cy="${ys[i]}" r="3" fill="#8b4e3e" />`).join("");
  document.getElementById("weightChart").innerHTML = `
    <path d="${area}" fill="#ffb09c" opacity="0.25" />
    <path d="${path}" fill="none" stroke="#8b4e3e" stroke-width="2" />
    ${dots}`;
}

async function logPeriodStart() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dateStr = prompt("Data inizio ciclo (YYYY-MM-DD):", dateKey(today));
  if (!dateStr) return;
  await put(STORES.cycle, { startDate: dateStr });
  renderCycle();
  renderHome();
}

async function renderCycle() {
  const cycles = (await getAll(STORES.cycle)).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const phaseEl = document.getElementById("cyclePhaseLabel");
  const nextEl = document.getElementById("cycleNext");
  const ovEl = document.getElementById("cycleOv");
  const avgEl = document.getElementById("cycleAvg");
  const cal = document.getElementById("cycleCalendar");

  // Lunghezza media reale (se ho almeno 2 cicli registrati)
  let avgLen = 28;
  if (cycles.length >= 2) {
    const diffs = [];
    for (let i = 1; i < cycles.length; i++) {
      const d = (new Date(cycles[i].startDate) - new Date(cycles[i - 1].startDate)) / 86400000;
      if (d > 15 && d < 60) diffs.push(d);
    }
    if (diffs.length) avgLen = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
  }
  avgEl.textContent = `${avgLen} giorni`;

  if (!cycles.length) {
    phaseEl.textContent = "Nessun ciclo registrato";
    nextEl.textContent = "—"; ovEl.textContent = "—";
    cal.innerHTML = "";
    return;
  }

  const last = cycles[cycles.length - 1];
  const lastStart = new Date(last.startDate); lastStart.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = Math.floor((today - lastStart) / 86400000) + 1;

  const phase = day <= 5 ? "Mestruale"
    : day <= 13 ? "Follicolare"
    : day === 14 ? "Ovulazione"
    : day <= avgLen ? "Luteale"
    : "In ritardo";
  phaseEl.textContent = `${phase} • Giorno ${day} di ~${avgLen}`;

  const nextStart = new Date(lastStart); nextStart.setDate(nextStart.getDate() + avgLen);
  const daysToNext = Math.ceil((nextStart - today) / 86400000);
  nextEl.textContent = daysToNext >= 0 ? `tra ${daysToNext} gg` : `${-daysToNext} gg fa`;

  const ovDate = new Date(lastStart); ovDate.setDate(ovDate.getDate() + 13);
  const daysToOv = Math.ceil((ovDate - today) / 86400000);
  ovEl.textContent = daysToOv > 0 ? `tra ${daysToOv} gg` : daysToOv === 0 ? "oggi" : `${-daysToOv} gg fa`;

  // Calendario: ultimi 28 giorni partendo dall'inizio ciclo (o 14 prima di oggi se siamo molto avanti)
  cal.innerHTML = "";
  for (let i = 0; i < 28; i++) {
    const d = new Date(lastStart); d.setDate(d.getDate() + i);
    const dayN = i + 1;
    const isToday = d.getTime() === today.getTime();
    const isFuture = d > today;

    let cls = "bg-surface-container-high text-on-surface";
    if (dayN <= 5) cls = "bg-secondary text-white font-bold";
    else if (dayN >= 12 && dayN <= 16) cls = "bg-tertiary/30 text-tertiary";
    if (dayN === 14) cls = "bg-tertiary text-white font-bold";
    if (isFuture) cls += " opacity-40";
    const ring = isToday ? " ring-2 ring-primary" : "";
    cal.innerHTML += `<div class="aspect-square flex items-center justify-center rounded-lg text-xs ${cls}${ring}">${dayN}</div>`;
  }
}

function renderSymptomChips() {
  const el = document.getElementById("symptomChips");
  el.innerHTML = SYMPTOMS.map((s) => `
    <button class="symptomChip px-3 py-2 rounded-full bg-surface-container-low text-on-surface text-sm font-semibold active:scale-95" data-sym="${s.id}">
      ${s.label}
    </button>`).join("");
  el.querySelectorAll(".symptomChip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await put(STORES.symptom, { ts: Date.now(), tag: btn.dataset.sym, intensity: 1 });
      btn.classList.add("bg-primary-fixed", "text-on-primary-fixed");
      await renderSymptomLog();
      await renderReminders();
      await renderInsight();
    });
  });
}

async function renderSymptomLog() {
  const el = document.getElementById("symptomLog");
  if (!el) return;
  const all = await getAll(STORES.symptom);
  const today = dateKey(new Date());
  const todays = all.filter((s) => tsDateKey(s.ts) === today);
  if (!todays.length) { el.textContent = ""; return; }
  const labels = todays.map((s) => {
    const def = SYMPTOMS.find((x) => x.id === s.tag);
    return def ? def.label : s.tag;
  });
  el.textContent = `Oggi: ${[...new Set(labels)].join(", ")}`;
}

async function saveLab() {
  const marker = document.getElementById("labMarker").value.trim();
  const value = parseFloat(document.getElementById("labValue").value);
  const unit = document.getElementById("labUnit").value.trim();
  const dateStr = document.getElementById("labDate").value || dateKey(new Date());
  if (!marker || !value) return;
  const ts = new Date(dateStr).getTime();
  await put(STORES.labs, { ts, marker, value, unit });
  document.getElementById("labMarker").value = "";
  document.getElementById("labValue").value = "";
  document.getElementById("labUnit").value = "";
  renderLabs();
}

async function renderLabs() {
  const labs = (await getAll(STORES.labs)).sort((a, b) => b.ts - a.ts);
  const el = document.getElementById("labList");
  if (!labs.length) { el.innerHTML = `<p class="text-sm italic text-on-surface-variant">Nessun valore registrato.</p>`; return; }

  // Raggruppa per marker
  const byMarker = {};
  for (const l of labs) {
    if (!byMarker[l.marker]) byMarker[l.marker] = [];
    byMarker[l.marker].push(l);
  }

  el.innerHTML = Object.entries(byMarker).map(([marker, vals]) => {
    vals.sort((a, b) => a.ts - b.ts);
    const last = vals[vals.length - 1];
    let trend = "";
    if (vals.length >= 2) {
      const prev = vals[vals.length - 2];
      const diff = last.value - prev.value;
      trend = diff > 0 ? `<span class="text-secondary">↑ ${(+diff.toFixed(2))}</span>`
            : diff < 0 ? `<span class="text-tertiary">↓ ${Math.abs(+diff.toFixed(2))}</span>`
            : `<span class="text-on-surface-variant">→</span>`;
    }
    const history = vals.map((v) => `${new Date(v.ts).toLocaleDateString("it-IT")}: ${v.value}${v.unit ? " " + v.unit : ""}`).join(" • ");
    return `<div class="border border-outline-variant/30 rounded-lg p-3">
      <div class="flex justify-between items-baseline">
        <span class="font-semibold text-on-surface">${marker}</span>
        <span class="text-sm">${last.value}${last.unit ? " " + last.unit : ""} ${trend}</span>
      </div>
      <p class="text-xs text-on-surface-variant mt-1">${history}</p>
    </div>`;
  }).join("");
}

function renderHealth() {
  renderWeight();
  renderCycle();
  renderSymptomHistory();
  renderLabs();
}

async function renderSymptomHistory() {
  const el = document.getElementById("symptomHistory");
  if (!el) return;
  const all = await getAll(STORES.symptom);
  const cutoff = Date.now() - 7 * 86400000;
  const recent = all.filter((s) => s.ts >= cutoff);
  if (!recent.length) {
    el.innerHTML = `<p class="text-sm italic text-on-surface-variant">Nessun sintomo registrato negli ultimi 7 giorni.</p>`;
    return;
  }
  // Frequenza per tag
  const freq = {};
  for (const s of recent) freq[s.tag] = (freq[s.tag] || 0) + 1;
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  el.innerHTML = sorted.map(([tag, count]) => {
    const def = SYMPTOMS.find((x) => x.id === tag);
    const label = def ? def.label : tag;
    const positive = ["energy", "happy"].includes(tag);
    const color = positive ? "text-tertiary" : "text-secondary";
    const bg = positive ? "bg-tertiary/15" : "bg-secondary-fixed";
    return `<div class="flex items-center justify-between p-3 rounded-lg ${bg}">
      <span class="font-semibold text-on-surface text-sm">${label}</span>
      <div class="flex items-center gap-2">
        <div class="flex gap-0.5">
          ${Array.from({ length: Math.min(7, count) }, () => `<div class="w-1.5 h-4 rounded-full ${positive ? 'bg-tertiary' : 'bg-secondary'}"></div>`).join("")}
        </div>
        <span class="font-bold ${color} text-sm">${count}×</span>
      </div>
    </div>`;
  }).join("");
}

function bindHealthEvents() {
  // Bottoni peso/ciclo presenti sia in Home (input) sia in Health (analitica)
  const wsh = document.getElementById("weightSaveHome");
  if (wsh) wsh.addEventListener("click", () => saveWeight("weightInputHome"));
  const lph = document.getElementById("logPeriodBtnHome");
  if (lph) lph.addEventListener("click", logPeriodStart);
  const lpb = document.getElementById("logPeriodBtn");
  if (lpb) lpb.addEventListener("click", logPeriodStart);
  document.getElementById("labSave").addEventListener("click", saveLab);
  document.getElementById("labDate").value = dateKey(new Date());
}

// ---------------- Insight engine (tono morbido) ----------------

// Regole locali, ordinate per priorita. La prima che matcha viene mostrata.
async function computeInsight() {
  const ideal = await getConfig("idealWeekly", IDEAL_DEFAULT);
  const foods = await getAll(STORES.food);
  const waters = await getAll(STORES.water);
  const weights = (await getAll(STORES.weight)).sort((a, b) => a.ts - b.ts);
  const cycles = (await getAll(STORES.cycle)).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const labs = await getAll(STORES.labs);

  const { start, end } = rangeDays(7);
  const week = foods.filter((f) => f.ts >= start && f.ts < end);
  const counts = {};
  for (const f of week) counts[f.category] = (counts[f.category] || 0) + (PORTION_FACTOR[f.portion] || 1);

  // Fase ciclo se nota
  let day = null, avgLen = 28, phase = null;
  if (cycles.length) {
    const last = cycles[cycles.length - 1];
    const lastStart = new Date(last.startDate); lastStart.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    day = Math.floor((today - lastStart) / 86400000) + 1;
    if (cycles.length >= 2) {
      const diffs = [];
      for (let i = 1; i < cycles.length; i++) {
        const d = (new Date(cycles[i].startDate) - new Date(cycles[i - 1].startDate)) / 86400000;
        if (d > 15 && d < 60) diffs.push(d);
      }
      if (diffs.length) avgLen = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    }
    phase = day <= 5 ? "mestruale" : day <= 13 ? "follicolare" : day === 14 ? "ovulazione" : day <= avgLen ? "luteale" : "ritardo";
  }

  // Regola 1 — Pre-mestruo: ferritina/ferro suggerito
  if (phase === "luteale" && day && (avgLen - day) <= 5) {
    return "Sei a pochi giorni dal ciclo. È un buon momento per un po' più di legumi o pesce — il ferro aiuta.";
  }

  // Regola 2 — Mestruale e poco ferro nella settimana
  if (phase === "mestruale" && (counts.legumi || 0) < 1 && (counts.pesce || 0) < 1 && (counts.carne_rossa || 0) < 1) {
    return "Sei in fase mestruale e questa settimana hai mangiato pochi cibi ricchi di ferro. Pensa a una zuppa di lenticchie o un'insalata di ceci.";
  }

  // Regola 3 — Verdura sotto target del 50%
  if (ideal.verdura > 0 && (counts.verdura || 0) < ideal.verdura * 0.5) {
    return "Notato meno verdura del solito questa settimana — domani magari una bella insalata o una zuppa?";
  }

  // Regola 4 — Acqua bassa oggi (3 giorni di seguito sotto goal)
  const goal = await getConfig("waterGoal", 8);
  const last3Days = [0, 1, 2].map((offset) => {
    const d = new Date(); d.setDate(d.getDate() - offset);
    const key = dateKey(d);
    return waters.filter((w) => tsDateKey(w.ts) === key)
      .reduce((s, w) => s + (w.glasses || 1), 0);
  });
  if (last3Days.every((g) => g < goal * 0.6)) {
    return "Negli ultimi giorni hai bevuto un po' poco. Un bicchiere d'acqua adesso fa già la differenza.";
  }

  // Regola 5 — Dolci/alcol sopra target
  if (ideal.dolci > 0 && (counts.dolci || 0) > ideal.dolci * 1.5) {
    return "Settimana un po' più dolce del solito — non è un problema, ma magari domani ascolta cosa ti chiede davvero il corpo.";
  }

  // Regola 6 — Peso registrato meno di 1 volta a settimana
  if (weights.length >= 1) {
    const last = weights[weights.length - 1];
    const daysAgo = Math.floor((Date.now() - last.ts) / 86400000);
    if (daysAgo >= 7) {
      return `Sono ${daysAgo} giorni dall'ultima pesata. Quando hai un momento, segna il peso — aiuta a vedere il quadro nel tempo.`;
    }
  } else if (foods.length > 5) {
    return "Quando vuoi, registra il peso nella sezione Salute: aiuta a costruire un quadro più completo.";
  }

  // Regola 7 — Fase follicolare e proteine basse
  if (phase === "follicolare" && (counts.pesce || 0) + (counts.uova || 0) + (counts.legumi || 0) < 3) {
    return "In fase follicolare il corpo risponde bene a proteine pulite — pesce, uova, legumi sono ottime scelte.";
  }

  // Regola 8 — Vitamina D bassa (no sole: integrazione/dieta)
  const vitD = labs.filter((l) => /vit.*d/i.test(l.marker)).sort((a, b) => b.ts - a.ts)[0];
  if (vitD && vitD.value < 30) {
    return "Il tuo ultimo valore di vitamina D è sotto i 30. Parlane col medico per l'integrazione e includi più salmone, sardine, tuorlo e funghi.";
  }

  // Regola 9 — Antinfiammatoria: troppa carne rossa
  if ((counts.carne_rossa || 0) > 2) {
    return "Questa settimana hai mangiato carne rossa più del solito. Per ridurre l'infiammazione prova a sostituirla con pesce azzurro o legumi.";
  }

  // Regola 10 — Antinfiammatoria: pesce sotto target (omega-3)
  if (ideal.pesce > 0 && (counts.pesce || 0) < 1) {
    return "Questa settimana zero pesce. Salmone, sardine, sgombro sono i tuoi alleati antinfiammatori — basta una porzione.";
  }

  // Regola 11 — Caviglie gonfie negli ultimi 3 giorni: idratazione + sale
  const symptoms = await getAll(STORES.symptom);
  const last3 = Date.now() - 3 * 86400000;
  const recentSymp = symptoms.filter((s) => s.ts >= last3);
  if (recentSymp.some((s) => s.tag === "swollen_ankles")) {
    if ((counts.snack_salati || 0) > 0 || last3Days.some((g) => g < goal * 0.7)) {
      return "Caviglie gonfie ultimamente: controlla l'idratazione (più acqua, meno sale e snack salati) e prova a tenere le gambe sollevate la sera.";
    }
    return "Caviglie gonfie: tisana di gambo d'ananas o tarassaco, gambe sollevate la sera, movimento leggero. Se persiste parlane col medico.";
  }

  // Regola 12 — Peso al petto negli ultimi giorni: serio, suggerisci medico
  if (recentSymp.some((s) => s.tag === "chest_heavy")) {
    return "Hai segnalato peso al petto. Se è persistente o intenso, parlane col medico — meglio escludere subito.";
  }

  // Regola — Sideral: ultimi 7 giorni
  const supps = await getAll(STORES.supplements);
  const sevenAgo = Date.now() - 7 * 86400000;
  const sideralWeek = supps.filter((s) => s.name === "sideral" && s.ts >= sevenAgo);
  if (sideralWeek.length <= 3) {
    return "Il Sideral è andato un po' a singhiozzo questa settimana. Provo a ricordartelo nei promemoria — la costanza fa la differenza per il ferro.";
  }

  // Regola 13 — BMI sopra range (info dati)
  if (weights.length) {
    const profile = await getProfile();
    const bmi = computeBMI(weights[weights.length - 1].kg, profile.height);
    if (bmi >= 25 && bmi < 30) {
      return "Il BMI è sopra il range sano. Niente diete drastiche: continua con il piano antinfiammatorio, riduci porzioni di cereali raffinati e dolci, aumenta verdure.";
    }
  }

  // Default positivo
  if (week.length > 0) {
    return "Stai costruendo un bel ritmo. Ogni giorno registrato è un pezzo del tuo quadro.";
  }
  return "Inizia a tracciare i pasti — bastano pochi tap e con qualche giorno emergono pattern utili.";
}

async function renderHomeQuickStats(profile) {
  // Pasti oggi
  const foods = await getAll(STORES.food);
  const today = dateKey(new Date());
  const mealsToday = foods.filter((f) => tsDateKey(f.ts) === today);
  const mealCountEl = document.getElementById("todayMealCount");
  if (mealCountEl) mealCountEl.textContent = mealsToday.length;

  // Peso ultimo + BMI
  const weights = (await getAll(STORES.weight)).sort((a, b) => b.ts - a.ts);
  if (weights.length) {
    const kg = weights[0].kg;
    const tw = document.getElementById("todayWeight");
    if (tw) tw.textContent = kg.toFixed(1);
    const bmi = computeBMI(kg, profile.height);
    const cat = bmiCategory(bmi);
    const bmiEl = document.getElementById("todayBmi");
    if (bmiEl) bmiEl.innerHTML = `BMI <strong>${bmi.toFixed(1)}</strong> <span class="${cat.color}">${cat.label}</span>`;
    const qb = document.getElementById("quickBmi");
    if (qb) qb.textContent = bmi.toFixed(1);
  }

  // Quick score 7gg (riusa logica idealSummary)
  const ideal = await getConfig("idealWeekly", IDEAL_DEFAULT);
  const { start, end } = rangeDays(7);
  const week = foods.filter((f) => f.ts >= start && f.ts < end);
  const counts = {};
  for (const f of week) counts[f.category] = (counts[f.category] || 0) + (PORTION_FACTOR[f.portion] || 1);
  const promoteIds = CATEGORY_GROUPS.promote.ids.filter((id) => (ideal[id] || 0) > 0);
  const promoteScores = promoteIds.map((id) => Math.max(0, Math.min(100, ((counts[id] || 0) / ideal[id]) * 100)));
  const limitIds = CATEGORY_GROUPS.limit.ids;
  const limitPen = limitIds.map((id) => {
    const t = ideal[id] || 0, r = counts[id] || 0;
    if (t === 0) return r === 0 ? 0 : Math.min(100, r * 25);
    return r <= t ? 0 : Math.min(100, ((r - t) / t) * 50);
  });
  const pAvg = promoteScores.length ? promoteScores.reduce((a, b) => a + b, 0) / promoteScores.length : 0;
  const lAvg = limitPen.length ? limitPen.reduce((a, b) => a + b, 0) / limitPen.length : 0;
  const score = Math.round(Math.max(0, Math.min(100, pAvg - lAvg)));
  const qs = document.getElementById("quickScore");
  if (qs) qs.textContent = week.length ? score : "—";

  // Cycle status
  const cycles = (await getAll(STORES.cycle)).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const csEl = document.getElementById("cycleStatus");
  if (csEl && cycles.length) {
    const last = cycles[cycles.length - 1];
    const lastStart = new Date(last.startDate); lastStart.setHours(0, 0, 0, 0);
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const day = Math.floor((today0 - lastStart) / 86400000) + 1;
    let avgLen = 28;
    if (cycles.length >= 2) {
      const diffs = [];
      for (let i = 1; i < cycles.length; i++) {
        const d = (new Date(cycles[i].startDate) - new Date(cycles[i - 1].startDate)) / 86400000;
        if (d > 15 && d < 60) diffs.push(d);
      }
      if (diffs.length) avgLen = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    }
    const phase = day <= 5 ? "Mestruale" : day <= 13 ? "Follicolare" : day === 14 ? "Ovulazione" : day <= avgLen ? "Luteale" : "Ritardo";
    csEl.textContent = `${phase} · giorno ${day}/${avgLen}`;
  }
}

async function renderInsight() {
  const text = await computeInsight();
  document.getElementById("insightText").textContent = text;
}

async function renderSupplements() {
  const el = document.getElementById("supplementsList");
  if (!el) return;
  const today = dateKey(new Date());
  const items = await Promise.all(SUPPLEMENTS.map(async (s) => {
    const taken = await isSupplementTaken(s.id, today);
    const streak = await supplementStreak(s.id);
    return { ...s, taken, streak };
  }));
  el.innerHTML = items.map((s) => `
    <button data-supp="${s.id}" class="supplementBtn flex items-center justify-between gap-3 p-3 rounded-lg ${s.taken ? 'bg-tertiary/15 border-2 border-tertiary' : 'bg-surface-container-low border-2 border-transparent'} active:scale-[0.98] transition-all">
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined ${s.taken ? 'text-tertiary' : 'text-on-surface-variant'}" style="font-variation-settings:'FILL' ${s.taken ? 1 : 0};">${s.taken ? 'check_circle' : 'radio_button_unchecked'}</span>
        <div class="text-left">
          <p class="font-semibold text-on-surface text-sm">${s.label}</p>
          <p class="text-xs text-on-surface-variant">${s.taken ? 'Preso oggi ✓' : 'Tocca per segnare'}</p>
        </div>
      </div>
      ${s.streak > 0 ? `<div class="text-right">
        <p class="font-serif text-lg text-tertiary leading-none">${s.streak}</p>
        <p class="text-[10px] text-on-surface-variant uppercase tracking-wider">gg di fila</p>
      </div>` : ''}
    </button>
  `).join("");
  el.querySelectorAll(".supplementBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await toggleSupplement(btn.dataset.supp, dateKey(new Date()));
      await renderSupplements();
      await renderReminders();
      await renderInsight();
    });
  });

  // Streak globale in header
  const streakEl = document.getElementById("supplementStreakLabel");
  if (streakEl) {
    const sideralStreak = items.find((i) => i.id === "sideral")?.streak || 0;
    streakEl.textContent = sideralStreak >= 3 ? `🔥 ${sideralStreak} giorni Sideral` : "";
  }
}

// ---------------- Promemoria proattivi (gentili) ----------------

async function computeReminders() {
  const out = [];
  const today = dateKey(new Date());
  const now = new Date();
  const hour = now.getHours();

  // Sideral non preso e siamo dopo le 9
  const sideralTaken = await isSupplementTaken("sideral", today);
  if (!sideralTaken && hour >= 9) {
    out.push({ icon: "medication", text: "Ricorda il Sideral di oggi — meglio a stomaco vuoto con un po' di vitamina C." });
  }

  // Acqua poca per l'orario corrente (target proporzionale)
  const goal = await getConfig("waterGoal", 8);
  const waters = await getAll(STORES.water);
  const todayGlasses = waters.filter((w) => tsDateKey(w.ts) === today)
    .reduce((s, w) => s + (w.glasses || 1), 0);
  // Aspettiamoci almeno: 2 entro le 11, 4 entro le 14, 6 entro le 18, 8 fine giornata
  const expected = hour < 11 ? 2 : hour < 14 ? 4 : hour < 18 ? 6 : 8;
  if (todayGlasses < expected - 1 && hour >= 10) {
    out.push({ icon: "water_drop", text: `Hai bevuto ${todayGlasses} bicchier${todayGlasses === 1 ? 'e' : 'i'}. Un po' d'acqua adesso fa bene.` });
  }

  // Peso non registrato da 7+ giorni
  const weights = (await getAll(STORES.weight)).sort((a, b) => b.ts - a.ts);
  if (weights.length) {
    const daysSince = Math.floor((Date.now() - weights[0].ts) / 86400000);
    if (daysSince >= 7) {
      out.push({ icon: "monitor_weight", text: `${daysSince} giorni dall'ultimo peso. Quando vuoi, una pesata serena al mattino.` });
    }
  }

  // Nessun pasto registrato e siamo dopo le 13
  const foods = await getAll(STORES.food);
  const todayFoods = foods.filter((f) => tsDateKey(f.ts) === today);
  if (todayFoods.length === 0 && hour >= 13) {
    out.push({ icon: "restaurant", text: "Non hai ancora registrato pasti oggi — basta un tap, anche velocissimo." });
  }

  // Lunedì mattina: check-in settimanale
  if (now.getDay() === 1 && hour < 12) {
    out.push({ icon: "calendar_month", text: "Inizio settimana — un buon momento per dare un'occhiata al piano e ricalibrare." });
  }

  // Venerdì sera: piano weekend
  if (now.getDay() === 5 && hour >= 17) {
    out.push({ icon: "weekend", text: "Weekend in arrivo — concediti pasti che ami, restando vicina alle tue scelte antinfiammatorie." });
  }

  // Ciclo: avviso 2 giorni prima del previsto
  const cycles = (await getAll(STORES.cycle)).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  if (cycles.length) {
    const last = cycles[cycles.length - 1];
    let avgLen = 28;
    if (cycles.length >= 2) {
      const diffs = [];
      for (let i = 1; i < cycles.length; i++) {
        const d = (new Date(cycles[i].startDate) - new Date(cycles[i - 1].startDate)) / 86400000;
        if (d > 15 && d < 60) diffs.push(d);
      }
      if (diffs.length) avgLen = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    }
    const lastStart = new Date(last.startDate); lastStart.setHours(0, 0, 0, 0);
    const nextStart = new Date(lastStart); nextStart.setDate(nextStart.getDate() + avgLen);
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const daysToNext = Math.ceil((nextStart - today0) / 86400000);
    if (daysToNext >= 0 && daysToNext <= 2) {
      out.push({ icon: "favorite", text: `Il ciclo è atteso ${daysToNext === 0 ? 'oggi' : daysToNext === 1 ? 'domani' : 'tra 2 giorni'}. Tieniti dolce — più ferro, meno caffè.` });
    }
  }

  return out;
}

async function renderReminders() {
  const reminders = await computeReminders();
  const card = document.getElementById("remindersCard");
  const list = document.getElementById("remindersList");
  if (!card || !list) return;
  if (!reminders.length) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  list.innerHTML = reminders.map((r) => `
    <li class="flex items-start gap-2">
      <span class="material-symbols-outlined text-base mt-0.5">${r.icon}</span>
      <span>${r.text}</span>
    </li>`).join("");
}

// ---------------- Export ----------------

async function buildMarkdownExport() {
  const foods = await getAll(STORES.food);
  const waters = await getAll(STORES.water);
  const weights = (await getAll(STORES.weight)).sort((a, b) => a.ts - b.ts);
  const cycles = (await getAll(STORES.cycle)).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const labs = (await getAll(STORES.labs)).sort((a, b) => a.ts - b.ts);
  const symptoms = await getAll(STORES.symptom);
  const ideal = await getConfig("idealWeekly", IDEAL_DEFAULT);

  const { start, end } = rangeDays(7);
  const weekFood = foods.filter((f) => f.ts >= start && f.ts < end);
  const weekWater = waters.filter((w) => w.ts >= start && w.ts < end);
  const weekSymp = symptoms.filter((s) => s.ts >= start && s.ts < end);

  // Aggregati per giorno
  const dayMap = {};
  for (const f of weekFood) {
    const k = tsDateKey(f.ts);
    if (!dayMap[k]) dayMap[k] = { food: [], water: 0, symptoms: [] };
    dayMap[k].food.push(`${f.category}(${f.portion})`);
  }
  for (const w of weekWater) {
    const k = tsDateKey(w.ts);
    if (!dayMap[k]) dayMap[k] = { food: [], water: 0, symptoms: [] };
    dayMap[k].water += (w.glasses || 1);
  }
  for (const s of weekSymp) {
    const k = tsDateKey(s.ts);
    if (!dayMap[k]) dayMap[k] = { food: [], water: 0, symptoms: [] };
    const def = SYMPTOMS.find((x) => x.id === s.tag);
    dayMap[k].symptoms.push(def ? def.label : s.tag);
  }

  // Ideale vs reale
  const counts = {};
  for (const f of weekFood) counts[f.category] = (counts[f.category] || 0) + (PORTION_FACTOR[f.portion] || 1);

  let md = `# Diario Irida — ultimi 7 giorni\n\nData export: ${new Date().toLocaleString("it-IT")}\n\n`;

  md += `## Diario alimentare (per giorno)\n\n`;
  Object.keys(dayMap).sort().forEach((k) => {
    const d = dayMap[k];
    md += `**${k}** — acqua: ${d.water} bicchieri\n`;
    md += `- Pasti: ${d.food.join(", ") || "—"}\n`;
    if (d.symptoms.length) md += `- Sintomi: ${[...new Set(d.symptoms)].join(", ")}\n`;
    md += `\n`;
  });

  md += `## Ideale vs Reale (porzioni in 7gg)\n\n| Categoria | Ideale | Reale | % |\n|---|---|---|---|\n`;
  for (const c of CATEGORIES) {
    const target = ideal[c.id] || 0;
    const real = +(counts[c.id] || 0).toFixed(1);
    if (target === 0 && real === 0) continue;
    const pct = target > 0 ? Math.round((real / target) * 100) + "%" : "—";
    md += `| ${c.label} | ${target} | ${real} | ${pct} |\n`;
  }
  md += `\n`;

  if (weights.length) {
    md += `## Peso (storico)\n\n`;
    weights.slice(-10).forEach((w) => {
      md += `- ${new Date(w.ts).toLocaleDateString("it-IT")}: ${w.kg} kg\n`;
    });
    md += `\n`;
  }

  if (cycles.length) {
    md += `## Ciclo mestruale\n\n`;
    cycles.slice(-6).forEach((c) => md += `- Inizio: ${c.startDate}\n`);
    md += `\n`;
  }

  // Sideral / integratori ultimi 14 giorni
  const supps = await getAll(STORES.supplements);
  const last14 = Date.now() - 14 * 86400000;
  const recentSupps = supps.filter((s) => s.ts >= last14);
  if (recentSupps.length) {
    md += `## Integratori (ultimi 14 giorni)\n\n`;
    const byName = {};
    for (const s of recentSupps) {
      if (!byName[s.name]) byName[s.name] = [];
      byName[s.name].push(s.date);
    }
    for (const [name, dates] of Object.entries(byName)) {
      md += `- **${name}**: ${dates.length}/14 giorni — ${dates.sort().join(", ")}\n`;
    }
    md += `\n`;
  }

  if (labs.length) {
    md += `## Esami del sangue\n\n`;
    const byMarker = {};
    for (const l of labs) {
      if (!byMarker[l.marker]) byMarker[l.marker] = [];
      byMarker[l.marker].push(l);
    }
    for (const [m, vals] of Object.entries(byMarker)) {
      md += `**${m}**: ${vals.map((v) => `${new Date(v.ts).toLocaleDateString("it-IT")}=${v.value}${v.unit ? v.unit : ""}`).join(", ")}\n`;
    }
    md += `\n`;
  }

  md += `## Richiesta per Claude\n\n`;
  md += `Analizza il diario di Irida sopra. Stile: empatico, non giudicante, suggerimenti pratici e concreti.\n`;
  md += `Considera la fase del ciclo se rilevante. Evidenzia pattern, correlazioni, e 2-3 azioni semplici per la prossima settimana.\n`;

  return md;
}

async function copyMarkdown() {
  const md = await buildMarkdownExport();
  try {
    await navigator.clipboard.writeText(md);
    const fb = document.getElementById("exportFeedback");
    fb.classList.remove("hidden");
    setTimeout(() => fb.classList.add("hidden"), 2500);
  } catch (e) {
    // Fallback: apri in un prompt
    prompt("Copia il testo:", md);
  }
}

async function downloadJson() {
  const data = {};
  for (const store of Object.values(STORES)) {
    data[store] = await getAll(store);
  }
  data.exportedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `irida-wellness-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function bindExportEvents() {
  document.getElementById("exportMd").addEventListener("click", copyMarkdown);
  document.getElementById("exportJson").addEventListener("click", downloadJson);
}

// ---------------- Init ----------------

openDB().then(async () => {
  await seedFirstRun();
  renderCategoryChips();
  renderSymptomChips();
  bindDiaryEvents();
  bindHealthEvents();
  bindExportEvents();
  route();
  window.addEventListener("hashchange", () => {
    if (location.hash === "#diary") renderDiary();
    if (location.hash === "#health") renderHealth();
  });
});

// Expose for quick console use during dev
window.IridaDB = { put, getAll, getConfig, setConfig, STORES };
