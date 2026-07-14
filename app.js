// PT HEROES 図鑑 — コミック/データブック調 + パスワード復号
let DATA = { meta: {}, heroes: [] };
let activeColor = "all";
let keyword = "";
let PASSWORD = null; // 復号後、画像復号のために保持（sessionStorageに保存）

const $ = (s) => document.querySelector(s);

// カード各項目の「見かた」を説明する凡例（ヒーロー個別の内容ではなく項目そのものの解説）
// 表示順はカードに合わせる：HERO ROLE → UNIQUE ABILITY → TARGET ENEMY → SOUL HERO → SECRET DATA
const CARD_GLOSSARY = [
  ["HERO ROLE", "組織の中で担う役割・ポジション。"],
  ["UNIQUE ABILITY", "その人ならではの固有能力。いちばんの武器。"],
  ["TARGET ENEMY", "立ち向かう相手・課題（宿敵）。"],
  ["SOUL HERO", "生き方に共感する、憧れの人物。"],
  ["SECRET DATA", "意外な素顔・裏話。"],
];

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
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}
function no(i) { return "No." + String(i + 1).padStart(3, "0"); }

// 暗号化画像(.enc)のプレースホルダ（hydrateImagesが復号して差し込む）
function encImg(path, name) {
  return `<div class="ph" data-enc="${esc(path)}"><b>${esc(name)}</b><small>復号中…</small></div>`;
}

// タイル/詳細左の顔ポートレート。顔切り抜き(portrait_img)を優先し、無ければ元イラスト。
function portrait(h) {
  const src = h.portrait_img || h.illustration;
  if (src) {
    if (src.endsWith(".enc")) {
      // 復号は後追い（data-enc）。まずプレースホルダ。
      return `<div class="ph" data-enc="${esc(src)}"><b>${esc(h.name)}</b><small>復号中…</small></div>`;
    }
    return `<img src="${esc(src)}" alt="${esc(h.name)}"
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
  // 一覧タイルは全ヒーロー共通スタイル（顔ポートレート＋メタ）。カード全体はクリック後に表示。
  return `<article class="card" style="--c:${hex}" data-slug="${esc(h.slug)}">
    <div class="num">${no(i)}</div>
    <div class="portrait">
      ${portrait(h)}
      <div class="field-tab">${esc(h.field || "")}</div>
    </div>
    <div class="meta">
      <p class="name">${esc(h.name)}<small>${esc(h.name_en || "")}</small></p>
      <p class="catch">${esc(h.catchphrase || "")}</p>
      <div class="badges">
        <span class="badge" style="background:${hex};color:#fff">${esc(colorLabel(h.color))}</span>
      </div>
    </div>
  </article>`;
}

function sectionHtml(label, obj) {
  if (!obj) return "";
  const name = obj.name ? `<div class="h-name">${esc(obj.name)}</div>` : "";
  const desc = obj.desc ? `<p>${esc(obj.desc)}</p>` : "";
  return `<div class="sec"><h4><span>${esc(label)}</span></h4>${name}${desc}</div>`;
}

function detailHtml(h, i) {
  const hex = colorHex(h.color);
  const secret = h.secret_data ? `<div class="sec"><h4><span>SECRET DATA</span></h4><p>${esc(h.secret_data)}</p></div>` : "";
  // 宿敵（文字列・新規）。値があるときだけ描く。
  const targetEnemy = h.target_enemy
    ? `<div class="sec"><h4><span>TARGET ENEMY（宿敵）</span></h4><p>${esc(h.target_enemy)}</p></div>`
    : "";
  const header = `<div class="d-top">
      <div class="d-num">${no(i)}</div>
      <div class="d-field">[FIELD] ${esc(h.field || "")} — ${esc(colorLabel(h.color))}</div>
      <div class="d-name display">${esc(h.name)} <small>${esc(h.name_en || "")}</small></div>
    </div>`;
  // セクション順：Hero Role → Unique Ability → Target Enemy → Soul Hero → Secret Data
  const rightContent = `${sectionHtml("HERO ROLE", h.hero_role)}
        ${sectionHtml("UNIQUE ABILITY（固有能力）", h.super_power)}
        ${targetEnemy}
        ${sectionHtml("SOUL HERO", h.soul_hero)}
        ${secret}`;
  // フルカード画像がある場合：左にカードそのまま表示、右は「項目の見かた（凡例）」で占有
  // （各項目の中身はカード画像に載っているため、右は凡例に集中させる）
  if (h.card) {
    const glossary = `<div class="d-glossary">
        <div class="g-head">◆ 項目の見かた</div>
        ${CARD_GLOSSARY.map(([k, v]) => `<div class="g-row"><span class="g-label">${esc(k)}</span><span class="g-desc">${esc(v)}</span></div>`).join("")}
      </div>`;
    const bigStatus = `<div class="d-status-big">${glossary}</div>`;
    return `<div class="detail detail-card" style="--c:${hex}">
      ${header}
      <div class="d-main">
        <div class="d-left d-left-card">
          <div class="d-cardimg">${encImg(h.card, h.name)}</div>
        </div>
        <div class="d-right d-right-status">${bigStatus}</div>
      </div>
    </div>`;
  }
  return `<div class="detail" style="--c:${hex}">
    ${header}
    <div class="d-main">
      <div class="d-left">
        <div class="d-portrait">${portrait(h)}</div>
      </div>
      <div class="d-right">${rightContent}</div>
    </div>
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
