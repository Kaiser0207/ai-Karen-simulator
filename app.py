"""AI 奧客應對演練 —— Gradio 網頁介面。

分兩頁:
  「遊戲」    :選關卡 → 打字或語音(STT)對話 → 即時憤怒值 → 結束出評審報告。
  「歷史紀錄」:回顧過去每一場的對話、奧客情緒/憤怒軌跡、評審報告。

直接 import 後端(graph + loader),前端事件呼叫 graph.invoke。
執行:  uv run python app.py
"""

import sqlite3
import threading
import time
import uuid

import matplotlib

matplotlib.use("Agg")  # 無視窗環境也能畫圖
import gradio as gr
import matplotlib.pyplot as plt
import numpy as np
from langgraph.checkpoint.sqlite import SqliteSaver

import config
import storage
from graph.build import build_graph
from scenarios import loader
from services import stt

# ── 啟動時建一次圖。Gradio 多執行緒,SQLite 連線需 check_same_thread=False ──
_conn = sqlite3.connect("game_state.db", check_same_thread=False)
GRAPH = build_graph(SqliteSaver(_conn))

ENDING_LABEL = {
    "fail": "💥 失敗(砸店 / 投訴)",
    "success": "⭐ 成功(和解)",
    "timeout": "⏰ 超時(無效溝通)",
}


# ====================================================================
# 視覺輔助
# ====================================================================
def anger_html(anger: int, turn: int | None = None, max_turns: int | None = None) -> str:
    color = "#e74c3c" if anger >= 70 else "#f39c12" if anger >= 40 else "#2ecc71"
    turn_line = ""
    if turn is not None and max_turns:
        turn_line = (f'<div style="font-weight:600;color:#607d8b;margin-bottom:6px;">'
                     f'🔄 回合 {turn}/{max_turns}</div>')
    return f"""
    <div style="margin:4px 0;">
      {turn_line}
      <div style="font-weight:600;margin-bottom:4px;">😠 憤怒值 {anger}/100</div>
      <div style="background:#eceff1;border-radius:10px;overflow:hidden;height:22px;">
        <div style="width:{anger}%;height:100%;background:{color};
                    transition:width .4s;border-radius:10px;"></div>
      </div>
    </div>"""


def radar_fig(report: dict):
    labels = ["Empathy", "Crisis", "Compliance"]
    vals = [report["empathy_score"], report["crisis_score"], report["compliance_score"]]
    angles = np.linspace(0, 2 * np.pi, len(labels), endpoint=False).tolist()
    vals_c, angles_c = vals + vals[:1], angles + angles[:1]
    fig, ax = plt.subplots(subplot_kw=dict(polar=True), figsize=(4, 4))
    ax.plot(angles_c, vals_c, color="#e74c3c")
    ax.fill(angles_c, vals_c, color="#e74c3c", alpha=0.25)
    ax.set_xticks(angles)
    ax.set_xticklabels(labels)
    ax.set_ylim(0, 100)
    ax.set_title("Training Report")
    return fig


def trajectory_fig(anger_history: list, emotion_history: list):
    """憤怒值折線圖,並在每回合標註奧客情緒。"""
    fig, ax = plt.subplots(figsize=(6, 3.2))
    x = list(range(len(anger_history)))
    ax.plot(x, anger_history, marker="o", color="#e74c3c", linewidth=2)
    ax.set_ylim(0, 100)
    ax.set_xlabel("Turn")
    ax.set_ylabel("Anger")
    ax.set_title("Anger Trajectory (with emotion)")
    ax.grid(alpha=0.3)
    for i, emo in enumerate(emotion_history):  # emotion[i] 對應 anger[i+1]
        idx = i + 1
        if idx < len(anger_history):
            ax.annotate(emo, (x[idx], anger_history[idx]),
                        textcoords="offset points", xytext=(0, 8), fontsize=8, ha="center")
    fig.tight_layout()
    return fig


def report_md(ending_type: str, report: dict) -> str:
    good = "\n".join(f"- {g}" for g in report["good_practices"])
    bad = "\n".join(f"- {b}" for b in report["bad_practices"])
    return (
        f"### 📊 培訓報告 — {ENDING_LABEL.get(ending_type, ending_type)}\n\n"
        f"**同理心 {report['empathy_score']} ｜ 危機應變 {report['crisis_score']} "
        f"｜ 法規遵從 {report['compliance_score']}**\n\n"
        f"**✅ 做得好**\n{good}\n\n"
        f"**❌ 可改進**\n{bad}\n\n"
        f"**總評**:{report['summary']}"
    )


# ====================================================================
# 錯誤處理輔助
# ====================================================================
_TRANSIENT = ("429", "resource_exhausted", "rate", "quota", "timeout", "deadline",
              "unavailable", "connection", "503", "500")


def _is_transient(err: Exception) -> bool:
    msg = str(err).lower()
    return any(k in msg for k in _TRANSIENT)


def _friendly_error(err: Exception) -> str:
    msg = str(err).lower()
    if "429" in msg or "resource_exhausted" in msg or "quota" in msg or "rate" in msg:
        return "AI 服務暫時達到使用上限,請稍候幾秒再送一次。"
    if "timeout" in msg or "deadline" in msg or "connection" in msg or "unavailable" in msg:
        return "連線不穩或逾時,請再試一次。"
    return f"發生錯誤,請再試一次。({type(err).__name__})"


def _invoke_with_retry(payload, cfg, retries: int = 1):
    """呼叫後端,遇到暫時性錯誤(如 429)退避後重試一次,其餘立即拋出。"""
    for attempt in range(retries + 1):
        try:
            return GRAPH.invoke(payload, cfg)
        except Exception as err:  # noqa: BLE001
            if attempt < retries and _is_transient(err):
                time.sleep(2)
                continue
            raise


# ====================================================================
# 遊戲頁事件
# ====================================================================
def start_game(scenario_id):
    init = loader.load(scenario_id)
    sid = uuid.uuid4().hex
    chat = [{"role": "assistant", "content": init["scenario"]["opening_line"]}]
    return (
        chat,                       # chatbot
        anger_html(init["anger"], 0, init["max_turns"]),  # anger_box(回合 0 = 尚未出手)
        sid,                        # st_sid
        init,                       # st_init
        True,                       # st_first
        False,                      # st_done
        [init["anger"]],            # st_anger_hist(含開局值)
        [],                         # st_emotion_hist
        gr.update(value="", interactive=True),   # textbox
        gr.update(interactive=True),             # send_btn
        gr.update(visible=False),                # report_col
    )


def player_say(text, chat, sid, init, first, done, anger_hist, emotion_hist):
    """串流式:① 先顯示玩家的話+思考中 → ② 奧客回應 →(結束)③ 結局台詞 → ④ 報告。"""
    if not sid or done:
        gr.Warning("請先選擇關卡並按「開始挑戰」。")
        yield (gr.update(), gr.update(), gr.update(), gr.update(), gr.update(),
               gr.update(), gr.update(), first, done, anger_hist, emotion_hist)
        return
    if not text or not text.strip():
        gr.Warning("請先輸入(或說出)你的回應。")
        yield (gr.update(), gr.update(), gr.update(), gr.update(), gr.update(),
               gr.update(), gr.update(), first, done, anger_hist, emotion_hist)
        return

    base = chat
    user_msg = {"role": "user", "content": text}

    # ① 立刻顯示玩家訊息 + 思考中,鎖輸入
    thinking = base + [user_msg, {"role": "assistant", "content": "⌛ 思考中…"}]
    yield (thinking, gr.update(), gr.update(value="", interactive=False),
           gr.update(interactive=False), gr.update(), gr.update(), gr.update(),
           first, done, anger_hist, emotion_hist)

    # ② 呼叫後端(含一次退避重試 + 友善錯誤處理)
    payload = {**init, "player_input": text} if first else {"player_input": text}
    try:
        result = _invoke_with_retry(payload, {"configurable": {"thread_id": sid}})
    except Exception as err:  # noqa: BLE001
        gr.Warning(_friendly_error(err))
        # 移除「思考中」、保留玩家訊息、把字還回輸入框、解鎖讓他重送。
        # first 設 False:本回合輸入已被 checkpointer 記錄,重試只需再送一次即可,不必重帶 init。
        yield (base + [user_msg], gr.update(), gr.update(value=text, interactive=True),
               gr.update(interactive=True), gr.update(), gr.update(), gr.update(visible=False),
               False, done, anger_hist, emotion_hist)
        return
    anger = result["anger"]
    new_anger_hist = anger_hist + [anger]
    new_emotion_hist = emotion_hist + [result.get("emotion", "neutral")]
    after_reply = base + [user_msg, {"role": "assistant", "content": result["ai_reply"]}]

    if not result.get("ended"):
        yield (after_reply, anger_html(anger, result["turn"], result["max_turns"]),
               gr.update(value="", interactive=True),
               gr.update(interactive=True), gr.update(), gr.update(), gr.update(visible=False),
               False, False, new_anger_hist, new_emotion_hist)
        return

    # ③ 結束:把奧客本回合反應與預寫結局台詞合併成「同一句收尾」,避免連續兩則氣泡。
    ending_line = result["messages"][-1].content
    final_say = f"{result['ai_reply']}\n\n{ending_line}"
    after_ending = base + [user_msg, {"role": "assistant", "content": final_say}]
    anger_box_end = anger_html(anger, result["turn"], result["max_turns"])
    yield (after_ending, anger_box_end, gr.update(value="", interactive=False),
           gr.update(interactive=False), gr.update(), gr.update(), gr.update(visible=False),
           False, True, new_anger_hist, new_emotion_hist)

    # 存檔(供歷史紀錄頁回顧)
    storage.save_game(
        thread_id=sid, scenario=init["scenario"], ending_type=result["ending_type"],
        anger_history=new_anger_hist, emotion_history=new_emotion_hist,
        transcript=after_ending, report=result["report"],
    )

    # ④ 最後才出現評審報告
    yield (after_ending, anger_box_end, gr.update(interactive=False),
           gr.update(interactive=False), report_md(result["ending_type"], result["report"]),
           radar_fig(result["report"]), gr.update(visible=True),
           False, True, new_anger_hist, new_emotion_hist)


def on_record(audio_path, chat, sid, init, first, done, anger_hist, emotion_hist):
    """麥克風錄音 → STT 轉文字 → 走和打字完全一樣的回合流程。
    每次 yield 末尾多帶一個 None,用來把錄音框清空(錄完自動清掉)。
    """
    try:
        text = stt.transcribe(audio_path)
    except Exception as err:  # noqa: BLE001
        gr.Warning(f"語音辨識失敗,請改用打字或再錄一次。({type(err).__name__})")
        yield (gr.update(), gr.update(), gr.update(), gr.update(), gr.update(),
               gr.update(), gr.update(), first, done, anger_hist, emotion_hist, None)
        return
    if not text.strip():
        gr.Warning("沒聽清楚,請再說一次。")
        yield (gr.update(), gr.update(), gr.update(), gr.update(), gr.update(),
               gr.update(), gr.update(), first, done, anger_hist, emotion_hist, None)
        return
    for step in player_say(text, chat, sid, init, first, done, anger_hist, emotion_hist):
        yield (*step, None)  # 末尾 None = 清空錄音框


# ====================================================================
# 歷史紀錄頁事件
# ====================================================================
def _history_choices():
    out = []
    for g in storage.list_games():
        label = (f"{g['scenario_name']} ｜ {ENDING_LABEL.get(g['ending_type'], g['ending_type'])} "
                 f"｜ {g['turns']}回合 ｜ {g['created_at']}")
        out.append((label, g["thread_id"]))
    return out


def refresh_history():
    return gr.update(choices=_history_choices(), value=None)


def view_game(thread_id):
    if not thread_id:
        return [], None, ""
    d = storage.load_game(thread_id)
    if not d:
        return [], None, "找不到這場紀錄。"
    chat = d.get("transcript", [])
    fig = trajectory_fig(d.get("anger_history", []), d.get("emotion_history", []))
    emo_line = " → ".join(d.get("emotion_history", [])) or "(無)"
    md = (
        f"#### {d.get('scenario_name','')} ｜ {ENDING_LABEL.get(d.get('ending_type'), d.get('ending_type'))}\n"
        f"回合數 {d.get('turns')} ｜ 最終憤怒 {d.get('final_anger')} ｜ {d.get('created_at')}\n\n"
        f"**奧客情緒變化**:{emo_line}\n\n"
        + (report_md(d.get("ending_type"), d["report"]) if d.get("report") else "")
    )
    return chat, fig, md


# ====================================================================
# 介面組裝
# ====================================================================
_SCENARIOS = [(s["name"] + f"({s['genre']})", s["scenario_id"]) for s in loader.list_scenarios()]

CUSTOM_CSS = """
/* 避免對話框出現雙層上下捲軸:外層不捲,只讓內層訊息區捲 */
#okeke-chat { overflow: hidden !important; }
#okeke-chat [class*="bubble-wrap"],
#okeke-chat [class*="message-wrap"] { overflow-y: auto !important; max-height: none !important; }
"""

with gr.Blocks(title="AI 奧客應對演練", css=CUSTOM_CSS) as demo:
    gr.Markdown(
        "# 🧯 AI 奧客應對演練\n"
        "AI 即時情緒模擬 × 危機溝通訓練 —— 你是店員,想辦法在回合內安撫 AI 奧客。"
    )

    # session 狀態
    st_sid = gr.State(None)
    st_init = gr.State(None)
    st_first = gr.State(True)
    st_done = gr.State(False)
    st_anger_hist = gr.State([])
    st_emotion_hist = gr.State([])

    with gr.Tabs():
        # ───────────────── 遊戲頁 ─────────────────
        with gr.Tab("🎮 遊戲"):
            with gr.Row():
                scenario_dd = gr.Dropdown(
                    choices=_SCENARIOS, value=_SCENARIOS[0][1], label="選擇關卡(奧客)"
                )
                start_btn = gr.Button("開始挑戰 / 重新開始", variant="primary")

            anger_box = gr.HTML(anger_html(50))
            chatbot = gr.Chatbot(height=420, label="對話", elem_id="okeke-chat")

            with gr.Row():
                textbox = gr.Textbox(
                    placeholder="輸入你要對奧客說的話…(先按上面開始挑戰)",
                    interactive=False, scale=7, show_label=False,
                )
                send_btn = gr.Button("送出", interactive=False, scale=1)
            mic = gr.Audio(sources=["microphone"], type="filepath", label="🎤 或用說的(放開自動送出)")

            with gr.Column(visible=False) as report_col:
                report_text = gr.Markdown()
                report_plot = gr.Plot()

        # ───────────────── 歷史紀錄頁 ─────────────────
        with gr.Tab("📜 歷史紀錄") as history_tab:
            with gr.Row():
                history_dd = gr.Dropdown(choices=_history_choices(), label="選擇一場過去的對局", scale=8)
                refresh_btn = gr.Button("🔄 重新整理", scale=1)
            hist_chatbot = gr.Chatbot(height=360, label="對話回放", elem_id="hist-chat")
            hist_plot = gr.Plot(label="憤怒值 / 情緒 軌跡")
            hist_md = gr.Markdown()

    # ── 事件綁定 ──
    start_btn.click(
        start_game,
        inputs=[scenario_dd],
        outputs=[chatbot, anger_box, st_sid, st_init, st_first, st_done,
                 st_anger_hist, st_emotion_hist, textbox, send_btn, report_col],
    )

    _say_inputs = [textbox, chatbot, st_sid, st_init, st_first, st_done, st_anger_hist, st_emotion_hist]
    _say_outputs = [chatbot, anger_box, textbox, send_btn, report_text, report_plot, report_col,
                    st_first, st_done, st_anger_hist, st_emotion_hist]
    send_btn.click(player_say, inputs=_say_inputs, outputs=_say_outputs)
    textbox.submit(player_say, inputs=_say_inputs, outputs=_say_outputs)

    _rec_inputs = [mic, chatbot, st_sid, st_init, st_first, st_done, st_anger_hist, st_emotion_hist]
    mic.stop_recording(on_record, inputs=_rec_inputs, outputs=_say_outputs + [mic])

    # 歷史頁
    refresh_btn.click(refresh_history, outputs=[history_dd])
    history_tab.select(refresh_history, outputs=[history_dd])
    history_dd.change(view_game, inputs=[history_dd], outputs=[hist_chatbot, hist_plot, hist_md])


if __name__ == "__main__":
    # 啟動時用背景執行緒預載 STT 模型到 GPU(不擋網頁,第一次錄音不卡)。
    # 放在 __main__ 才跑:import app(測試用)時不會有副作用。可在 .env 設 STT_WARMUP=0 關閉。
    if config.STT_WARMUP:
        threading.Thread(target=stt.warmup, daemon=True).start()
    demo.launch(server_name="0.0.0.0", server_port=7860)
