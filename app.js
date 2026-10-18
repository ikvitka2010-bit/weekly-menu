"use strict";

// Home measures, largest unit first: [name, grams per unit]
const UNITS = {
  breast: [["філе", 180]],
  thigh: [["шт", 90]],
  turkey: [["шматок з долоню", 150]],
  liver: [["скл.", 220]],
  mince: [["скл.", 220]],
  beef: [["скл. кубиків", 180]],
  fish: [["філе", 110]],
  whole: [["курка", 1800]],
  egg: [["шт", 55]],
  white: [["білок", 33]],
  yogurt: [["скл.", 250], ["ст. л.", 25]],
  cottage: [["скл.", 200], ["ст. л.", 20]],
  kefir: [["скл.", 250]],
  milk: [["скл.", 250], ["ст. л.", 15]],
  oats: [["скл.", 90], ["ст. л.", 10]],
  bulgur: [["скл.", 170], ["ст. л.", 17]],
  rice: [["скл.", 200], ["ст. л.", 20]],
  lentil: [["скл.", 190], ["ст. л.", 20]],
  chick: [["скл.", 160], ["ст. л.", 15]],
  pasta: [["скл.", 100]],
  bread: [["скибка", 30]],
  potato: [["шт сер.", 150]],
  beet: [["шт сер.", 200]],
  cabbage: [["скл. нашаткованої", 70]],
  carrot: [["шт сер.", 80]],
  onion: [["шт сер.", 100]],
  zucchini: [["шт сер.", 300]],
  pepper: [["шт", 150]],
  broccoli: [["скл. суцвіть", 90]],
  cuke: [["шт сер.", 120]],
  tomato: [["шт сер.", 120]],
  spinach: [["жменя", 30]],
  banana: [["шт", 120]],
  apple: [["шт сер.", 180]],
  berries: [["скл.", 140], ["жменя", 50]],
  lemon: [["лимон", 80]],
  tpaste: [["ст. л.", 20], ["ч. л.", 7]],
  tcan: [["банка", 400], ["скл.", 250]],
  oil: [["ст. л.", 14], ["ч. л.", 5]],
  honey: [["ст. л.", 21], ["ч. л.", 7]],
};

const DAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const PREP_DAYS = { 0: "p1", 3: "p2" };
const SHOP_ORDER = [
  "М'ясо і риба", "Молочне і яйця", "Овочі", "Фрукти і ягоди",
  "Крупи, хліб, макарони", "Бакалія", "Спеції (перевір, що є вдома)",
];
const TARGET_C = 155;
const TABS = { today: "Сьогодні", week: "Тиждень", prep: "Заготовки", shop: "Покупки" };
const PREP_LABEL = { p1: "заготовка пн", p2: "заготовка чт", morning: "зранку", snack: "без готування" };

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
};

let DATA = null;
let todayIdx = (new Date().getDay() + 6) % 7;
let dayIdx = todayIdx;
let tab = "today";
let lastFocus = null;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => String(Math.round(n));
const kcalOf = (p, f, c) => p * 4 + f * 9 + c * 4;
const chevron = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

// ---------- measures ----------
function frac(q) {
  const whole = Math.floor(q);
  const rest = Math.round((q - whole) * 4);
  const sym = ["", "¼", "½", "¾"][rest] || "";
  if (!whole) return sym || "0";
  return whole + sym;
}

function measure(id, grams) {
  const units = UNITS[id];
  if (!units || grams == null) return null;
  if (id === "white") {
    const n = Math.max(1, Math.round(grams / units[0][1]));
    return n + " " + units[0][0];
  }
  let [name, g] = units[units.length - 1];
  for (const u of units) {
    if (grams / u[1] >= 0.45) { [name, g] = u; break; }
  }
  const q = grams / g;
  const step = q < 2 ? 0.25 : 0.5;
  const rounded = Math.max(0.25, Math.round(q / step) * step);
  return frac(rounded) + " " + name;
}

function pieceHint(id, grams) {
  if (id === "egg" || id === "whole" || !grams) return "";
  const u = (UNITS[id] || []).find(([n]) => n.startsWith("шт") || n === "філе");
  if (!u) return "";
  return "≈ " + Math.ceil(grams / u[1]) + " " + u[0];
}

function splitName(name) {
  const i = name.indexOf(" — ");
  return i < 0 ? [name, ""] : [name.slice(0, i), name.slice(i + 3)];
}

// ---------- day logic ----------
function mealSource(meal, di) {
  const dish = DATA.dishes[meal.dish];
  if (meal.frozen) return { cls: "frozen", text: "з морозилки" };
  if (meal.slot === "Вечеря" && PREP_DAYS[di] && dish.prep === PREP_DAYS[di]) return { cls: "fresh", text: "свіже" };
  if (dish.prep === "morning") return { cls: "", text: "зранку · " + dish.time.replace(" зранку", "") };
  return { cls: dish.prep, text: PREP_LABEL[dish.prep] || dish.prep };
}

function dayTotals(di) {
  const t = { p: 0, f: 0, c: 0 };
  for (const m of DATA.week[di].meals) {
    const d = DATA.dishes[m.dish];
    t.p += d.p; t.f += d.f; t.c += d.c;
  }
  t.kcal = kcalOf(t.p, t.f, t.c);
  return t;
}

function macroLine(o) {
  return `<span class="macro-line"><span><b class="mp">Б ${fmt(o.p)}</b></span><span><b class="mf">Ж ${fmt(o.f)}</b></span><span><b class="mc">В ${fmt(o.c)}</b></span>${o.kcal != null ? `<span>${fmt(o.kcal)} ккал</span>` : ""}</span>`;
}

// ---------- views ----------
function renderToday() {
  const day = DATA.week[dayIdx];
  const t = dayTotals(dayIdx);
  const tgt = DATA.target;
  const bar = (k, label, val, goal, goalText) => `
    <div class="bar-row">
      <span class="lbl">${label}</span>
      <span class="bar ${k}" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.round(val)}"><i style="width:${Math.min(100, (val / goal) * 100)}%"></i></span>
      <span class="val">${fmt(val)} <small>/ ${goalText} г</small></span>
    </div>`;

  const prepId = PREP_DAYS[dayIdx];
  const prep = prepId && DATA.prep.find((p) => p.id === prepId);

  $("#view-today").innerHTML = `
    <div class="days" role="group" aria-label="День тижня">
      ${DATA.week.map((d, i) => `
        <button type="button" class="day-chip" data-day="${i}" aria-pressed="${i === dayIdx}" aria-label="${d.day}${PREP_DAYS[i] ? ", день заготовки" : ""}${i === todayIdx ? ", сьогодні" : ""}">
          ${PREP_DAYS[i] ? '<span class="dot" aria-hidden="true"></span>' : ""}
          <span>${DAYS_SHORT[i]}</span><small>${i === todayIdx ? "сьог." : "&nbsp;"}</small>
        </button>`).join("")}
    </div>

    <div class="card macros">
      <div class="macros-head">
        <div><h3>${esc(day.day)} · на 1 людину</h3></div>
        <div class="kcal">${fmt(t.kcal)} <small>ккал</small></div>
      </div>
      ${bar("p", "Білки", t.p, tgt.p, "від " + tgt.p)}
      ${bar("f", "Жири", t.f, tgt.f, "≈" + tgt.f)}
      ${bar("c", "Вуглеводи", t.c, TARGET_C, tgt.c)}
    </div>

    ${prep ? `
    <div class="banner">
      <div><b>Ввечері — заготовка ${prepId.slice(1)}</b><span>${esc(prep.covers)} · ${esc(prep.dur)}</span></div>
      <button type="button" class="btn primary" data-goto="prep">План</button>
    </div>` : ""}

    ${day.meals.map((m) => {
      const d = DATA.dishes[m.dish];
      const src = mealSource(m, dayIdx);
      return `
      <button type="button" class="meal" data-dish="${m.dish}" data-day="${dayIdx}" data-slot="${esc(m.slot)}">
        <span class="meal-top"><h3>${esc(m.slot)}</h3><span class="pill ${src.cls}">${esc(src.text)}</span></span>
        <span class="meal-name">${esc(d.name)}</span>
        <span class="meal-foot">${macroLine({ p: d.p, f: d.f, c: d.c })}<span class="kc">${d.kcal} ккал ${chevron}</span></span>
      </button>`;
    }).join("")}
  `;
}

function renderWeek() {
  $("#view-week").innerHTML = DATA.week.map((d, i) => {
    const t = dayTotals(i);
    return `
    <article class="card wday${i === todayIdx ? " is-today" : ""}">
      <div class="wday-head">
        <h2>${esc(d.day)}${i === todayIdx ? '<span class="pill p1">сьогодні</span>' : ""}${PREP_DAYS[i] ? `<span class="pill">заготовка ${PREP_DAYS[i].slice(1)}</span>` : ""}</h2>
        <button type="button" class="link-btn" data-open-day="${i}">Відкрити день</button>
      </div>
      <div>
        ${d.meals.map((m) => `
          <button type="button" class="wrow" data-dish="${m.dish}" data-day="${i}" data-slot="${esc(m.slot)}">
            <span class="slot">${esc(m.slot)}</span>
            <span class="dish">${esc(DATA.dishes[m.dish].name)}${m.frozen ? " <em>· з морозилки</em>" : ""}</span>
          </button>`).join("")}
      </div>
      ${macroLine(t)}
    </article>`;
  }).join("");
}

function prepDone(p) {
  return p.steps.filter((_, n) => store.get(p.id + n) === "1").length;
}

function renderPrep() {
  $("#view-prep").innerHTML = DATA.prep.map((p) => {
    const used = new Set(DATA.week.flatMap((d) => d.meals.filter((m) => !m.frozen).map((m) => m.dish)));
    const dishes = Object.entries(DATA.dishes).filter(([id, d]) => d.prep === p.id && used.has(id));
    const done = prepDone(p);
    return `
    <article class="card prep" data-prep="${p.id}">
      <div>
        <h2>${esc(p.title)}</h2>
        <div class="prep-meta" style="margin-top:8px">
          <span class="pill p1 wrap">${esc(p.covers)}</span>
          <span class="pill">${esc(p.dur)}</span>
        </div>
      </div>
      <div>
        <h3 style="margin-bottom:8px">Страви</h3>
        <div class="chips">${dishes.map(([id, d]) => `<button type="button" class="chip" data-dish="${id}">${esc(d.name)}</button>`).join("")}</div>
      </div>
      <div class="progress">
        <b data-count>Зроблено ${done} з ${p.steps.length}</b>
        <button type="button" class="btn ghost" data-reset-prep="${p.id}">Скинути галочки</button>
      </div>
      <ol class="steps">
        ${p.steps.map((s, n) => `
          <li><label class="check">
            <input type="checkbox" data-step="${p.id}${n}"${store.get(p.id + n) === "1" ? " checked" : ""}>
            <span class="txt"><span class="num">${n + 1}.</span>${esc(s)}</span>
          </label></li>`).join("")}
      </ol>
    </article>`;
  }).join("") + `
    <aside class="card note">
      <h3>Зберігання</h3>
      <ul>
        <li>Розкладайте все по контейнерах і підписуйте день.</li>
        <li>Готові страви — у холодильнику 3–4 дні, рибу їжте наступного дня.</li>
        <li>Тефтелі на наступний понеділок — одразу в морозилку (до 2 місяців), розморожуйте з вечора неділі.</li>
        <li>Ягоди для сирників і йогурту розморожуйте з вечора в холодильнику.</li>
        <li>Салати заправляйте перед їжею.</li>
      </ul>
    </aside>`;
}

function shopCats() {
  const keys = Object.keys(DATA.shop);
  return SHOP_ORDER.filter((k) => keys.includes(k)).concat(keys.filter((k) => !SHOP_ORDER.includes(k)));
}

function renderShop() {
  const cats = shopCats();
  const all = cats.flatMap((c) => DATA.shop[c]);
  const left = all.filter((it) => store.get("s_" + it.id) !== "1").length;
  $("#view-shop").innerHTML = `
    <div class="card shop-actions">
      <span class="shop-count" id="shop-count">Залишилось ${left} з ${all.length} · відмічайте те, що вже є вдома або в кошику</span>
      <button type="button" class="btn primary" data-copy>Копіювати список</button>
      <button type="button" class="btn ghost" data-reset-shop>Скинути</button>
      <textarea class="copy-fallback" id="copy-fallback" readonly hidden aria-label="Список покупок для копіювання"></textarea>
    </div>
    ${cats.map((c) => `
    <section class="card shop-cat">
      <h2>${esc(c)} <small>${DATA.shop[c].length}</small></h2>
      ${DATA.shop[c].map((it) => {
        const [ua, tr] = splitName(it.name);
        const hint = pieceHint(it.id, it.g);
        return `
        <label class="check">
          <input type="checkbox" data-shop="${esc(it.id)}"${store.get("s_" + it.id) === "1" ? " checked" : ""}>
          <span class="txt"><span class="item-ua">${esc(ua)}</span>${tr ? `<span class="item-tr">${esc(tr)}</span>` : ""}</span>
          <span class="item-qty">${esc(it.qty || "")}${hint ? `<small>${esc(hint)}</small>` : ""}</span>
        </label>`;
      }).join("")}
    </section>`).join("")}
  `;
}

function updateShopCount() {
  const all = shopCats().flatMap((c) => DATA.shop[c]);
  const left = all.filter((it) => store.get("s_" + it.id) !== "1").length;
  const el = $("#shop-count");
  if (el) el.textContent = `Залишилось ${left} з ${all.length} · відмічайте те, що вже є вдома або в кошику`;
}

function shopText() {
  const out = [];
  for (const c of shopCats()) {
    const items = DATA.shop[c].filter((it) => store.get("s_" + it.id) !== "1");
    if (!items.length) continue;
    out.push(c.toUpperCase());
    for (const it of items) {
      const hint = pieceHint(it.id, it.g);
      out.push("• " + it.name + (it.qty ? " — " + it.qty : "") + (hint ? " (" + hint + ")" : ""));
    }
    out.push("");
  }
  return out.join("\n").trim();
}

async function copyShop() {
  const text = shopText();
  if (!text) { toast("Усе вже відмічено"); return; }
  const fb = $("#copy-fallback");
  try {
    await navigator.clipboard.writeText(text);
    fb.hidden = true;
    toast("Список скопійовано");
  } catch (e) {
    fb.value = text;
    fb.hidden = false;
    fb.focus();
    fb.select();
    toast("Скопіюйте виділений текст");
  }
}

// ---------- recipe sheet ----------
let sheetState = null;

function openRecipe(dishId, ctx) {
  lastFocus = document.activeElement;
  sheetState = { dishId, ctx, portions: Number(store.get("portions")) || 2 };
  renderRecipe();
  const sheet = $("#sheet");
  sheet.hidden = false;
  document.body.classList.add("locked");
  $(".sheet-panel").scrollTop = 0;
  $(".sheet-close").focus();
}

function renderRecipe() {
  const { dishId, ctx, portions } = sheetState;
  const d = DATA.dishes[dishId];
  let src = { cls: d.prep, text: PREP_LABEL[d.prep] };
  if (ctx && ctx.day != null) {
    const meal = DATA.week[ctx.day].meals.find((m) => m.slot === ctx.slot && m.dish === dishId);
    if (meal) src = mealSource(meal, ctx.day);
  }
  $("#sheet-body").innerHTML = `
    <div>
      <h3 style="margin-bottom:6px">${ctx && ctx.slot ? esc(ctx.slot) + " · " + esc(DATA.week[ctx.day].day) : "Рецепт"}</h3>
      <h2 id="sheet-title">${esc(d.name)}</h2>
    </div>
    <div class="sheet-meta">
      <span class="pill ${src.cls}">${esc(src.text)}</span>
      <span class="pill">${esc(d.time)}</span>
    </div>
    <div>
      <h3 style="margin-bottom:8px">На 1 порцію</h3>
      <div class="stat-grid">
        <div class="stat p"><b>${r1(d.p)}</b><span>білки, г</span></div>
        <div class="stat f"><b>${r1(d.f)}</b><span>жири, г</span></div>
        <div class="stat c"><b>${r1(d.c)}</b><span>вуглев., г</span></div>
        <div class="stat"><b>${d.kcal}</b><span>ккал</span></div>
      </div>
    </div>
    <div class="seg-row">
      <div class="lbl-line"><h3>Інгредієнти</h3><span class="eyebrow">порцій</span></div>
      <div class="seg" role="group" aria-label="Кількість порцій">
        ${[1, 2, 4].map((n) => `<button type="button" data-portions="${n}" aria-pressed="${n === portions}">${n}</button>`).join("")}
      </div>
      <ul class="ing">
        ${d.ing.map((i) => {
          const [ua, tr] = splitName(i.name);
          const g = i.g == null ? null : i.g * portions;
          const m = measure(i.id, g);
          return `<li><span class="nm">${esc(ua)}${tr ? `<small>${esc(tr)}</small>` : ""}</span>
            <span class="ms">${m ? esc(m) : g != null ? fmt(g) + " г" : "—"}${m && g != null ? `<small>${fmt(g)} г</small>` : ""}</span></li>`;
        }).join("")}
      </ul>
    </div>
    <div>
      <h3 style="margin-bottom:10px">Приготування</h3>
      <ol class="howto">${d.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join("")}</ol>
    </div>
    ${d.store ? `<div><h3 style="margin-bottom:8px">Зберігання</h3><div class="store">${esc(d.store)}</div></div>` : ""}
  `;
}

function closeRecipe() {
  if ($("#sheet").hidden) return;
  $("#sheet").hidden = true;
  document.body.classList.remove("locked");
  sheetState = null;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
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
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function renderAll() {
  renderToday();
  renderWeek();
  renderPrep();
  renderShop();
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("button, [data-close]");
  if (!el) return;
  const ds = el.dataset;
  if (ds.close !== undefined) { closeRecipe(); return; }
  if (ds.tab) { setTab(ds.tab, true); return; }
  if (ds.portions) {
    sheetState.portions = Number(ds.portions);
    store.set("portions", ds.portions);
    renderRecipe();
    $(`[data-portions="${ds.portions}"]`).focus();
    return;
  }
  if (ds.dish) {
    openRecipe(ds.dish, ds.day != null ? { day: Number(ds.day), slot: ds.slot } : null);
    return;
  }
  if (ds.day != null && el.classList.contains("day-chip")) {
    dayIdx = Number(ds.day);
    renderToday();
    $(`.day-chip[data-day="${dayIdx}"]`).focus();
    return;
  }
  if (ds.openDay != null) { dayIdx = Number(ds.openDay); renderToday(); setTab("today", true); return; }
  if (ds.goto) { setTab(ds.goto, true); return; }
  if (ds.resetPrep) {
    const p = DATA.prep.find((x) => x.id === ds.resetPrep);
    p.steps.forEach((_, n) => store.del(p.id + n));
    renderPrep();
    toast("Галочки скинуто");
    return;
  }
  if (ds.copy !== undefined) { copyShop(); return; }
  if (ds.resetShop !== undefined) {
    for (const c of Object.keys(DATA.shop)) for (const it of DATA.shop[c]) store.del("s_" + it.id);
    renderShop();
    toast("Список скинуто");
  }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.step) {
    if (el.checked) store.set(el.dataset.step, "1"); else store.del(el.dataset.step);
    const card = el.closest("[data-prep]");
    const p = DATA.prep.find((x) => x.id === card.dataset.prep);
    $("[data-count]", card).textContent = `Зроблено ${prepDone(p)} з ${p.steps.length}`;
  } else if (el.dataset.shop) {
    if (el.checked) store.set("s_" + el.dataset.shop, "1"); else store.del("s_" + el.dataset.shop);
    updateShopCount();
  }
});

document.addEventListener("keydown", (e) => {
  if ($("#sheet").hidden) return;
  if (e.key === "Escape") { closeRecipe(); return; }
  if (e.key === "Tab") {
    const f = [...$(".sheet-panel").querySelectorAll("button, [href], input, textarea")].filter((x) => !x.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Re-open on the current weekday when the app comes back after midnight
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !DATA) return;
  const now = (new Date().getDay() + 6) % 7;
  if (now !== todayIdx) { todayIdx = now; dayIdx = now; renderAll(); }
});

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
  renderAll();
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

init();
