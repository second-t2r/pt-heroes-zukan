// PT HEROES 図鑑 — コミック/データブック調 + パスワード復号
let DATA = { meta: {}, heroes: [] };
let activeColor = "all";
let keyword = "";
let PASSWORD = null; // 復号後、画像復号のために保持（sessionStorageに保存）

const $ = (s) => document.querySelector(s);
const RANK_VAL = { A: 5, B: 4, C: 3, D: 2, E: 1 };

/* ---------- 復号ユーティリティ（Web Crypto / PBKDF2-SHA256 → AES-256-GCM） ---------- */
function b64ToBytes(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
async function deriveKey(pw, saltBytes, iter) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
}
async function decryptEnc(meta, pw) {
  const key = await deriveKey(pw, b64ToBytes(meta.salt), meta.iter);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(meta.iv) }, key, b64ToBytes(meta.ct));
}
// 暗号化イラスト（.enc）を復号して blob URL を返す
async function decryptImage(path) {
  const meta = await fetch(path, { cache: "no-store" }).then((r) => r.json());
  const buf = await decryptEnc(meta, PASSWORD);
  const blob = new Blob([buf], { type: meta.mime || "image/png" });
  return URL.createObjectURL(blob);
}

/* ---------- 表示ヘルパ ---------- */
function colorHex(color) { const c = DATA.meta.colors && DATA.meta.colors[color]; return c ? c.hex : "#17b978"; }
function colorLabel(color) { const c = DATA.meta.colors && DATA.meta.colors[color]; return c ? c.label : color; }
function statLabel(key) { const l = DATA.meta.stat_labels || {}; return l[key] || key; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}
function no(i) { return "No." + String(i + 1).padStart(3, "0"); }

function portrait(h) {
  if (h.illustration) {
    if (h.illustration.endsWith(".enc")) {
      // 復号は後追い（data-enc）。まずプレースホルダ。
      return `<div class="ph" data-enc="${esc(h.illustration)}"><b>${esc(h.name)}</b><small>復号中…</small></div>`;
    }
    return `<img src="${esc(h.illustration)}" alt="${esc(h.name)}"
      onerror="this.parentNode.innerHTML='<div class=&quot;ph&quot;><b>${esc(h.name)}</b><small>イラスト未設定</small></div>'">`;
  }
  return `<div class="ph"><b>${esc(h.name)}</b><small>イラスト未設定</small></div>`;
}

// 描画後、暗号化イラストを順次復号して差し込む
async function hydrateImages(root) {
  const nodes = (root || document).querySelectorAll(".ph[data-enc]");
  for (const el of nodes) {
    try {
      const url = await decryptImage(el.getAttribute("data-enc"));
      const img = new Image();
      img.src = url; img.alt = "";
      el.replaceWith(img);
    } catch (e) {
      el.innerHTML = "<b>復号エラー</b>";
    }
  }
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

function radarSvg(stats5) {
  const keys = ["power", "speed", "technique", "intelligence", "cooperation"];
  const cx = 100, cy = 94, R = 60;
  const ang = (i) => (-90 + i * 72) * Math.PI / 180;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  let grid = "";
  for (let lvl = 1; lvl <= 5; lvl++) {
    const r = R * lvl / 5;
    const p = keys.map((_, i) => pt(i, r).map((n) => n.toFixed(1)).join(",")).join(" ");
    grid += `<polygon class="grid-line" points="${p}"/>`;
  }
  let axes = "";
  keys.forEach((_, i) => { const [x, y] = pt(i, R); axes += `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
  const shapePts = keys.map((k, i) => {
    const v = RANK_VAL[String(stats5[k] || "E").toUpperCase()] || 1;
    return pt(i, R * v / 5).map((n) => n.toFixed(1)).join(",");
  }).join(" ");
  let labels = "";
  keys.forEach((k, i) => {
    const [x, y] = pt(i, R + 13);
    const rk = String(stats5[k] || "E").toUpperCase();
    const anchor = Math.abs(x - cx) < 6 ? "middle" : (x > cx ? "start" : "end");
    labels += `<text class="lab" x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="${anchor}">${esc(statLabel(k))}</text>`;
    labels += `<text class="rank-lab" x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" text-anchor="${anchor}">${rk}</text>`;
  });
  // ラベルがはみ出さないよう左右・上下に余白を持たせた viewBox
  return `<div class="radar"><svg viewBox="-32 -4 264 208" role="img" aria-label="ステータスレーダー">
    ${grid}${axes}<polygon class="shape" points="${shapePts}"/>${labels}
  </svg></div>`;
}

function statBlock(h) {
  const numbers = `<div class="numbers">
    <div class="n"><b>SPEED</b><div class="v">${esc(h.speed ?? "-")}</div></div>
    <div class="n"><b>HP</b><div class="v">${esc(h.hp ?? "-")}</div></div>
    <div class="n"><b>AI LOG</b><div class="v" style="font-size:12px">${esc(h.ai_log || "-")}</div></div>
  </div>`;
  if (h.stats5) return `<div class="radar-wrap"><h4>◆ HERO STATUS</h4>${radarSvg(h.stats5)}</div>${numbers}`;
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
  const secret = h.secret_data ? `<div class="sec"><h4><span>SECRET DATA</span></h4><p>${esc(h.secret_data)}</p></div>` : "";
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
  let html = `<button class="chip ${activeColor === "all" ? "active" : ""}" data-color="all" ${activeColor === "all" ? 'style="background:#16130f;color:#fff"' : ""}>ALL</button>`;
  Object.keys(colors).forEach((key) => {
    if (!used.has(key)) return;
    const c = colors[key];
    const act = activeColor === key ? "active" : "";
    const style = act ? `style="background:${c.hex};color:#fff"` : "";
    html += `<button class="chip ${act}" data-color="${key}" ${style}><span class="dot" style="background:${c.hex}"></span>${esc(c.label)}</button>`;
  });
  $("#filters").innerHTML = html;
}

function renderGrid() {
  const kw = keyword.trim().toLowerCase();
  const list = DATA.heroes.map((h, i) => ({ h, i })).filter(({ h }) => {
    if (activeColor !== "all" && h.color !== activeColor) return false;
    if (!kw) return true;
    return [h.name, h.name_en, h.code_name, h.catchphrase].some((v) => String(v || "").toLowerCase().includes(kw));
  });
  $("#grid").innerHTML = list.map(({ h, i }) => cardHtml(h, i)).join("");
  $("#empty").hidden = list.length !== 0;
  $("#count").textContent = `全 ${DATA.heroes.length} 名中 ${list.length} 名を表示`;
  hydrateImages($("#grid"));
}

function openModal(slug) {
  const i = DATA.heroes.findIndex((x) => x.slug === slug);
  if (i < 0) return;
  $("#modalCard").innerHTML = detailHtml(DATA.heroes[i], i);
  hydrateImages($("#modalCard"));
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() { $("#modal").hidden = true; document.body.style.overflow = ""; }

function bindApp() {
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    activeColor = b.dataset.color; renderFilters(); renderGrid();
  });
  $("#search").addEventListener("input", (e) => { keyword = e.target.value; renderGrid(); });
  $("#grid").addEventListener("click", (e) => { const c = e.target.closest(".card"); if (c) openModal(c.dataset.slug); });
  $("#modal").addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

/* ---------- 起動：パスワード復号 ---------- */
async function unlock(pw) {
  const meta = await fetch("data/heroes.enc", { cache: "no-store" }).then((r) => r.json());
  const buf = await decryptEnc(meta, pw); // 失敗すれば例外
  DATA = JSON.parse(new TextDecoder().decode(buf));
  PASSWORD = pw;
  if (DATA.meta.subtitle) $("#subtitle").textContent = DATA.meta.subtitle;
  if (DATA.meta.note) $("#notice").title = DATA.meta.note;
  $("#gate").hidden = true;
  $("#app").hidden = false;
  renderFilters();
  renderGrid();
  bindApp();
}

function initGate() {
  const form = $("#gateForm");
  const err = $("#gateErr");
  const btn = $("#gateBtn");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    btn.classList.add("loading");
    const pw = $("#gatePw").value;
    try {
      await unlock(pw);
      try { sessionStorage.setItem("pt_pw", pw); } catch (_) {}
    } catch (_) {
      err.hidden = false;
      $("#gatePw").value = "";
      $("#gatePw").focus();
    } finally {
      btn.classList.remove("loading");
    }
  });
  // 同一セッション中は再入力不要
  let saved = null;
  try { saved = sessionStorage.getItem("pt_pw"); } catch (_) {}
  if (saved) unlock(saved).catch(() => { try { sessionStorage.removeItem("pt_pw"); } catch (_) {} });
}

initGate();
