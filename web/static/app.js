// AI 奧客應對演練 —— 前端邏輯(vanilla JS,呼叫 /api/*)。
// 選關卡採 AKARU 式橫向場景:滾輪 deltaY → 全幅水平平移(lerp 緩動)。

const $ = (s) => document.querySelector(s);
const el = (h) => { const t = document.createElement("template"); t.innerHTML = h.trim(); return t.content.firstChild; };

const GENRE_STYLE = {
  "餐飲": { grad: "#b692a1", emoji: "🍜" },   // AKARU 藕粉
  "零售": { grad: "#b3c2ce", emoji: "🛍️" },   // 灰藍(由 #bfccd8 微調深;接近原色)
};
const styleFor = (g) => GENRE_STYLE[g] || { grad: "#798e7b", emoji: "😤" };  // AKARU 灰綠
const angerColor = (a) => (a >= 70 ? "#FE494A" : a >= 40 ? "#f39c12" : "#2e9e6b");

// 難度 → 顏色 / 標籤 / 排序 / 休息態寬度(藍簡單最寬 → 綠困難最窄)。關卡顏色全程以難度為準。
const DIFF_STYLE = {
  easy:   { grad: "#8ca2b4", label: "簡單", rank: 0, rest: 0.20 },   // 藍:寬
  normal: { grad: "#b692a1", label: "中等", rank: 1, rest: 0.16 },   // 粉:中
  hard:   { grad: "#798e7b", label: "困難", rank: 2, rest: 0.12 },   // 綠:窄(三關 0.48 填滿標題右側)
};
const diffStyle = (d) => DIFF_STYLE[d] || DIFF_STYLE.normal;

// 情緒 → 立繪。優先用手繪圖(/characters/<前綴>_<角色>.png),沒有(或載入失敗)退回 emoji。
const FACE = { angry: "😡", annoyed: "😠", neutral: "😐", calm: "🙂", happy: "😄" };
// 玩家語氣(SER 4 類)→ 顯示;送給奧客大腦影響反應
const TONE_LABEL = { Angry: "你的語氣:失控/不耐", Happy: "你的語氣:輕鬆有溫度", Neutral: "你的語氣:平穩", Anxious: "你的語氣:緊張/沒底氣" };
// 泡泡常駐語氣標籤(顏色分類,demo 一眼對照奧客反應)
const TONE_BADGE = { Angry: { cls: "angry", txt: "失控/不耐" }, Happy: { cls: "happy", txt: "輕鬆有溫度" }, Neutral: { cls: "neutral", txt: "平穩" }, Anxious: { cls: "anxious", txt: "緊張/沒底氣" } };
function attachTone(node, emotion) {
  const b = TONE_BADGE[emotion]; if (!node || !b) return;
  node.appendChild(el(`<span class="tone-badge tone-${b.cls}">🎙️ 語氣 · ${b.txt}</span>`));
}
const FACE_PREFIX = { angry: "ang", annoyed: "annoy", neutral: "neu", calm: "calm", happy: "hap" };
const emotionForAnger = (a) => (a >= 80 ? "angry" : a >= 55 ? "annoyed" : a >= 30 ? "neutral" : a >= 10 ? "calm" : "happy");
function setOkekeFace(emotion) {
  const f = $("#okeke-face"); if (!f) return;
  const emo = emotion || "neutral";
  f.dataset.emo = emo;
  const ch = STATE.char;
  if (ch) {                                   // 有角色圖:用手繪;載不到(如 girl 還沒畫)→ onerror 退 emoji
    const src = `/characters/${FACE_PREFIX[emo] || "neu"}_${ch}.png`;
    f.classList.add("has-img");
    f.innerHTML = `<img src="${src}" alt="" onerror="this.closest('.okeke-face').classList.remove('has-img');this.closest('.okeke-face').textContent='${FACE[emo] || "😐"}'">`;
  } else {
    f.classList.remove("has-img");
    f.textContent = FACE[emo] || "😐";
  }
  f.classList.remove("face-pop"); void f.offsetWidth; f.classList.add("face-pop");  // 重觸發動畫
}
// 開局先把這位角色的 5 張表情都預載進瀏覽器快取 → 換臉時瞬間切換,不再載入閃爍/卡頓
function preloadFaces(ch) {
  if (!ch) return;
  ["ang", "annoy", "neu", "calm", "hap"].forEach((p) => { const im = new Image(); im.src = `/characters/${p}_${ch}.png`; });
}
// 空閒時把「全部角色 × 全部表情」都先載好 → 任何關卡開場、任何換臉都 0 延遲
function preloadAllFaces() {
  ["boy", "girl", "aunt", "uncle"].forEach((ch) => preloadFaces(ch));
}

// 音效:WebAudio 即時合成(免音檔)。憤怒爆表、怒氣飆升、倒數 tick、勝利。
const SFX = (() => {
  let ctx = null, on = true;
  const ac = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } return ctx; };
  function tone(freq, dur, type = "sine", gain = 0.2, when = 0) {
    const c = ac(); if (!c || !on) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  return {
    resume() { const c = ac(); if (c && c.state === "suspended") c.resume(); },
    set(v) { on = v; },
    tick() { tone(880, 0.05, "square", 0.05); },                               // 倒數每秒
    tension() { tone(150, 0.22, "sawtooth", 0.32); tone(160, 0.22, "sawtooth", 0.22, 0.02); }, // 怒氣飆升(調大聲)
    buzzer() { tone(110, 0.55, "square", 0.45); tone(104, 0.55, "square", 0.36); tone(70, 0.5, "sawtooth", 0.3, 0.01); }, // 爆表/時間到(更大聲+低頻轟)
    win() { tone(523, 0.12, "sine", 0.18); tone(659, 0.12, "sine", 0.18, 0.12); tone(784, 0.22, "sine", 0.18, 0.24); },
  };
})();

// 背景音樂:寶可夢音檔(放專案 /music,後端 mount 到 /music)。
//   戰鬥曲依「班次第幾位客人」切換(野生→訓練家→道館);和解播對應勝利曲一次;
//   首頁/歷史循環大廳三曲;開設定/進歷史壓低音量並播 Healed。設定可整體關閉。
// (瀏覽器自動播放限制:首次須使用者手勢才能出聲 → 見底部 unlockMusic。)
const MUSIC = (() => {
  let on = true, cur = null, key = null, vol = 0.45;
  let duckS = false, duckV = false;   // 兩個獨立壓低來源:設定開啟、歷史頁;任一成立就壓低
  const DUCK_RATIO = 0.12;   // 壓低時 = 主音量的 12%(隨音量滑桿一起縮放,不是固定值)
  const MASTER = 0.6;        // 全域主衰減:整體再小聲一點(所有輸出 ×此值;要更大/更小只調這顆)
  const ducked = () => duckS || duckV;
  // 目前該播的背景音量:壓低時用「主音量 × DUCK_RATIO」,否則用該軌 base(預設=主音量)
  const bgTarget = (base) => (ducked() ? vol * DUCK_RATIO : (base != null ? base : vol));
  function applyDuck(ms) { if (cur && key !== "victory") fade(cur, bgTarget(cur._base || vol), ms || 250); }
  const F = {   // 用 mp3(由原 wav 轉,~10x 小、載入快、瀏覽器通用)
    battle:  ["Battle! (Wild Pokémon).mp3", "Battle! (Trainer Battle).mp3", "Battle! (Gym Leader Battle).mp3"],
    victory: ["Victory! (Wild Pokémon).mp3", "Victory! (Trainer Battle).mp3", "Victory! (Gym Leader Battle).mp3"],
    lobby:   ["Pokémon Center.mp3", "Pallet Town Theme.mp3", "Professor Oak's Laboratory.mp3"],
    healed:  "Pokémon Healed.mp3",
  };
  const url = (f) => "/music/" + encodeURIComponent(f);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const cache = {};
  function getAudio(f) {   // 同檔重用同一個 <audio>;preload="none" → 不在進站/進關時搶頻寬
    // (慢網路/VS Code 埠轉發下,一次預載多個大 mp3 會佔滿瀏覽器 6 連線、把 /api/start 跟立繪卡在後面)
    let a = cache[f];
    if (!a) { a = new Audio(url(f)); a.preload = "none"; cache[f] = a; }   // 改成 play() 時才串流
    return a;
  }
  function preload(list) { (list || []).forEach(getAudio); }
  function fade(a, to, ms, done) {
    if (!a) { if (done) done(); return; }
    if (a._fid) clearInterval(a._fid);
    const from = a.volume, toA = clamp01(to * MASTER), steps = Math.max(1, Math.round(ms / 40)); let i = 0;
    a._fid = setInterval(() => {
      i++; a.volume = clamp01(from + (toA - from) * (i / steps));
      if (i >= steps) { clearInterval(a._fid); a._fid = null; if (done) done(); }
    }, 40);
  }
  function stopEl(a, ms) { if (a) fade(a, 0, ms || 400, () => { try { a.pause(); a.ontimeupdate = null; } catch {} }); }
  function start(file, loop, baseVol, ms) {   // 切到單一曲(戰鬥/勝利):與舊曲交疊淡入淡出
    const old = cur, a = getAudio(file);
    a.loop = loop; a.onended = null; a.ontimeupdate = null; a._base = baseVol;
    try { a.currentTime = 0; } catch {}
    a.volume = 0; cur = a;
    a.play().then(() => fade(a, bgTarget(baseVol), ms || 500)).catch(() => {});
    if (old && old !== a) stopEl(old, 450);
    return a;
  }
  function lobbyNext(prev) {   // 大廳:隨機(不連播同首),剩 ~1.6s 提前交疊換下一首 → 無縫接續
    if (key !== "lobby") return;
    let pool = F.lobby.filter((f) => f !== prev); if (!pool.length) pool = F.lobby;
    const file = pool[Math.floor(Math.random() * pool.length)];
    const old = cur, a = getAudio(file);
    a.loop = false; a._base = vol; a._handing = false;
    try { a.currentTime = 0; } catch {}
    a.volume = 0; cur = a;
    a.ontimeupdate = () => {
      if (key !== "lobby" || cur !== a || a._handing) return;
      if (a.duration && a.duration - a.currentTime <= 1.6) { a._handing = true; lobbyNext(file); }
    };
    a.onended = () => { if (key === "lobby" && cur === a) lobbyNext(file); };   // 後備
    a.play().then(() => fade(a, bgTarget(vol), 700)).catch(() => {});
    if (old && old !== a) stopEl(old, 1600);   // 與新曲交疊較長 → 聽得出 crossfade
  }
  const idx3 = (i) => Math.max(0, Math.min(2, i | 0));
  return {
    set(v) { on = v; if (!on) this.stop(); },
    isOn() { return on; },
    setVolume(v) { vol = clamp01(v); if (cur && key !== "victory") { cur._base = vol; if (cur._fid) { clearInterval(cur._fid); cur._fid = null; } cur.volume = clamp01(vol * MASTER); } },   // 預覽:即時設真實音量(忽略壓低、先清掉進行中的淡入避免被蓋回)→ 在設定裡拖立刻聽到、不會偶發「調不動」
    getVolume() { return vol; },
    preloadLobby() { preload(F.lobby); },
    preloadBattle() { preload(F.battle.concat(F.victory)); },   // 進關卡前先 buffer 整班戰鬥/勝利曲
    lobby() { if (!on) { key = "lobby"; return; } if (key === "lobby" && cur && !cur.paused) return; key = "lobby"; lobbyNext(null); },
    battle(i) { key = "battle"; if (!on) return; start(F.battle[idx3(i)], true, vol, 400); },
    victory(i) { key = "victory"; if (!on) return; start(F.victory[idx3(i)], false, Math.min(1, vol + 0.12), 250); },
    healed() { if (!on) return; try { const a = getAudio(F.healed); a.loop = false; a.volume = clamp01((bgTarget(vol) + vol * 0.35) * MASTER); try { a.currentTime = 0; } catch {} a.play().catch(() => {}); } catch {} },   // 跟主音量一起縮放 ×主衰減,且固定高背景一截
    duckSettings(d) { duckS = d; applyDuck(); },   // 設定開啟 → 壓低
    duckView(d) { duckV = d; applyDuck(); },        // 歷史頁 → 壓低
    stop() { key = null; const old = cur; cur = null; stopEl(old, 350); },
  };
})();

let STATE = { thread: null, maxTurns: 8, busy: false, ended: false, anger: 0 };
let SCENARIOS = [];          // /api/scenarios 快取(已依難度排序)
let SHIFT = null;            // 班次:{ diff, queue:[scenario...], idx, results:[] }
let curBody = null;          // 目前客人的對話折疊區(addMessage 寫入這裡)

// ---------- 共用 ----------
async function api(path, opts) {
  opts = opts || {};
  let timer = null;
  if (opts.timeoutMs) {                       // 逾時自動中止 → AI 卡住時 UI 不會永遠「思考中」
    const ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    opts = { ...opts, signal: ctrl.signal };
  }
  try {
    const res = await fetch(path, opts);
    if (!res.ok) { let d = "請求失敗,請再試一次。"; try { d = (await res.json()).detail || d; } catch {} throw new Error(d); }
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("回應逾時(AI 太久沒回應),請稍候再送一次。");
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function showView(name) {
  if (name !== "game" && typeof stopTurnTimer === "function") stopTurnTimer();  // 離開遊戲就停倒數
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-" + name).classList.remove("hidden");
  document.querySelectorAll(".navlink").forEach((l) => l.classList.toggle("is-active", l.dataset.view === name));
  if (name === "select") { MUSIC.duckView(false); MUSIC.lobby(); }              // 首頁:大廳曲正常音量
  else if (name === "history") { MUSIC.duckView(true); MUSIC.lobby(); MUSIC.healed(); }  // 歷史:大廳曲壓低(同設定背景大小)+ Healed
  else if (name === "game") MUSIC.duckView(false);            // 戰鬥曲由 startCustomer 觸發,音量正常
}

// ---------- 選關卡(橫向場景)----------
async function loadScenarios() {
  const track = $("#h-track");
  try {
    const list = await api("/api/scenarios");
    // 依難度排:簡單(藍) → 中等(粉) → 困難(綠);同難度內依初始憤怒由低到高
    list.sort((a, b) => (diffStyle(a.difficulty).rank - diffStyle(b.difficulty).rank)
      || (a.initial_anger - b.initial_anger));
    SCENARIOS = list;   // 快取給班次編排用
    track.querySelectorAll(".panel-okeke, .panel-soon").forEach((n) => n.remove());
    // 選關畫面只有 3 關 = 三個難度(藍簡單/粉中等/綠困難),點進去才連續面對多位客人
    const tiers = ["easy", "normal", "hard"].filter((d) => list.some((s) => (s.difficulty || "normal") === d));
    tiers.forEach((d, i) => {
      const customers = list.filter((s) => (s.difficulty || "normal") === d);
      track.appendChild(tierPanel(d, customers, i));
    });
    track.appendChild(el(`<div class="panel panel-soon"><div class="soon-inner"><span>更多難度<br/>敬請期待…</span></div></div>`));
    initHScroll();
  } catch (e) { toast("載入關卡失敗:" + e.message); }
}
// 一個「難度關卡」面板:點進去 → 連續服務該難度的多位客人(班次)
const TIER_META = {
  easy:   { emoji: "🙂", tag: "新手友善", desc: "低怒氣・好安撫" },
  normal: { emoji: "😤", tag: "標準奧客", desc: "會盧・要技巧" },
  hard:   { emoji: "😡", tag: "火爆魔王", desc: "硬頸・易爆走" },
};
function tierPanel(difficulty, customers, i) {
  const ds = diffStyle(difficulty);
  const meta = TIER_META[difficulty] || TIER_META.normal;
  const count = customers.length;
  const num = String(i + 1).padStart(2, "0");
  // 大名(簡單/中等/困難)逐字遮罩 → 一個字一個字錯開上滑
  const nameChars = Array.from(ds.label)
    .map((ch) => `<span class="rev rev-char"><span>${escapeHtml(ch)}</span></span>`).join("");
  const p = el(`
    <div class="panel panel-okeke" data-diff="${difficulty}">
      <div class="okeke-visual" style="background:${ds.grad}">
        <span class="num">${num}</span>
        <span class="rev s-genre"><span>${meta.desc}</span></span>
        <span class="emoji">${meta.emoji}</span>
      </div>
      <div class="okeke-foot">
        <div class="foot-panel">
          <div class="okeke-tags">
            <span class="rev"><span class="tag">${meta.tag}</span></span>
            <span class="rev"><span class="tag">${count} 位客人</span></span>
          </div>
          <h2 class="okeke-bigname">${nameChars}</h2>
          <button class="okeke-start" type="button" style="--accent:${ds.grad}">開始<br/>挑戰</button>
        </div>
      </div>
    </div>`);
  // 只有「開始挑戰」鈕能進關卡(避免點到面板任何地方、或滾動誤觸而誤入)
  p.querySelector(".okeke-start").addEventListener("click", (e) => {
    e.stopPropagation();
    startShift(difficulty);   // 進入該難度班次,從第一位開始連續服務
  });
  return p;
}

// AKARU 式「展開橫向輪播」:滾輪驅動焦點,當前關卡由右側細條「長大」占主畫面(~60%),
// 下一關 ~40%,其餘成右側細條;標題隨之被推出左邊。每塊內容固定寬(內層),外框只負責裁切
// 成 slice → 變寬時是「揭露更多」而非把內容壓扁,所以縮放滑順不卡。
let hsInited = false;
function initHScroll() {
  const vp = $("#akaru-viewport"), track = $("#h-track"), bar = $("#scroll-bar");
  if (!vp || !track) return;
  const panels = [...track.children];                 // 順序:intro → 各奧客 → 敬請期待
  const N = panels.length; if (!N) return;
  // 預先快取每個 panel 的子節點,避免每幀 querySelectorAll(逐字 .rev、intro 內層、米色條)
  const revCache = panels.map((p) => [...p.querySelectorAll(".rev")]);
  const introInner = panels.map((p) => p.querySelector(".intro-inner"));
  const footPanels = panels.map((p) => p.querySelector(".foot-panel"));
  // 每個 panel 的「休息態寬度」依難度:藍簡單最寬 → 綠困難最窄(intro/敬請期待用預設窄條)
  const DEFAULT_REST = 0.085;
  const restCache = panels.map((p) => {
    const d = p.dataset ? p.dataset.diff : null;
    return d && DIFF_STYLE[d] ? DIFF_STYLE[d].rest : DEFAULT_REST;
  });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // 各狀態占視窗比例(內層固定 = FOCUS/TITLE,外框裁切到下列寬度)
  // 只有 3 個難度關卡:起始(標題聚焦)時,三關直接以「難度細條」並列在標題右側 ——
  // 藍最寬 / 粉中 / 綠最窄(如 AKARU 圖)。聚焦某關時它長到 FOCUS,其餘維持細條。
  const TITLE = 0.52, FOCUS = 0.60;
  function fracFor(panel, d, rest) {                   // d = 該塊索引 − 焦點(0=焦點);rest=該塊休息態寬
    if (panel.classList.contains("panel-intro")) {
      if (d <= -1) return 0;                            // 被推出左邊
      if (d < 0) return TITLE * (1 + d);                // 隨焦點離開而縮去左側
      return TITLE;
    }
    if (d <= -1) return 0;                              // 已捲出左邊
    if (d < 0) return FOCUS * (1 + d);                  // 正在離場
    if (d < 1) return lerp(FOCUS, rest, smooth(d));     // 焦點(60%) → 直接收成該難度細條(無 0.40 on-deck)
    return rest;                                         // 其餘 = 依難度寬(藍寬/粉中/綠窄),起始就三色並列
  }

  const STEP = 1100;                                    // 推進一關所需的滾輪量(px,大=較不靈敏/較慢)
  const maxAccum = () => Math.max(0, (N - 1) * STEP);
  let accum = 0, targetF = 0, curF = 0, raf = null;
  function frame() {
    curF += (targetF - curF) * 0.12;                    // lerp:小=更滑、慣性更長
    if (Math.abs(targetF - curF) < 0.0015) curF = targetF;
    const VW = vp.clientWidth || 1;
    panels.forEach((p, i) => {
      const frac = fracFor(p, i - curF, restCache[i]);
      const basis = frac * VW;
      p.style.flexBasis = (basis > 0 ? basis : 0).toFixed(1) + "px";  // 防 NaN/負值破版
      if (p.classList.contains("panel-intro")) {
        // 標題隨焦點離開「往左推出」(非淡化):整塊內容左移、被外框裁切
        const inner = introInner[i];
        if (inner) inner.style.transform = `translateX(${(-(TITLE - frac) * VW).toFixed(1)}px)`;
      } else {
        // 接近占主畫面時:米色資訊條由下往上滑入,內含項目再「階梯式」錯開上滑(皆無淡化)
        const a = smooth((frac - 0.40) / (FOCUS - 0.40));   // 0(下一關 40%)→ 1(焦點 60%)
        const fp = footPanels[i];
        if (fp) fp.style.transform = `translateY(${((1 - smooth(a / 0.35)) * 100).toFixed(1)}%)`;
        // 標籤、標籤、然後大名「一個字一個字」錯開上滑(無淡化);步距依項目數自動縮放,確保聚焦時全到位
        // LEAD 小=更早開始;WIN 小=每字上滑更快;0.45 = 全部字錯開的總跨度(小=更早全顯示)
        const revs = revCache[i], n = revs.length;
        const LEAD = 0.02, WIN = 0.20, step = n > 1 ? 0.45 / (n - 1) : 0;
        revs.forEach((r, k) => {
          const child = r.firstElementChild; if (!child) return;
          const pk = smooth((a - LEAD - k * step) / WIN);
          child.style.transform = `translateY(${((1 - pk) * 120).toFixed(1)}%)`;
        });
      }
    });
    if (bar) bar.style.width = (N > 1 ? (curF / (N - 1)) * 100 : 0).toFixed(2) + "%";
    raf = Math.abs(targetF - curF) > 0.0008 ? requestAnimationFrame(frame) : null;
  }
  // 推進焦點 deltaPx;回傳「是否真的移動了」——到頭/尾沒動就回 false(讓頁面能繼續捲)
  function nudge(deltaPx) {
    const m = maxAccum(); if (m <= 0) return false;
    const before = accum;
    accum = clamp(accum + deltaPx, 0, m);
    if (accum === before) return false;
    targetF = accum / STEP;
    if (!raf) raf = requestAnimationFrame(frame);
    return true;
  }
  frame();
  if (hsInited) return;
  hsInited = true;

  vp.addEventListener("wheel", (e) => {
    const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (nudge(d)) e.preventDefault();        // 只有真的捲動時才攔截;到頭尾放行,頁面可往下看 footer
  }, { passive: false });

  // 觸控板/手機:水平拖曳推進(觸控不會觸發 wheel)
  let touchX = null;
  vp.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  vp.addEventListener("touchmove", (e) => {
    if (touchX === null) return;
    const x = e.touches[0].clientX;
    nudge((touchX - x) * 2.2);               // 往左拖 = 前進;乘數調靈敏度
    touchX = x;
  }, { passive: true });
  vp.addEventListener("touchend", () => { touchX = null; }, { passive: true });

  // 鍵盤可達性:在選關卡頁用左右方向鍵切換關卡
  window.addEventListener("keydown", (e) => {
    if ($("#view-select").classList.contains("hidden")) return;
    if (e.key === "ArrowRight") { nudge(STEP); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { nudge(-STEP); e.preventDefault(); }
  });
  window.addEventListener("resize", () => { if (!raf) raf = requestAnimationFrame(frame); });
}

// ---------- 班次(多客人):選難度 → 依序服務同難度多位客人 → 班次總報告 ----------
function startShift(difficulty, fromId) {
  const queue = SCENARIOS.filter((s) => (s.difficulty || "normal") === difficulty);
  if (!queue.length) { toast("這個難度還沒有關卡。"); return; }
  // 從點到的那位開始,接著服務同難度其餘客人(維持排序、輪一圈)
  let start = 0;
  if (fromId) { const k = queue.findIndex((s) => s.scenario_id === fromId); if (k > 0) start = k; }
  const ordered = queue.slice(start).concat(queue.slice(0, start));
  const sid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "s" + Date.now() + Math.floor(Math.random() * 1e6);
  SHIFT = { id: sid, diff: difficulty, queue: ordered, idx: 0, results: [] };
  const side = document.querySelector(".game-side");
  if (side) side.style.setProperty("--lvl", diffStyle(difficulty).grad);
  SFX.resume();   // 開局點擊=使用者手勢,趁機解鎖 AudioContext
  MUSIC.preloadBattle();   // 先 buffer 整班戰鬥/勝利曲 → 換客人時瞬間切、不延遲
  $("#chat").innerHTML = "";
  $("#report").classList.add("hidden");
  syncReopenBtn();   // 新班次 results 為空 → 隱藏舊的捷徑
  showView("game");
  maybeShowHowto();   // 首次進關卡彈出操作說明(只一次;之後設定可再看)
  startCustomer();
}

async function startCustomer() {
  const meta = SHIFT.queue[SHIFT.idx];
  const myShift = SHIFT;                       // 守衛:開場請求回來前若已離開此班次 → 丟棄,不污染新對局
  try {
    const d = await api("/api/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: meta.scenario_id, shift_id: SHIFT.id,
        shift_index: SHIFT.idx, shift_total: SHIFT.queue.length, shift_diff: SHIFT.diff }),
      timeoutMs: 45000,
    });
    if (SHIFT !== myShift) return;             // 已換關/已離開:整個丟棄
    STATE = { thread: d.thread_id, maxTurns: d.max_turns, turn: d.turn || 0, busy: false, ended: false, anger: d.anger,
      serverAnger: d.anger, penalty: 0,   // penalty:超時累積的怒氣懲罰(顯示用,疊加在 AI 給的怒氣上)
      costSpent: 0, costBudget: d.cost_budget || 80, char: d.scenario.char || "" };
    preloadFaces(STATE.char);                             // 先預載 5 張表情 → 後續換臉不卡
    const ds = diffStyle(d.scenario.difficulty);          // 本關顏色以難度為準(藍簡/粉中/綠難)
    const emoji = styleFor(d.scenario.genre).emoji;
    const n = SHIFT.idx + 1, N = SHIFT.queue.length;
    const brief = (d.scenario.shop || d.scenario.player_role)
      ? `<div class="ok-brief">🏪 ${escapeHtml(d.scenario.shop || "")}${d.scenario.player_role ? ` · 你的身分:${escapeHtml(d.scenario.player_role)}` : ""}</div>`
      : "";
    $("#okeke-card").innerHTML = `
      <div class="okeke-face" id="okeke-face">😐</div>
      <span class="pill" style="background:${ds.grad}">${emoji} ${ds.label} · ${d.scenario.genre}</span>
      <div class="shift-progress">班次進度 ${n}/${N}</div>
      <div class="ok-name">${d.scenario.name}</div>
      ${brief}
      <p class="ok-persona">${d.scenario.persona}</p>`;
    setOkekeFace(emotionForAnger(d.anger));   // 開場依初始怒氣決定表情
    updateMeter(d.anger, d.turn, d.max_turns);
    // 收合先前客人,開一個新的折疊對話區給這位
    document.querySelectorAll(".cust-block").forEach((b) => b.classList.add("collapsed"));
    const block = el(`<div class="cust-block" data-idx="${SHIFT.idx}">
      <button class="cust-head" type="button"><span class="cust-head-l">第 ${n}/${N} 位 · ${escapeHtml(d.scenario.name)}</span><span class="cust-head-r live">進行中</span></button>
      <div class="cust-body"></div></div>`);
    block.querySelector(".cust-head").addEventListener("click", () => block.classList.toggle("collapsed"));
    $("#chat").appendChild(block);
    curBody = block.querySelector(".cust-body");
    addMessage("bot", d.opening_line, d.scenario.name);
    $("#msg").disabled = false; $("#send").disabled = false; $("#mic").disabled = false;
    $("#msg").value = ""; $("#msg").focus();
    startTurnTimer();   // 換你回話 → 開始倒數
    MUSIC.battle(SHIFT.idx);   // 戰鬥曲:第1位=野生、第2位=訓練家、第3位=道館
    syncReopenBtn();    // 班次內已有完成的客人 → 側欄顯示「班次總結」捷徑
  } catch (e) { if (SHIFT !== myShift) return; toast(e.message); }
}

function finishCustomer(d) {
  stopTurnTimer();
  $("#msg").disabled = true; $("#send").disabled = true; $("#mic").disabled = true;
  const meta = SHIFT.queue[SHIFT.idx];
  SHIFT.results.push({
    name: meta.name, scenario_id: meta.scenario_id,
    ending_type: d.ending_type, ending_label: d.ending_label,
    report: d.report, anger_history: d.anger_history,
  });
  // 本客人對話標上結果徽章(保持展開讓你讀;換下一位時才收合)
  const block = $(`.cust-block[data-idx="${SHIFT.idx}"]`);
  if (block) {
    block.classList.add("done", d.ending_type);
    const r = block.querySelector(".cust-head-r");
    if (r) { r.classList.remove("live"); r.textContent = d.ending_label || d.ending_type; }
  }
  const last = SHIFT.idx >= SHIFT.queue.length - 1;
  const adv = el(`<div class="shift-advance"><button class="btn-red" id="shift-next">${last ? "看班次總結 →" : "下一位客人 →"}</button></div>`);
  $("#chat").appendChild(adv);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  $("#shift-next").onclick = () => {
    adv.remove();
    if (last) showShiftReport();
    else { SHIFT.idx += 1; startCustomer(); }
  };
  syncReopenBtn();   // 已完成 ≥1 位 → 側欄常駐「班次總結」捷徑(關掉報告也能再開)
}
function updateMeter(anger, turn, maxTurns) {
  const budget = STATE.costBudget || 80, spent = STATE.costSpent || 0;
  const over = spent > budget;
  const costPct = Math.min(100, (spent / budget) * 100);
  $("#meter-card").innerHTML = `
    <div class="meter-label"><span class="meter-anger">😠 憤怒值 ${anger}/100</span>
      <span class="meter-turn">回合 ${turn}/${maxTurns}</span></div>
    <div class="meter-bar"><div class="meter-fill" style="width:${anger}%;background:${angerColor(anger)}"></div></div>
    <div class="meter-label cost-label"><span class="meter-cost ${over ? "over" : ""}">💸 讓步成本 ${spent}/${budget}${over ? " ⚠超支" : ""}</span></div>
    <div class="meter-bar cost-track"><div class="meter-fill cost-fill ${over ? "over" : ""}" style="width:${costPct}%"></div></div>`;
}
function addMessage(role, text, who) {
  const tag = who ? `<span class="who">${who}</span>` : "";
  const node = el(`<div class="msg ${role}">${tag}${escapeHtml(text)}</div>`);
  (curBody || $("#chat")).appendChild(node);   // 寫進目前客人的折疊區
  const chat = $("#chat"); chat.scrollTop = chat.scrollHeight;
  return node;
}
async function send() {
  if (STATE.busy || STATE.ended || !STATE.thread) return;
  const input = $("#msg"); const text = input.value.trim();
  if (!text) { toast("請先輸入你的回應。"); return; }
  const myThread = STATE.thread;   // 守衛:中途離開/換關後,這個在途回應不可寫進新對局
  const ve = STATE.voiceEmotion || null;   // 這句的語氣(語音才有;打字為 null)
  STATE.busy = true; stopTurnTimer(); input.disabled = true; $("#send").disabled = true; $("#mic").disabled = true;
  const userNode = addMessage("user", text, "你"); input.value = "";
  attachTone(userNode, ve);   // 語音語氣 → 泡泡下常駐標籤(demo 對照奧客反應)
  // 只在「這回合是最後一回合(結束會跑評審報告)」才顯示報告字樣,避免一般慢回合(如限流)誤判
  const willEnd = (STATE.turn + 1) >= STATE.maxTurns;
  const thinking = addMessage("bot thinking", willEnd ? "📝 整理評審報告中…(評審較花時間)" : "⌛ 思考中…");
  const prevAnger = STATE.serverAnger != null ? STATE.serverAnger : STATE.anger;
  try {
    const d = await api("/api/say", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: myThread, text, voice_emotion: ve }), timeoutMs: 90000,
    });
    if (STATE.thread !== myThread) return;   // 已換關/已離開:整個丟棄,別寫進別人的對話
    STATE.voiceEmotion = null;               // 這句語氣已用掉(送成功);下一句若用打字就不帶
    thinking.remove();
    // 一個奧客氣泡:結局回合顯示關卡「預設收尾台詞」(角色自帶、每關手寫的 ending_lines);
    // 一般回合顯示奧客即時回話。二擇一 → 結局不再冒兩個奧客氣泡(健檢 L8)。
    addMessage("bot", d.ended ? d.ending_line : d.ai_reply, "奧客");
    if (typeof d.cost_spent === "number") STATE.costSpent = d.cost_spent;
    if (typeof d.cost_budget === "number") STATE.costBudget = d.cost_budget;
    const disp = Math.min(100, d.anger + (STATE.penalty || 0));   // 疊加超時懲罰後的顯示怒氣
    updateMeter(disp, d.turn, d.max_turns);
    setOkekeFace(emotionForAnger(disp));   // 立繪換臉:以怒氣為準(怒氣0=最開心),不靠 LLM 自報情緒
    STATE.serverAnger = d.anger; STATE.anger = disp; STATE.turn = d.turn;
    if (d.anger - prevAnger >= 12) SFX.tension();           // 怒氣一回合飆 ≥12 → 緊張音
    if (d.ended) {
      STATE.ended = true;
      if (d.ending_type === "success") MUSIC.victory(SHIFT.idx);   // 和解 → 對應勝利曲一次
      else { MUSIC.stop(); SFX.buzzer(); }                          // 砸店/逾時 → 停戰鬥曲 + 爆表音
      finishCustomer(d);   // 收尾本客人 → 「下一位 / 看班次總結」
    } else { STATE.busy = false; input.disabled = false; $("#send").disabled = false; $("#mic").disabled = false; input.focus(); startTurnTimer(); }
  } catch (e) {
    if (STATE.thread !== myThread) return;   // 舊對局的逾時/錯誤,不要打擾新對局
    // 這回合沒送成(伺服器端也沒推進)→ 把剛貼的「你」泡泡和思考泡泡都收回,文字還原到輸入框讓你重送。
    // 不自動重啟倒數,避免「倒數到 → 自動再送 → 又失敗」無限疊泡泡。
    thinking.remove(); if (userNode) userNode.remove(); toast(e.message);
    STATE.busy = false; input.disabled = false; $("#send").disabled = false; $("#mic").disabled = false; input.value = text; input.focus();
  }
}

// ---------- 語音輸入(MediaRecorder → /api/stt → 填進輸入框)----------
// 設定:auto=靜音自動送出、sec=靜音幾秒;存 localStorage,左側面板可調。
const VOICE = { auto: true, sec: 2 };
function loadVoiceSettings() {
  try { const s = JSON.parse(localStorage.getItem("okeke_voice") || "{}");
    if (typeof s.auto === "boolean") VOICE.auto = s.auto;
    if (s.sec) VOICE.sec = Math.max(1, Math.min(15, s.sec)); } catch {}
  $("#vs-auto").checked = VOICE.auto; $("#vs-sec").value = VOICE.sec; $("#vs-sec-val").textContent = VOICE.sec; updateVoiceUI();
}
function saveVoiceSettings() {
  VOICE.auto = $("#vs-auto").checked;
  VOICE.sec = Math.max(1, Math.min(15, parseInt($("#vs-sec").value, 10) || 2));
  $("#vs-sec-val").textContent = VOICE.sec;
  try { localStorage.setItem("okeke_voice", JSON.stringify(VOICE)); } catch {}
  updateVoiceUI();
}
function updateVoiceUI() {
  $("#vs-sec-row").style.opacity = VOICE.auto ? "1" : ".4";
  $("#vs-sec").disabled = !VOICE.auto;
  const sl = $("#vs-sec");
  if (sl) sl.style.setProperty("--fill", ((VOICE.sec - 1) / 14 * 100).toFixed(1) + "%");
  $("#vs-hint").textContent = VOICE.auto
    ? `說完停頓 ${VOICE.sec} 秒就自動辨識並送出;也可按一下■提早結束。`
    : "手動模式:按一下開始、再按一下結束,文字會填到輸入框讓你檢查再送。";
  const m = $("#mic"); if (m) m.title = VOICE.auto ? `按一下開始;靜音 ${VOICE.sec} 秒自動送出` : "按一下開始錄音,再按一下結束";
}

// ---------- 壓力模式:回合倒數 + 音效 ----------
const TIMER = { on: false, sec: 30, sfx: true };
let timerDeadline = 0, timerRAF = null, timerLastSec = -1;
function loadTimerSettings() {
  try { const s = JSON.parse(localStorage.getItem("okeke_timer") || "{}");
    if (typeof s.on === "boolean") TIMER.on = s.on;
    if (typeof s.sfx === "boolean") TIMER.sfx = s.sfx;
    if (s.sec) TIMER.sec = Math.max(10, Math.min(60, s.sec)); } catch {}
  $("#ts-on").checked = TIMER.on; $("#ts-sec").value = TIMER.sec;
  $("#ts-sec-val").textContent = TIMER.sec; $("#ts-sfx").checked = TIMER.sfx;
  SFX.set(TIMER.sfx); updateTimerUI();
}
function saveTimerSettings() {
  TIMER.on = $("#ts-on").checked;
  TIMER.sfx = $("#ts-sfx").checked;
  TIMER.sec = Math.max(10, Math.min(60, parseInt($("#ts-sec").value, 10) || 30));
  $("#ts-sec-val").textContent = TIMER.sec;
  SFX.set(TIMER.sfx);
  try { localStorage.setItem("okeke_timer", JSON.stringify(TIMER)); } catch {}
  updateTimerUI();
  // 即時生效:開了就在你的回合啟動、關了就停
  if (!TIMER.on) stopTurnTimer();
  else if (STATE.thread && !STATE.busy && !STATE.ended && !recording) startTurnTimer();
}
function updateTimerUI() {
  const row = $("#ts-sec-row");
  if (row) { row.style.opacity = TIMER.on ? "1" : ".4"; }
  $("#ts-sec").disabled = !TIMER.on;
  $("#ts-sec").style.setProperty("--fill", ((TIMER.sec - 10) / 50 * 100).toFixed(1) + "%");
  if (!TIMER.on) { const b = $("#timer-bar"); if (b) { b.style.width = "100%"; b.classList.remove("low"); } document.querySelector(".timer-card")?.classList.remove("warn"); }
}
function startTurnTimer() {
  stopTurnTimer();
  if (!TIMER.on || !STATE.thread || STATE.ended) return;
  timerDeadline = performance.now() + TIMER.sec * 1000;
  timerLastSec = -1;
  const bar = $("#timer-bar"), card = document.querySelector(".timer-card");
  const hud = $("#hud-timer"), hudFill = $("#hud-timer-fill"), hudSec = $("#hud-timer-sec");
  if (hud) hud.classList.remove("hidden");   // 遊戲中 HUD 顯示倒數(設定條在 modal,這裡是常駐 HUD)
  (function frame() {
    if (!TIMER.on || STATE.ended) { stopTurnTimer(); return; }
    const left = Math.max(0, timerDeadline - performance.now());
    const frac = left / (TIMER.sec * 1000);
    if (bar) { bar.style.width = (frac * 100).toFixed(1) + "%"; bar.classList.toggle("low", left <= 5000); }
    if (card) card.classList.toggle("warn", left <= 5000 && left > 0);
    const secLeft = Math.ceil(left / 1000);
    if (hudFill) hudFill.style.width = (frac * 100).toFixed(1) + "%";
    if (hudSec) hudSec.textContent = secLeft;
    if (hud) hud.classList.toggle("low", left <= 5000 && left > 0);
    if (secLeft <= 5 && secLeft >= 1 && secLeft !== timerLastSec) { timerLastSec = secLeft; SFX.tick(); }  // 最後 5 秒每秒滴答
    if (left <= 0) { onTimerExpire(); return; }
    timerRAF = requestAnimationFrame(frame);
  })();
}
function stopTurnTimer() {
  if (timerRAF) { cancelAnimationFrame(timerRAF); timerRAF = null; }
  const bar = $("#timer-bar"); if (bar) { bar.style.width = "100%"; bar.classList.remove("low"); }
  document.querySelector(".timer-card")?.classList.remove("warn");
  const hud = $("#hud-timer"); if (hud) { hud.classList.add("hidden"); hud.classList.remove("low"); }
}
function onTimerExpire() {
  stopTurnTimer();
  SFX.buzzer();
  const input = $("#msg"), text = (input.value || "").trim();
  if (text && !STATE.busy && !STATE.ended && STATE.thread) { send(); return; }  // 有打字 → 直接送出
  // 沒打字 → 視為冷場,加怒氣懲罰(顯示用,疊加在 AI 怒氣上)+ 催促 + 重新計時
  if (!STATE.busy && !STATE.ended && STATE.thread) {
    STATE.penalty = (STATE.penalty || 0) + 10;
    const disp = Math.min(100, (STATE.serverAnger != null ? STATE.serverAnger : STATE.anger) + STATE.penalty);
    STATE.anger = disp;
    updateMeter(disp, STATE.turn, STATE.maxTurns);
    setOkekeFace(emotionForAnger(disp));
    toast("⏰ 時間到!你乾在那發呆,顧客更火了(怒氣 +10)");
    startTurnTimer();
  } else {
    toast("⏰ 時間到!快回應奧客!");
  }
}

let mediaRec = null, recChunks = [], recording = false, silenceAudioCtx = null;
// 偵測靜音:用 Web Audio 量 RMS 音量,偵測到說話後、若連續靜音超過設定秒數 → 自動停止(觸發送出)
function startSilenceMonitor(stream) {
  let ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch { return; }
  silenceAudioCtx = ctx;
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser(); analyser.fftSize = 512;
  src.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const THRESH = 0.02;                 // RMS 門檻(0~1):高於=有人說話
  let spoke = false, lastSound = performance.now();
  const closeCtx = () => { try { ctx.close(); } catch {} if (silenceAudioCtx === ctx) silenceAudioCtx = null; };
  (function tick() {
    if (!recording || silenceAudioCtx !== ctx) { closeCtx(); return; }
    analyser.getByteTimeDomainData(buf);
    let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length), now = performance.now();
    if (rms > THRESH) { spoke = true; lastSound = now; }
    if (spoke && now - lastSound > VOICE.sec * 1000) {   // 說過話 + 靜音夠久 → 收尾
      try { mediaRec && mediaRec.stop(); } catch {}
      closeCtx(); return;
    }
    requestAnimationFrame(tick);
  })();
}

async function toggleMic() {
  const mic = $("#mic");
  if (recording) { try { mediaRec && mediaRec.stop(); } catch {} return; }   // 第二下=手動結束
  if (STATE.busy || STATE.ended || !STATE.thread) return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { toast("無法使用麥克風,請檢查瀏覽器權限。"); return; }
  recChunks = [];
  mediaRec = new MediaRecorder(stream);
  mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  mediaRec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    recording = false; mic.classList.remove("recording"); mic.textContent = "🎤";
    const blob = new Blob(recChunks, { type: mediaRec.mimeType || "audio/webm" });
    if (!blob.size) return;
    const input = $("#msg"), ph = input.placeholder;
    mic.disabled = true; input.placeholder = "辨識中…";
    let text = "";
    try {
      const fd = new FormData(); fd.append("audio", blob, "rec.webm");
      // 走 api()(內建 AbortController 逾時)→ STT 後端卡住/網路停住時不會永遠卡在「辨識中…」,
      // 逾時會丟錯走下面 catch,照常還原麥克風與輸入框(健檢 M5)。
      const d = await api("/api/stt", { method: "POST", body: fd, timeoutMs: 60000 });
      text = d.text || "";
      if (text) {
        input.value = (input.value ? input.value + " " : "") + text;
        STATE.voiceEmotion = d.emotion || null;        // 記住這句的語氣 → send() 帶給奧客
        if (d.emotion && TONE_LABEL[d.emotion]) toast("🎙 " + TONE_LABEL[d.emotion]);   // 給玩家語氣回饋
      } else toast("沒聽清楚,請再說一次。");
    } catch (e) { toast(e.message); }
    input.placeholder = ph;
    if (!STATE.ended && STATE.thread) mic.disabled = false;
    // 自動模式且有辨識到內容 → 直接送出;否則留給使用者檢查
    if (text && VOICE.auto && !STATE.busy && !STATE.ended && STATE.thread) send();
    else { input.focus(); if (!STATE.busy && !STATE.ended && STATE.thread) startTurnTimer(); }  // 回到手動檢查 → 倒數續跑
  };
  mediaRec.start();
  recording = true; mic.classList.add("recording"); mic.textContent = "■";
  stopTurnTimer();   // 錄音中暫停倒數(避免邊講邊被時間壓)
  if (VOICE.auto) startSilenceMonitor(stream);
}

// ---------- 報告 ----------
const _scoreOf = (rep) => {
  if (!rep) return null;
  const dims = [rep.empathy_score, rep.crisis_score, rep.compliance_score];
  if (typeof rep.cost_control_score === "number") dims.push(rep.cost_control_score);
  return Math.round(dims.reduce((a, b) => a + b, 0) / dims.length);
};
function showShiftReport() {
  stopTurnTimer(); MUSIC.stop();
  const rs = SHIFT.results, ds = diffStyle(SHIFT.diff);
  const metric = (label, v) => `
    <div class="metric"><div class="metric-top"><span>${label}</span><b>${v}<small> /100</small></b></div>
      <div class="metric-bar"><div class="metric-fill" style="width:${v}%"></div></div></div>`;
  const li = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const scores = rs.map((r) => _scoreOf(r.report)).filter((x) => x != null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const cnt = (t) => rs.filter((r) => r.ending_type === t).length;
  const success = cnt("success"), fail = cnt("fail"), timeout = cnt("timeout");
  const totalCost = rs.reduce((a, r) => a + ((r.report && r.report.cost_spent) || 0), 0);
  let streak = 0, best = 0;
  rs.forEach((r) => { if (r.ending_type === "success") { streak++; best = Math.max(best, streak); } else streak = 0; });
  const rows = rs.map((r, i) => {
    const sc = _scoreOf(r.report), rep = r.report;
    const detail = rep ? `<div class="srow-detail">
      ${metric("同理心 Empathy", rep.empathy_score)}${metric("危機應變 Crisis", rep.crisis_score)}${metric("法規遵從 Compliance", rep.compliance_score)}${typeof rep.cost_control_score === "number" ? metric("成本控制 Cost-control", rep.cost_control_score) : ""}
      ${trajectorySVG(r.anger_history)}
      <div class="report-h">✓ 做得好</div><ul class="report-list good">${li(rep.good_practices)}</ul>
      <div class="report-h">→ 可改進</div><ul class="report-list bad">${li(rep.bad_practices)}</ul>
      <div class="report-summary">${escapeHtml(rep.summary)}</div></div>` : "";
    return `<div class="srow-block ${r.ending_type} collapsed">
      <button class="srow-head" type="button"><span>第 ${i + 1} 位 · ${escapeHtml(r.name)}</span><span class="srow-r">${r.ending_label || r.ending_type}${sc != null ? ` · ${sc} 分` : ""}</span></button>
      ${detail}</div>`;
  }).join("");
  $("#report-card").innerHTML = `
    <div class="report-ending">班次總結 · ${ds.label}難度 · 共 ${rs.length} 位客人</div>
    <div class="report-score">${avg}<small> / 100</small></div>
    <div class="report-title">平均表現</div>
    <div class="shift-stats">
      <div class="sstat"><b>${success}</b>滿意和解</div>
      <div class="sstat"><b>${fail}</b>客訴砸店</div>
      <div class="sstat"><b>${timeout}</b>逾時離開</div>
      <div class="sstat"><b>🔥 ${best}</b>連續和解</div>
      <div class="sstat"><b>💸 ${totalCost}</b>總讓步成本</div>
    </div>
    <div class="report-h">每位客人(點開看明細)</div>
    <div class="shift-rows">${rows}</div>
    <div class="report-actions">
      <button class="btn-red" id="r-again">回選難度</button>
      <button class="btn-ghost" id="r-close">關閉看對話</button>
    </div>`;
  $("#report").classList.remove("hidden");
  $("#report-card").style.setProperty("--lvl", ds.grad);   // 分數條/卷軸條用本班次難度色
  $("#report-card").scrollTop = 0;
  $("#report-card").querySelectorAll(".srow-head").forEach((h) =>
    h.addEventListener("click", () => h.parentElement.classList.toggle("collapsed")));
  $("#r-again").onclick = () => { $("#report").classList.add("hidden"); SHIFT = null; curBody = null; showView("select"); syncReopenBtn(); };
  $("#r-close").onclick = () => { $("#report").classList.add("hidden"); syncReopenBtn(); };
  $("#report").onclick = (e) => { if (e.target === $("#report")) { $("#report").classList.add("hidden"); syncReopenBtn(); } };
  syncReopenBtn();   // 報告開著時隱藏捷徑;關掉時(上面處理)再現
}
// 側欄「班次總結」捷徑:本班次有完成的客人、且報告沒開著 → 顯示;讓「關閉看對話」後還能再開
function syncReopenBtn() {
  const b = $("#reopen-report"); if (!b) return;
  const show = !!(SHIFT && SHIFT.results && SHIFT.results.length && $("#report").classList.contains("hidden"));
  b.classList.toggle("hidden", !show);
}
function trajectorySVG(hist) {
  if (!Array.isArray(hist) || hist.length < 2) return "";
  const W = 480, H = 90, pad = 10, n = hist.length;
  const x = (i) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (v) => pad + (1 - v / 100) * (H - 2 * pad);
  const pts = hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const dots = hist.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="#FE494A"/>`).join("");
  return `<div class="report-h">憤怒值軌跡</div>
    <svg class="report-traj" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="#FE494A" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    </svg>`;
}

// ---------- 歷史 ----------
async function loadHistory() {
  const grid = $("#history-grid");
  try {
    const list = await api("/api/history");
    if (!list.length) { grid.innerHTML = `<p style="color:var(--muted)">還沒有任何對局紀錄。</p>`; return; }
    // 依 shift_id 把同一班次的客人聚成一組;舊紀錄(無 shift_id)各自成一組
    const order = [], byId = {};
    list.forEach((g) => {
      const key = g.shift_id || ("solo_" + g.thread_id);
      if (!byId[key]) { byId[key] = { items: [], created_at: g.created_at || "", difficulty: g.difficulty }; order.push(key); }
      const grp = byId[key];
      grp.items.push(g);
      if ((g.created_at || "") > grp.created_at) grp.created_at = g.created_at || "";
      if (!grp.difficulty && g.difficulty) grp.difficulty = g.difficulty;
    });
    grid.innerHTML = "";
    order.forEach((key, gi) => {
      const grp = byId[key];
      grp.items.sort((a, b) => (a.shift_index ?? 0) - (b.shift_index ?? 0));
      const ds = diffStyle(grp.difficulty);
      const c = (t) => grp.items.filter((x) => x.ending_type === t).length;
      const date = (grp.created_at || "").replace("T", " ").slice(0, 16);
      const rows = grp.items.map((g) => {
        const ava = g.char
          ? `<img class="hrow-ava" src="/characters/neu_${g.char}.png" alt="" onerror="this.style.display='none'">`
          : `<span class="hrow-ava">${styleFor(g.scenario_name || "").emoji}</span>`;
        const sc = typeof g.score === "number" ? g.score : "—";
        return `<button class="hrow" data-tid="${g.thread_id}">
          ${ava}
          <span class="hrow-name">${escapeHtml(g.scenario_name || "?")}</span>
          <span class="hrow-meta">${g.turns} 回合 · 怒 ${g.final_anger ?? "?"}</span>
          <span class="hrow-badge ${g.ending_type}">${g.ending_label || g.ending_type}</span>
          <span class="hrow-score">${sc}</span>
        </button>`;
      }).join("");
      // 班次總分:各客人分數平均(像遊戲,下拉前就先秀總分)
      const gScores = grp.items.map((x) => x.score).filter((v) => typeof v === "number");
      const gAvg = gScores.length ? Math.round(gScores.reduce((a, b) => a + b, 0) / gScores.length) : null;
      const single = grp.items.length === 1;
      const title = single ? escapeHtml(grp.items[0].scenario_name || "?")
                           : `${ds.label}難度班次 · ${grp.items.length} 位客人`;
      const card = el(`<div class="hgroup ${gi === 0 ? "" : "collapsed"}" style="--lvl:${ds.grad}">
        <button class="hgroup-head">
          <span class="hg-caret"></span>
          <span class="hg-l"><span class="hg-title">${title}</span><span class="hg-sub">${date} · ✓ ${c("success")}/${grp.items.length} 和解</span></span>
          <span class="hg-r">${gAvg != null ? `<b class="hg-score">${gAvg}<small> /100</small></b>` : ""}</span>
        </button>
        <div class="hgroup-body">${rows}</div>
      </div>`);
      card.querySelector(".hgroup-head").addEventListener("click", () => card.classList.toggle("collapsed"));
      card.querySelectorAll(".hrow").forEach((r) => r.addEventListener("click", () => viewHistory(r.dataset.tid)));
      grid.appendChild(card);
    });
  } catch (e) { grid.innerHTML = `<p style="color:var(--muted)">載入失敗:${e.message}</p>`; }
}
async function viewHistory(threadId) {
  try {
    const d = await api("/api/history/" + threadId);
    const msgs = (d.transcript || []).map((m) =>
      `<div class="msg ${m.role === "user" ? "user" : "bot"}"><span class="who">${m.role === "user" ? "你" : "奧客"}</span>${escapeHtml(m.content)}</div>`).join("");
    const r = d.report;
    const metric = (label, v) => `
      <div class="metric"><div class="metric-top"><span>${label}</span><b>${v}<small> /100</small></b></div>
        <div class="metric-bar"><div class="metric-fill" style="width:${v}%"></div></div></div>`;
    const li = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
    const hasCost = r && typeof r.cost_control_score === "number";
    const reportHtml = r ? `
      <div class="report-h">綜合表現</div>
      ${metric("同理心 Empathy", r.empathy_score)}
      ${metric("危機應變 Crisis", r.crisis_score)}
      ${metric("法規遵從 Compliance", r.compliance_score)}
      ${hasCost ? metric("成本控制 Cost-control", r.cost_control_score) : ""}
      ${hasCost ? `<div class="report-costline ${r.cost_spent > r.cost_budget ? "over" : ""}">💸 讓步成本 ${r.cost_spent}/${r.cost_budget}</div>` : ""}
      <div class="report-h">✓ 做得好</div><ul class="report-list good">${li(r.good_practices)}</ul>
      <div class="report-h">→ 可改進</div><ul class="report-list bad">${li(r.bad_practices)}</ul>
      <div class="report-summary">${escapeHtml(r.summary)}</div>` : "";
    $("#hist-card").innerHTML = `
      <div class="report-ending">對話回放 · ${d.ending_label || d.ending_type}</div>
      <div class="report-title">${escapeHtml(d.scenario_name || "")}</div>
      ${trajectorySVG(d.anger_history)}
      <details class="transcript-fold">
        <summary>對話紀錄 · ${(d.transcript || []).length} 句(點開回放)</summary>
        <div class="transcript">${msgs || '<p style="color:var(--muted);margin:0">(無對話)</p>'}</div>
      </details>
      ${reportHtml}
      <div class="report-actions"><button class="btn-ghost" id="h-close">關閉</button></div>`;
    $("#hist-overlay").classList.remove("hidden");
    // 分數條/卷軸條用該關卡難度色:優先記錄存的 difficulty,舊紀錄退而從關卡快取查
    const _diff = d.difficulty || (SCENARIOS.find((s) => s.scenario_id === d.scenario_id) || {}).difficulty;
    const _lvl = _diff && DIFF_STYLE[_diff] ? DIFF_STYLE[_diff].grad : null;
    if (_lvl) $("#hist-card").style.setProperty("--lvl", _lvl);
    else $("#hist-card").style.removeProperty("--lvl");
    $("#hist-card").scrollTop = 0;
    $("#h-close").onclick = () => $("#hist-overlay").classList.add("hidden");
    $("#hist-overlay").onclick = (e) => { if (e.target === $("#hist-overlay")) $("#hist-overlay").classList.add("hidden"); };
  } catch (e) { toast(e.message); }
}

// ---------- 綁定 ----------
document.querySelectorAll(".navlink").forEach((l) =>
  l.addEventListener("click", () => {
    if (l.dataset.action === "settings") { openSettings(); return; }   // 設定不是頁面,是隨時可開的覆蓋層
    const v = l.dataset.view; showView(v); if (v === "history") loadHistory();
  }));
function openSettings() { $("#settings-overlay").classList.remove("hidden"); SFX.resume(); MUSIC.duckSettings(true); MUSIC.healed(); }  // 開設定:壓低背景樂 + Healed 一聲
function closeSettings() { if ($("#settings-overlay").classList.contains("hidden")) return; $("#settings-overlay").classList.add("hidden"); MUSIC.duckSettings(false); }  // 關設定:解除「設定壓低」(若在歷史頁仍由 duckView 壓著)
$("#set-close").addEventListener("click", closeSettings);
$("#settings-overlay").addEventListener("click", (e) => { if (e.target === $("#settings-overlay")) closeSettings(); });
// 操作說明:首次進關卡自動彈一次(localStorage 記住);之後在設定裡可再看
// 從設定開→按鈕「返回設定」並回到設定;關卡自動彈→按鈕「開始挑戰」單純關閉
let _howtoFromSettings = false;
function openHowto(fromSettings) {
  _howtoFromSettings = !!fromSettings;
  const btn = $("#howto-close"); if (btn) btn.textContent = _howtoFromSettings ? "← 返回設定" : "開始挑戰 →";
  $("#howto-overlay").classList.remove("hidden");
}
function closeHowto() {
  $("#howto-overlay").classList.add("hidden");
  const back = _howtoFromSettings; _howtoFromSettings = false;
  if (back) openSettings();   // 從設定進來的 → 退回設定
}
function maybeShowHowto() {
  let seen = false; try { seen = localStorage.getItem("okeke_seen_howto") === "1"; } catch {}
  if (seen) return;
  openHowto(false);
  try { localStorage.setItem("okeke_seen_howto", "1"); } catch {}
}
$("#howto-close").addEventListener("click", closeHowto);
$("#open-howto").addEventListener("click", () => { closeSettings(); openHowto(true); });
$("#howto-overlay").addEventListener("click", (e) => { if (e.target === $("#howto-overlay")) closeHowto(); });
$(".brand").addEventListener("click", () => showView("select"));
$("#send").addEventListener("click", send);
$("#mic").addEventListener("click", toggleMic);
$("#vs-auto").addEventListener("change", saveVoiceSettings);
$("#vs-sec").addEventListener("input", saveVoiceSettings);   // 拖拉即時更新秒數
loadVoiceSettings();
$("#ts-on").addEventListener("change", saveTimerSettings);
$("#ts-sec").addEventListener("input", saveTimerSettings);
$("#ts-sfx").addEventListener("change", saveTimerSettings);
loadTimerSettings();
// 背景音樂開關(預設開;關了立即停,開了依目前畫面接著播)
function loadBgmSetting() {
  let on = true;
  try { const v = localStorage.getItem("okeke_bgm"); if (v !== null) on = v === "1"; } catch {}
  const cb = $("#bgm-on"); if (cb) cb.checked = on;
  MUSIC.set(on);
}
function playForCurrentView() {
  if (!$("#view-game").classList.contains("hidden") && SHIFT && STATE.thread && !STATE.ended) MUSIC.battle(SHIFT.idx);
  else MUSIC.lobby();
}
function saveBgmSetting() {
  const on = $("#bgm-on").checked; MUSIC.set(on);
  try { localStorage.setItem("okeke_bgm", on ? "1" : "0"); } catch {}
  if (on) playForCurrentView();
}
$("#bgm-on").addEventListener("change", saveBgmSetting);
loadBgmSetting();
// 音樂音量(設定可調;存 localStorage)
function loadMusicVol() {
  let v = 45;
  try { const s = localStorage.getItem("okeke_bgm_vol"); if (s !== null) { const n = parseInt(s, 10); if (!Number.isNaN(n)) v = Math.max(0, Math.min(100, n)); } } catch {}
  const sl = $("#bgm-vol"); if (sl) { sl.value = v; sl.style.setProperty("--fill", v + "%"); }
  const lab = $("#bgm-vol-val"); if (lab) lab.textContent = v;
  MUSIC.setVolume(v / 100);
}
function saveMusicVol() {
  const n = parseInt($("#bgm-vol").value, 10);
  const v = Math.max(0, Math.min(100, Number.isNaN(n) ? 45 : n));
  $("#bgm-vol-val").textContent = v;
  $("#bgm-vol").style.setProperty("--fill", v + "%");
  MUSIC.setVolume(v / 100);
  try { localStorage.setItem("okeke_bgm_vol", String(v)); } catch {}
}
$("#bgm-vol").addEventListener("input", saveMusicVol);
loadMusicVol();
// 延到瀏覽器空閒再預載大廳曲 + 全部立繪 → 不擋首屏渲染,之後播放/換臉都瞬間(解一開始卡頓)
(window.requestIdleCallback || ((cb) => setTimeout(cb, 800)))(() => { MUSIC.preloadLobby(); preloadAllFaces(); });
// 瀏覽器禁止無手勢自動播放 → 第一次互動(點/鍵/滾)才啟動目前畫面的音樂
let _musicUnlocked = false;
function unlockMusic() { if (_musicUnlocked) return; _musicUnlocked = true; playForCurrentView(); }
["pointerdown", "keydown", "wheel"].forEach((ev) => document.addEventListener(ev, unlockMusic, { once: true, passive: true }));
$("#msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); if (!STATE.busy && !STATE.ended) send(); }
});
$("#msg").addEventListener("input", () => { STATE.voiceEmotion = null; });   // 手動打字 → 清語音語氣(STT 程式填值不觸發 input)
// 結束關卡 = 直接回首頁。thread 設 null → 任何在途回應被守衛丟棄,不污染下一關。
// 想看「只完成部分客人」的總結,離開前點側欄「📋 班次總結」即可(不強制跳報告)。
$("#quit").addEventListener("click", () => {
  stopTurnTimer();
  $("#msg").disabled = true; $("#send").disabled = true; $("#mic").disabled = true;
  STATE = { thread: null, maxTurns: 8, busy: false, ended: true, anger: 0 };
  SHIFT = null; curBody = null;
  $("#report").classList.add("hidden");
  showView("select"); syncReopenBtn();   // showView('select') 會切回大廳曲
});
$("#reopen-report").addEventListener("click", () => { if (SHIFT && SHIFT.results && SHIFT.results.length) showShiftReport(); });
$("#history-refresh").addEventListener("click", loadHistory);
// Esc 關閉評審報告 / 歷史回放覆蓋層
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("#report").classList.add("hidden"); $("#hist-overlay").classList.add("hidden"); closeSettings(); syncReopenBtn(); }
});

loadScenarios();
