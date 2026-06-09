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

let STATE = { thread: null, maxTurns: 8, busy: false, ended: false };

// ---------- 共用 ----------
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) { let d = "請求失敗,請再試一次。"; try { d = (await res.json()).detail || d; } catch {} throw new Error(d); }
  return res.json();
}
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-" + name).classList.remove("hidden");
  document.querySelectorAll(".navlink").forEach((l) => l.classList.toggle("is-active", l.dataset.view === name));
}

// ---------- 選關卡(橫向場景)----------
async function loadScenarios() {
  const track = $("#h-track");
  try {
    const list = await api("/api/scenarios");
    track.querySelectorAll(".panel-okeke, .panel-soon").forEach((n) => n.remove());
    list.forEach((s, i) => track.appendChild(okekePanel(s, i)));
    track.appendChild(el(`<div class="panel panel-soon"><div class="soon-inner"><span>更多奧客<br/>敬請期待…</span></div></div>`));
    initHScroll();
  } catch (e) { toast("載入關卡失敗:" + e.message); }
}
function okekePanel(s, i) {
  const st = styleFor(s.genre);
  const num = String(i + 1).padStart(2, "0");
  // 大名拆成單字,每字各自一個 .rev 遮罩 → 一個字一個字錯開上滑
  const nameChars = Array.from(s.name || "")
    .map((ch) => `<span class="rev rev-char"><span>${ch === " " ? "&nbsp;" : escapeHtml(ch)}</span></span>`).join("");
  const p = el(`
    <div class="panel panel-okeke">
      <div class="okeke-visual" style="background:${st.grad}">
        <span class="num">${num}</span>
        <span class="s-genre">${s.genre}</span>
        <span class="emoji">${st.emoji}</span>
      </div>
      <div class="okeke-foot">
        <div class="foot-panel">
          <div class="okeke-tags">
            <span class="rev"><span class="tag">初始憤怒 ${s.initial_anger}</span></span>
            <span class="rev"><span class="tag">${s.max_turns} 回合</span></span>
          </div>
          <h2 class="okeke-bigname">${nameChars}</h2>
          <button class="okeke-start" type="button" style="--accent:${st.grad}">開始<br/>挑戰</button>
        </div>
      </div>
    </div>`);
  // 只有「開始挑戰」鈕能進關卡(避免點到面板任何地方、或滾動誤觸而誤入)
  p.querySelector(".okeke-start").addEventListener("click", (e) => {
    e.stopPropagation();
    startGame(s.scenario_id);
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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // 各狀態占視窗比例(內層固定 = FOCUS/TITLE,外框裁切到下列寬度)
  const TITLE = 0.52, FOCUS = 0.60, NEXT = 0.40, STRIP = 0.14, STRIP2 = 0.085;
  function fracFor(panel, d) {                          // d = 該塊索引 − 焦點(0=焦點)
    if (panel.classList.contains("panel-intro")) {
      if (d <= -1) return 0;                            // 被推出左邊
      if (d < 0) return TITLE * (1 + d);                // 隨焦點離開而縮去左側
      return TITLE;
    }
    if (d <= -1) return 0;                              // 已捲出左邊
    if (d < 0) return FOCUS * (1 + d);                  // 正在離場
    if (d < 1) return lerp(FOCUS, NEXT, d);             // 焦點(60%) → 下一關(40%)
    if (d < 2) return lerp(NEXT, STRIP, d - 1);         // 下一關(40%) → 細條(14%)
    if (d < 3) return lerp(STRIP, STRIP2, d - 2);       // 細條 → 更細
    return STRIP2;                                       // 遠處皆細條
  }

  const STEP = 1100;                                    // 推進一關所需的滾輪量(px,大=較不靈敏/較慢)
  const maxAccum = () => Math.max(0, (N - 1) * STEP);
  let accum = 0, targetF = 0, curF = 0, raf = null;
  function frame() {
    curF += (targetF - curF) * 0.12;                    // lerp:小=更滑、慣性更長
    if (Math.abs(targetF - curF) < 0.0015) curF = targetF;
    const VW = vp.clientWidth || 1;
    panels.forEach((p, i) => {
      const frac = fracFor(p, i - curF);
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

// ---------- 遊戲 ----------
async function startGame(scenarioId) {
  try {
    const d = await api("/api/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: scenarioId }),
    });
    STATE = { thread: d.thread_id, maxTurns: d.max_turns, busy: false, ended: false };
    const st = styleFor(d.scenario.genre);
    $("#okeke-card").innerHTML = `
      <span class="pill" style="background:${st.grad}">${st.emoji} ${d.scenario.genre}</span>
      <div class="ok-name">${d.scenario.name}</div>
      <p class="ok-persona">${d.scenario.persona}</p>`;
    updateMeter(d.anger, d.turn, d.max_turns);
    $("#chat").innerHTML = "";
    addMessage("bot", d.opening_line, d.scenario.name);
    $("#msg").disabled = false; $("#send").disabled = false; $("#mic").disabled = false;
    $("#msg").value = ""; $("#msg").focus();
    $("#report").classList.add("hidden");
    showView("game");
  } catch (e) { toast(e.message); }
}
function updateMeter(anger, turn, maxTurns) {
  $("#meter-card").innerHTML = `
    <div class="meter-label"><span class="meter-anger">😠 憤怒值 ${anger}/100</span>
      <span class="meter-turn">回合 ${turn}/${maxTurns}</span></div>
    <div class="meter-bar"><div class="meter-fill" style="width:${anger}%;background:${angerColor(anger)}"></div></div>`;
}
function addMessage(role, text, who) {
  const tag = who ? `<span class="who">${who}</span>` : "";
  const node = el(`<div class="msg ${role}">${tag}${escapeHtml(text)}</div>`);
  $("#chat").appendChild(node); $("#chat").scrollTop = $("#chat").scrollHeight;
  return node;
}
async function send() {
  if (STATE.busy || STATE.ended || !STATE.thread) return;
  const input = $("#msg"); const text = input.value.trim();
  if (!text) { toast("請先輸入你的回應。"); return; }
  STATE.busy = true; input.disabled = true; $("#send").disabled = true; $("#mic").disabled = true;
  addMessage("user", text, "你"); input.value = "";
  const thinking = addMessage("bot thinking", "⌛ 思考中…");
  try {
    const d = await api("/api/say", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: STATE.thread, text }),
    });
    thinking.remove();
    addMessage("bot", d.ai_reply, "奧客");
    updateMeter(d.anger, d.turn, d.max_turns);
    if (d.ended) { STATE.ended = true; addMessage("bot", d.ending_line, "奧客"); showReport(d); }
    else { STATE.busy = false; input.disabled = false; $("#send").disabled = false; $("#mic").disabled = false; input.focus(); }
  } catch (e) {
    thinking.remove(); toast(e.message);
    STATE.busy = false; input.disabled = false; $("#send").disabled = false; $("#mic").disabled = false; input.value = text; input.focus();
  }
}

// ---------- 語音輸入(MediaRecorder → /api/stt → 填進輸入框)----------
// 設定:auto=靜音自動送出、sec=靜音幾秒;存 localStorage,左側面板可調。
const VOICE = { auto: true, sec: 4 };
function loadVoiceSettings() {
  try { const s = JSON.parse(localStorage.getItem("okeke_voice") || "{}");
    if (typeof s.auto === "boolean") VOICE.auto = s.auto;
    if (s.sec) VOICE.sec = Math.max(1, Math.min(15, s.sec)); } catch {}
  $("#vs-auto").checked = VOICE.auto; $("#vs-sec").value = VOICE.sec; $("#vs-sec-val").textContent = VOICE.sec; updateVoiceUI();
}
function saveVoiceSettings() {
  VOICE.auto = $("#vs-auto").checked;
  VOICE.sec = Math.max(1, Math.min(15, parseInt($("#vs-sec").value, 10) || 4));
  $("#vs-sec-val").textContent = VOICE.sec;
  try { localStorage.setItem("okeke_voice", JSON.stringify(VOICE)); } catch {}
  updateVoiceUI();
}
function updateVoiceUI() {
  $("#vs-sec-row").style.opacity = VOICE.auto ? "1" : ".4";
  $("#vs-sec").disabled = !VOICE.auto;
  $("#vs-hint").textContent = VOICE.auto
    ? `說完停頓 ${VOICE.sec} 秒就自動辨識並送出;也可按一下■提早結束。`
    : "手動模式:按一下開始、再按一下結束,文字會填到輸入框讓你檢查再送。";
  const m = $("#mic"); if (m) m.title = VOICE.auto ? `按一下開始;靜音 ${VOICE.sec} 秒自動送出` : "按一下開始錄音,再按一下結束";
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
      const res = await fetch("/api/stt", { method: "POST", body: fd });
      if (!res.ok) { let m = "辨識失敗"; try { m = (await res.json()).detail || m; } catch {} throw new Error(m); }
      text = (await res.json()).text || "";
      if (text) input.value = (input.value ? input.value + " " : "") + text;
      else toast("沒聽清楚,請再說一次。");
    } catch (e) { toast(e.message); }
    input.placeholder = ph;
    if (!STATE.ended && STATE.thread) mic.disabled = false;
    // 自動模式且有辨識到內容 → 直接送出;否則留給使用者檢查
    if (text && VOICE.auto && !STATE.busy && !STATE.ended && STATE.thread) send();
    else input.focus();
  };
  mediaRec.start();
  recording = true; mic.classList.add("recording"); mic.textContent = "■";
  if (VOICE.auto) startSilenceMonitor(stream);
}

// ---------- 報告 ----------
function showReport(d) {
  const r = d.report;
  const comp = Math.round((r.empathy_score + r.crisis_score + r.compliance_score) / 3);
  const metric = (label, v) => `
    <div class="metric"><div class="metric-top"><span>${label}</span><b>${(v / 10).toFixed(1)}</b></div>
      <div class="metric-bar"><div class="metric-fill" style="width:${v}%"></div></div></div>`;
  const li = (arr) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  $("#report-card").innerHTML = `
    <div class="report-ending">培訓報告 · ${d.ending_label}</div>
    <div class="report-score">${(comp / 10).toFixed(1)}<small> / 10.0</small></div>
    <div class="report-title">綜合表現</div>
    ${metric("同理心 Empathy", r.empathy_score)}
    ${metric("危機應變 Crisis", r.crisis_score)}
    ${metric("法規遵從 Compliance", r.compliance_score)}
    ${trajectorySVG(d.anger_history)}
    <div class="report-h">✓ 做得好</div><ul class="report-list good">${li(r.good_practices)}</ul>
    <div class="report-h">→ 可改進</div><ul class="report-list bad">${li(r.bad_practices)}</ul>
    <div class="report-summary">${escapeHtml(r.summary)}</div>
    <div class="report-actions">
      <button class="btn-red" id="r-again">再玩一次</button>
      <button class="btn-ghost" id="r-close">關閉看對話</button>
    </div>`;
  $("#report").classList.remove("hidden");
  $("#r-again").onclick = () => { $("#report").classList.add("hidden"); showView("select"); };
  $("#r-close").onclick = () => $("#report").classList.add("hidden");
  // 點背景空白處也能關閉報告(只在點到 overlay 本身、非卡片內容時)
  $("#report").onclick = (e) => { if (e.target === $("#report")) $("#report").classList.add("hidden"); };
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
  const grid = $("#history-grid"); $("#history-detail").classList.add("hidden");
  try {
    const list = await api("/api/history");
    grid.innerHTML = list.length ? "" : `<p style="color:var(--muted)">還沒有任何對局紀錄。</p>`;
    list.forEach((g) => {
      const st = styleFor((g.scenario_name || "").includes("劉董") ? "零售" : "餐飲");
      const card = el(`
        <div class="gcard" style="--accent:${st.grad}">
          <div class="gcard-banner" style="background:${st.grad}">
            <span class="pill-genre">${g.ending_label || g.ending_type}</span>
            <span class="gcard-emoji">${st.emoji}</span>
            <div class="gcard-name">${g.scenario_name || "?"}</div>
          </div>
          <div class="gcard-body">
            <div class="gcard-meta"><span class="chip">${g.turns} 回合</span><span class="chip">最終憤怒 ${g.final_anger ?? "?"}</span></div>
            <span class="gcard-cta">查看回放 →</span>
            <p style="margin:0;font-size:.8rem;color:var(--dim)">${g.created_at || ""}</p>
          </div>
        </div>`);
      card.addEventListener("click", () => viewHistory(g.thread_id));
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
    const rep = r ? `<div class="report-summary" style="margin-top:16px"><b>同理心 ${(r.empathy_score/10).toFixed(1)} ｜ 危機 ${(r.crisis_score/10).toFixed(1)} ｜ 法規 ${(r.compliance_score/10).toFixed(1)}</b><br>${escapeHtml(r.summary)}</div>` : "";
    const box = $("#history-detail");
    box.innerHTML = `
      <div class="section-head"><h2>${d.scenario_name} · ${d.ending_label || d.ending_type}</h2><span class="rule"></span></div>
      ${trajectorySVG(d.anger_history)}<div class="transcript">${msgs}</div>${rep}`;
    box.classList.remove("hidden"); box.scrollIntoView({ behavior: "smooth" });
  } catch (e) { toast(e.message); }
}

// ---------- 綁定 ----------
document.querySelectorAll(".navlink").forEach((l) =>
  l.addEventListener("click", () => { const v = l.dataset.view; showView(v); if (v === "history") loadHistory(); }));
$(".brand").addEventListener("click", () => showView("select"));
$("#send").addEventListener("click", send);
$("#mic").addEventListener("click", toggleMic);
$("#vs-auto").addEventListener("change", saveVoiceSettings);
$("#vs-sec").addEventListener("input", saveVoiceSettings);   // 拖拉即時更新秒數
loadVoiceSettings();
$("#msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); if (!STATE.busy && !STATE.ended) send(); }
});
// 換一關:回選關卡並清掉本場狀態(避免殘留 thread 造成誤送到舊對局)
$("#quit").addEventListener("click", () => {
  STATE = { thread: null, maxTurns: 8, busy: false, ended: false };
  showView("select");
});
$("#history-refresh").addEventListener("click", loadHistory);
// Esc 關閉評審報告覆蓋層
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("#report").classList.add("hidden");
});

loadScenarios();
