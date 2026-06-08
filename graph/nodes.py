"""LangGraph 節點 —— 每個節點是一個純函式:讀 state → 做事 → 回傳要更新的欄位。

資料流(一個回合):
    customer_brain → apply_state → classify_ending → [岔路]
        ├─ continue → END(等玩家下一句)
        └─ ending   → set_ending → judge → END
"""

from langchain_core.messages import AIMessage, HumanMessage

from graph.state import GameState
from services import llm

# 結局類型 → 結局時前端立繪要顯示的情緒
_ENDING_EMOTION = {"fail": "angry", "success": "happy", "timeout": "annoyed"}


def customer_brain(state: GameState) -> dict:
    """奧客大腦:用奧客口吻回一句話,同時評估玩家這句話的憤怒變化。"""
    turn = llm.customer_turn(
        system_prompt=state["system_prompt"],
        anger=state["anger"],
        messages=state["messages"],
        player_input=state["player_input"],
    )
    return {
        "ai_reply": turn.reply,
        "anger_change": turn.anger_change,
        "emotion": turn.emotion,
        "ended": turn.ended,
        "messages": [HumanMessage(state["player_input"]), AIMessage(turn.reply)],
    }


def apply_state(state: GameState) -> dict:
    """套用憤怒變化:後端硬性夾限 anger_change(防暴衝/防作弊),再夾血條在 0~100,回合 +1。"""
    delta = max(-30, min(30, state["anger_change"]))
    new_anger = max(0, min(100, state["anger"] + delta))
    return {"anger": new_anger, "turn": state["turn"] + 1}


def classify_ending(state: GameState) -> dict:
    """判斷結局類型並寫進 state(沒結束 → None)。

    寫進 state 而非只在岔路回傳,是因為 conditional edge 的回傳值不會進 state,
    後面的 set_ending 需要從 state 讀 ending_type 才能取對應台詞。
    """
    if state["anger"] >= 100:
        et = "fail"  # 砸店 / 投訴
    elif state["anger"] <= 0 or state["ended"]:
        et = "success"  # 和解(消氣 或 LLM 判定完美方案)
    elif state["turn"] >= state["max_turns"]:
        et = "timeout"  # 超時無效溝通
    else:
        et = None
    return {"ending_type": et}


def route_after_classify(state: GameState) -> str:
    """conditional edge:只讀 state,決定走向。"""
    return "continue" if state["ending_type"] is None else "ending"


def set_ending(state: GameState) -> dict:
    """收尾:附加 scenario 預寫好的結局台詞(與血條一致,不靠 LLM 即時生成)。"""
    ending_type = state["ending_type"]
    line = state["scenario"]["ending_lines"][ending_type]
    return {
        "ended": True,
        "emotion": _ENDING_EMOTION.get(ending_type, "neutral"),
        "messages": [AIMessage(line)],
    }


def judge(state: GameState) -> dict:
    """評審大腦:跳出角色,審視整場對話,輸出結構化報告。"""
    report = llm.judge_report(state["messages"])
    return {"report": report.model_dump()}
