// AI 奧客應對演練 —— 前端邏輯(vanilla JS,呼叫 /api/*)。

const $ = (sel) => document.querySelector(sel);
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };

// 關卡橫幅配色(依類型),沒有圖片就用漸層 + emoji
const GENRE_STYLE = {
  "餐飲": { grad: "linear-gradient(135deg,#b5341f,#e8743b)", emoji: "🍜" },
  "零售": { grad: "linear-gradient(135deg,#243b53,#3d6e8c)", emoji: "🛍️" },
};
const styleFor = (genre) => GENRE_STYLE[genre] || { grad: "linear-gradient(135deg,#7a2f6a,#d480c0)", emoji: "😤" };

const angerColor = (a) => (a >= 70 ? "#FE494A" : a >= 40 ? "#f39c12" : "#2e9e6b");

let STATE = { thread: null, maxTurns: 8, busy: false, ended: false };

// ---------- 共用 ----------
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let detail = "請求失敗,請再試一次。";
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-" + name).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === name));
}

// ---------- 選關卡 ----------
async function loadScenarios() {
  const grid = $("#scenario-grid");
  try {
    const list = await api("/api/scenarios");
    grid.innerHTML = "";
    list.forEach((s) => grid.appendChild(scenarioCard(s)));
  } catch (e) { grid.innerHTML = `<p style="color:var(--muted)">載入關卡失敗:${e.message}</p>`; }
}
function scenarioCard(s) {
  const st = styleFor(s.genre);
  const card = el(`
    <div class="gcard">
      <div class="gcard-banner" style="background:${st.grad}">
        <span class="pill pill-genre">${s.genre}</span>
        <span class="gcard-emoji">${st.emoji}</span>
        <div class="gcard-name">${s.name}</div>
      </div>
      <div class="gcard-body">
        <p class="gcard-desc">${s.situation || s.persona}</p>
        <div class="gcard-meta">
          <span class="chip">初始憤怒 ${s.initial_anger}</span>
          <span class="chip">${s.max_turns} 回合</span>
        </div>
        <span class="gcard-cta">開始挑戰 →</span>
      </div>
    </div>`);
  card.addEventListener("click", () => startGame(s.scenario_id));
  return card;
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
      <span class="pill" style="background:${st.grad};color:#fff">${st.emoji} ${d.scenario.genre}</span>
      <div class="ok-name">${d.scenario.name}</div>
      <p class="ok-persona">${d.scenario.persona}</p>`;
    updateMeter(d.anger, d.turn, d.max_turns);
    $("#chat").innerHTML = "";
    addMessage("bot", d.opening_line, d.scenario.name);
    $("#msg").disabled = false; $("#send").disabled = false; $("#msg").value = ""; $("#msg").focus();
    $("#report").classList.add("hidden");
    showView("game");
  } catch (e) { toast(e.message); }
}

function updateMeter(anger, turn, maxTurns) {
  $("#meter-card").innerHTML = `
    <div class="meter-label">
      <span class="meter-anger">😠 憤怒值 ${anger}/100</span>
      <span class="meter-turn">回合 ${turn}/${maxTurns}</span>
    </div>
    <div class="meter-bar"><div class="meter-fill" style="width:${anger}%;background:${angerColor(anger)}"></div></div>`;
}

function addMessage(role, text, who) {
  const tag = who ? `<span class="who">${who}</span>` : "";
  const node = el(`<div class="msg ${role}">${tag}${escapeHtml(text)}</div>`);
  $("#chat").appendChild(node);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return node;
}
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

async function send() {
  if (STATE.busy || STATE.ended || !STATE.thread) return;
  const input = $("#msg"); const text = input.value.trim();
  if (!text) { toast("請先輸入你的回應。"); return; }
  STATE.busy = true; input.disabled = true; $("#send").disabled = true;
  addMessage("user", text, "你");
  input.value = "";
  const thinking = addMessage("bot thinking", "⌛ 思考中…");
  try {
    const d = await api("/api/say", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: STATE.thread, text }),
    });
    thinking.remove();
    addMessage("bot", d.ai_reply, "奧客");
    updateMeter(d.anger, d.turn, d.max_turns);
    if (d.ended) {
      STATE.ended = true;
      addMessage("bot", d.ending_line, "奧客");
      showReport(d);
    } else {
      STATE.busy = false; input.disabled = false; $("#send").disabled = false; input.focus();
    }
  } catch (e) {
    thinking.remove(); toast(e.message);
    STATE.busy = false; input.disabled = false; $("#send").disabled = false;
    input.value = text; input.focus();
  }
}

// ---------- 報告 ----------
function showReport(d) {
  const r = d.report;
  const comp = Math.round((r.empathy_score + r.crisis_score + r.compliance_score) / 3);
  const metric = (label, v) => `
    <div class="metric">
      <div class="metric-top"><span>${label}</span><b>${(v / 10).toFixed(1)}</b></div>
      <div class="metric-bar"><div class="metric-fill" style="width:${v}%"></div></div>
    </div>`;
  const li = (arr) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  $("#report-card").innerHTML = `
    <div class="report-ending">培訓報告 · ${d.ending_label}</div>
    <div class="report-score">${(comp / 10).toFixed(1)}<small> / 10.0</small></div>
    <div class="report-title">綜合表現</div>
    ${metric("同理心 Empathy", r.empathy_score)}
    ${metric("危機應變 Crisis", r.crisis_score)}
    ${metric("法規遵從 Compliance", r.compliance_score)}
    ${trajectorySVG(d.anger_history, d.emotion_history)}
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
}

// 憤怒軌跡小折線(SVG)
function trajectorySVG(hist, emo) {
  if (!hist || hist.length < 2) return "";
  const W = 480, H = 90, pad = 10;
  const n = hist.length;
  const x = (i) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (v) => pad + (1 - v / 100) * (H - 2 * pad);
  const pts = hist.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const dots = hist.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="#FE494A"/>`).join("");
  return `<div class="report-h">憤怒值軌跡</div>
    <svg class="report-traj" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polyline points="${pts}" fill="none" stroke="#FE494A" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round"/>${dots}
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
        <div class="gcard">
          <div class="gcard-banner" style="background:${st.grad}">
            <span class="pill pill-genre">${g.ending_label || g.ending_type}</span>
            <span class="gcard-emoji">${st.emoji}</span>
            <div class="gcard-name">${g.scenario_name || "?"}</div>
          </div>
          <div class="gcard-body">
            <div class="gcard-meta">
              <span class="chip">${g.turns} 回合</span>
              <span class="chip">最終憤怒 ${g.final_anger ?? "?"}</span>
            </div>
            <span class="gcard-cta">查看回放 →</span>
            <p class="gcard-desc" style="margin:0;font-size:.8rem">${g.created_at || ""}</p>
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
    const box = $("#history-detail");
    const msgs = (d.transcript || []).map((m) =>
      `<div class="msg ${m.role === "user" ? "user" : "bot"}">
         <span class="who">${m.role === "user" ? "你" : "奧客"}</span>${escapeHtml(m.content)}</div>`).join("");
    const r = d.report;
    const rep = r ? `<div class="report-summary" style="margin-top:16px">
        <b>同理心 ${(r.empathy_score/10).toFixed(1)} ｜ 危機 ${(r.crisis_score/10).toFixed(1)} ｜ 法規 ${(r.compliance_score/10).toFixed(1)}</b><br>${escapeHtml(r.summary)}</div>` : "";
    box.innerHTML = `
      <div class="section-head"><h2>${d.scenario_name} · ${d.ending_label || d.ending_type}</h2><span class="rule"></span></div>
      ${trajectorySVG(d.anger_history, d.emotion_history)}
      <div class="transcript">${msgs}</div>${rep}`;
    box.classList.remove("hidden");
    box.scrollIntoView({ behavior: "smooth" });
  } catch (e) { toast(e.message); }
}

// ---------- 綁定 ----------
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => { const v = t.dataset.view; showView(v); if (v === "history") loadHistory(); }));
$("#send").addEventListener("click", send);
$("#msg").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
$("#quit").addEventListener("click", () => showView("select"));
$("#history-refresh").addEventListener("click", loadHistory);

loadScenarios();
