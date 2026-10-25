import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { WHATDAY } from "./whatday.js";

const STORE_KEY = "omikuji-result";
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const DEFAULT_PIN = "0501";

// Firestore にまだ設定が無いときに使う初期値
const DEFAULTS = {
  title: "今日の小池みくじ",
  name: "ななか",
  startDate: "2025-04-01",
  fortunes: [
    { name: "大吉", weight: 15, color: "#d4372c" },
    { name: "中吉", weight: 25, color: "#e0752d" },
    { name: "吉", weight: 30, color: "#c99a1e" },
    { name: "末吉", weight: 20, color: "#5b8c5a" },
    { name: "凶", weight: 10, color: "#5a6b8c" },
  ],
  photoIds: [],
  messages: [
    "最高の一日！何をやってもうまくいく予感",
    "いい流れが来ています。自信をもって進もう",
    "穏やかで心地よい一日になりそう",
    "後半になるほど運気上昇。焦らずゆっくりね",
    "ちょっと注意の日。でも大丈夫、そばにいるよ",
  ],
  advice: [
    "気になっていたことに挑戦してみて。今日ならきっと叶うよ",
    "笑顔がいちばんの開運アイテム。たくさん笑ってね",
    "欲しかったものを買うなら今日がチャンス",
    "思い切って新しいお店に行ってみると良い出会いがあるかも",
    "いつもより少しだけ早起きすると、一日がうまく回るよ",
    "身近な人に「ありがとう」を伝えると運気アップ",
    "お気に入りの服を着て出かけてみて",
    "直感を信じて選んだものが当たりになりそう",
    "あたたかい飲み物でひと休みすると心が整うよ",
    "部屋を少し片付けると、良い運が入ってくるよ",
    "好きな音楽を聴いて気分を上げていこう",
    "いつもの道を少し変えてみると小さな発見があるかも",
    "午前中は無理せず、午後から本気を出そう",
    "小さなご褒美を用意しておくと頑張れるよ",
    "早めに寝て、明日の自分にパスしよう",
    "深呼吸を3回。それだけで流れが変わるよ",
    "忘れ物に注意！出かける前にもう一度チェックしてね",
    "今日は無理せず、甘いものを食べてのんびりしよう",
    "困ったらすぐ連絡してね。いつでも味方だよ",
    "凶は「これから上がるだけ」のサイン。明日はきっといい日",
  ],
  luckyColors: [
    { name: "さくらピンク", code: "#f4a7b9" }, { name: "スカイブルー", code: "#7cc3f0" },
    { name: "ミントグリーン", code: "#98dcc0" }, { name: "レモンイエロー", code: "#f7e36a" },
    { name: "ラベンダー", code: "#b9a4e0" }, { name: "コーラルオレンジ", code: "#f69a7a" },
    { name: "ホワイト", code: "#ffffff" }, { name: "ネイビー", code: "#2c3e6b" },
    { name: "ボルドー", code: "#7b2639" }, { name: "ベージュ", code: "#e3cfb0" },
    { name: "ゴールド", code: "#d4af37" }, { name: "シルバー", code: "#c0c4cc" },
  ],
  luckyItems: [
    "ハンカチ", "リップクリーム", "イヤリング", "お気に入りのマグカップ", "チョコレート",
    "手帳", "ヘアゴム", "ハンドクリーム", "腕時計", "スニーカー", "マフラー", "香水",
    "いちご", "プリン", "コーヒー", "本", "写真", "ぬいぐるみ", "キャンドル", "折りたたみ傘",
  ],
  specialDays: [],
};

// ---------- Firebase ----------
const configured = !!firebaseConfig.projectId && !/貼り付け/.test(firebaseConfig.apiKey);
const fb = configured ? (() => {
  const app = initializeApp(firebaseConfig);
  return { db: getFirestore(app), auth: getAuth(app) };
})() : null;

let CONFIG = structuredClone(DEFAULTS);
const photoCache = new Map();

async function loadSettings() {
  if (!fb) return;
  try {
    const snap = await getDoc(doc(fb.db, "settings", "main"));
    if (snap.exists()) CONFIG = { ...structuredClone(DEFAULTS), ...snap.data() };
  } catch (e) {
    console.error(e);
  }
}

async function loadPhoto(id) {
  if (!id) return "";
  if (photoCache.has(id)) return photoCache.get(id);
  if (!fb) return "";
  try {
    const snap = await getDoc(doc(fb.db, "photos", id));
    const data = snap.exists() ? snap.data().data : "";
    photoCache.set(id, data);
    return data;
  } catch (e) {
    return "";
  }
}

// ---------- 小道具 ----------
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const p2 = x => String(x).padStart(2, "0");
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
function toast(text) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// 日付から決まる乱数。同じ日なら何度引いても同じ結果になる
function dayRandom(key) {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) { h = Math.imul(h ^ key.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(list, rnd) {
  const w = f => Math.max(0, Number(f.weight) || 0);
  const total = list.reduce((s, f) => s + w(f), 0);
  if (total <= 0) return pick(list, rnd);
  let r = rnd() * total;
  for (const f of list) { r -= w(f); if (r < 0) return f; }
  return list[list.length - 1];
}

const now = new Date();
const todayKey = dayKey(now);
const fortunes = () => (CONFIG.fortunes || []).filter(f => f && f.name);

// ================= メイン画面 =================
function renderMain() {
  const m = now.getMonth() + 1, d = now.getDate();
  document.title = CONFIG.title || "今日のおみくじ";
  const specials = (CONFIG.specialDays || []).filter(s => Number(s.month) === m && Number(s.day) === d);
  let since = "";
  if (CONFIG.startDate) {
    const start = new Date(CONFIG.startDate + "T00:00:00");
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), d) - start) / 86400000) + 1;
    if (days > 0) since = `付き合って ${days.toLocaleString()} 日目`;
  }

  $("#app").innerHTML = `
    <div class="wrap">
      <header>
        <div class="date">${now.getFullYear()}年${m}月${d}日（${WEEK[now.getDay()]}）</div>
        <h1>${esc(CONFIG.title || "今日のおみくじ")}</h1>
        <div class="greet">${esc(CONFIG.name || "")}、今日も一日がんばろうね</div>
      </header>
      <section class="card">
        <div class="label">今日は何の日？</div>
        <div class="whatday-main">${esc(WHATDAY[`${m}-${d}`] || "なんでもない、でも大切な一日")}</div>
        ${specials.map(s => {
          const y = Number(s.year) ? now.getFullYear() - Number(s.year) : 0;
          return `<div class="special">${esc(s.text)}${y > 0 ? `（${y}周年）` : ""}</div>`;
        }).join("")}
        ${since ? `<div class="since">${since}</div>` : ""}
      </section>
      <div id="fortuneArea"></div>
      <div class="footer"><button class="link-btn" id="toSettings" type="button">設定モードへ</button></div>
    </div>`;
  $("#toSettings").addEventListener("click", openPin);

  const saved = store.get(STORE_KEY);
  if (saved && saved.date === todayKey) renderResult(saved, false);
  else renderDraw();
}

function renderDraw() {
  $("#fortuneArea").innerHTML = `
    <section class="card draw">
      <div class="box" id="box"><span>御神籤</span></div>
      <button class="btn-primary" id="drawBtn" type="button">おみくじを引く</button>
      <div class="hint">おみくじは1日1回だけ引けます</div>
    </section>`;
  $("#drawBtn").addEventListener("click", () => {
    const list = fortunes();
    if (!list.length) return;
    $("#drawBtn").disabled = true;
    $("#box").classList.add("shake");
    setTimeout(() => {
      // 要素ごとに別々の乱数で選ぶ（どれかのリストを変えても他は変わらない）
      const rnd = name => dayRandom(`omikuji|${todayKey}|${name}`);
      const f = pickWeighted(list, rnd("rank"));
      const colors = (CONFIG.luckyColors || []).filter(c => c && c.name);
      const items = (CONFIG.luckyItems || []).filter(Boolean);
      const photoIds = (CONFIG.photoIds || []).filter(Boolean);
      const msgs = CONFIG.messages || [];
      const adv = CONFIG.advice || [];
      const r = {
        date: todayKey,
        rank: f.name,
        rankColor: f.color,
        photoId: photoIds.length ? pick(photoIds, rnd("photo")) : "",
        message: msgs.length ? pick(msgs, rnd("message")) : "",
        advice: adv.length ? pick(adv, rnd("advice")) : "今日も素敵な一日を",
        color: colors.length ? pick(colors, rnd("color")) : { name: "-", code: "#ffffff" },
        item: items.length ? pick(items, rnd("item")) : "-",
      };
      store.set(STORE_KEY, r);
      renderResult(r, true);
    }, 1000);
  });
}

let tickTimer = null;
function renderResult(r, animate) {
  const f = fortunes().find(x => x.name === r.rank);
  const color = (f && f.color) || r.rankColor || "#c8352a";
  const fallback = `<div class="photo-fallback" style="background:linear-gradient(135deg, ${esc(color)}, ${esc(color)}aa)">${esc(r.rank)}</div>`;
  $("#fortuneArea").innerHTML = `
    <div class="${animate ? "rise" : ""}" style="display:flex;flex-direction:column;gap:16px">
      <section class="card slip">
        <div class="slip-head">
          <div class="label">今日の運勢</div>
          <div class="rank" style="color:${esc(color)}">${esc(r.rank)}</div>
          ${r.message ? `<div class="msg">${esc(r.message)}</div>` : ""}
        </div>
        <div id="photoSlot">${fallback}</div>
      </section>
      <div class="grid2">
        <section class="card">
          <div class="label">ラッキーカラー</div>
          <div class="swatch-row"><div class="swatch" style="background:${esc(r.color.code)}"></div><div class="value">${esc(r.color.name)}</div></div>
        </section>
        <section class="card">
          <div class="label">ラッキーアイテム</div>
          <div class="value">${esc(r.item)}</div>
        </section>
      </div>
      <section class="card">
        <div class="label">アドバイス</div>
        <div class="advice-text">${esc(r.advice)}</div>
      </section>
      <section class="card tomorrow">
        また明日ね。次のおみくじまで
        <div class="countdown" id="countdown"></div>
      </section>
    </div>`;
  if (r.photoId) {
    loadPhoto(r.photoId).then(src => {
      const slot = $("#photoSlot");
      if (src && slot) slot.innerHTML = `<img class="photo" src="${esc(src)}" alt="${esc(r.rank)}の写真">`;
    });
  }
  if (animate && (r.rank === "大吉" || r.rank === "中吉")) petals(r.rank === "大吉" ? 60 : 30);
  clearInterval(tickTimer);
  tick();
  tickTimer = setInterval(tick, 1000);
}

function tick() {
  const el = $("#countdown");
  if (!el) return;
  const n = new Date();
  if (dayKey(n) !== todayKey) { location.reload(); return; }
  const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
  const s = Math.max(0, Math.floor((next - n) / 1000));
  el.textContent = `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}`;
}

function petals(count) {
  let layer = $(".petals");
  if (!layer) { layer = document.createElement("div"); layer.className = "petals"; document.body.appendChild(layer); }
  const colors = ["#f8b4c4", "#fcd5de", "#f4a7b9", "#ffe08a"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "petal";
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", (Math.random() * 160 - 80) + "px");
    p.style.animationDuration = 3 + Math.random() * 3 + "s";
    p.style.animationDelay = Math.random() * 1.5 + "s";
    layer.appendChild(p);
    setTimeout(() => p.remove(), 8000);
  }
}

// ================= 暗証番号 =================
// 暗証番号は Firestore の secret/pin に隠してあり、照合は Firebase 側のルールで行う。
// 正しい番号を入れた端末だけが unlocks/{uid} を書けて、設定の保存が許可される。
async function unlockWithPin(pin) {
  if (!fb) return pin === DEFAULT_PIN; // Firebase 未設定のお試し表示
  if (!fb.auth.currentUser) await signInAnonymously(fb.auth);
  const ref = doc(fb.db, "unlocks", fb.auth.currentUser.uid);
  try {
    await setDoc(ref, { pin, at: serverTimestamp() });
    return true;
  } catch (e) {
    if (e.code !== "permission-denied") throw e;
  }
  // 初回だけ：まだ暗証番号が登録されていなければ初期値 0501 を登録してから再挑戦
  if (pin !== DEFAULT_PIN) return false;
  try { await setDoc(doc(fb.db, "secret", "pin"), { value: DEFAULT_PIN }); } catch (e) { return false; }
  try { await setDoc(ref, { pin, at: serverTimestamp() }); return true; } catch (e) { return false; }
}

function openPin() {
  if ($(".overlay") || $("#settings")) return;
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `
    <form class="card pin-card" id="pinForm" autocomplete="off">
      <div class="pin-title">設定モード</div>
      <label for="pinInput" style="font-size:14px;color:var(--muted)">4桁の暗証番号を入力してください</label>
      <input class="pin-input" id="pinInput" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off">
      <div class="pin-error" id="pinError" aria-live="polite"></div>
      <div class="row-btns">
        <button class="btn" type="button" id="pinCancel">やめる</button>
        <button class="btn red" type="submit" id="pinOk">開く</button>
      </div>
    </form>`;
  document.body.appendChild(ov);
  const input = $("#pinInput");
  setTimeout(() => input.focus(), 50);
  const close = () => ov.remove();
  $("#pinCancel").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 4); });
  let busy = false;
  $("#pinForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("#pinOk").disabled = true;
    $("#pinError").textContent = "確認しています…";
    let ok = false;
    try {
      ok = await unlockWithPin(input.value);
    } catch (err) {
      console.error(err);
      $("#pinError").textContent = "通信できませんでした。電波の良いところでもう一度お試しください";
      busy = false; $("#pinOk").disabled = false;
      return;
    }
    busy = false; $("#pinOk").disabled = false;
    if (ok) { close(); openSettings(input.value); return; }
    $("#pinError").textContent = "暗証番号が違います";
    const card = $("#pinForm");
    card.classList.remove("ng"); void card.offsetWidth; card.classList.add("ng");
    input.value = ""; input.focus();
  });
}

// ================= 設定画面 =================
let draft = null;
let unlockedPin = ""; // 設定モードを開いたときの暗証番号（変更されたかの判定用）

async function openSettings(currentPin) {
  if ($("#settings")) return;
  unlockedPin = currentPin;
  draft = structuredClone(CONFIG);
  draft.pin = currentPin;
  draft.photos = [];
  const el = document.createElement("div");
  el.className = "settings";
  el.id = "settings";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "設定");
  el.innerHTML = `<div class="wrap"><div class="loading">設定を読み込み中…</div></div>`;
  document.body.appendChild(el);
  document.body.style.overflow = "hidden";
  const ids = (CONFIG.photoIds || []).filter(Boolean);
  const datas = await Promise.all(ids.map(loadPhoto));
  draft.photos = ids.map((id, i) => ({ id, data: datas[i] })).filter(p => p.data);
  renderSettings();
}

function closeSettings() {
  const el = $("#settings"); if (el) el.remove();
  const bar = $(".savebar"); if (bar) bar.remove();
  document.body.style.overflow = "";
  draft = null;
}

function renderSettings() {
  const el = $("#settings");
  const totalW = draft.fortunes.reduce((s, f) => s + Math.max(0, Number(f.weight) || 0), 0);
  el.innerHTML = `
    <div class="wrap">
      <div class="s-head">
        <h2>設定モード</h2>
        <button class="btn small" type="button" id="sClose">閉じる</button>
      </div>
      ${fb ? "" : `<section class="card s-section"><p class="s-note" style="margin:0;color:var(--accent)">Firebase の接続情報がまだ入っていないため、保存はできません（お試し表示です）。firebase-config.js を設定してください。</p></section>`}

      <section class="card s-section">
        <h3>基本</h3>
        <label class="field"><span>タイトル</span><input type="text" id="s-title" value="${esc(draft.title)}"></label>
        <label class="field"><span>呼び名（あいさつに表示）</span><input type="text" id="s-name" value="${esc(draft.name)}"></label>
        <label class="field"><span>付き合い始めた日（入れると「付き合って○日目」を表示）</span><input type="date" id="s-start" value="${esc(draft.startDate || "")}"></label>
        <label class="field"><span>設定モードの暗証番号（4桁の数字）</span><input type="text" id="s-pin" inputmode="numeric" maxlength="4" value="${esc(draft.pin)}"></label>
      </section>

      <section class="card s-section">
        <h3>運勢と出る確率</h3>
        <p class="s-note">「出やすさ」は比率です。合計が100でなくても、自動で割合に直します。運勢・写真・ひとこと・アドバイス・ラッキーカラー・アイテムは、それぞれ別々にランダムで選ばれます（同じ日なら何度開いても同じ結果です）。</p>
        <div class="total" id="s-total">合計 ${totalW}</div>
        ${draft.fortunes.map((f, i) => `
          <div class="fortune-edit" data-i="${i}">
            <div class="fe-top">
              <label class="field"><span>運勢</span><input type="text" data-k="name" value="${esc(f.name)}"></label>
              <label class="field"><span>出やすさ</span><input type="number" min="0" step="1" data-k="weight" value="${esc(f.weight)}"><div class="pct" data-pct></div></label>
              <label class="field"><span>色</span><input type="color" data-k="color" value="${esc(f.color || "#c8352a")}"></label>
            </div>
          </div>`).join("")}
      </section>

      <section class="card s-section">
        <h3>写真</h3>
        <p class="s-note">毎日この中から1枚選ばれます。何枚でも追加できます（まとめて選択もできます）。写真がないときは運勢の文字が大きく表示されます。</p>
        <div class="photo-grid">
          ${draft.photos.map((p, i) => `
            <div class="photo-cell">
              <img src="${esc(p.data)}" alt="写真${i + 1}">
              <button class="del" type="button" data-rmphoto="${i}" aria-label="写真${i + 1}を外す">×</button>
            </div>`).join("")}
        </div>
        <label class="btn small file-label">＋ 写真を追加<input type="file" accept="image/*" multiple id="s-photo-add"></label>
      </section>

      <section class="card s-section">
        <h3>ひとこと</h3>
        <p class="s-note">運勢の下に出る一言です。1行に1つずつ書いてください。</p>
        <textarea id="s-messages">${esc(draft.messages.join("\n"))}</textarea>
      </section>

      <section class="card s-section">
        <h3>アドバイス</h3>
        <p class="s-note">1行に1つずつ書いてください。</p>
        <textarea id="s-advice" style="min-height:200px">${esc(draft.advice.join("\n"))}</textarea>
      </section>

      <section class="card s-section">
        <h3>ラッキーカラー</h3>
        <p class="s-note">名前と色を選んでください。毎日この中から1つ選ばれます。</p>
        <div id="s-colors">
          ${draft.luckyColors.map((c, i) => `
            <div class="list-row" data-ci="${i}">
              <input type="color" data-k="code" value="${esc(c.code || "#ffffff")}" aria-label="色">
              <input type="text" data-k="name" value="${esc(c.name)}" aria-label="色の名前">
              <button class="del" type="button" data-delcolor="${i}" aria-label="削除">×</button>
            </div>`).join("")}
        </div>
        <button class="btn small" type="button" id="s-addcolor">＋ 色を追加</button>
      </section>

      <section class="card s-section">
        <h3>ラッキーアイテム</h3>
        <p class="s-note">1行に1つずつ書いてください。</p>
        <textarea id="s-items" style="min-height:200px">${esc(draft.luckyItems.join("\n"))}</textarea>
      </section>

      <section class="card s-section">
        <h3>特別な日</h3>
        <p class="s-note">誕生日や記念日を登録すると、その日の「今日は何の日？」に表示されます。始まりの年を入れると「○周年」も付きます。</p>
        <div class="sd-row sd-head"><span>月</span><span>日</span><span>内容</span><span>始まりの年</span><span></span></div>
        <div id="s-days">
          ${draft.specialDays.map((s, i) => `
            <div class="sd-row" data-si="${i}">
              <input type="number" min="1" max="12" data-k="month" value="${esc(s.month)}" aria-label="月">
              <input type="number" min="1" max="31" data-k="day" value="${esc(s.day)}" aria-label="日">
              <input type="text" data-k="text" value="${esc(s.text)}" aria-label="内容" placeholder="例：お誕生日">
              <input class="sd-year" type="number" min="1900" max="2100" data-k="year" value="${esc(s.year || "")}" aria-label="始まりの年" placeholder="年（任意）">
              <button class="del" type="button" data-delday="${i}" aria-label="削除">×</button>
            </div>`).join("")}
        </div>
        <button class="btn small" type="button" id="s-addday">＋ 特別な日を追加</button>
      </section>

      <section class="card s-section">
        <h3>この端末の今日の結果</h3>
        <p class="s-note">テスト用です。この端末を「まだ引いていない」状態に戻します（彼女さんの端末には影響しません）。設定を変えていなければ、引き直しても今日は同じ結果になります。</p>
        <button class="btn small" type="button" id="s-reset">今日の結果をリセット</button>
      </section>
    </div>`;

  let bar = $(".savebar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "savebar";
    bar.innerHTML = `<div class="savebar-in"><div class="save-msg" id="saveMsg" aria-live="polite">保存すると、彼女さんの画面にも反映されます</div><button class="btn red" type="button" id="saveBtn">保存する</button></div>`;
    document.body.appendChild(bar);
    $("#saveBtn").addEventListener("click", saveSettings);
  }

  updatePct();
  $("#sClose").addEventListener("click", closeSettings);
  el.addEventListener("input", e => { if (e.target.dataset.k === "weight") updatePct(); });
  $("#s-photo-add").addEventListener("change", onPhoto);
  $$("[data-rmphoto]", el).forEach(b => b.addEventListener("click", () => {
    collect(); draft.photos.splice(Number(b.dataset.rmphoto), 1); renderSettings();
  }));
  $$("[data-delcolor]", el).forEach(b => b.addEventListener("click", () => {
    collect(); draft.luckyColors.splice(Number(b.dataset.delcolor), 1); renderSettings();
  }));
  $$("[data-delday]", el).forEach(b => b.addEventListener("click", () => {
    collect(); draft.specialDays.splice(Number(b.dataset.delday), 1); renderSettings();
  }));
  $("#s-addcolor").addEventListener("click", () => {
    collect(); draft.luckyColors.push({ name: "", code: "#f4a7b9" }); renderSettings();
  });
  $("#s-addday").addEventListener("click", () => {
    collect(); draft.specialDays.push({ month: now.getMonth() + 1, day: now.getDate(), text: "" }); renderSettings();
  });
  $("#s-reset").addEventListener("click", () => {
    store.del(STORE_KEY); toast("この端末の今日の結果をリセットしました"); renderMain();
  });
}

function updatePct() {
  const rows = $$(".fortune-edit");
  const ws = rows.map(r => Math.max(0, Number($('[data-k="weight"]', r).value) || 0));
  const total = ws.reduce((a, b) => a + b, 0);
  rows.forEach((r, i) => { $("[data-pct]", r).textContent = total ? `約 ${(ws[i] / total * 100).toFixed(1)}%` : "-"; });
  const t = $("#s-total"); if (t) t.textContent = `合計 ${total}`;
}

function collect() {
  const lines = v => v.split("\n").map(s => s.trim()).filter(Boolean);
  draft.title = $("#s-title").value.trim();
  draft.name = $("#s-name").value.trim();
  draft.startDate = $("#s-start").value;
  draft.pin = $("#s-pin").value.trim();
  $$(".fortune-edit").forEach(r => {
    const f = draft.fortunes[Number(r.dataset.i)];
    f.name = $('[data-k="name"]', r).value.trim();
    f.weight = Math.max(0, Number($('[data-k="weight"]', r).value) || 0);
    f.color = $('[data-k="color"]', r).value;
  });
  draft.messages = lines($("#s-messages").value);
  draft.advice = lines($("#s-advice").value);
  draft.luckyColors = $$("[data-ci]").map(r => ({ name: $('[data-k="name"]', r).value.trim(), code: $('[data-k="code"]', r).value }));
  draft.luckyItems = lines($("#s-items").value);
  draft.specialDays = $$("[data-si]").map(r => {
    const o = { month: Number($('[data-k="month"]', r).value) || 0, day: Number($('[data-k="day"]', r).value) || 0, text: $('[data-k="text"]', r).value.trim() };
    const y = Number($('[data-k="year"]', r).value);
    if (y) o.year = y;
    return o;
  });
}

// 写真を長辺1000pxのJPEGに縮める（Firestore の1件あたりの上限に収めるため）
function shrinkPhoto(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function onPhoto(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  collect();
  setSaveMsg("写真を読み込んでいます…", "");
  const results = await Promise.all(files.map(shrinkPhoto));
  const ok = results.filter(Boolean);
  draft.photos.push(...ok.map(data => ({ id: null, data })));
  renderSettings();
  const failed = results.length - ok.length;
  if (failed) setSaveMsg(`${failed}枚は読み込めませんでした。JPEG か PNG の写真を選んでください`, "err");
  else setSaveMsg(`写真を${ok.length}枚追加しました。「保存する」で反映されます`, "");
}

function setSaveMsg(text, cls) {
  const m = $("#saveMsg"); if (!m) return;
  m.textContent = text; m.className = "save-msg" + (cls ? " " + cls : "");
}

function validate(c) {
  if (!/^\d{4}$/.test(c.pin)) return "暗証番号は4桁の数字にしてください";
  if (!c.fortunes.every(f => f.name)) return "運勢の名前が空になっています";
  if (c.fortunes.reduce((s, f) => s + f.weight, 0) <= 0) return "出やすさの合計が0です。どれかに数字を入れてください";
  if (!c.luckyColors.length) return "ラッキーカラーを1つ以上入れてください";
  if (!c.luckyItems.length) return "ラッキーアイテムを1つ以上入れてください";
  if (c.specialDays.some(s => s.month < 1 || s.month > 12 || s.day < 1 || s.day > 31)) return "特別な日の月・日を確認してください";
  return "";
}

async function saveSettings() {
  collect();
  draft.specialDays = draft.specialDays.filter(s => s.text);
  draft.luckyColors = draft.luckyColors.filter(c => c.name);
  const problem = validate(draft);
  if (problem) { setSaveMsg(problem, "err"); return; }
  if (!fb) { setSaveMsg("Firebase の接続情報がまだ入っていないため保存できません", "err"); return; }

  const btn = $("#saveBtn");
  btn.disabled = true;
  setSaveMsg("保存しています…", "");
  try {
    // 新しい写真を1枚ずつ保存し、外した写真は消す
    for (const p of draft.photos) {
      if (p.id) continue;
      const ref = doc(collection(fb.db, "photos"));
      await setDoc(ref, { data: p.data, at: serverTimestamp() });
      p.id = ref.id;
      photoCache.set(ref.id, p.data);
    }
    const keep = new Set(draft.photos.map(p => p.id));
    for (const id of CONFIG.photoIds || []) {
      if (!keep.has(id)) await deleteDoc(doc(fb.db, "photos", id)).catch(() => {});
    }

    const { pin, photos, ...rest } = draft;
    const settings = { ...rest, photoIds: draft.photos.map(p => p.id), updatedAt: serverTimestamp() };
    await setDoc(doc(fb.db, "settings", "main"), settings);

    // 暗証番号を変えたときは、隠し場所の番号とこの端末の解錠情報も新しい番号にそろえる
    if (pin !== unlockedPin) {
      await setDoc(doc(fb.db, "secret", "pin"), { value: pin });
      await setDoc(doc(fb.db, "unlocks", fb.auth.currentUser.uid), { pin, at: serverTimestamp() });
    }
    unlockedPin = pin;

    CONFIG = { ...structuredClone(DEFAULTS), ...settings };
    closeSettings();
    renderMain();
    toast("設定を保存しました");
  } catch (err) {
    console.error(err);
    if (err && err.code === "permission-denied") {
      setSaveMsg("保存が許可されませんでした。設定モードを開き直して、暗証番号をもう一度入れてください", "err");
    } else if (err && err.code === "invalid-argument") {
      setSaveMsg("写真が大きすぎて保存できませんでした。別の写真でお試しください", "err");
    } else {
      setSaveMsg("保存できませんでした。電波の良いところでもう一度押してください", "err");
    }
    btn.disabled = false;
  }
}

// ================= 起動 =================
await loadSettings();
renderMain();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && dayKey(new Date()) !== todayKey) location.reload();
});
