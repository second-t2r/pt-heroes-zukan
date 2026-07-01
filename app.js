// PT HEROES 図鑑 — コミック/データブック調のレンダラ
let DATA = { meta: {}, heroes: [] };
let activeColor = "all";
let keyword = "";

const $ = (s) => document.querySelector(s);
const RANK_VAL = { A: 5, B: 4, C: 3, D: 2, E: 1 };

function colorHex(color) {
  const c = DATA.meta.colors && DATA.meta.colors[color];
  return c ? c.hex : "#17b978";
}
function colorLabel(color) {
  const c = DATA.meta.colors && DATA.meta.colors[color];
  return c ? c.label : color;
}
function statLabel(key) {
  const l = DATA.meta.stat_labels || {};
  return l[key] || key;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}
function no(i) { return "No." + String(i + 1).padStart(3, "0"); }

function portrait(h) {
  if (h.illustration) {
    return `<img src="${esc(h.illustration)}" alt="${esc(h.name)}"
      onerror="this.parentNode.innerHTML='<div class=&quot;ph&quot;><b>${esc(h.name)}</b><small>イラスト未設定</small></div>'">`;
  }
  return `<div class="ph"><b>${esc(h.name)}</b><small>イラスト未設定</small></div>`;
}

function cardHtml(h, i) {
  const hex = colorHex(h.color);
  const rank = h.rank ? `<div class="rank"><span>${esc(h.rank)}</span></div>` : "";
  return `<article class="card" style="--c:${hex}" data-slug="${esc(h.slug)}">
    <div class="num">${no(i)}</div>
    ${rank}
    <div class="portrait">
      ${portrait(h)}
      <div class="field-tab">${esc(h.field || "")}</div>
    </div>
    <div class="meta">
      <p class="name">${esc(h.name)}<small>${esc(h.name_en || "")}</small></p>
      <span class="code">${esc(h.code_name || "")}</span>
      <p class="catch">${esc(h.catchphrase || "")}</p>
      <div class="badges">
        <span class="badge" style="background:${hex};color:#fff">${esc(colorLabel(h.color))}</span>
        <span class="badge">SPEED ${esc(h.speed ?? "-")}</span>
      </div>
    </div>
  </article>`;
}

// 5角形ステータスレーダー（SVG）
function radarSvg(stats5) {
  const keys = ["power", "speed", "technique", "intelligence", "cooperation"];
  const cx = 100, cy = 96, R = 66;
  const ang = (i) => (-90 + i * 72) * Math.PI / 180;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];

  let grid = "";
  for (let lvl = 1; lvl <= 5; lvl++) {
    const r = R * lvl / 5;
    const p = keys.map((_, i) => pt(i, r).map((n) => n.toFixed(1)).join(",")).join(" ");
    grid += `<polygon class="grid-line" points="${p}"/>`;
  }
  let axes = "";
  keys.forEach((_, i) => {
    const [x, y] = pt(i, R);
    axes += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  });
  const shapePts = keys.map((k, i) => {
    const v = RANK_VAL[String(stats5[k] || "E").toUpperCase()] || 1;
    return pt(i, R * v / 5).map((n) => n.toFixed(1)).join(",");
  }).join(" ");

  let labels = "";
  keys.forEach((k, i) => {
    const [x, y] = pt(i, R + 15);
    const rk = String(stats5[k] || "E").toUpperCase();
    const anchor = Math.abs(x - cx) < 6 ? "middle" : (x > cx ? "start" : "end");
    labels += `<text class="lab" x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="${anchor}">${esc(statLabel(k))}</text>`;
    labels += `<text class="rank-lab" x="${x.toFixed(1)}" y="${(y + 8).toFixed(1)}" text-anchor="${anchor}">${rk}</text>`;
  });

  return `<div class="radar"><svg viewBox="0 0 200 205" role="img" aria-label="ステータスレーダー">
    ${grid}${axes}<polygon class="shape" points="${shapePts}"/>${labels}
  </svg></div>`;
}

function statBlock(h) {
  const numbers = `<div class="numbers">
    <div class="n"><b>SPEED</b><div class="v">${esc(h.speed ?? "-")}</div></div>
    <div class="n"><b>HP</b><div class="v">${esc(h.hp ?? "-")}</div></div>
    <div class="n"><b>AI LOG</b><div class="v" style="font-size:12px">${esc(h.ai_log || "-")}</div></div>
  </div>`;
  if (h.stats5) {
    return `<div class="radar-wrap"><h4>◆ HERO STATUS</h4>${radarSvg(h.stats5)}</div>${numbers}`;
  }
  return `<h4>◆ HERO STATUS</h4>${numbers}`;
}

function sectionHtml(label, obj) {
  if (!obj) return "";
  const name = obj.name ? `<div class="h-name">${esc(obj.name)}</div>` : "";
  const desc = obj.desc ? `<p>${esc(obj.desc)}</p>` : "";
  return `<div class="sec"><h4><span>${esc(label)}</span></h4>${name}${desc}</div>`;
}

function detailHtml(h, i) {
  const hex = colorHex(h.color);
  const rankBadge = h.rank ? ` ／ RANK ${esc(h.rank)}` : "";
  const secret = h.secret_data
    ? `<div class="sec"><h4><span>SECRET DATA</span></h4><p>${esc(h.secret_data)}</p></div>` : "";
  return `<div class="detail" style="--c:${hex}">
    <div class="d-top">
      <div class="d-num">${no(i)}</div>
      <div class="d-field">[FIELD] ${esc(h.field || "")} — ${esc(colorLabel(h.color))}${rankBadge}</div>
      <div class="d-name display">${esc(h.name)} <small>${esc(h.name_en || "")}</small></div>
      <div class="d-code">CODE NAME : ${esc(h.code_name || "")}</div>
    </div>
    <div class="d-body">
      <div class="d-portrait">${portrait(h)}</div>
      <div class="d-stat-col">${statBlock(h)}</div>
      ${h.quote ? `<p class="d-quote">「${esc(h.quote)}」</p>` : ""}
    </div>
    ${sectionHtml("SUPER POWER（固有能力）", h.super_power)}
    ${sectionHtml("HERO ROLE", h.hero_role)}
    ${sectionHtml("SOUL HERO", h.soul_hero)}
    ${secret}
  </div>`;
}

function renderFilters() {
  const colors = DATA.meta.colors || {};
  const used = new Set(DATA.heroes.map((h) => h.color));
  let html = `<button class="chip ${activeColor === "all" ? "active" : ""}"
    data-color="all" ${activeColor === "all" ? 'style="background:#16130f;color:#fff"' : ""}>ALL</button>`;
  Object.keys(colors).forEach((key) => {
    if (!used.has(key)) return;
    const c = colors[key];
    const act = activeColor === key ? "active" : "";
    const style = act ? `style="background:${c.hex};color:#fff"` : "";
    html += `<button class="chip ${act}" data-color="${key}" ${style}>
      <span class="dot" style="background:${c.hex}"></span>${esc(c.label)}</button>`;
  });
  $("#filters").innerHTML = html;
}

function renderGrid() {
  const kw = keyword.trim().toLowerCase();
  // 全体の通し番号を保つため、元index付きで絞り込む
  const list = DATA.heroes
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => {
      if (activeColor !== "all" && h.color !== activeColor) return false;
      if (!kw) return true;
      return [h.name, h.name_en, h.code_name, h.catchphrase]
        .some((v) => String(v || "").toLowerCase().includes(kw));
    });
  $("#grid").innerHTML = list.map(({ h, i }) => cardHtml(h, i)).join("");
  $("#empty").hidden = list.length !== 0;
  $("#count").textContent = `全 ${DATA.heroes.length} 名中 ${list.length} 名を表示`;
}

function openModal(slug) {
  const i = DATA.heroes.findIndex((x) => x.slug === slug);
  if (i < 0) return;
  $("#modalCard").innerHTML = detailHtml(DATA.heroes[i], i);
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modal").hidden = true;
  document.body.style.overflow = "";
}

function bind() {
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    activeColor = b.dataset.color;
    renderFilters();
    renderGrid();
  });
  $("#search").addEventListener("input", (e) => { keyword = e.target.value; renderGrid(); });
  $("#grid").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) openModal(card.dataset.slug);
  });
  $("#modal").addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

async function init() {
  try {
    const res = await fetch("data/heroes.json", { cache: "no-store" });
    DATA = await res.json();
  } catch (err) {
    $("#grid").innerHTML = `<p class="empty">データ読み込みに失敗しました（data/heroes.json）。</p>`;
    return;
  }
  if (DATA.meta.subtitle) $("#subtitle").textContent = DATA.meta.subtitle;
  if (DATA.meta.note) $("#notice").title = DATA.meta.note;
  renderFilters();
  renderGrid();
  bind();
}

init();
