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

import sqlite3
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel

import storage
from graph.build import build_graph
from scenarios import loader

# 建一次圖。多執行緒下 SQLite 連線需 check_same_thread=False。
_conn = sqlite3.connect("game_state.db", check_same_thread=False)
GRAPH = build_graph(SqliteSaver(_conn))

# thread_id -> 本場附加資訊(graph state 由 checkpointer 存;這裡只記前端要的東西)
SESSIONS: dict[str, dict] = {}

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
            return GRAPH.invoke(payload, cfg)
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
    SESSIONS[sid] = {
        "init": init, "first": True, "scenario": init["scenario"],
        "anger_history": [init["anger"]], "emotion_history": [],
    }
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
    sess = SESSIONS.get(req.thread_id)
    if not sess:
        raise HTTPException(404, "工作階段不存在或已結束,請重新開始一場。")
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "請先輸入你的回應。")

    payload = {**sess["init"], "player_input": text} if sess["first"] else {"player_input": text}
    try:
        result = _invoke_with_retry(payload, {"configurable": {"thread_id": req.thread_id}})
    except Exception as err:  # noqa: BLE001
        raise HTTPException(503, _friendly_error(err))
    sess["first"] = False

    anger = result["anger"]
    sess["anger_history"].append(anger)
    sess["emotion_history"].append(result.get("emotion", "neutral"))

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
        resp["anger_history"] = sess["anger_history"]
        resp["emotion_history"] = sess["emotion_history"]
        # 從 graph messages 重建逐句對話,存進歷史紀錄
        transcript = [
            {"role": "assistant" if type(m).__name__ == "AIMessage" else "user",
             "content": getattr(m, "content", "")}
            for m in result["messages"]
        ]
        storage.save_game(
            thread_id=req.thread_id, scenario=sess["scenario"], ending_type=result["ending_type"],
            anger_history=sess["anger_history"], emotion_history=sess["emotion_history"],
            transcript=transcript, report=result["report"],
        )
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
