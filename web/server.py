"""FastAPI 薄層 —— 把遊戲的 LangGraph 後端包成 JSON API,給自訂網頁前端用。

遊戲邏輯完全沿用 graph/、services/、scenarios/、storage.py;本檔只負責
「HTTP ↔ graph.invoke」與工作階段管理,等同把 app.py(Gradio)的 player_say 流程
改寫成 REST API。前端是純 HTML/CSS/JS(web/static,免 build)。

執行:
    uv run python -m web.server
  或:
    uv run uvicorn web.server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

import config
import storage
from graph.build import build_graph
from scenarios import loader
from services import stt

# 建一次圖。多執行緒下 SQLite 連線需 check_same_thread=False;
# 加 timeout(被鎖時最多等 30s 而非立刻拋 "database is locked")+ WAL(讀寫併發較友善)。
_conn = sqlite3.connect("game_state.db", check_same_thread=False, timeout=30)
_conn.execute("PRAGMA journal_mode=WAL")
GRAPH = build_graph(SqliteSaver(_conn))

# 單一 SQLite 連線在多執行緒下「同時使用同一 cursor」並不安全 → 用鎖把 graph 的讀寫序列化。
# 這是訓練用工具(併發極低),序列化最簡單且安全;日後要真併發再換 Postgres / 連線池。
_DB_LOCK = threading.Lock()


def _graph_invoke(payload, cfg):
    with _DB_LOCK:
        return GRAPH.invoke(payload, cfg)


def _graph_get_state(cfg):
    with _DB_LOCK:
        return GRAPH.get_state(cfg)


# STT 語音輸入:啟動就背景預載模型(不擋啟動),讓第一次錄音不卡。STT_WARMUP=0 可關。
if config.STT_WARMUP:
    threading.Thread(target=stt.warmup, daemon=True).start()


# thread_id -> 本場附加資訊(graph state 由 checkpointer 存;這裡只記「是否首回合」「關卡」「最後活動時間」)。
# 伺服器重啟會清空,但進行中的對局可從 checkpointer 還原(見 _get_session)。
SESSIONS: dict[str, dict] = {}
_SESS_LOCK = threading.Lock()
_SESSION_TTL = 3600  # 閒置逾時(秒);超過就清掉記憶體 session(之後仍可從 checkpointer 還原)


def _gc_sessions(now: float) -> None:
    """清掉閒置過久的記憶體 session,避免玩家中離後永久佔用記憶體。"""
    stale = [sid for sid, s in SESSIONS.items() if now - s.get("last", now) > _SESSION_TTL]
    for sid in stale:
        SESSIONS.pop(sid, None)


def _get_session(thread_id: str) -> dict | None:
    """取 session;記憶體沒有時(伺服器重啟 / TTL 清掉)試著從 checkpointer 還原。

    進行中的 graph state 由 SqliteSaver 以 thread_id 持久化,所以即使 SESSIONS 不在,
    只要該 thread 已跑過至少一回合,就能還原關卡並以 first=False 繼續對局。
    """
    now = time.time()
    with _SESS_LOCK:
        _gc_sessions(now)
        sess = SESSIONS.get(thread_id)
        if sess:
            return sess
    # 記憶體沒有 → 查 checkpointer(在 SESS_LOCK 外做,避免長時間持鎖)
    try:
        snap = _graph_get_state({"configurable": {"thread_id": thread_id}})
    except Exception:  # noqa: BLE001
        snap = None
    vals = getattr(snap, "values", None) if snap else None
    if not vals or not vals.get("scenario"):
        return None  # 從沒開始過 → 真的不存在
    recovered = {"first": False, "scenario": vals["scenario"], "last": now}
    with _SESS_LOCK:
        SESSIONS[thread_id] = recovered
    return recovered

ENDING_LABEL = {
    "fail": "失敗 · 砸店/投訴",
    "success": "成功 · 和解",
    "timeout": "超時 · 無效溝通",
}

_TRANSIENT = ("429", "resource_exhausted", "rate", "quota", "timeout", "deadline",
              "unavailable", "connection", "503", "500")


def _is_transient(err: Exception) -> bool:
    return any(k in str(err).lower() for k in _TRANSIENT)


def _friendly_error(err: Exception) -> str:
    msg = str(err).lower()
    if any(k in msg for k in ("429", "resource_exhausted", "quota", "rate")):
        return "AI 服務暫時達到使用上限,請稍候幾秒再送一次。"
    if any(k in msg for k in ("timeout", "deadline", "connection", "unavailable")):
        return "連線不穩或逾時,請再試一次。"
    return f"發生錯誤,請再試一次。({type(err).__name__})"


def _invoke_with_retry(payload, cfg, retries: int = 1):
    """遇暫時性錯誤(如 429)退避重試一次,其餘立即拋出。"""
    for attempt in range(retries + 1):
        try:
            return _graph_invoke(payload, cfg)
        except Exception as err:  # noqa: BLE001
            if attempt < retries and _is_transient(err):
                time.sleep(2)
                continue
            raise


app = FastAPI(title="AI 奧客應對演練 API")


class StartReq(BaseModel):
    scenario_id: str


class SayReq(BaseModel):
    thread_id: str
    text: str


@app.get("/api/scenarios")
def api_scenarios():
    """關卡清單(給選關卡頁的卡片用)。"""
    out = []
    for meta in loader.list_scenarios():
        sc = loader.load(meta["scenario_id"])["scenario"]
        out.append({
            "scenario_id": sc["scenario_id"],
            "name": sc["name"],
            "genre": sc["genre"],
            "persona": sc.get("persona", ""),
            "situation": sc.get("situation", ""),
            "triggers": sc.get("triggers", ""),
            "opening_line": sc.get("opening_line", ""),
            "initial_anger": sc.get("initial_anger", 50),
            "max_turns": sc.get("max_turns", 8),
        })
    return out


@app.post("/api/start")
def api_start(req: StartReq):
    """開一場新對局:建立 thread_id,回傳開場白與初始狀態。"""
    try:
        init = loader.load(req.scenario_id)
    except FileNotFoundError:
        raise HTTPException(404, "找不到這個關卡")
    sid = uuid.uuid4().hex
    now = time.time()
    with _SESS_LOCK:
        _gc_sessions(now)
        SESSIONS[sid] = {"init": init, "first": True, "scenario": init["scenario"], "last": now}
    sc = init["scenario"]
    return {
        "thread_id": sid,
        "opening_line": sc["opening_line"],
        "anger": init["anger"],
        "turn": 0,
        "max_turns": init["max_turns"],
        "scenario": {"name": sc["name"], "genre": sc["genre"], "persona": sc.get("persona", "")},
    }


@app.post("/api/say")
def api_say(req: SayReq):
    """玩家說一句 → 跑一個回合 → 回傳奧客回應與最新狀態(結束時附結局台詞與評審報告)。"""
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "請先輸入你的回應。")
    sess = _get_session(req.thread_id)
    if not sess:
        raise HTTPException(404, "工作階段不存在或已結束,請重新開始一場。")

    payload = {**sess["init"], "player_input": text} if sess["first"] else {"player_input": text}
    try:
        result = _invoke_with_retry(payload, {"configurable": {"thread_id": req.thread_id}})
    except Exception as err:  # noqa: BLE001
        raise HTTPException(503, _friendly_error(err))
    with _SESS_LOCK:
        if req.thread_id in SESSIONS:
            SESSIONS[req.thread_id].update(first=False, last=time.time())

    anger = result["anger"]
    # 軌跡以 graph state(checkpointer 持久化)為準,不再靠記憶體 session 累加
    anger_history = list(result.get("anger_history") or [anger])
    emotion_history = list(result.get("emotion_history") or [])

    resp = {
        "ai_reply": result["ai_reply"],
        "anger": anger,
        "anger_change": result.get("anger_change", 0),
        "emotion": result.get("emotion", "neutral"),
        "turn": result["turn"],
        "max_turns": result["max_turns"],
        "ended": bool(result.get("ended")),
        "ending_type": result.get("ending_type"),
    }

    if resp["ended"]:
        resp["ending_line"] = result["messages"][-1].content
        resp["ending_label"] = ENDING_LABEL.get(result["ending_type"], result["ending_type"])
        resp["report"] = result["report"]
        resp["anger_history"] = anger_history
        resp["emotion_history"] = emotion_history
        # 從 graph messages 重建逐句對話,存進歷史紀錄
        transcript = [
            {"role": "assistant" if type(m).__name__ == "AIMessage" else "user",
             "content": getattr(m, "content", "")}
            for m in result["messages"]
        ]
        storage.save_game(
            thread_id=req.thread_id, scenario=sess["scenario"], ending_type=result["ending_type"],
            anger_history=anger_history, emotion_history=emotion_history,
            transcript=transcript, report=result["report"],
        )
        with _SESS_LOCK:
            SESSIONS.pop(req.thread_id, None)
    return resp


@app.get("/api/history")
def api_history():
    out = []
    for g in storage.list_games():
        g = dict(g)
        g["ending_label"] = ENDING_LABEL.get(g.get("ending_type"), g.get("ending_type"))
        out.append(g)
    return out


@app.post("/api/stt")
async def api_stt(audio: UploadFile = File(...)):
    """瀏覽器錄音(webm/opus)→ faster-whisper 轉繁中文字。給語音輸入用。"""
    data = await audio.read()
    if not data:
        raise HTTPException(400, "沒有收到音訊,請再錄一次。")
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(data)
        tmp.close()
        text = await run_in_threadpool(stt.transcribe, tmp.name)  # 不擋事件迴圈
    except Exception:  # noqa: BLE001
        raise HTTPException(503, "語音辨識失敗,請改用打字或再錄一次。")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
    return {"text": text}


@app.get("/api/history/{thread_id}")
def api_history_one(thread_id: str):
    d = storage.load_game(thread_id)
    if not d:
        raise HTTPException(404, "找不到這場紀錄")
    d["ending_label"] = ENDING_LABEL.get(d.get("ending_type"), d.get("ending_type"))
    return d


# 靜態前端(放最後 mount,/api 路由優先比對,不會被蓋掉)
_STATIC = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=str(_STATIC), html=True), name="static")


def main():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
