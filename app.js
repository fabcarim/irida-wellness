// Irida Wellness — single-user PWA
// Storage: IndexedDB (sola Irida, su questo iPhone). Export JSON per backup.

const DB_NAME = "irida-wellness";
const DB_VERSION = 4;

const STORES = {
  food:        "food",        // { id, ts, category, portion, note }
  water:       "water",       // { id, ts, glasses }
  weight:      "weight",      // { id, ts, kg }
  cycle:       "cycle",       // { id, startDate, length }
  labs:        "labs",        // { id, ts, marker, value, unit }
  symptom:     "symptom",     // { id, ts, tag, intensity }
  supplements: "supplements", // { id (date:name), date, name, taken, ts }
  exercise:    "exercise",    // { id (date:key), date, activityKey, duration, note, ts }
  drainage:    "drainage",    // { id (date:exId), date, exId, ts }
  config:      "config",      // { key, value }
};

let db;

// Default profilo: generici. I dati reali si impostano al primo avvio
// tramite il modal Setup e si salvano in IndexedDB sul dispositivo.
const PROFILE_DEFAULTS = {
  name: "",
  dob: "",
  height: 165,
  gender: "F",
  startWeight: null,
  targetWeight: 60,  // BMI 23.4 a 160cm — range sano + indicazione calo Gremese
  startDate: "",
};

// Integratori monitorati (assunti autonomamente da Irida)
const SUPPLEMENTS = [
  { id: "sideral", label: "Sideral (ferro)",           note: "dosaggio da verificare",           icon: "medication", color: "text-secondary" },
  { id: "drox",    label: "Drox Orosolubile 2000 UI",  note: "Vit D + resveratrolo",             icon: "wb_sunny",   color: "text-primary"   },
];

// Prescritti dai medici ma NON attualmente assunti (info-only, non trackati)
const PRESCRIBED_NOT_TAKEN = [
  { label: "Dibase 10.000 (Vit D)", dose: "6 gtt/die (~2000 UI)", by: "Dr.ssa Gandolfi 06/2026", status: "Sostituito con Drox" },
  { label: "Milesax",                dose: "da verificare",         by: "Dr.ssa Gremese 12/2025",   status: "Non risulta assunto" },
];

// Programma esercizio in 3 fasi (dal profilo salute Irida)
// Ogni giorno: array di attivita previste
const EXERCISE_PHASES = {
  base: {
    label: "Fase 1 — Base (abitudine)",
    weeks: "settimane 1-4",
    description: "Costruire l'abitudine, basso impatto. 4-5 sessioni/settimana.",
    schedule: [
      { day: "Lun", activities: [{ key: "walk30", label: "Camminata veloce", duration: 30, icon: "directions_walk", note: "Passo sostenuto, all'aperto (Vit D)" }] },
      { day: "Mar", activities: [{ key: "bodyweight20", label: "Corpo libero", duration: 20, icon: "fitness_center", note: "Squat, affondi, plank, ponte glutei" }] },
      { day: "Mer", activities: [{ key: "stretch15", label: "Riposo o stretching", duration: 15, icon: "self_improvement", note: "Yoga dolce o stretching" }] },
      { day: "Gio", activities: [{ key: "walk30", label: "Camminata veloce", duration: 30, icon: "directions_walk", note: "" }] },
      { day: "Ven", activities: [{ key: "bodyweight20", label: "Corpo libero", duration: 20, icon: "fitness_center", note: "" }] },
      { day: "Sab", activities: [{ key: "walk45", label: "Camminata lunga o bici", duration: 45, icon: "hiking", note: "Con famiglia" }] },
      { day: "Dom", activities: [{ key: "rest", label: "Riposo", duration: 0, icon: "bed", note: "" }] },
    ],
  },
  progression: {
    label: "Fase 2 — Progressione",
    weeks: "settimane 5-8",
    description: "Aumentare intensita e varieta. Introdurre nuoto/acquagym.",
    schedule: [
      { day: "Lun", activities: [{ key: "walkjog35", label: "Camminata + jogging leggero", duration: 35, icon: "directions_run", note: "3 min camminata + 2 min jogging" }] },
      { day: "Mar", activities: [{ key: "bodyband30", label: "Corpo libero + elastici", duration: 30, icon: "fitness_center", note: "Resistenza con elastici" }] },
      { day: "Mer", activities: [{ key: "swim30", label: "Nuoto o acquagym", duration: 30, icon: "pool", note: "Basso impatto per articolazioni" }] },
      { day: "Gio", activities: [{ key: "walk35", label: "Camminata veloce", duration: 35, icon: "directions_walk", note: "" }] },
      { day: "Ven", activities: [{ key: "bodyband30", label: "Corpo libero + elastici", duration: 30, icon: "fitness_center", note: "" }] },
      { day: "Sab", activities: [{ key: "hike60", label: "Escursione o bici", duration: 60, icon: "hiking", note: "" }] },
      { day: "Dom", activities: [{ key: "yoga20", label: "Riposo o yoga", duration: 20, icon: "self_improvement", note: "" }] },
    ],
  },
  maintenance: {
    label: "Fase 3 — Mantenimento",
    weeks: "da settimana 9 in poi",
    description: "3x cardio + 2x forza + 1x flessibilita + 1x riposo.",
    schedule: [
      { day: "Lun", activities: [{ key: "cardio40", label: "Cardio", duration: 40, icon: "directions_run", note: "Camminata veloce / jogging / bici / nuoto" }] },
      { day: "Mar", activities: [{ key: "strength30", label: "Forza", duration: 30, icon: "fitness_center", note: "Corpo libero + elastici o pesi leggeri" }] },
      { day: "Mer", activities: [{ key: "cardio40", label: "Cardio", duration: 40, icon: "directions_run", note: "" }] },
      { day: "Gio", activities: [{ key: "flex20", label: "Flessibilita", duration: 20, icon: "self_improvement", note: "Yoga o stretching" }] },
      { day: "Ven", activities: [{ key: "cardio40", label: "Cardio", duration: 40, icon: "directions_run", note: "" }] },
      { day: "Sab", activities: [{ key: "strength30", label: "Forza", duration: 30, icon: "fitness_center", note: "" }] },
      { day: "Dom", activities: [{ key: "rest", label: "Riposo", duration: 0, icon: "bed", note: "" }] },
    ],
  },
};

const EXERCISE_RULES = [
  { icon: "healing",       text: "Tallone sinistro (melanoma): se dolore, preferisci bici/nuoto alla camminata." },
  { icon: "wb_sunny",      text: "Sole: 15-20 min braccia/gambe scoperte per Vit D naturale, poi SPF50+ SEMPRE su cicatrice e nei. Evita fascia 12-15." },
  { icon: "battery_alert", text: "Ferro basso: non forzare. Con l'affaticamento migliora nel tempo, riduci intensita nei giorni no." },
  { icon: "water_drop",    text: "Idratazione: bevi PRIMA, DURANTE e DOPO — non solo per la sete, i calcoli renali ringraziano." },
  { icon: "psychology",    text: "Autoimmunita (ANA+): con artralgie i giorni no sono normali. Meglio poco che niente." },
];

// ---------------- Drenaggio linfatico 28 giorni ----------------

// Avvertenze critiche specifiche per Irida (mostrate sempre in cima)
const DRAINAGE_WARNINGS = [
  { icon: "block",       text: "NON massaggiare/premere sul tallone sinistro (cicatrice melanoma). Piede sinistro: solo dorso." },
  { icon: "warning",     text: "NON premere forte nella zona inguinale (follow-up linfonodi). Auto-massaggio gambe fermarsi a meta coscia." },
  { icon: "touch_app",   text: "Pressione LEGGERA sempre — come accarezzare un gatto. Il sistema linfatico risponde alla delicatezza." },
  { icon: "emergency",   text: "Se noti linfonodi inguinali gonfi o gonfiore che AUMENTA, ferma tutto e senti il dermatologo." },
];

// Routine base (5 esercizi, ogni giorno, 15 min)
const DRAINAGE_BASE = [
  { id: "R1", label: "Respirazione diaframmatica",  duration: 3, icon: "air",             note: "Sdraiata, mano su pancia. Inspira 4s, tieni 2s, espira 6s. x8-10. Il diaframma e la pompa linfatica principale." },
  { id: "R2", label: "Attivazione collo/clavicola", duration: 2, icon: "self_improvement",note: "Rotazioni testa lente x5, spalle su/giu x10, cerchi leggeri nella fossetta sopra clavicola x10." },
  { id: "R3", label: "Auto-massaggio braccia",       duration: 2, icon: "back_hand",       note: "Accarezza dal polso all'ascella x10 per braccio + cerchi nell'incavo ascella x10." },
  { id: "R4", label: "Auto-massaggio gambe",         duration: 3, icon: "airline_seat_legroom_normal", note: "Caviglia → ginocchio x10, cerchi dietro ginocchio x10, ginocchio → meta coscia x10. STOP prima dell'inguine. Piede sx: solo dorso." },
  { id: "R5", label: "Gambe al muro",                duration: 5, icon: "vertical_align_top", note: "Sedere al muro, gambe in alto. Dopo 2 min flex caviglie x20, dopo 4 min forbici x10." },
];

// 4 settimane: esercizi extra che si aggiungono alla base
const DRAINAGE_WEEKS = [
  {
    n: 1, label: "Settimana 1 — Fondamenta", totalMin: 25,
    extras: [
      { id: "W1A", label: "Marcia sul posto",          duration: 3, icon: "directions_walk", note: "Ginocchia alte alternate, lento e ritmico. Braccia oscillano." },
      { id: "W1B", label: "Cerchi con le caviglie",    duration: 2, icon: "sync",            note: "Seduta, ruota il piede 10 orari + 10 antiorari. Sx: fermati se il tallone tira." },
      { id: "W1C", label: "Torsione spinale sdraiata", duration: 3, icon: "swap_horiz",      note: "Sdraiata, braccia a croce. Ginocchia insieme cadono a dx 30s, a sx 30s. x3 per lato." },
      { id: "W1D", label: "Dry brushing",              duration: 2, icon: "cleaning_services",note: "Spazzola setole naturali su pelle ASCIUTTA, sempre verso il cuore. Piede sx: solo dorso. Pancia in senso orario." },
    ],
  },
  {
    n: 2, label: "Settimana 2 — Intensificazione", totalMin: 30,
    extras: [
      { id: "W2E", label: "Ponte glutei con respiro", duration: 3, icon: "flip_camera_android", note: "Sdraiata, ginocchia piegate. Inspira sollevando bacino (tieni 3s), espira scendendo vertebra per vertebra. x12." },
      { id: "W2F", label: "Farfalla",                 duration: 2, icon: "flutter_dash",        note: "Seduta, piante piedi unite. Ginocchia su/giu x30, poi busto avanti dolcemente 30s. Apre l'inguine." },
      { id: "W2G", label: "Cat-Cow",                  duration: 2, icon: "pets",                note: "Quattro zampe. Inspira inarcando (mucca), espira arrotondando (gatto). Lento, x10." },
    ],
  },
  {
    n: 3, label: "Settimana 3 — Consolidamento", totalMin: 35,
    extras: [
      { id: "W3H", label: "Squat leggero con respiro", duration: 3, icon: "airline_seat_recline_normal", note: "Piedi larghezza spalle. Inspira scendendo, espira risalendo. x12 x2 serie. Sx dolorante: talloni su asciugamano." },
      { id: "W3I", label: "Massaggio addominale",      duration: 3, icon: "bubble_chart",       note: "Sdraiata, mani sovrapposte. Cerchi ORARI x20 grandi + x20 piccoli. Poi 3 dita sotto costole dx (fegato) x5, sx (milza) x5." },
      { id: "W3J", label: "Bicicletta da sdraiata",    duration: 2, icon: "pedal_bike",         note: "Sdraiata, mani dietro nuca. Pedala lento 20 avanti + 20 indietro. No impatto sul tallone." },
    ],
  },
  {
    n: 4, label: "Settimana 4 — Routine completa", totalMin: 30,
    extras: [], // consolidamento: si fa tutto A-J insieme (extras 1-3 combinati)
  },
];

// Consigli complementari
const DRAINAGE_TIPS = {
  food: [
    "Acqua tiepida + limone: prima di ogni sessione e al mattino",
    "Alimenti drenanti: cetrioli, finocchio, sedano, ananas, zenzero, prezzemolo",
    "Tisane: tarassaco, betulla, ortica — 1-2 tazze/die (LONTANO dai pasti per non bloccare il ferro)",
    "Riduci sale (sodio → ritenzione) e zuccheri raffinati (infiammazione → blocco linfatico)",
  ],
  habits: [
    "Doccia finale: getto freddo su gambe 30s (tonifica linfa)",
    "Non stare seduta > 1h: alzati e cammina 2 min",
    "Dormi con cuscino sotto le caviglie",
    "Vestiti comodi, non stretti in vita/inguine",
  ],
  expect: [
    { days: "1-5", text: "Possibile aumento diuresi (normale, sta drenando)" },
    { days: "5-10", text: "Gambe meno pesanti, meno gonfiore caviglie" },
    { days: "10-20", text: "Pancia meno gonfia, piu energia" },
    { days: "20-28", text: "Abitudine consolidata, differenza visibile" },
  ],
};

// Esami da fare (mancanti al quadro clinico)
const EXAMS_TODO = [
  { label: "Ferritina",                          why: "MAI dosata in 8 anni. Necessaria per sapere le riserve reali di ferro." },
  { label: "Transferrina + saturazione",         why: "Completa il quadro ferro e distingue tipi di anemia." },
  { label: "Vitamina B12",                       why: "Mai dosata. Essenziale per anemia e sistema nervoso." },
  { label: "Folati",                             why: "Mai dosati. Coinvolti in anemia macrocitica." },
  { label: "Peso aggiornato",                    why: "Ultimo dato registrato: 2024. Serve per calibrare BMI e target." },
];

// Profilo clinico di Irida (basato su documentazione 06/2026)
// Ogni condizione: cosa cambia in dieta + priorita.
const CLINICAL_PROFILE = [
  {
    id: "sideropenia",
    label: "Sideropenia (ferro basso)",
    severity: "high",
    icon: "bloodtype",
    dietImpact: "Aumenta legumi, pesce, uova, foglie verdi cotte. Abbina sempre vitamina C (limone, agrumi, peperoni, kiwi) per assorbire il ferro non-eme. Evita te/caffe entro 1h dal pasto ricco di ferro.",
  },
  {
    id: "vitd_low",
    label: "Vitamina D carente (cronica)",
    severity: "high",
    icon: "wb_sunny",
    dietImpact: "Pesce grasso 3-5/sett (salmone, sardine, sgombro, aringhe), tuorlo d'uovo, funghi esposti UV. Integrazione D3 su parere medico. NON dal sole (storia melanoma).",
  },
  {
    id: "dislipidemia",
    label: "Colesterolo LDL alto (8 anni)",
    severity: "high",
    icon: "favorite",
    dietImpact: "Riduci grassi saturi (carne rossa, burro, formaggi grassi). Aumenta fibre solubili (avena, legumi, mele), omega-3 (pesce, noci, semi di lino), fitosteroli (frutta secca, EVO). Yogurt magro al posto del formaggio stagionato.",
  },
  {
    id: "overweight",
    label: "Lieve sovrappeso (BMI 26)",
    severity: "med",
    icon: "monitor_weight",
    dietImpact: "Target ~60 kg (BMI 23). Riduci porzioni di cereali raffinati e dolci, aumenta verdura a foglia, controlla porzioni dei grassi (anche buoni). Calo lento: 0.5 kg/settimana.",
  },
  {
    id: "ana_positive",
    label: "ANA positivo (infiammazione subclinica)",
    severity: "med",
    icon: "shield",
    dietImpact: "Dieta antinfiammatoria stretta: omega-3, curcuma+pepe nero, zenzero, verdure colorate, frutti rossi. Riduci zuccheri raffinati e ultraprocessati.",
  },
  {
    id: "kidney_stones",
    label: "Calcoli renali millimetrici",
    severity: "med",
    icon: "water_drop",
    dietImpact: "Idratazione abbondante (>2L/die). LIMITA ossalati: spinaci crudi, rabarbaro, cioccolato, te nero, frutta secca in eccesso. No eccesso proteine animali. Sale moderato.",
  },
  {
    id: "premenopause",
    label: "Pre-menopausa, cicli abbondanti",
    severity: "med",
    icon: "female",
    dietImpact: "Perdita di ferro mensile elevata: nei giorni 1-5 carica ferro+vit C. Magnesio in fase luteale (mandorle, semi di zucca, cacao).",
  },
  {
    id: "uric_acid",
    label: "Acido urico (era alto, ora normale)",
    severity: "low",
    icon: "science",
    dietImpact: "Mantieni basso: limita frattaglie, acciughe, crostacei in eccesso, birra. Acqua abbondante.",
  },
  {
    id: "melanoma",
    label: "Melanoma asportato 2025",
    severity: "info",
    icon: "healing",
    dietImpact: "Nessun vincolo alimentare diretto, ma stato infiammatorio basso aiuta. MAI esposizione solare. Vit D solo da dieta/integratore.",
  },
];

// Esami: range di riferimento per stato colore
const LAB_RANGES = {
  "Ferro":          { min: 50,  max: 170, unit: "μg/dL",   higherIsBetter: false },
  "Ferritina":      { min: 30,  max: 200, unit: "ng/mL",   higherIsBetter: false },
  "Emoglobina":     { min: 12,  max: 16,  unit: "g/dL",    higherIsBetter: false },
  "Vitamina D":     { min: 30,  max: 100, unit: "ng/mL",   higherIsBetter: true  },
  "Vitamina B12":   { min: 200, max: 900, unit: "pg/mL",   higherIsBetter: false },
  "Colesterolo Tot":{ min: 0,   max: 190, unit: "mg/dL",   higherIsBetter: false, onlyMax: true },
  "LDL":            { min: 0,   max: 115, unit: "mg/dL",   higherIsBetter: false, onlyMax: true },
  "HDL":            { min: 45,  max: 100, unit: "mg/dL",   higherIsBetter: true  },
  "Trigliceridi":   { min: 0,   max: 150, unit: "mg/dL",   higherIsBetter: false, onlyMax: true },
  "HbA1c":          { min: 0,   max: 38,  unit: "mmol/mol",higherIsBetter: false, onlyMax: true },
  "Acido urico":    { min: 2.0, max: 5.7, unit: "mg/dL",   higherIsBetter: false },
  "Creatinina":     { min: 0.51,max: 0.95,unit: "mg/dL",   higherIsBetter: false },
  "eGFR":           { min: 60,  max: 200, unit: "mL/min",  higherIsBetter: true  },
  "TSH":            { min: 0.4, max: 4.0, unit: "μUI/mL",  higherIsBetter: false },
  "RDW":            { min: 11.5,max: 14.5,unit: "%",       higherIsBetter: false, onlyMax: true },
};

function labStatus(marker, value) {
  const r = LAB_RANGES[marker];
  if (!r) return null;
  const inRange = r.onlyMax ? value <= r.max : value >= r.min && value <= r.max;
  if (inRange) return { ok: true, text: "in range", color: "text-tertiary", bg: "bg-tertiary/15", icon: "✓" };
  const tooLow = !r.onlyMax && value < r.min;
  return tooLow
    ? { ok: false, text: "basso", color: "text-error", bg: "bg-error-container", icon: "↓" }
    : { ok: false, text: "alto",  color: "text-error", bg: "bg-error-container", icon: "↑" };
}

// Lab pre-popolati (esami 13/06/2026 da documenti clinici)
const SEED_LABS = [
  { date: "2025-06-13", marker: "Vitamina D",      value: 28.5,unit: "ng/mL" },  // storico → trend peggiorativo
  { date: "2026-06-13", marker: "Ferro",           value: 31,  unit: "μg/dL" },
  { date: "2026-06-13", marker: "Emoglobina",      value: 12.7,unit: "g/dL" },
  { date: "2026-06-13", marker: "RDW",             value: 14.8,unit: "%" },
  { date: "2026-06-13", marker: "Vitamina D",      value: 24,  unit: "ng/mL" },
  { date: "2026-06-13", marker: "Colesterolo Tot", value: 223, unit: "mg/dL" },
  { date: "2026-06-13", marker: "LDL",             value: 158, unit: "mg/dL" },
  { date: "2026-06-13", marker: "HDL",             value: 46,  unit: "mg/dL" },
  { date: "2026-06-13", marker: "Trigliceridi",    value: 97,  unit: "mg/dL" },
  { date: "2026-06-13", marker: "HbA1c",           value: 34,  unit: "mmol/mol" },
  { date: "2026-06-13", marker: "Acido urico",     value: 4.0, unit: "mg/dL" },
  { date: "2026-06-13", marker: "Creatinina",      value: 0.87,unit: "mg/dL" },
  { date: "2026-06-13", marker: "eGFR",            value: 80,  unit: "mL/min" },
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
          if (name === "exercise") { keyPath = "id"; autoIncrement = false; } // id = "date:activityKey"
          if (name === "drainage") { keyPath = "id"; autoIncrement = false; } // id = "date:exId"
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

const views = ["home", "diary", "plan", "health", "exercise"];

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
  if (target === "exercise") { renderExercise(); }
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
  { id: "ossalati",      label: "Ossalati alti",  icon: "report",        color: "bg-error-container text-on-error-container" },
];

// Cibi ossalato-alti (da limitare per calcoli renali):
// spinaci crudi, bietole, rabarbaro, te nero, cioccolato fondente in eccesso,
// frutta secca in eccesso, barbabietole, prezzemolo a manciate.

// Ideale settimanale - RICALIBRATO sui dati clinici di Irida (06/2026).
// Priorita: ferro (sideropenia), vit D (carenza cronica), LDL alto, sovrappeso, calcoli renali.
// Indicazione Dr.ssa Gremese 12/2025: ridurre carne rossa, calo ponderale, vit D.
const IDEAL_DEFAULT = {
  verdura: 28,       // 4/die — almeno 1 crucifera (sulforafano) + foglia verde cotta (ferro)
  frutta: 14,        // 2/die — frutti rossi (polifenoli), agrumi/kiwi (vit C → assorbimento ferro)
  frutti_secchi: 10, // ~1/die (noci, mandorle) — ridotto leggermente per ossalati/calcoli
  cereali_int: 14,   // 2/die integrali (avena = beta-glucani, riducono LDL)
  cereali_raf: 0,    // azzerato per LDL e calo peso
  legumi: 6,         // 6/sett — ferro non-eme + fibre solubili (LDL) + proteine vegetali
  pesce: 5,          // 5/sett, di cui 3-4 pesce azzurro (omega-3 + vit D + ferro eme)
  carne_bianca: 2,
  carne_rossa: 0,    // 0 — indicazione Gremese, anche per LDL e acido urico
  uova: 5,           // 5/sett — tuorlo = vit D + ferro eme (no contro-indicazione colesterolo)
  latticini: 4,      // yogurt magro/kefir — Ca (LDL+), evita stagionati grassi
  grassi_buoni: 21,  // EVO 3/die (oleocantale antinfiammatorio) + avocado
  dolci: 0,          // 0 — calo peso + LDL + infiammazione (ANA+)
  alcol: 0,
  snack_salati: 0,   // 0 — calcoli renali (sale) + LDL
  ossalati: 2,       // max 2/sett — calcoli renali (spinaci crudi, te nero, cioccolato in eccesso)
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
    name:         await getConfig("profile.name",         PROFILE_DEFAULTS.name),
    dob:          await getConfig("profile.dob",          PROFILE_DEFAULTS.dob),
    height:       await getConfig("profile.height",       PROFILE_DEFAULTS.height),
    gender:       await getConfig("profile.gender",       PROFILE_DEFAULTS.gender),
    startWeight:  await getConfig("profile.startWeight",  PROFILE_DEFAULTS.startWeight),
    startDate:    await getConfig("profile.startDate",    PROFILE_DEFAULTS.startDate),
    targetWeight: await getConfig("profile.targetWeight", PROFILE_DEFAULTS.targetWeight),
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

// First-run: se il profilo non e' configurato, mostra il Setup.
// Quando l'utente salva il Setup, registra il peso di partenza come prima misura.
async function maybeShowSetup() {
  const profile = await getProfile();
  if (profile.name && profile.dob && profile.startWeight) return false;
  document.getElementById("setupModal").classList.remove("hidden");
  // Pre-compila la data di oggi come start
  const today = dateKey(new Date());
  const sd = document.getElementById("setupStartDate");
  if (sd && !sd.value) sd.value = today;
  return true;
}

async function saveSetup() {
  const name = document.getElementById("setupName").value.trim();
  const dob = document.getElementById("setupDob").value;
  const height = parseInt(document.getElementById("setupHeight").value) || 165;
  const startWeight = parseFloat(document.getElementById("setupStartWeight").value);
  const targetWeight = parseFloat(document.getElementById("setupTargetWeight").value) || PROFILE_DEFAULTS.targetWeight;
  const startDate = document.getElementById("setupStartDate").value || dateKey(new Date());

  if (!name || !dob || !startWeight) {
    alert("Compila almeno nome, data di nascita e peso di partenza.");
    return;
  }

  await setConfig("profile.name", name);
  await setConfig("profile.dob", dob);
  await setConfig("profile.height", height);
  await setConfig("profile.startWeight", startWeight);
  await setConfig("profile.targetWeight", targetWeight);
  await setConfig("profile.startDate", startDate);

  // Pre-carica il peso di partenza come prima misurazione
  const existing = await getAll(STORES.weight);
  if (!existing.length) {
    const ts = new Date(startDate).getTime();
    await put(STORES.weight, { ts, kg: startWeight });
  }

  // Pre-carica gli esami clinici di base se nessuno presente
  const existingLabs = await getAll(STORES.labs);
  if (!existingLabs.length) {
    for (const l of SEED_LABS) {
      await put(STORES.labs, { ts: new Date(l.date).getTime(), marker: l.marker, value: l.value, unit: l.unit });
    }
  }

  // Acqua: default 10 bicchieri/die per calcoli renali (se non gia impostato)
  const wg = await getConfig("waterGoal", null);
  if (wg == null) await setConfig("waterGoal", 10);

  document.getElementById("setupModal").classList.add("hidden");
  renderHome();
  renderHealth();
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
  const loggedCat = pickerCat;
  await put(STORES.food, { ts: Date.now(), category: loggedCat, portion });
  closePortionPicker();

  // Tip ossalati: avviso immediato → ricorda idratazione
  if (loggedCat === "ossalati") {
    showToast("Ossalati registrati: bevi un grande bicchiere d'acqua adesso e nelle prossime ore (calcoli renali).");
  }

  // Tip combo ferro+vitC + avviso te/caffe lontano dai pasti
  if (["legumi", "uova", "pesce", "carne_bianca"].includes(loggedCat)) {
    const today = dateKey(new Date());
    const foods = await getAll(STORES.food);
    const hasVitC = foods.some((f) => tsDateKey(f.ts) === today && ["frutta", "verdura"].includes(f.category));
    if (!hasVitC) {
      showToast("Ottimo per il ferro. Aggiungi vit C (limone, agrumi, kiwi, peperoni) e NIENTE te/caffe/latte per almeno 1h — bloccano l'assorbimento.");
    } else {
      showToast("Ricorda: niente te, caffe o latte entro 1h dal pasto — bloccano l'assorbimento del ferro.");
    }
  }

  // Aggiorna immediatamente conteggio pasti Home + insight + reminders
  await renderHome();
  await renderInsight();
}

function showToast(text, ms = 4500) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "fixed left-4 right-4 bottom-24 z-[70] bg-on-surface text-surface rounded-xl p-4 text-sm soft-card transition-opacity";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = "1";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.style.opacity = "0"; }, ms);
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
           ids: ["cereali_raf", "carne_rossa", "dolci", "alcol", "snack_salati", "ossalati"] },
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
      <p class="text-xs text-on-surface-variant mt-2">Altezza: ${profile.height} cm · Età: ${computeAge(profile.dob)} anni${profile.targetWeight ? ` · Target: <strong class="text-primary">${profile.targetWeight} kg</strong>` : ""}</p>
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
    const status = labStatus(marker, last.value);
    const range = LAB_RANGES[marker];
    let trend = "";
    if (vals.length >= 2) {
      const prev = vals[vals.length - 2];
      const diff = last.value - prev.value;
      // Per marker dove "più alto è meglio" (es. Vit D, HDL), una salita è positiva
      const goingUp = diff > 0;
      const positive = range ? (range.higherIsBetter ? goingUp : !goingUp) : null;
      const color = positive == null ? "text-on-surface-variant"
                  : positive ? "text-tertiary" : "text-secondary";
      trend = `<span class="${color}">${goingUp ? "↑" : diff < 0 ? "↓" : "→"} ${Math.abs(+diff.toFixed(2))}</span>`;
    }
    const history = vals.map((v) => `${new Date(v.ts).toLocaleDateString("it-IT")}: ${v.value}${v.unit ? " " + v.unit : ""}`).join(" • ");
    const rangeText = range
      ? (range.onlyMax ? `≤ ${range.max} ${range.unit}` : `${range.min}–${range.max} ${range.unit}`)
      : "";
    const statusBadge = status
      ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${status.bg} ${status.color}">${status.icon} ${status.text}</span>`
      : "";
    return `<div class="border ${status && !status.ok ? 'border-error/40' : 'border-outline-variant/30'} rounded-lg p-3">
      <div class="flex justify-between items-baseline gap-2">
        <span class="font-semibold text-on-surface">${marker}</span>
        ${statusBadge}
      </div>
      <div class="flex justify-between items-baseline mt-1">
        <span class="text-xs text-on-surface-variant">${rangeText}</span>
        <span class="text-sm font-bold">${last.value}${last.unit ? " " + last.unit : ""} ${trend}</span>
      </div>
      ${vals.length > 1 ? `<p class="text-xs text-on-surface-variant mt-2">${history}</p>` : ""}
    </div>`;
  }).join("");
}

function renderExamsTodo() {
  const el = document.getElementById("examsTodo");
  if (!el) return;
  el.innerHTML = EXAMS_TODO.map((e) => `
    <div class="flex items-start gap-3 p-3 rounded-lg bg-error-container/40 border-l-4 border-error">
      <span class="material-symbols-outlined text-error text-base mt-0.5">assignment_late</span>
      <div class="flex-1">
        <p class="font-semibold text-on-surface text-sm">${e.label}</p>
        <p class="text-xs text-on-surface-variant mt-0.5">${e.why}</p>
      </div>
    </div>`).join("");
}

function renderPrescribedNotTaken() {
  const el = document.getElementById("prescribedNotTaken");
  if (!el) return;
  el.innerHTML = PRESCRIBED_NOT_TAKEN.map((p) => `
    <div class="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low border-l-4 border-secondary">
      <span class="material-symbols-outlined text-secondary text-base mt-0.5">pill_off</span>
      <div class="flex-1">
        <p class="font-semibold text-on-surface text-sm">${p.label}</p>
        <p class="text-xs text-on-surface-variant">${p.dose} — ${p.by}</p>
        <p class="text-xs italic text-secondary mt-0.5">${p.status}</p>
      </div>
    </div>`).join("");
}

function renderClinicalProfile() {
  const el = document.getElementById("clinicalProfile");
  if (!el) return;
  const sevColor = { high: "border-error bg-error-container/30", med: "border-secondary bg-secondary-fixed/50", low: "border-tertiary bg-tertiary/10", info: "border-outline-variant bg-surface-container-low" };
  const sevLabel = { high: "PRIORITA ALTA", med: "ATTENZIONE", low: "MANTIENI", info: "INFO" };
  el.innerHTML = CLINICAL_PROFILE.map((c) => `
    <details class="border-l-4 ${sevColor[c.severity]} rounded-lg p-3">
      <summary class="flex items-center justify-between cursor-pointer">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-on-surface text-base">${c.icon}</span>
          <span class="font-semibold text-on-surface text-sm">${c.label}</span>
        </div>
        <span class="text-[10px] font-bold tracking-wider text-on-surface-variant">${sevLabel[c.severity]}</span>
      </summary>
      <p class="text-xs text-on-surface-variant mt-2 leading-relaxed">${c.dietImpact}</p>
    </details>`).join("");
}

function renderHealth() {
  renderWeight();
  renderCycle();
  renderSymptomHistory();
  renderLabs();
  renderClinicalProfile();
  renderExamsTodo();
  renderPrescribedNotTaken();
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

  // Regola PRIORITARIA — Sideropenia: settimana senza fonti di ferro
  const ironSources = (counts.legumi || 0) + (counts.pesce || 0) + (counts.uova || 0) + (counts.carne_bianca || 0);
  if (ironSources < 4) {
    return "Ferro basso da quadro clinico: questa settimana poche fonti di ferro. Pianifica zuppa di lenticchie con limone, o salmone con peperoni — la vitamina C triplica l'assorbimento.";
  }

  // Combo ferro+vitC del giorno: se hai mangiato legumi/uova/pesce ma niente frutta/verdura oggi
  const today0 = dateKey(new Date());
  const todayFood = foods.filter((f) => tsDateKey(f.ts) === today0);
  const todayIron = todayFood.some((f) => ["legumi", "uova", "pesce", "carne_bianca"].includes(f.category));
  const todayVitC = todayFood.some((f) => ["frutta", "verdura"].includes(f.category));
  if (todayIron && !todayVitC && new Date().getHours() >= 15) {
    return "Hai mangiato una fonte di ferro oggi — abbinaci agrumi, kiwi, peperoni o un'insalata con limone per moltiplicare l'assorbimento.";
  }

  // Ferro EME vs NON-EME: settimana senza ferro EME (assorbimento 15-35% vs 2-20%)
  const eme = (counts.carne_bianca || 0) + (counts.pesce || 0);
  const nonEme = (counts.legumi || 0) + (counts.uova || 0);
  if (nonEme > 0 && eme < 1) {
    return "Questa settimana solo ferro non-eme (legumi, uova). Aggiungi anche pesce, tacchino o manzo magro: il ferro eme si assorbe 3-5 volte di più.";
  }

  // Pasta a cena → digeribilita in pre-menopausa
  const nowH = new Date().getHours();
  if (nowH >= 19 && nowH <= 22 && todayFood.some((f) => f.category === "cereali_int" && new Date(f.ts).getHours() >= 18)) {
    // no return: solo tip via toast? Meglio insight solo se persistente. Skip.
  }

  // Pattern pasta serale ricorrente negli ultimi 3 giorni
  const last3 = foods.filter((f) => f.ts >= Date.now() - 3 * 86400000);
  const pastaCena3 = last3.filter((f) => f.category === "cereali_int" && new Date(f.ts).getHours() >= 19).length;
  if (pastaCena3 >= 2) {
    return "Ultimi giorni pasta/cereali la sera: per digeribilita in pre-menopausa meglio 1 fetta di pane integrale o patate al vapore, pasta a pranzo.";
  }

  // Regola PRIORITARIA — LDL alto: troppa carne rossa o cereali raffinati
  if ((counts.carne_rossa || 0) >= 1 || (counts.cereali_raf || 0) > 3) {
    return "Il tuo LDL e' alto da anni. Sostituisci carne rossa con legumi o pesce, e pane bianco con avena/farro — beta-glucani e fibre solubili lavorano sul colesterolo.";
  }

  // Regola PRIORITARIA — Ossalati: oltre soglia → reminder calcoli renali
  if ((counts.ossalati || 0) > 2) {
    return "Hai mangiato parecchi cibi ricchi di ossalati questa settimana (spinaci crudi, te nero, cioccolato, frutta secca in eccesso). Per i calcoli renali: idratati di piu e abbinali sempre a calcio (yogurt, formaggio magro) per ridurre l'assorbimento.";
  }

  // Regola PRIORITARIA — Calcoli renali: idratazione costante
  const goal0 = await getConfig("waterGoal", 10);
  const todayGlasses = waters.filter((w) => tsDateKey(w.ts) === dateKey(new Date()))
    .reduce((s, w) => s + (w.glasses || 1), 0);
  if (todayGlasses < goal0 * 0.5 && new Date().getHours() >= 14) {
    return "Per i calcoli renali l'idratazione e' la prima medicina. Oggi sei sotto meta' obiettivo — un grande bicchiere ora, poi un altro tra un'ora.";
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

  // Regola 13 — Peso target / BMI sopra range
  if (weights.length) {
    const profile = await getProfile();
    const lastKg = weights[weights.length - 1].kg;
    const bmi = computeBMI(lastKg, profile.height);
    const target = profile.targetWeight || 60;
    const toGo = +(lastKg - target).toFixed(1);
    if (toGo > 0.5 && weights.length >= 2) {
      // Calcola velocita media (kg/sett) ultimi 30 gg
      const cutoff = Date.now() - 30 * 86400000;
      const recent = weights.filter((w) => w.ts >= cutoff).sort((a, b) => a.ts - b.ts);
      if (recent.length >= 2) {
        const dKg = recent[recent.length - 1].kg - recent[0].kg;
        const dDays = Math.max(1, (recent[recent.length - 1].ts - recent[0].ts) / 86400000);
        const kgPerWeek = (dKg / dDays) * 7;
        if (kgPerWeek < -0.1) {
          const weeks = Math.ceil(toGo / Math.abs(kgPerWeek));
          return `Stai scendendo ~${Math.abs(kgPerWeek).toFixed(1)} kg/settimana. Al ritmo attuale arrivi a ${target} kg in ~${weeks} settimane. Continua cosi.`;
        }
      }
      return `Sei a ${toGo} kg dal tuo target di ${target} kg. Niente fretta: 0.5 kg/settimana e' un ritmo sostenibile e sano.`;
    }
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

  // Integratori — promemoria differenziati per timing/modalita
  // Sideral: stomaco vuoto al mattino + vitamina C (succo limone/spremuta). Mai con te/caffe/latte.
  const sideralTaken = await isSupplementTaken("sideral", today);
  if (!sideralTaken && hour >= 7 && hour < 11) {
    out.push({ icon: "medication", text: "Sideral: prendilo ora a stomaco vuoto con succo di limone o spremuta. Aspetta 30 min prima di caffe/the/latte." });
  } else if (!sideralTaken && hour >= 11 && hour < 20) {
    out.push({ icon: "medication", text: "Sideral non preso oggi. Se ancora in tempo, lontano dai pasti (almeno 1h) con vitamina C." });
  }

  // Drox (Vit D 2000 UI): liposolubile, assorbe con i grassi → con pranzo o cena
  const droxTaken = await isSupplementTaken("drox", today);
  if (!droxTaken && hour >= 12 && hour < 22) {
    const when = hour < 15 ? "a pranzo" : "a cena";
    out.push({ icon: "wb_sunny", text: `Drox ${when} — assumi con un cucchiaio di EVO o pesce/uova per assorbire meglio la Vit D.` });
  }

  // Drenaggio linfatico: reminder se giorno programma attivo e nessun esercizio fatto oggi
  const drainStart = await getConfig("drainageStartDate", null);
  if (drainStart) {
    const dayN = drainageDayNumber(drainStart);
    if (dayN <= 28) {
      const allDrain = await getAll(STORES.drainage);
      const todayDrain = allDrain.filter((d) => d.date === today);
      const isMorning = hour >= 7 && hour < 10;
      const isEvening = hour >= 20 && hour < 23;
      if (todayDrain.length === 0 && (isMorning || isEvening)) {
        const when = isMorning ? "Mattina a digiuno" : "Prima di dormire";
        out.push({ icon: "spa", text: `${when} = ottimo momento per il drenaggio (giorno ${dayN}/28). 15 min routine base + acqua tiepida con limone.` });
      }
    }
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

  const profile = await getProfile();
  let md = `# Diario Irida — ultimi 7 giorni\n\nData export: ${new Date().toLocaleString("it-IT")}\n\n`;

  // Profilo anagrafico + obiettivo
  if (profile.name || profile.dob) {
    const age = profile.dob ? computeAge(profile.dob) : "?";
    const lastW = weights.length ? weights[weights.length - 1].kg : null;
    const bmi = lastW ? computeBMI(lastW, profile.height) : null;
    md += `## Profilo\n\n`;
    md += `- ${profile.name || "—"}, ${age} anni, ${profile.height} cm\n`;
    if (lastW) md += `- Peso attuale: **${lastW} kg** (BMI ${bmi?.toFixed(1)} — ${bmiCategory(bmi).label})\n`;
    if (profile.targetWeight) md += `- Peso target: **${profile.targetWeight} kg**\n`;
    md += `\n`;
  }

  // Profilo clinico
  md += `## Profilo clinico\n\n`;
  for (const c of CLINICAL_PROFILE) {
    const tag = c.severity === "high" ? "🔴" : c.severity === "med" ? "🟠" : c.severity === "low" ? "🟢" : "ℹ️";
    md += `- ${tag} **${c.label}** — ${c.dietImpact}\n`;
  }
  md += `\n`;


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
    md += `## Esami del sangue (con stato)\n\n`;
    const byMarker = {};
    for (const l of labs) {
      if (!byMarker[l.marker]) byMarker[l.marker] = [];
      byMarker[l.marker].push(l);
    }
    md += `| Marker | Ultimo | Range | Stato | Storico |\n|---|---|---|---|---|\n`;
    for (const [m, vals] of Object.entries(byMarker)) {
      vals.sort((a, b) => a.ts - b.ts);
      const last = vals[vals.length - 1];
      const r = LAB_RANGES[m];
      const status = labStatus(m, last.value);
      const rangeText = r ? (r.onlyMax ? `≤${r.max}` : `${r.min}–${r.max}`) + ` ${r.unit}` : "—";
      const statusText = status ? (status.ok ? "✅ in range" : `🔴 ${status.text}`) : "—";
      const history = vals.map((v) => `${new Date(v.ts).toLocaleDateString("it-IT")}=${v.value}`).join(", ");
      md += `| ${m} | **${last.value}${last.unit ? " " + last.unit : ""}** | ${rangeText} | ${statusText} | ${history} |\n`;
    }
    md += `\n`;
  }

  // Drenaggio linfatico — ultimi 14 giorni
  const drainStart = await getConfig("drainageStartDate", null);
  if (drainStart) {
    const drainAll = await getAll(STORES.drainage);
    const last14d = Date.now() - 14 * 86400000;
    const recent = drainAll.filter((d) => d.ts >= last14d);
    if (recent.length) {
      const dayN = drainageDayNumber(drainStart);
      md += `## Drenaggio linfatico 28gg\n\n`;
      md += `Giorno ${dayN}/28 · settimana ${drainageWeekNumber(dayN)}\n\n`;
      const byDate = {};
      for (const d of recent) {
        if (!byDate[d.date]) byDate[d.date] = 0;
        byDate[d.date]++;
      }
      const days = Object.keys(byDate).sort();
      md += `Aderenza ultimi 14 giorni:\n`;
      for (const d of days) md += `- ${d}: ${byDate[d]} esercizi\n`;
      md += `\n`;
    }
  }

  md += `## Richiesta per Claude\n\n`;
  md += `Analizza il diario di Irida sopra alla luce del suo **profilo clinico** (sideropenia, vit D bassa, LDL alto, sovrappeso, ANA+, calcoli renali, pre-menopausa, melanoma).\n\n`;
  md += `Stile: empatico, non giudicante, concreto. Considera la fase del ciclo se rilevante.\n\n`;
  md += `Output desiderato:\n`;
  md += `1. **3 pattern principali** osservati nel diario (anche correlazioni cibo↔sintomi)\n`;
  md += `2. **Top 3 priorita** per la prossima settimana, ordinate per impatto sul quadro clinico (ferro, LDL, vit D, peso)\n`;
  md += `3. **Esempio di 2 pasti concreti** che coprono piu obiettivi contemporaneamente (es. ferro+vit C+omega-3)\n`;
  md += `4. **Segnali a cui prestare attenzione** dai sintomi registrati\n`;

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

// ---------------- Esercizio ----------------

function currentExercisePhaseKey(startDateIso) {
  if (!startDateIso) return "base";
  const start = new Date(startDateIso);
  const daysElapsed = Math.floor((Date.now() - start.getTime()) / 86400000);
  const week = Math.floor(daysElapsed / 7) + 1;
  if (week <= 4) return "base";
  if (week <= 8) return "progression";
  return "maintenance";
}

function todayItalianDayLabel(d = new Date()) {
  // 0=Dom, 1=Lun ... in JS
  return ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][d.getDay()];
}

async function isExerciseDone(dateStr, activityKey) {
  return new Promise((res) => {
    const r = tx(STORES.exercise).get(`${dateStr}:${activityKey}`);
    r.onsuccess = () => res(!!r.result);
    r.onerror = () => res(false);
  });
}

async function toggleExercise(dateStr, activityKey, meta = {}) {
  const id = `${dateStr}:${activityKey}`;
  const existing = await new Promise((res) => {
    const r = tx(STORES.exercise).get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
  if (existing) {
    await new Promise((res) => {
      const r = tx(STORES.exercise, "readwrite").delete(id);
      r.onsuccess = res;
    });
    return false;
  }
  await put(STORES.exercise, { id, date: dateStr, activityKey, ts: Date.now(), ...meta });
  return true;
}

async function exerciseStreak() {
  // Giorni consecutivi in cui almeno un'attivita non-riposo e' stata fatta
  const all = await getAll(STORES.exercise);
  const done = new Set(all.filter((e) => e.activityKey !== "rest").map((e) => e.date));
  let streak = 0;
  const today = startOfDay(new Date());
  let cursor = new Date(today);
  if (!done.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (done.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function renderExercise() {
  const startDate = await getConfig("exerciseStartDate", null);
  const phaseKey = await getConfig("exercisePhaseOverride", null) || currentExercisePhaseKey(startDate);
  const phase = EXERCISE_PHASES[phaseKey];

  // Header
  const headerEl = document.getElementById("exercisePhaseHeader");
  if (headerEl) {
    const week = startDate ? Math.floor((Date.now() - new Date(startDate).getTime()) / (7 * 86400000)) + 1 : "—";
    const streak = await exerciseStreak();
    headerEl.innerHTML = `
      <div class="flex items-end justify-between mb-2">
        <div>
          <p class="text-label-caps uppercase text-on-surface-variant">${phase.weeks} · settimana ${week}</p>
          <p class="font-serif text-title-md text-primary">${phase.label}</p>
        </div>
        ${streak > 0 ? `<div class="text-right">
          <p class="font-serif text-2xl text-tertiary leading-none">🔥 ${streak}</p>
          <p class="text-[10px] text-on-surface-variant uppercase tracking-wider">gg di fila</p>
        </div>` : ""}
      </div>
      <p class="text-sm text-on-surface-variant">${phase.description}</p>
    `;
  }

  // Attivita di OGGI
  const todayLabel = todayItalianDayLabel();
  const todayEntry = phase.schedule.find((s) => s.day === todayLabel);
  const todayEl = document.getElementById("exerciseToday");
  const today = dateKey(new Date());
  if (todayEl && todayEntry) {
    const items = await Promise.all(todayEntry.activities.map(async (a) => {
      const done = await isExerciseDone(today, a.key);
      return { ...a, done };
    }));
    todayEl.innerHTML = items.map((a) => a.key === "rest" ? `
      <div class="p-4 rounded-lg bg-surface-container-low text-center">
        <span class="material-symbols-outlined text-on-surface-variant text-3xl">${a.icon}</span>
        <p class="font-serif text-title-md text-on-surface mt-1">${a.label}</p>
        <p class="text-xs text-on-surface-variant">Recupero attivo consigliato</p>
      </div>
    ` : `
      <button data-act="${a.key}" data-dur="${a.duration}" class="exerciseTodayBtn w-full flex items-center justify-between gap-3 p-4 rounded-xl ${a.done ? 'bg-tertiary/15 border-2 border-tertiary' : 'bg-surface-container-low border-2 border-transparent'} active:scale-[0.98] transition-all">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined ${a.done ? 'text-tertiary' : 'text-primary'} text-3xl" style="font-variation-settings:'FILL' ${a.done ? 1 : 0};">${a.done ? 'check_circle' : a.icon}</span>
          <div class="text-left">
            <p class="font-semibold text-on-surface">${a.label}</p>
            <p class="text-xs text-on-surface-variant">${a.duration} min${a.note ? ' · ' + a.note : ''}</p>
          </div>
        </div>
        <span class="text-xs font-bold uppercase tracking-wider ${a.done ? 'text-tertiary' : 'text-on-surface-variant'}">${a.done ? '✓ FATTO' : 'TAP'}</span>
      </button>
    `).join("");
    todayEl.querySelectorAll(".exerciseTodayBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await toggleExercise(today, btn.dataset.act, { duration: parseInt(btn.dataset.dur) });
        renderExercise();
      });
    });
  }

  // Settimana
  const weekEl = document.getElementById("exerciseWeek");
  if (weekEl) {
    const rows = await Promise.all(phase.schedule.map(async (s) => {
      const isToday = s.day === todayLabel;
      const actList = await Promise.all(s.activities.map(async (a) => {
        const done = a.key === "rest" ? null : await isExerciseDone(today, a.key);
        return { a, done };
      }));
      return { s, isToday, actList };
    }));
    weekEl.innerHTML = rows.map(({ s, isToday, actList }) => `
      <div class="flex items-center gap-3 py-2 border-b border-outline-variant/20 last:border-0 ${isToday ? 'bg-primary-fixed/30 -mx-2 px-2 rounded-lg' : ''}">
        <span class="text-xs font-bold w-10 ${isToday ? 'text-primary' : 'text-on-surface-variant'}">${s.day}</span>
        <div class="flex-1 flex flex-col gap-1">
          ${actList.map(({ a, done }) => `
            <div class="flex items-center gap-2 text-sm">
              <span class="material-symbols-outlined text-base ${done === true ? 'text-tertiary' : done === false ? 'text-on-surface-variant' : 'text-outline'}">${done === true ? 'check_circle' : a.icon}</span>
              <span class="${done === true ? 'text-tertiary line-through' : 'text-on-surface'}">${a.label}</span>
              ${a.duration ? `<span class="text-xs text-on-surface-variant">· ${a.duration} min</span>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  // Regole per Irida
  const rulesEl = document.getElementById("exerciseRules");
  if (rulesEl) {
    rulesEl.innerHTML = EXERCISE_RULES.map((r) => `
      <div class="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low">
        <span class="material-symbols-outlined text-primary text-base mt-0.5">${r.icon}</span>
        <p class="text-sm text-on-surface flex-1">${r.text}</p>
      </div>`).join("");
  }

  // Selector fase (per override)
  const selectEl = document.getElementById("exercisePhaseSelect");
  if (selectEl) {
    selectEl.value = phaseKey;
  }
}

async function setExerciseStartDateIfEmpty() {
  const existing = await getConfig("exerciseStartDate", null);
  if (!existing) await setConfig("exerciseStartDate", dateKey(new Date()));
}

function bindExerciseEvents() {
  const sel = document.getElementById("exercisePhaseSelect");
  if (sel) {
    sel.addEventListener("change", async (e) => {
      await setConfig("exercisePhaseOverride", e.target.value);
      renderExercise();
    });
  }
  const resetBtn = document.getElementById("exerciseResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (confirm("Reset del programma esercizio? Ricomincia dalla Fase Base, oggi giorno 1.")) {
        await setConfig("exerciseStartDate", dateKey(new Date()));
        await setConfig("exercisePhaseOverride", null);
        renderExercise();
      }
    });
  }
}

// ---------------- Drenaggio linfatico — logica ----------------

function drainageDayNumber(startDateIso) {
  if (!startDateIso) return 1;
  const start = startOfDay(new Date(startDateIso));
  const today = startOfDay(new Date());
  const day = Math.floor((today - start) / 86400000) + 1;
  return Math.max(1, day);
}

function drainageWeekNumber(dayN) {
  if (dayN <= 7) return 1;
  if (dayN <= 14) return 2;
  if (dayN <= 21) return 3;
  if (dayN <= 28) return 4;
  return 4; // mantenimento oltre il 28
}

function drainageExercisesForDay(dayN) {
  // Base sempre + extras cumulativi fino alla settimana corrente
  const wk = drainageWeekNumber(dayN);
  const extras = [];
  for (let i = 0; i < wk; i++) {
    for (const ex of (DRAINAGE_WEEKS[i]?.extras || [])) extras.push(ex);
  }
  return { base: DRAINAGE_BASE, extras, week: wk };
}

async function isDrainageDone(dateStr, exId) {
  return new Promise((res) => {
    const r = tx(STORES.drainage).get(`${dateStr}:${exId}`);
    r.onsuccess = () => res(!!r.result);
    r.onerror = () => res(false);
  });
}

async function toggleDrainage(dateStr, exId) {
  const id = `${dateStr}:${exId}`;
  const existing = await new Promise((res) => {
    const r = tx(STORES.drainage).get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
  if (existing) {
    await new Promise((res) => {
      const r = tx(STORES.drainage, "readwrite").delete(id);
      r.onsuccess = res;
    });
    return false;
  }
  await put(STORES.drainage, { id, date: dateStr, exId, ts: Date.now() });
  return true;
}

async function drainageStreak() {
  // Giorni consecutivi con ALMENO 1 esercizio drenaggio registrato
  const all = await getAll(STORES.drainage);
  const done = new Set(all.map((e) => e.date));
  let streak = 0;
  const today = startOfDay(new Date());
  let cursor = new Date(today);
  if (!done.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (done.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function setDrainageStartDateIfEmpty() {
  const existing = await getConfig("drainageStartDate", null);
  if (!existing) await setConfig("drainageStartDate", dateKey(new Date()));
}

async function renderDrainage() {
  const startDate = await getConfig("drainageStartDate", null);
  const dayN = drainageDayNumber(startDate);
  const { base, extras, week } = drainageExercisesForDay(dayN);
  const today = dateKey(new Date());
  const streak = await drainageStreak();
  const all = base.concat(extras);
  const doneStates = await Promise.all(all.map((ex) => isDrainageDone(today, ex.id)));
  const doneCount = doneStates.filter(Boolean).length;
  const totalMin = all.reduce((s, e) => s + e.duration, 0);

  // Header progress
  const headerEl = document.getElementById("drainageHeader");
  if (headerEl) {
    const dayLabel = dayN > 28 ? `Mantenimento · giorno ${dayN}` : `Giorno ${dayN} di 28`;
    const weekLabel = dayN > 28 ? "Routine completa" : DRAINAGE_WEEKS[week - 1].label;
    const pct = Math.min(100, Math.round((doneCount / all.length) * 100));
    headerEl.innerHTML = `
      <div class="flex items-end justify-between mb-2">
        <div>
          <p class="text-label-caps uppercase text-on-surface-variant">${dayLabel}</p>
          <p class="font-serif text-title-md text-primary">${weekLabel}</p>
        </div>
        ${streak > 0 ? `<div class="text-right">
          <p class="font-serif text-2xl text-tertiary leading-none">🔥 ${streak}</p>
          <p class="text-[10px] text-on-surface-variant uppercase tracking-wider">gg di fila</p>
        </div>` : ""}
      </div>
      <div class="h-3 rounded-full bg-surface-container-high overflow-hidden mb-2">
        <div class="h-full transition-all ${pct === 100 ? 'bg-tertiary' : 'bg-primary'}" style="width:${pct}%"></div>
      </div>
      <p class="text-xs text-on-surface-variant">${doneCount}/${all.length} esercizi oggi · ~${totalMin} min totali</p>
    `;
  }

  // Avvertenze
  const warnEl = document.getElementById("drainageWarnings");
  if (warnEl) {
    warnEl.innerHTML = DRAINAGE_WARNINGS.map((w) => `
      <div class="flex items-start gap-2">
        <span class="material-symbols-outlined text-error text-base mt-0.5">${w.icon}</span>
        <p class="text-xs text-on-error-container flex-1">${w.text}</p>
      </div>`).join("");
  }

  // Routine base + extras (checklist)
  function renderSection(list, title, iconColor) {
    return `
      <div class="mb-4">
        <p class="text-label-caps uppercase text-on-surface-variant mb-2">${title}</p>
        <div class="flex flex-col gap-2">
          ${list.map((ex, i) => {
            const isBase = base.includes(ex);
            const idx = isBase ? base.indexOf(ex) : base.length + extras.indexOf(ex);
            const done = doneStates[idx];
            return `<button data-drainex="${ex.id}" class="drainageBtn w-full flex items-start gap-3 p-3 rounded-lg ${done ? 'bg-tertiary/15 border-2 border-tertiary' : 'bg-surface-container-low border-2 border-transparent'} active:scale-[0.98] transition-all text-left">
              <span class="material-symbols-outlined ${done ? 'text-tertiary' : iconColor} text-2xl mt-0.5" style="font-variation-settings:'FILL' ${done ? 1 : 0};">${done ? 'check_circle' : ex.icon}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="font-semibold text-on-surface text-sm ${done ? 'line-through opacity-70' : ''}">${ex.label}</p>
                  <span class="text-xs font-bold text-on-surface-variant whitespace-nowrap">${ex.duration} min</span>
                </div>
                <p class="text-xs text-on-surface-variant mt-1 leading-relaxed">${ex.note}</p>
              </div>
            </button>`;
          }).join("")}
        </div>
      </div>`;
  }

  const listEl = document.getElementById("drainageList");
  if (listEl) {
    listEl.innerHTML = renderSection(base, "Routine base · 15 min · ogni giorno", "text-primary")
      + (extras.length ? renderSection(extras, `Extra settimana ${week}`, "text-secondary") : "");
    listEl.querySelectorAll(".drainageBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await toggleDrainage(today, btn.dataset.drainex);
        renderDrainage();
        renderReminders();
      });
    });
  }

  // Consigli complementari
  const tipsEl = document.getElementById("drainageTips");
  if (tipsEl) {
    tipsEl.innerHTML = `
      <details class="rounded-lg bg-surface-container-low p-3">
        <summary class="font-semibold text-sm text-on-surface cursor-pointer flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary text-base">restaurant</span> Alimentazione pro-drenaggio
        </summary>
        <ul class="mt-2 space-y-1 text-xs text-on-surface-variant">
          ${DRAINAGE_TIPS.food.map((t) => `<li>• ${t}</li>`).join("")}
        </ul>
      </details>
      <details class="rounded-lg bg-surface-container-low p-3">
        <summary class="font-semibold text-sm text-on-surface cursor-pointer flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary text-base">bedtime</span> Abitudini quotidiane
        </summary>
        <ul class="mt-2 space-y-1 text-xs text-on-surface-variant">
          ${DRAINAGE_TIPS.habits.map((t) => `<li>• ${t}</li>`).join("")}
        </ul>
      </details>
      <details class="rounded-lg bg-surface-container-low p-3">
        <summary class="font-semibold text-sm text-on-surface cursor-pointer flex items-center gap-2">
          <span class="material-symbols-outlined text-tertiary text-base">timeline</span> Cosa aspettarti
        </summary>
        <ul class="mt-2 space-y-1.5 text-xs text-on-surface-variant">
          ${DRAINAGE_TIPS.expect.map((e) => `<li><strong class="text-primary">Giorni ${e.days}:</strong> ${e.text}</li>`).join("")}
        </ul>
      </details>
    `;
  }
}

function bindDrainageEvents() {
  const resetBtn = document.getElementById("drainageResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (confirm("Ricomincia il programma 28 giorni da oggi (giorno 1)?")) {
        await setConfig("drainageStartDate", dateKey(new Date()));
        renderDrainage();
      }
    });
  }
  // Tab switcher Fitness / Drenaggio
  document.querySelectorAll(".exerciseTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tab;
      document.querySelectorAll(".exerciseTab").forEach((b) => {
        b.classList.toggle("bg-primary", b.dataset.tab === t);
        b.classList.toggle("text-on-primary", b.dataset.tab === t);
        b.classList.toggle("text-on-surface-variant", b.dataset.tab !== t);
      });
      document.getElementById("exerciseFitnessPane").classList.toggle("hidden", t !== "fitness");
      document.getElementById("exerciseDrainagePane").classList.toggle("hidden", t !== "drainage");
      if (t === "drainage") renderDrainage();
    });
  });
}

// ---------------- Init ----------------

openDB().then(async () => {
  await maybeShowSetup();
  await setExerciseStartDateIfEmpty();
  await setDrainageStartDateIfEmpty();
  document.getElementById("setupSaveBtn")?.addEventListener("click", saveSetup);
  renderCategoryChips();
  renderSymptomChips();
  bindDiaryEvents();
  bindHealthEvents();
  bindExportEvents();
  bindExerciseEvents();
  bindDrainageEvents();
  route();
  window.addEventListener("hashchange", () => {
    if (location.hash === "#diary") renderDiary();
    if (location.hash === "#health") renderHealth();
    if (location.hash === "#exercise") renderExercise();
  });
});

// Expose for quick console use during dev
window.IridaDB = { put, getAll, getConfig, setConfig, STORES };
