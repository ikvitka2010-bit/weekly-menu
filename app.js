"use strict";

const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const DAY_FULL = ["Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота", "Неділя"];
const DAY_ACC = ["у понеділок", "у вівторок", "у середу", "у четвер", "у п'ятницю", "у суботу", "у неділю"];
const SLOTS = ["Сніданок", "Обід", "Перекус", "Вечеря"];
const TABS = { today: "Сьогодні", week: "Тиждень", prep: "Заготовки", shop: "Покупки" };
const PREP_DAYS = [0, 3];
const FROZEN = "FROZEN";
const DAY_MS = 864e5;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  json(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch (e) { return fb; } },
  put(k, v) { this.set(k, JSON.stringify(v)); },
};

let DATA = null;
let S = null;          // settings
let tab = "today";
let viewDay = null;    // day index shown on "Сьогодні"
let offsets = { week: 0, prep: 0, shop: 0 }; // week offset from the default week of each tab
let lastFocus = null;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => String(Math.round(n));
const kcalOf = (p, f, c) => p * 4 + f * 9 + c * 4;
const chevron = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const dec = (n) => String(n).replace(".", ",");

// ---------- settings ----------
function defaults() {
  return {
    shopDay: 5,
    people: DATA.people || 2,
    target: { ...DATA.target },
    scale: 1,
    shuffle: {},  // cycleId -> { from: week n, seed }
    sync: null,   // { db, code }
  };
}
function loadSettings() {
  const d = defaults();
  const s = store.json("settings", {});
  S = { ...d, ...s, target: { ...d.target, ...(s.target || {}) }, shuffle: s.shuffle || {} };
}
function saveSettings() { store.put("settings", S); }

// ---------- dates & cycles ----------
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((midnight(a) - midnight(b)) / DAY_MS);
const wd = (d) => (d.getDay() + 6) % 7;
const ddmm = (d) => String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0");
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }

let CYCLES = [];
function cycles() { return CYCLES; }
function initCycles() {
  CYCLES = [{ cycleId: DATA.cycleId, cycleStart: DATA.cycleStart, weeks: DATA.weeks, dishes: DATA.dishes }];
  if (DATA.prev) CYCLES.push({ ...DATA.prev, dishes: { ...DATA.dishes, ...DATA.prev.dishes } });
}
function cycleStart0(cyc) { return addDays(parseDate(cyc.cycleStart), S.shopDay); }

// Which cycle and week number cover a date
function resolve(date) {
  const [cur, prev] = cycles();
  const s0 = cycleStart0(cur);
  if (date >= s0) return { cyc: cur, n: Math.floor(diffDays(date, s0) / 7) };
  if (prev && date >= cycleStart0(prev)) return { cyc: prev, n: Math.floor(diffDays(date, cycleStart0(prev)) / 7) };
  return { cyc: cur, n: 0, preview: true };
}
function weekStartOf(date) { // start of the shopping week containing date
  return addDays(midnight(date), -((wd(date) - S.shopDay + 7) % 7));
}
function nextShopDate(date) { return addDays(midnight(date), (S.shopDay - wd(date) + 7) % 7); }

// ---------- arrangement & shuffle ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function prepOf(week, dishId) { return week.prep.findIndex((p) => p.dishes.includes(dishId)); }

// Is dish fine to eat on day d of this week (cooked in its prep, not past its shelf life)?
function okOnDay(cyc, week, dishId, d, morning) {
  const dish = cyc.dishes[dishId];
  if (!dish || dish.kind !== "cook") return true;
  const k = prepOf(week, dishId);
  if (k < 0) return true;
  const off = d - PREP_DAYS[k];
  return off >= (morning ? 1 : 0) && off <= (dish.shelf ?? 3);
}

function arrangeWeek(cyc, wIdx, rand) {
  const week = cyc.weeks[wIdx];
  const ident = [0, 1, 2, 3, 4, 5, 6];
  if (!rand) return { w: wIdx, days: ident, b: ident, s: ident };
  const valid = (days, b) => days.every((src, d) =>
    week.days[src].every((id, si) => si === 0 || si === 2 || id === FROZEN || okOnDay(cyc, week, id, d, false)) &&
    okOnDay(cyc, week, week.days[b[d]][0], d, true));
  for (let t = 0; t < 300; t++) {
    const a = shuffled([1, 2], rand), bb = shuffled([4, 5, 6], rand);
    const days = [0, a[0], a[1], 3, bb[0], bb[1], bb[2]];
    const b = shuffled(ident, rand);
    if (valid(days, b)) {
      const s = [0, ...shuffled([1, 2, 3, 4, 5, 6], rand)];
      return { w: wIdx, days, b, s };
    }
  }
  return { w: wIdx, days: ident, b: ident, s: ident };
}

function arrangement(cyc, n) {
  const sh = S.shuffle[cyc.cycleId];
  const L = cyc.weeks.length;
  const round = Math.floor(n / L);
  const pos = ((n % L) + L) % L;
  if (!sh || n < sh.from) return arrangeWeek(cyc, pos, null);
  const rand = rng(sh.seed + round * 7919);
  const order = shuffled([...Array(L).keys()], rand);
  const wIdx = order[pos];
  return arrangeWeek(cyc, wIdx, rng(sh.seed + round * 7919 + wIdx * 104729 + 1));
}

// ---------- resolved week ----------
const weekCache = new Map();
function buildWeek(cyc, n) {
  const key = cyc.cycleId + ":" + n + ":" + S.shopDay + ":" + JSON.stringify(S.shuffle[cyc.cycleId] || 0);
  if (weekCache.has(key)) return weekCache.get(key);
  const arr = arrangement(cyc, n);
  const week = cyc.weeks[arr.w];
  const prevArr = n > 0 ? arrangement(cyc, n - 1) : arrangement(cyc, cyc.weeks.length - 1);
  const frozenDish = cyc.weeks[prevArr.w].freeze;
  const start = addDays(cycleStart0(cyc), n * 7);
  const days = arr.days.map((src, d) => {
    const raw = week.days[src].slice();
    raw[0] = week.days[arr.b[d]][0];
    raw[2] = week.days[arr.s[d]][2];
    const date = addDays(start, d);
    return {
      d, date, wd: wd(date),
      meals: raw.map((id, si) => {
        const frozen = id === FROZEN;
        const dish = frozen ? frozenDish : id;
        return { slot: SLOTS[si], dish, frozen, src: source(cyc, week, dish, frozen, si, d) };
      }),
    };
  });
  const W = { cyc, n, arr, week, title: week.title, start, days, frozenDish, key: cyc.cycleId + "_" + n };
  W.preps = week.prep.map((p, k) => ({ ...p, k, day: days[PREP_DAYS[k]] }));
  weekCache.set(key, W);
  return W;
}

function source(cyc, week, dishId, frozen, si, d) {
  const dish = cyc.dishes[dishId];
  if (frozen) return { cls: "frozen", text: "з морозилки" };
  if (dish.kind === "morning") return { cls: "", text: "зранку · " + dish.time.replace(" зранку", "") };
  if (dish.kind === "snack") return { cls: "", text: "без готування" };
  const k = prepOf(week, dishId);
  if (si === 3 && d === PREP_DAYS[k]) return { cls: "fresh", text: "свіже" };
  return { cls: "p" + (k + 1), text: "заготовка " + (k + 1), k };
}

function resolveText(text, W) {
  return String(text).replace(/\{@([a-z_0-9]+)\}/gi, (_, id) => {
    if (!W) return "";
    const ds = W.days.filter((day) => day.meals.some((m) => m.dish === id && !m.frozen)).map((day) => DAY_SHORT[day.wd].toLowerCase());
    return ds.length ? ds.join(", ") : "";
  });
}

function dish(cyc, id) { return cyc.dishes[id]; }
function dishMacros(d) { return { p: d.p * S.scale, f: d.f * S.scale, c: d.c * S.scale, kcal: d.kcal * S.scale }; }
function dayTotals(W, day) {
  const t = { p: 0, f: 0, c: 0 };
  for (const m of day.meals) { const d = dishMacros(dish(W.cyc, m.dish)); t.p += d.p; t.f += d.f; t.c += d.c; }
  t.kcal = kcalOf(t.p, t.f, t.c);
  return t;
}

// ---------- measures ----------
function frac(q) {
  const whole = Math.floor(q);
  const rest = Math.round((q - whole) * 4);
  const sym = ["", "¼", "½", "¾"][rest] || "";
  if (rest === 4) return String(whole + 1);
  if (!whole) return sym || "0";
  return whole + sym;
}
function measure(id, grams) {
  const ing = DATA.ingredients[id];
  if (!ing || grams == null) return null;
  const units = ing.units;
  if (id === "white") {
    const n = Math.max(1, Math.round(grams / units[0][1]));
    return n + " " + units[0][0];
  }
  let [name, g] = units[units.length - 1];
  for (const u of units) { if (grams / u[1] >= 0.45) { [name, g] = u; break; } }
  const q = grams / g;
  const step = q < 2 ? 0.25 : 0.5;
  return frac(Math.max(0.25, Math.round(q / step) * step)) + " " + name;
}

// ---------- shopping list ----------
function roundUp(g) {
  const step = g < 200 ? 10 : g < 1000 ? 50 : 100;
  return Math.ceil(g / step - 1e-9) * step;
}
function qtyText(id, g, eggs) {
  const ing = DATA.ingredients[id];
  const shop = ing.shop || "g";
  if (shop === "egg") return { qty: eggs + " шт", hint: eggs >= 10 ? "≈ " + Math.ceil(eggs / 10) + " уп. по 10" : "" };
  if (shop === "pcs") return { qty: Math.ceil(g / ing.piece - 1e-9) + " " + ing.pieceName, hint: "" };
  if (shop === "can") return { qty: Math.ceil(g / ing.piece - 1e-9) + " × " + ing.pieceName, hint: "" };
  const v = roundUp(g);
  let qty;
  if (shop === "ml") qty = v >= 1000 ? dec(r1(v / 1000)) + " л" : v + " мл";
  else qty = v >= 1000 ? dec(r1(v / 1000)) + " кг" : v + " г";
  let hint = "";
  if (ing.pack) hint = "≈ " + Math.ceil(v / ing.pack) + " " + ing.packName;
  else {
    const u = ing.units.find(([n]) => n.startsWith("шт") || n === "філе");
    if (u) hint = "≈ " + Math.ceil(g / u[1] - 1e-9) + " " + u[0];
  }
  return { qty, hint };
}

function collect(W, meals) {
  const sum = {};
  for (const { dish: id, k } of meals) {
    for (const i of dish(W.cyc, id).ing) {
      if (!i.id || i.g == null) continue;
      sum[i.id] = (sum[i.id] || 0) + i.g * k * S.people * S.scale;
    }
  }
  return sum;
}

function shoppingList(W) {
  const meals = [];
  for (const day of W.days) for (const m of day.meals) if (!m.frozen) meals.push({ dish: m.dish, k: 1 });
  meals.push({ dish: W.week.freeze, k: 1 }); // portions that go to the freezer for next week
  const sum = collect(W, meals);
  const groups = groupItems(sum, "");
  groups.push({ cat: "Спеції (перевір, що є вдома)", items: DATA.spices.map((name, i) => ({ id: "sp" + i, ua: name, tr: "", qty: "", hint: "" })) });
  const fz = collect(W, [{ dish: W.frozenDish, k: 1 }]);
  const fzItems = groupItems(fz, "fz_").flatMap((g) => g.items);
  groups.push({ cat: "Якщо в морозилці немає: " + dish(W.cyc, W.frozenDish).name.split(" + ")[0].toLowerCase(), items: fzItems, optional: true });
  return groups;
}

function groupItems(sum, prefix) {
  const eggs = Math.ceil((sum.egg || 0) / 55 - 1e-9) + Math.ceil((sum.white || 0) / 33 - 1e-9);
  const byCat = {};
  for (const [id, g] of Object.entries(sum)) {
    if (id === "white") continue;
    const ing = DATA.ingredients[id];
    const { qty, hint } = qtyText(id, g, eggs);
    (byCat[ing.cat] = byCat[ing.cat] || []).push({ id: prefix + id, ua: id === "egg" ? "Яйця" : ing.name, tr: ing.tr, qty, hint });
  }
  if (sum.white && !sum.egg) {
    const ing = DATA.ingredients.egg;
    (byCat[ing.cat] = byCat[ing.cat] || []).push({ id: prefix + "egg", ua: "Яйця", tr: ing.tr, qty: eggs + " шт", hint: "" });
  }
  return DATA.cats.filter((c) => byCat[c]).map((c) => ({ cat: c, items: byCat[c] }));
}

// ---------- checks (local + shared) ----------
function shopChecks(key) { return store.json("shop:" + key, {}); }
function setShopCheck(key, id, on) {
  const all = shopChecks(key);
  if (on) all[id] = 1; else delete all[id];
  store.put("shop:" + key, all);
  Sync.write(key, id, on);
}
function prepChecks(key) { return store.json("prep:" + key, {}); }

// Firebase Realtime Database through its REST API: no SDK, works on GitHub Pages
const Sync = {
  es: null, key: null, status: "off",
  on() { return !!(S.sync && S.sync.db && S.sync.code); },
  base() { return S.sync.db.replace(/\/+$/, "") + "/lists/" + S.sync.code; },
  listen(key) {
    if (!this.on()) { this.close(); this.status = "off"; return; }
    if (this.key === key && this.es) return;
    this.close();
    this.key = key;
    this.status = "connecting";
    this.flush();
    try {
      const es = new EventSource(this.base() + "/" + key + ".json");
      const apply = (e, patch) => {
        let msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (!msg) return;
        let all = shopChecks(key);
        if (msg.path === "/") all = patch ? { ...all, ...(msg.data || {}) } : { ...(msg.data || {}) };
        else { const id = msg.path.slice(1); if (msg.data) all[id] = 1; else delete all[id]; }
        // local ticks that have not reached the server yet win over the snapshot
        for (const p of store.json("pending", [])) if (p.key === key) { if (p.on) all[p.id] = 1; else delete all[p.id]; }
        for (const k of Object.keys(all)) if (!all[k]) delete all[k];
        store.put("shop:" + key, all);
        this.status = "live";
        if (tab === "shop") refreshShopChecks();
      };
      es.addEventListener("put", (e) => apply(e, false));
      es.addEventListener("patch", (e) => apply(e, true));
      es.addEventListener("open", () => { this.status = "live"; updateSyncBadge(); });
      es.onerror = () => { this.status = navigator.onLine ? "error" : "offline"; updateSyncBadge(); };
      this.es = es;
    } catch (e) { this.status = "error"; }
  },
  close() { if (this.es) this.es.close(); this.es = null; this.key = null; },
  async write(key, id, on) {
    if (!this.on()) return;
    const pending = store.json("pending", []).filter((p) => !(p.key === key && p.id === id));
    pending.push({ key, id, on });
    store.put("pending", pending);
    this.flush();
  },
  async flush() {
    if (!this.on() || !navigator.onLine) return;
    const pending = store.json("pending", []);
    const left = [];
    for (const p of pending) {
      try {
        const url = this.base() + "/" + p.key + "/" + p.id + ".json";
        const res = await fetch(url, p.on ? { method: "PUT", body: "1" } : { method: "DELETE" });
        if (!res.ok) throw new Error(res.status);
      } catch (e) { left.push(p); }
    }
    store.put("pending", left);
  },
  async reset(key) {
    if (!this.on()) return;
    try { await fetch(this.base() + "/" + key + ".json", { method: "DELETE" }); } catch (e) { /* offline */ }
  },
};

// ---------- common view bits ----------
function weekLabel(W) {
  const L = W.cyc.weeks.length;
  return `Тиждень ${(W.n % L) + 1} з ${L} · ${esc(W.title)}`;
}
function weekDates(W) { return ddmm(W.start) + " – " + ddmm(addDays(W.start, 6)); }

function weekSwitcher(name, W) {
  return `
    <div class="wk-switch">
      <button type="button" class="icon-btn" data-wk="${name}" data-dir="-1" aria-label="Попередній тиждень"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
      <div class="wk-label"><b>${weekLabel(W)}</b><span>${weekDates(W)}${W.preview ? " · старт циклу" : ""}</span></div>
      <button type="button" class="icon-btn" data-wk="${name}" data-dir="1" aria-label="Наступний тиждень"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>`;
}

function macroLine(o) {
  return `<span class="macro-line"><span><b class="mp">Б ${fmt(o.p)}</b></span><span><b class="mf">Ж ${fmt(o.f)}</b></span><span><b class="mc">В ${fmt(o.c)}</b></span>${o.kcal != null ? `<span>${fmt(o.kcal)} ккал</span>` : ""}</span>`;
}

function currentRef() { return resolve(midnight(new Date())); }
function todayWeek() { const r = currentRef(); const W = buildWeek(r.cyc, r.n); return { W, preview: !!r.preview }; }
function weekAtOffset(base, k) {
  const date = addDays(base, 7 * k);
  const r = resolve(date);
  const W = buildWeek(r.cyc, r.n);
  return { ...W, preview: !!r.preview };
}

// ---------- views ----------
function renderToday() {
  const today = midnight(new Date());
  const { W, preview } = todayWeek();
  const todayIdx = preview ? -1 : diffDays(today, W.start);
  if (viewDay == null) viewDay = Math.max(0, todayIdx);
  const day = W.days[viewDay];
  const t = dayTotals(W, day);
  const tg = S.target;
  const bar = (k, label, val, goal, goalText) => `
    <div class="bar-row">
      <span class="lbl">${label}</span>
      <span class="bar ${k}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(val)}"><i style="width:${Math.min(100, (val / goal) * 100)}%"></i></span>
      <span class="val">${fmt(val)} <small>/ ${goalText} г</small></span>
    </div>`;
  const prep = W.preps.find((p) => PREP_DAYS[p.k] === viewDay);
  const sh = S.shuffle[W.cyc.cycleId];
  const cycleOver = W.n >= W.cyc.weeks.length && W.cyc === cycles()[0] && !(sh && sh.from <= W.n + 1);

  $("#view-today").innerHTML = `
    ${preview ? `<div class="banner"><div><b>Цикл стартує ${DAY_ACC[S.shopDay]}, ${ddmm(W.start)}</b><span>Закупка і заготовка 1. Список — у «Покупках».</span></div><button type="button" class="btn primary" data-goto="shop">Список</button></div>` : ""}
    ${cycleOver ? `<div class="banner"><div><b>Минуло 4 тижні</b><span>Нове меню ще не прийшло — перемішайте дні й тижні, щоб раціон змінився.</span></div><button type="button" class="btn primary" data-shuffle>Перемішати</button></div>` : ""}
    <div class="wk-mini"><b>${weekLabel(W)}</b><span>${weekDates(W)}</span></div>
    <div class="days" role="group" aria-label="День тижня">
      ${W.days.map((d, i) => `
        <button type="button" class="day-chip" data-day="${i}" aria-pressed="${i === viewDay}" aria-label="${DAY_FULL[d.wd]} ${ddmm(d.date)}${PREP_DAYS.includes(i) ? ", день заготовки" : ""}${i === todayIdx ? ", сьогодні" : ""}">
          ${PREP_DAYS.includes(i) ? '<span class="dot" aria-hidden="true"></span>' : ""}
          <span>${DAY_SHORT[d.wd]}</span><small>${i === todayIdx ? "сьог." : d.date.getDate()}</small>
        </button>`).join("")}
    </div>

    <div class="card macros">
      <div class="macros-head">
        <div><h3>${DAY_FULL[day.wd]} · на 1 людину</h3></div>
        <div class="kcal">${fmt(t.kcal)} <small>/ ${tg.kcal} ккал</small></div>
      </div>
      ${bar("p", "Білки", t.p, tg.p, "від " + tg.p)}
      ${bar("f", "Жири", t.f, tg.f, "≈" + tg.f)}
      ${bar("c", "Вуглеводи", t.c, tg.c, "≈" + tg.c)}
    </div>

    ${prep ? `
    <div class="banner">
      <div><b>${viewDay === 0 ? "Закупка + ввечері заготовка 1" : "Ввечері — заготовка 2"}</b><span>${prepCovers(W, prep.k)} · ${esc(prep.dur)}</span></div>
      <button type="button" class="btn primary" data-goto="prep">План</button>
    </div>` : ""}

    ${day.meals.map((m) => {
      const d = dish(W.cyc, m.dish);
      const mm = dishMacros(d);
      return `
      <button type="button" class="meal" data-dish="${m.dish}" data-w="${W.key}" data-day="${viewDay}" data-slot="${esc(m.slot)}">
        <span class="meal-top"><h3>${esc(m.slot)}</h3><span class="pill ${m.src.cls}">${esc(m.src.text)}</span></span>
        <span class="meal-name">${esc(d.name)}</span>
        <span class="meal-foot">${macroLine({ p: mm.p, f: mm.f, c: mm.c })}<span class="kc">${fmt(mm.kcal)} ккал ${chevron}</span></span>
      </button>`;
    }).join("")}
  `;
}

function prepCovers(W, k) {
  const ds = (a, b) => W.days.slice(a, b + 1).map((d) => DAY_SHORT[d.wd].toLowerCase()).join(", ");
  return k === 0
    ? `Вечеря ${DAY_SHORT[W.days[0].wd].toLowerCase()} + ${ds(1, 3)}`
    : `Вечеря ${DAY_SHORT[W.days[3].wd].toLowerCase()} + ${ds(4, 6)} + морозилка`;
}

const weeksById = new Map();
function remember(W) { weeksById.set(W.key, W); return W; }

function renderWeek() {
  const base = todayWeek().W.start;
  const W = remember(weekAtOffset(base, offsets.week));
  const today = midnight(new Date());
  $("#view-week").innerHTML = weekSwitcher("week", W) + W.days.map((d, i) => {
    const t = dayTotals(W, d);
    const isToday = diffDays(today, d.date) === 0;
    return `
    <article class="card wday${isToday ? " is-today" : ""}">
      <div class="wday-head">
        <h2>${DAY_FULL[d.wd]} <small class="date">${ddmm(d.date)}</small>${isToday ? '<span class="pill p1">сьогодні</span>' : ""}${PREP_DAYS.includes(i) ? `<span class="pill">заготовка ${PREP_DAYS.indexOf(i) + 1}</span>` : ""}</h2>
        ${offsets.week === 0 || isToday ? `<button type="button" class="link-btn" data-open-day="${i}" data-w="${W.key}">Відкрити</button>` : ""}
      </div>
      <div>
        ${d.meals.map((m) => `
          <button type="button" class="wrow" data-dish="${m.dish}" data-w="${W.key}" data-day="${i}" data-slot="${esc(m.slot)}">
            <span class="slot">${esc(m.slot)}</span>
            <span class="dish">${esc(dish(W.cyc, m.dish).name)}${m.frozen ? " <em>· з морозилки</em>" : ""}</span>
          </button>`).join("")}
      </div>
      ${macroLine(t)}
    </article>`;
  }).join("");
}

function renderPrep() {
  const base = todayWeek().W.start;
  const W = remember(weekAtOffset(base, offsets.prep));
  const checks = prepChecks(W.key);
  $("#view-prep").innerHTML = weekSwitcher("prep", W) + W.preps.map((p) => {
    const done = p.steps.filter((_, i) => checks[p.k + "-" + i]).length;
    return `
    <article class="card prep" data-prep="${p.k}" data-w="${W.key}">
      <div>
        <h2>Заготовка ${p.k + 1} — ${DAY_FULL[p.day.wd].toLowerCase()}, ${ddmm(p.day.date)}</h2>
        <div class="prep-meta" style="margin-top:8px">
          <span class="pill p1 wrap">${prepCovers(W, p.k)}</span>
          <span class="pill">${esc(p.dur)}</span>
        </div>
      </div>
      <div>
        <h3 style="margin-bottom:8px">Страви</h3>
        <div class="chips">${p.dishes.map((id) => `<button type="button" class="chip" data-dish="${id}" data-w="${W.key}">${esc(dish(W.cyc, id).name)}</button>`).join("")}</div>
      </div>
      <div class="progress">
        <b data-count>Зроблено ${done} з ${p.steps.length}</b>
        <button type="button" class="btn ghost" data-reset-prep="${p.k}" data-w="${W.key}">Скинути галочки</button>
      </div>
      <ol class="steps">
        ${p.steps.map((s, i) => `
          <li><label class="check">
            <input type="checkbox" data-step="${p.k}-${i}"${checks[p.k + "-" + i] ? " checked" : ""}>
            <span class="txt"><span class="num">${i + 1}.</span>${esc(resolveText(s, W))}</span>
          </label></li>`).join("")}
      </ol>
    </article>`;
  }).join("") + `
    <aside class="card note">
      <h3>Зберігання</h3>
      <ul>
        <li>Розкладайте все по контейнерах і підписуйте день.</li>
        <li>Готові страви — у холодильнику 3–4 дні, рибу їжте наступного дня після заготовки.</li>
        <li>Страву для морозилки — одразу в морозилку (до 2 місяців), розморожуйте з вечора напередодні.</li>
        <li>Ягоди для сирників і йогурту розморожуйте з вечора в холодильнику.</li>
        <li>Салати заправляйте перед їжею.</li>
      </ul>
    </aside>`;
}

let shopW = null;
function renderShop() {
  const base = weekStartOf(nextShopDate(new Date()));
  shopW = remember(weekAtOffset(base, offsets.shop));
  const W = shopW;
  const groups = shoppingList(W);
  const checks = shopChecks(W.key);
  const main = groups.filter((g) => !g.optional).flatMap((g) => g.items);
  const left = main.filter((it) => !checks[it.id]).length;
  Sync.listen(W.key);
  $("#view-shop").innerHTML = weekSwitcher("shop", W) + `
    <div class="card shop-actions">
      <span class="shop-count"><span id="shop-count">Залишилось ${left} з ${main.length}</span> · на ${S.people} ${S.people === 1 ? "людину" : S.people < 5 ? "людини" : "людей"} · закупка ${DAY_ACC[S.shopDay]}, ${ddmm(W.start)}</span>
      <span class="sync-badge" id="sync-badge"></span>
      <button type="button" class="btn primary" data-share-list>Поділитися</button>
      <button type="button" class="btn ghost" data-reset-shop>Скинути</button>
      <textarea class="copy-fallback" id="copy-fallback" readonly hidden aria-label="Список покупок для копіювання"></textarea>
    </div>
    ${groups.map((g) => `
    <section class="card shop-cat${g.optional ? " optional" : ""}">
      <h2>${esc(g.cat)} <small>${g.items.length}</small></h2>
      ${g.optional ? '<p class="note">Відмітьте, якщо порція з минулого тижня вже є в морозилці.</p>' : ""}
      ${g.items.map((it) => `
        <label class="check">
          <input type="checkbox" data-shop="${esc(it.id)}"${checks[it.id] ? " checked" : ""}>
          <span class="txt"><span class="item-ua">${esc(it.ua)}</span>${it.tr ? `<span class="item-tr">${esc(it.tr)}</span>` : ""}</span>
          <span class="item-qty">${esc(it.qty)}${it.hint ? `<small>${esc(it.hint)}</small>` : ""}</span>
        </label>`).join("")}
    </section>`).join("")}
  `;
  updateSyncBadge();
}

function refreshShopChecks() {
  if (!shopW) return;
  const checks = shopChecks(shopW.key);
  document.querySelectorAll("[data-shop]").forEach((el) => { el.checked = !!checks[el.dataset.shop]; });
  updateShopCount();
  updateSyncBadge();
}
function updateShopCount() {
  const el = $("#shop-count");
  if (!el || !shopW) return;
  const checks = shopChecks(shopW.key);
  const main = shoppingList(shopW).filter((g) => !g.optional).flatMap((g) => g.items);
  el.textContent = `Залишилось ${main.filter((it) => !checks[it.id]).length} з ${main.length}`;
}
function updateSyncBadge() {
  const el = $("#sync-badge");
  if (!el) return;
  const map = { off: "Тільки на цьому телефоні", connecting: "Спільний список · підключення…", live: "Спільний список · онлайн", error: "Спільний список · немає зв'язку", offline: "Спільний список · офлайн" };
  el.textContent = map[Sync.status] || "";
  el.dataset.state = Sync.status;
}

function shopText(W) {
  const checks = shopChecks(W.key);
  const out = [`Покупки · ${weekLabel(W).replace(/&#39;/g, "'")} · ${weekDates(W)}`, ""];
  for (const g of shoppingList(W)) {
    const items = g.items.filter((it) => !checks[it.id]);
    if (!items.length) continue;
    out.push(g.cat.toUpperCase());
    for (const it of items) out.push("• " + it.ua + (it.tr ? " — " + it.tr : "") + (it.qty ? " — " + it.qty : "") + (it.hint ? " (" + it.hint + ")" : ""));
    out.push("");
  }
  return out.join("\n").trim();
}

async function shareOrCopy(text, title, url) {
  if (navigator.share) {
    try { await navigator.share(url ? { title, text, url } : { title, text }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  const full = url ? text + "\n" + url : text;
  try { await navigator.clipboard.writeText(full); toast("Скопійовано"); }
  catch (e) {
    const fb = $("#copy-fallback") || $("#settings-fallback");
    if (fb) { fb.value = full; fb.hidden = false; fb.focus(); fb.select(); toast("Скопіюйте виділений текст"); }
  }
}

// ---------- recipe sheet ----------
let sheetState = null;

function openSheet(render) {
  lastFocus = document.activeElement;
  render();
  $("#sheet").hidden = false;
  document.body.classList.add("locked");
  $(".sheet-panel").scrollTop = 0;
  $(".sheet-close").focus();
}

function openRecipe(dishId, W, ctx) {
  sheetState = { type: "recipe", dishId, W, ctx, portions: Number(store.get("portions")) || 2 };
  openSheet(renderRecipe);
}

function renderRecipe() {
  const { dishId, W, ctx, portions } = sheetState;
  const d = dish(W.cyc, dishId);
  const mm = dishMacros(d);
  let src = null;
  let head = "Рецепт";
  if (ctx && ctx.day != null) {
    const day = W.days[ctx.day];
    const m = day.meals.find((x) => x.slot === ctx.slot && x.dish === dishId);
    if (m) src = m.src;
    head = esc(ctx.slot) + " · " + DAY_FULL[day.wd].toLowerCase();
  } else {
    const k = prepOf(W.week, dishId);
    src = k >= 0 ? { cls: "p" + (k + 1), text: "заготовка " + (k + 1) } : { cls: "", text: d.kind === "snack" ? "без готування" : "зранку" };
  }
  $("#sheet-body").innerHTML = `
    <div>
      <h3 style="margin-bottom:6px">${head}</h3>
      <h2 id="sheet-title">${esc(d.name)}</h2>
    </div>
    <div class="sheet-meta">
      ${src ? `<span class="pill ${src.cls}">${esc(src.text)}</span>` : ""}
      <span class="pill">${esc(d.time)}</span>
    </div>
    <div>
      <h3 style="margin-bottom:8px">На 1 порцію${S.scale !== 1 ? ` · ${Math.round(S.scale * 100)}%` : ""}</h3>
      <div class="stat-grid">
        <div class="stat p"><b>${r1(mm.p)}</b><span>білки, г</span></div>
        <div class="stat f"><b>${r1(mm.f)}</b><span>жири, г</span></div>
        <div class="stat c"><b>${r1(mm.c)}</b><span>вуглев., г</span></div>
        <div class="stat"><b>${fmt(mm.kcal)}</b><span>ккал</span></div>
      </div>
    </div>
    <div class="seg-row">
      <div class="lbl-line"><h3>Інгредієнти</h3><span class="eyebrow">порцій</span></div>
      <div class="seg" role="group" aria-label="Кількість порцій">
        ${[1, 2, 4].map((n) => `<button type="button" data-portions="${n}" aria-pressed="${n === portions}">${n}</button>`).join("")}
      </div>
      <ul class="ing">
        ${d.ing.map((i) => {
          const ing = DATA.ingredients[i.id];
          const g = i.g == null ? null : i.g * portions * S.scale;
          const m = measure(i.id, g);
          const ua = i.note || (ing ? ing.name : "");
          return `<li><span class="nm">${esc(ua)}${ing && !i.note ? `<small>${esc(ing.tr)}</small>` : ""}</span>
            <span class="ms">${m ? esc(m) : g != null ? fmt(g) + " г" : "—"}${m && g != null ? `<small>${fmt(g)} г</small>` : ""}</span></li>`;
        }).join("")}
      </ul>
    </div>
    <div>
      <h3 style="margin-bottom:10px">Приготування</h3>
      <ol class="howto">${d.steps.map((s) => `<li><span>${esc(resolveText(s, W))}</span></li>`).join("")}</ol>
    </div>
    ${d.store ? `<div><h3 style="margin-bottom:8px">Зберігання</h3><div class="store">${esc(resolveText(d.store, W))}</div></div>` : ""}
  `;
}

function closeSheet() {
  if ($("#sheet").hidden) return;
  $("#sheet").hidden = true;
  document.body.classList.remove("locked");
  sheetState = null;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

// ---------- settings sheet ----------
function openSettings() {
  sheetState = { type: "settings" };
  openSheet(renderSettings);
}

function avgKcal(W) {
  return W.days.reduce((s, d) => s + d.meals.reduce((a, m) => a + dish(W.cyc, m.dish).kcal, 0), 0) / 7;
}

function renderSettings() {
  const { W } = todayWeek();
  const cur = cycles()[0];
  const sh = S.shuffle[cur.cycleId];
  const t = S.target;
  const num = (k, label, v, unit) => `
    <label class="field"><span>${label}</span><span class="inp"><input type="number" inputmode="numeric" min="0" step="1" data-target="${k}" value="${v}"><i>${unit}</i></span></label>`;
  $("#sheet-body").innerHTML = `
    <div><h3 style="margin-bottom:6px">Налаштування</h3><h2 id="sheet-title">Мій розклад і раціон</h2></div>

    <section class="set">
      <h3>День закупки</h3>
      <div class="seg seg7" role="group" aria-label="День закупки">
        ${DAY_SHORT.map((n, i) => `<button type="button" data-shopday="${i}" aria-pressed="${i === S.shopDay}">${n}</button>`).join("")}
      </div>
      <p class="note">Закупка і заготовка 1 — ${DAY_ACC[S.shopDay]} увечері, заготовка 2 — ${DAY_ACC[(S.shopDay + 3) % 7]}. Базар у вас у суботу та вівторок — Сб підходить ідеально.</p>
    </section>

    <section class="set">
      <h3>Мої КБЖУ на день (1 людина)</h3>
      <div class="fields">
        ${num("p", "Білки", t.p, "г")}${num("f", "Жири", t.f, "г")}${num("c", "Вуглеводи", t.c, "г")}${num("kcal", "Калорії", t.kcal, "ккал")}
      </div>
      <div class="stepper-row">
        <span><b>Розмір порцій</b><small>Меню в середньому дає ${fmt(avgKcal(W) * S.scale)} ккал на день</small></span>
        <span class="stepper">
          <button type="button" class="icon-btn" data-scale="-0.05" aria-label="Менші порції">−</button>
          <b>${Math.round(S.scale * 100)}%</b>
          <button type="button" class="icon-btn" data-scale="0.05" aria-label="Більші порції">+</button>
        </span>
      </div>
      <button type="button" class="btn ghost" data-autoscale>Підібрати порції під мої ${t.kcal} ккал</button>
      <div class="stepper-row">
        <span><b>Скільки людей їсть</b><small>Список покупок рахується на всіх</small></span>
        <span class="stepper">
          <button type="button" class="icon-btn" data-people="-1" aria-label="Менше людей">−</button>
          <b>${S.people}</b>
          <button type="button" class="icon-btn" data-people="1" aria-label="Більше людей">+</button>
        </span>
      </div>
    </section>

    <section class="set">
      <h3>Цикл меню</h3>
      <p class="note">Зараз: ${weekLabel(W)}. Чотири тижні меню йдуть по колу з ${ddmm(cycleStart0(cur))}. Кожні 4 тижні Claude складає нове меню, і застосунок оновлюється сам.</p>
      <ol class="cycle-list">${cur.weeks.map((w, i) => `<li>${esc(w.title)}</li>`).join("")}</ol>
      <button type="button" class="btn primary" data-shuffle>Перемішати дні й тижні</button>
      ${sh ? `<button type="button" class="btn ghost" data-unshuffle>Повернути початковий порядок</button>` : ""}
      <p class="note">Перемішування змінює порядок тижнів, днів усередині заготовки, сніданків і перекусів. Риба, печінка й страви з коротким терміном зберігання лишаються там, де вони безпечні. Плани заготовок і покупки перераховуються.</p>
    </section>

    <section class="set">
      <h3>Спільний список покупок</h3>
      ${Sync.on() ? `
        <p class="note">Підключено. Галочки бачать усі телефони з цим посиланням.</p>
        <button type="button" class="btn primary" data-invite>Запросити другий телефон</button>
        <button type="button" class="btn ghost" data-unsync>Відключити на цьому телефоні</button>
      ` : `
        <p class="note">Потрібна безкоштовна база Firebase (5 хвилин, один раз). Інструкція — нижче.</p>
        <label class="field wide"><span>Адреса бази (Realtime Database URL)</span><input type="url" id="db-url" placeholder="https://….firebasedatabase.app" value="${esc((S.sync && S.sync.db) || "")}"></label>
        <button type="button" class="btn primary" data-create-sync>Створити спільний список</button>
        <label class="field wide"><span>Або вставте посилання-запрошення</span><input type="url" id="invite-url" placeholder="https://…/weekly-menu/?db=…&list=…"></label>
        <button type="button" class="btn ghost" data-join-sync>Приєднатися</button>
      `}
      <details class="help"><summary>Як створити базу Firebase</summary>
        <ol>
          <li>Відкрийте <b>console.firebase.google.com</b>, увійдіть з Google, натисніть «Create a project», назва — weekly-menu, Analytics вимкніть.</li>
          <li>Зліва <b>Build → Realtime Database → Create database</b>, регіон Europe (europe-west1), режим «Start in locked mode».</li>
          <li>Вкладка <b>Rules</b>: вставте правила з README репозиторію і натисніть Publish.</li>
          <li>Скопіюйте адресу бази зверху (https://…firebasedatabase.app), вставте сюди й натисніть «Створити».</li>
          <li>Натисніть «Запросити» і надішліть посилання. На iPhone після встановлення на головний екран вставте це посилання ще раз у поле «Приєднатися».</li>
        </ol>
      </details>
      <textarea class="copy-fallback" id="settings-fallback" readonly hidden aria-label="Посилання"></textarea>
    </section>

    <section class="set">
      <button type="button" class="btn ghost" data-reset-settings>Скинути налаштування</button>
      <p class="note">Дані меню: ${esc(DATA.version)}</p>
    </section>
  `;
}

function randomCode() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}
function inviteUrl() {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("db", S.sync.db);
  u.searchParams.set("list", S.sync.code);
  return u.toString();
}
function parseInvite(text) {
  try {
    const u = new URL(text.trim());
    const db = u.searchParams.get("db"), list = u.searchParams.get("list");
    if (db && list && /^(https:\/\/|http:\/\/localhost)/.test(db)) return { db, code: list };
  } catch (e) { /* not a url */ }
  return null;
}
function cleanDbUrl(v) {
  try { const u = new URL(v.trim()); if (u.protocol !== "https:") return null; return u.origin; } catch (e) { return null; }
}

function settingsChanged() {
  saveSettings();
  weekCache.clear();
  weeksById.clear();
  viewDay = null;
  renderAll();
  if (sheetState && sheetState.type === "settings") renderSettings();
}

// ---------- shell ----------
function setTab(name, focus) {
  if (!TABS[name]) name = "today";
  tab = name;
  store.set("tab", name);
  for (const k of Object.keys(TABS)) $("#view-" + k).hidden = k !== name;
  document.querySelectorAll(".tabbar button").forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("#title").textContent = TABS[name];
  window.scrollTo(0, 0);
  if (focus) $("#main").focus({ preventScroll: true });
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

function renderAll() {
  renderToday();
  renderWeek();
  renderPrep();
  renderShop();
}

function wById(key) { return weeksById.get(key) || todayWeek().W; }

document.addEventListener("click", (e) => {
  const el = e.target.closest("button, [data-close]");
  if (!el) return;
  const ds = el.dataset;
  if (ds.close !== undefined) { closeSheet(); return; }
  if (el.id === "settings-btn") { openSettings(); return; }
  if (ds.tab) { setTab(ds.tab, true); return; }
  if (ds.portions) {
    sheetState.portions = Number(ds.portions);
    store.set("portions", ds.portions);
    renderRecipe();
    $(`[data-portions="${ds.portions}"]`).focus();
    return;
  }
  if (ds.dish) {
    const W = ds.w ? wById(ds.w) : todayWeek().W;
    if (!ds.w) remember(W);
    openRecipe(ds.dish, W, ds.day != null ? { day: Number(ds.day), slot: ds.slot } : null);
    return;
  }
  if (ds.day != null && el.classList.contains("day-chip")) {
    viewDay = Number(ds.day);
    renderToday();
    $(`.day-chip[data-day="${viewDay}"]`).focus();
    return;
  }
  if (ds.openDay != null) { viewDay = Number(ds.openDay); renderToday(); setTab("today", true); return; }
  if (ds.wk) {
    offsets[ds.wk] = Math.max(-1, Math.min(8, offsets[ds.wk] + Number(ds.dir)));
    ({ week: renderWeek, prep: renderPrep, shop: renderShop })[ds.wk]();
    $(`[data-wk="${ds.wk}"][data-dir="${ds.dir}"]`).focus();
    return;
  }
  if (ds.goto) { if (ds.goto === "shop") offsets.shop = 0; setTab(ds.goto, true); return; }
  if (ds.resetPrep != null) {
    const all = prepChecks(ds.w);
    for (const k of Object.keys(all)) if (k.startsWith(ds.resetPrep + "-")) delete all[k];
    store.put("prep:" + ds.w, all);
    renderPrep();
    toast("Галочки скинуто");
    return;
  }
  if (ds.shareList !== undefined) { shareOrCopy(shopText(shopW), "Покупки на тиждень"); return; }
  if (ds.resetShop !== undefined) {
    store.del("shop:" + shopW.key);
    Sync.reset(shopW.key);
    renderShop();
    toast("Список скинуто");
    return;
  }
  // settings
  if (ds.shopday) {
    S.shopDay = Number(ds.shopday);
    settingsChanged();
    toast("Закупка " + DAY_ACC[S.shopDay]);
    return;
  }
  if (ds.scale) { S.scale = Math.round(Math.max(0.7, Math.min(1.5, S.scale + Number(ds.scale))) * 100) / 100; settingsChanged(); return; }
  if (ds.autoscale !== undefined) {
    const { W } = todayWeek();
    S.scale = Math.round(Math.max(0.7, Math.min(1.5, S.target.kcal / avgKcal(W))) * 20) / 20;
    settingsChanged();
    toast("Порції: " + Math.round(S.scale * 100) + "%");
    return;
  }
  if (ds.people) { S.people = Math.max(1, Math.min(8, S.people + Number(ds.people))); settingsChanged(); return; }
  if (ds.shuffle !== undefined) {
    const cur = cycles()[0];
    const r = resolve(midnight(new Date()));
    // A week that is already under way keeps its menu: the new order starts with the next shopping day
    const started = r.cyc === cur && !r.preview && diffDays(midnight(new Date()), buildWeek(cur, r.n).start) > 0;
    const from = r.cyc === cur && !r.preview ? r.n + (started ? 1 : 0) : 0;
    S.shuffle[cur.cycleId] = { from, seed: Math.floor(Math.random() * 1e9) };
    settingsChanged();
    toast(started ? "Перемішано — з наступної закупки" : "Меню перемішано");
    return;
  }
  if (ds.unshuffle !== undefined) { delete S.shuffle[cycles()[0].cycleId]; settingsChanged(); toast("Початковий порядок"); return; }
  if (ds.createSync !== undefined) {
    const db = cleanDbUrl($("#db-url").value);
    if (!db) { toast("Вставте адресу бази, що починається з https://"); return; }
    S.sync = { db, code: randomCode() };
    settingsChanged();
    Sync.close();
    renderShop();
    toast("Спільний список створено");
    return;
  }
  if (ds.joinSync !== undefined) {
    const inv = parseInvite($("#invite-url").value);
    if (!inv) { toast("Це не посилання-запрошення"); return; }
    S.sync = inv;
    settingsChanged();
    Sync.close();
    renderShop();
    toast("Спільний список підключено");
    return;
  }
  if (ds.invite !== undefined) { shareOrCopy("Наш спільний список покупок:", "Тижневе меню", inviteUrl()); return; }
  if (ds.unsync !== undefined) { S.sync = null; Sync.close(); settingsChanged(); toast("Відключено"); return; }
  if (ds.resetSettings !== undefined) {
    const sync = S.sync;
    S = defaults(); S.sync = sync;
    settingsChanged();
    toast("Налаштування скинуто");
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.step) {
    const card = el.closest("[data-prep]");
    const key = card.dataset.w;
    const all = prepChecks(key);
    if (el.checked) all[el.dataset.step] = 1; else delete all[el.dataset.step];
    store.put("prep:" + key, all);
    const W = wById(key);
    const p = W.preps[Number(card.dataset.prep)];
    $("[data-count]", card).textContent = `Зроблено ${p.steps.filter((_, i) => all[p.k + "-" + i]).length} з ${p.steps.length}`;
  } else if (el.dataset.shop) {
    setShopCheck(shopW.key, el.dataset.shop, el.checked);
    updateShopCount();
  } else if (el.dataset.target) {
    const v = Number(el.value);
    if (v > 0) { S.target[el.dataset.target] = Math.round(v); saveSettings(); weekCache.clear(); renderToday(); }
  }
});

document.addEventListener("keydown", (e) => {
  if ($("#sheet").hidden) return;
  if (e.key === "Escape") { closeSheet(); return; }
  if (e.key === "Tab") {
    const f = [...$(".sheet-panel").querySelectorAll("button, [href], input, textarea, summary")].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

let lastDay = midnight(new Date()).getTime();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !DATA) return;
  const now = midnight(new Date()).getTime();
  if (now !== lastDay) { lastDay = now; viewDay = null; weekCache.clear(); renderAll(); }
  if (tab === "shop" && Sync.on() && !Sync.es) { Sync.close(); renderShop(); }
});
window.addEventListener("online", () => { Sync.flush(); if (tab === "shop") { Sync.close(); renderShop(); } });

function readInviteFromUrl() {
  const inv = parseInvite(location.href);
  if (!inv) return;
  S.sync = inv;
  saveSettings();
  history.replaceState(null, "", location.pathname);
  setTimeout(() => toast("Спільний список підключено"), 300);
}

async function init() {
  setTab(store.get("tab") || "today");
  try {
    const res = await fetch("menu-data.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch (e) {
    $("#load-error").hidden = false;
    return;
  }
  initCycles();
  loadSettings();
  readInviteFromUrl();
  const seen = store.get("cycleSeen");
  if (seen && seen !== DATA.cycleId) setTimeout(() => toast("Нове меню на 4 тижні!"), 600);
  store.set("cycleSeen", DATA.cycleId);
  renderAll();
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

init();
