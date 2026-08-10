// PT HEROES 図鑑 — コミック/データブック調 + パスワード復号
let DATA = { meta: {}, heroes: [] };
let activeColor = "all";
let activeField = "all";
let keyword = "";
let LANG = "ja";     // "ja" | "en"。カード画像は日本語で焼き込み済みなので、切り替わるのは文字情報だけ。
let PASSWORD = null; // 復号後、画像復号のために保持（sessionStorageに保存）

const $ = (s) => document.querySelector(s);

/* ---------- 表示言語 ----------
   Excel由来の英訳は hero.en に入っている（catchphrase / mastery / tactics / hero_role /
   super_power / target_enemy / ai_equipment / soul_hero / secret_data）。
   英訳が無い項目は日本語のまま出す（歯抜けで空欄にしない）。 */
const T = {
  ja: {
    role: "HERO ROLE（ヒーローの特徴）", ability: "UNIQUE ABILITY（固有能力）",
    enemy: "TARGET ENEMY（宿敵）", soul: "SOUL HERO（ソウルヒーロー）", secret: "SECRET DATA",
    mastery: "◆ 専門領域（Mastery）", tactics: "◆ 得意戦術（Tactics）", ai: "◆ AI装備",
    glossary: "◆ 項目の見かた", survey: "◆ アンケートから",
    allField: "すべての領域", count: (t, n) => `全 ${t} 名中 ${n} 名を表示`,
  },
  en: {
    role: "HERO ROLE", ability: "UNIQUE ABILITY",
    enemy: "TARGET ENEMY", soul: "SOUL HERO", secret: "SECRET DATA",
    mastery: "◆ MASTERY", tactics: "◆ TACTICS", ai: "◆ AI EQUIPMENT",
    glossary: "◆ HOW TO READ", survey: "◆ FROM THE SURVEY",
    allField: "All fields", count: (t, n) => `Showing ${n} of ${t}`,
  },
};
const t = (k) => T[LANG][k];

// 「レジリエント・ストラクチャー（複雑に…）」「Root Cause Detection (a vibration that…)」→ {name, desc}
// 末尾が閉じ括弧で、名前部が短く句点を含まないときだけ分割する。それ以外は説明文として扱う。
function splitNamed(s) {
  const v = String(s ?? "").trim();
  if (!v) return null;
  const m = v.match(/^([^（(]{1,60}?)[（(]([\s\S]*)[）)]$/);
  if (!m) return { desc: v };
  const name = m[1].trim();
  if (!name || /[。.]$/.test(name)) return { desc: v };
  return { name, desc: m[2].trim() };
}
// 文字列項目を今の言語で取り出す
function tx(h, key) {
  if (LANG === "en") { const v = (h.en || {})[key]; if (v) return v; }
  return h[key] || "";
}
// 「見出し＋説明」項目を今の言語で取り出す（英訳は1本の文字列なので分割する）
function txSec(h, key) {
  if (LANG === "en") { const v = (h.en || {})[key]; if (v) return splitNamed(v); }
  const o = h[key];
  if (typeof o === "string") return splitNamed(o);
  return o || null;
}

// カード各項目の「見かた」を説明する凡例（ヒーロー個別の内容ではなく項目そのものの解説）
// 表示順はカードに合わせる：HERO ROLE → UNIQUE ABILITY → TARGET ENEMY → SOUL HERO → SECRET DATA
const CARD_GLOSSARY = {
  ja: [
    ["HERO ROLE", "組織の中で担う役割・ポジション。"],
    ["UNIQUE ABILITY", "その人ならではの固有能力。いちばんの武器。"],
    ["TARGET ENEMY", "立ち向かう相手・課題（宿敵）。"],
    ["SOUL HERO", "生き方に共感する、憧れの人物。"],
    ["SECRET DATA", "意外な素顔・裏話。"],
  ],
  en: [
    ["HERO ROLE", "The role this person plays in the organization."],
    ["UNIQUE ABILITY", "Their signature strength — the sharpest weapon they bring."],
    ["TARGET ENEMY", "The problem or pattern they set out to beat."],
    ["SOUL HERO", "The figure whose way of living they identify with."],
    ["SECRET DATA", "An unexpected side of them, off the clock."],
  ],
};

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
// 暗号化イラスト（.enc）を復号して blob URL を返す。
// セッション内キャッシュ：同じ .enc は1回だけ取得・復号し、以降は即返す（モーダル再オープンが即時）。
const _imgCache = new Map(); // path -> Promise<blobURL>
function decryptImage(path) {
  const hit = _imgCache.get(path);
  if (hit) return hit;
  const p = (async () => {
    const meta = await fetch(path, { cache: "no-store" }).then((r) => r.json());
    const buf = await decryptEnc(meta, PASSWORD);
    return URL.createObjectURL(new Blob([buf], { type: meta.mime || "image/png" }));
  })();
  _imgCache.set(path, p);
  p.catch(() => _imgCache.delete(path)); // 失敗はキャッシュしない（次回再試行）
  return p;
}
// グリッド表示後、カード/イラスト画像を背景で先読み復号しておく（クリック時に即表示）。
function preloadImages() {
  const set = new Set();
  for (const h of (DATA.heroes || []))
    for (const p of [h.card, h.illustration, h.portrait_img])
      if (p && p.endsWith(".enc")) set.add(p);
  const paths = [...set].filter((p) => !_imgCache.has(p));
  let idx = 0;
  const kick = () => { if (idx < paths.length) decryptImage(paths[idx++]).catch(() => {}).finally(kick); };
  for (let i = 0; i < 3; i++) kick(); // 同時3本まで
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

// タイル/詳細左の顔ポートレート。顔切り抜き(portrait_img) > 元イラスト > カード画像の順に使う。
// カード画像しか無い人（Excel一括取り込み組）は、カードの上寄りを切り出して顔を見せる（.from-card）。
function portrait(h) {
  const src = h.portrait_img || h.illustration || h.card;
  const fromCard = !h.portrait_img && !h.illustration && h.card ? " from-card" : "";
  if (src) {
    if (src.endsWith(".enc")) {
      // 復号は後追い（data-enc）。まずプレースホルダ。
      return `<div class="ph${fromCard}" data-enc="${esc(src)}"><b>${esc(h.name)}</b><small>復号中…</small></div>`;
    }
    return `<img class="${fromCard.trim()}" src="${esc(src)}" alt="${esc(h.name)}"
      onerror="this.parentNode.innerHTML='<div class=&quot;ph&quot;><b>${esc(h.name)}</b><small>イラスト未設定</small></div>'">`;
  }
  return `<div class="ph"><b>${esc(h.name)}</b><small>イラスト未設定</small></div>`;
}

// 描画後、暗号化イラストを順次復号して差し込む
async function hydrateImages(root) {
  const nodes = [...(root || document).querySelectorAll(".ph[data-enc]")];
  // 逐次ではなく並列で復号（複数タイルが同時に表示される）
  await Promise.all(nodes.map(async (el) => {
    try {
      const url = await decryptImage(el.getAttribute("data-enc"));
      const img = new Image();
      img.src = url; img.alt = "";
      // カード画像を顔タイルとして使う場合の切り出し指定を引き継ぐ
      if (el.classList.contains("from-card")) img.className = "from-card";
      el.replaceWith(img);
    } catch (e) {
      el.innerHTML = "<b>復号エラー</b>";
    }
  }));
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
      <p class="name">${esc(LANG === "en" ? (h.name_en || h.name) : h.name)}<small>${esc(LANG === "en" ? h.name : (h.name_en || ""))}</small></p>
      <p class="catch">${esc(tx(h, "catchphrase"))}</p>
      <div class="badges">
        <span class="badge" style="background:${hex};color:#fff">${esc(colorLabel(h.color))}</span>
      </div>
    </div>
  </article>`;
}

function sectionHtml(label, obj) {
  // 中身（name/desc）が両方空なら見出しごと出さない（不参加者・未入力でも空バッジを残さない）。
  if (!obj || (!obj.name && !obj.desc)) return "";
  const name = obj.name ? `<div class="h-name">${esc(obj.name)}</div>` : "";
  const desc = obj.desc ? `<p>${esc(obj.desc)}</p>` : "";
  return `<div class="sec"><h4><span>${esc(label)}</span></h4>${name}${desc}</div>`;
}

// 図鑑だけに出す項目（カードには刷られていない）：専門領域・得意戦術・AI装備。
// 専門領域と得意戦術は「、」区切りの列挙なのでタグに割る。空なら見出しごと出さない。
function tagsHtml(label, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const items = v.split(/[、,]/).map((s) => s.trim()).filter(Boolean);
  if (items.length < 2) return `<div class="d-zk"><h4>${esc(label)}</h4><p>${esc(v)}</p></div>`;
  return `<div class="d-zk"><h4>${esc(label)}</h4><div class="zk-tags">` +
    items.map((s) => `<span class="zk-tag">${esc(s)}</span>`).join("") + `</div></div>`;
}
function aiHtml(h) {
  const o = txSec(h, "ai_equipment");
  if (!o || (!o.name && !o.desc)) return "";
  const name = o.name ? `<div class="zk-name">${esc(o.name)}</div>` : "";
  const desc = o.desc ? `<p>${esc(o.desc)}</p>` : "";
  return `<div class="d-zk"><h4>${esc(t("ai"))}</h4>${name}${desc}</div>`;
}
// 図鑑限定ブロックをまとめて返す
function zukanOnlyHtml(h) {
  return tagsHtml(t("mastery"), tx(h, "mastery")) + tagsHtml(t("tactics"), tx(h, "tactics")) + aiHtml(h);
}
// カードに刷られている項目（テキスト版）。カード画像が無い人と、EN表示のときに使う。
function cardTextHtml(h) {
  const enemy = tx(h, "target_enemy");
  const secret = tx(h, "secret_data");
  return sectionHtml(t("role"), txSec(h, "hero_role")) +
    sectionHtml(t("ability"), txSec(h, "super_power")) +
    (enemy ? `<div class="sec"><h4><span>${esc(t("enemy"))}</span></h4><p>${esc(enemy)}</p></div>` : "") +
    sectionHtml(t("soul"), txSec(h, "soul_hero")) +
    (secret ? `<div class="sec"><h4><span>${esc(t("secret"))}</span></h4><p>${esc(secret)}</p></div>` : "");
}

// Phase 2: カードに載らないアンケート項目を詳細だけに展開する。
// h.profile は「表示ラベル→値」の順序付きオブジェクト（項目名はデータ側が決める）。
// 空・未設定なら何も出さない（不参加者・未回答でも崩れない）。
function profileHtml(h) {
  const p = h.profile;
  if (!p || typeof p !== "object") return "";
  const rows = Object.keys(p)
    .filter((k) => String(p[k] ?? "").trim() !== "")
    .map((k) => `<div class="pf-row"><dt>${esc(k)}</dt><dd>${esc(p[k])}</dd></div>`)
    .join("");
  if (!rows) return "";
  return `<div class="d-profile"><h4>${esc(t("survey"))}</h4><dl>${rows}</dl></div>`;
}

function detailHtml(h, i) {
  const hex = colorHex(h.color);
  const header = `<div class="d-top">
      <div class="d-num">${no(i)}</div>
      <div class="d-field">[FIELD] ${esc(h.field || "")} — ${esc(colorLabel(h.color))}</div>
      <div class="d-name display">${esc(h.name)} <small>${esc(h.name_en || "")}</small></div>
      <p class="d-catch">${esc(tx(h, "catchphrase"))}</p>
    </div>`;

  // カード画像がある場合：左にカードそのまま、右は図鑑だけの項目＋凡例。
  // ただしカードの文字は日本語で焼き込まれているので、EN表示のときは右に英文の全文も出す。
  if (h.card) {
    const glossary = `<div class="d-glossary">
        <div class="g-head">${esc(t("glossary"))}</div>
        ${CARD_GLOSSARY[LANG].map(([k, v]) => `<div class="g-row"><span class="g-label">${esc(k)}</span><span class="g-desc">${esc(v)}</span></div>`).join("")}
      </div>`;
    const right = LANG === "en"
      ? `${cardTextHtml(h)}${zukanOnlyHtml(h)}${profileHtml(h)}`
      : `${zukanOnlyHtml(h)}${glossary}${profileHtml(h)}`;
    return `<div class="detail detail-card" style="--c:${hex}">
      ${header}
      <div class="d-main">
        <div class="d-left d-left-card">
          <div class="d-cardimg">${encImg(h.card, h.name)}</div>
        </div>
        <div class="d-right d-right-status"><div class="d-side">${right}</div></div>
      </div>
    </div>`;
  }

  // カード画像がまだ無い人：顔＋テキストで同じ内容を出す（並びはカードと同じ）。
  return `<div class="detail" style="--c:${hex}">
    ${header}
    <div class="d-main">
      <div class="d-left">
        <div class="d-portrait">${portrait(h)}</div>
      </div>
      <div class="d-right">${cardTextHtml(h)}${zukanOnlyHtml(h)}${profileHtml(h)}</div>
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
  renderFieldFilter();
}

// FIELD（英字カテゴリ）での絞り込み。人数が増えて色だけでは絞りきれないので別軸で用意する。
function renderFieldFilter() {
  const sel = $("#fieldFilter");
  if (!sel) return;
  const fields = [...new Set(DATA.heroes.map((h) => h.field).filter(Boolean))].sort();
  sel.innerHTML = `<option value="all">${esc(t("allField"))}</option>` +
    fields.map((f) => `<option value="${esc(f)}" ${f === activeField ? "selected" : ""}>${esc(f)}</option>`).join("");
  sel.hidden = fields.length < 2;
}

function renderGrid() {
  const kw = keyword.trim().toLowerCase();
  const list = DATA.heroes.map((h, i) => ({ h, i })).filter(({ h }) => {
    if (activeColor !== "all" && h.color !== activeColor) return false;
    if (activeField !== "all" && h.field !== activeField) return false;
    if (!kw) return true;
    // 日本語・英語どちらで打っても引っかかるようにする（英訳も検索対象に入れる）
    const en = h.en || {};
    return [h.name, h.name_en, h.field, h.catchphrase, h.mastery, h.tactics,
      en.catchphrase, en.mastery, en.tactics]
      .some((v) => String(v || "").toLowerCase().includes(kw));
  });
  $("#grid").innerHTML = list.map(({ h, i }) => cardHtml(h, i)).join("");
  $("#empty").hidden = list.length !== 0;
  $("#count").textContent = t("count")(DATA.heroes.length, list.length);
  hydrateImages($("#grid"));
}

let openSlug = null; // 言語を切り替えたとき、開いている詳細を描き直すために覚えておく
function openModal(slug) {
  const i = DATA.heroes.findIndex((x) => x.slug === slug);
  if (i < 0) return;
  openSlug = slug;
  $("#modalCard").innerHTML = detailHtml(DATA.heroes[i], i);
  hydrateImages($("#modalCard"));
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() { $("#modal").hidden = true; openSlug = null; document.body.style.overflow = ""; }

// 表示言語の切り替え。開いている詳細もその場で描き直す。
function setLang(lang) {
  LANG = lang === "en" ? "en" : "ja";
  try { sessionStorage.setItem("pt_lang", LANG); } catch (_) {}
  document.documentElement.lang = LANG;
  document.querySelectorAll("#langToggle button").forEach((b) => b.classList.toggle("on", b.dataset.lang === LANG));
  renderFieldFilter();
  renderGrid();
  if (openSlug) openModal(openSlug);
}

function bindApp() {
  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    activeColor = b.dataset.color; renderFilters(); renderGrid();
  });
  $("#fieldFilter").addEventListener("change", (e) => { activeField = e.target.value; renderGrid(); });
  $("#langToggle").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setLang(b.dataset.lang); });
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
  try { LANG = sessionStorage.getItem("pt_lang") === "en" ? "en" : "ja"; } catch (_) {}
  document.documentElement.lang = LANG;
  document.querySelectorAll("#langToggle button").forEach((b) => b.classList.toggle("on", b.dataset.lang === LANG));
  renderFilters();
  renderGrid();
  bindApp();
  preloadImages(); // カード画像を背景で先読み → モーダルが即開く
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
