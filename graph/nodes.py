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
        "concession_cost": turn.concession_cost,
        "messages": [HumanMessage(state["player_input"]), AIMessage(turn.reply)],
    }


def apply_state(state: GameState) -> dict:
    """套用憤怒變化:後端硬性夾限 anger_change(防暴衝/防作弊),再夾血條在 0~100,回合 +1。

    難度的「怒氣衰減係數」calm_resistance 在這裡生效:只縮放「安撫成功」的負向 delta
    (困難關同一句好話降的怒氣較少),被惹怒的正向 delta 不打折(被踩雷一樣痛)。

    同時累積本回合的讓步成本 cost_spent(單值替換寫回,resume 不會重複累加),並把本回合情緒
    追加進 emotion_history(reducer 累加),讓情緒/成本軌跡都由 checkpointer 持久化。
    """
    delta = max(-30, min(30, state["anger_change"]))
    if delta < 0:  # 只衰減安撫效果,不衰減惹怒
        resistance = float((state.get("scenario") or {}).get("calm_resistance", 1.0)) or 1.0
        delta = round(delta / resistance)
    new_anger = max(0, min(100, state["anger"] + delta))
    cost = max(0, min(100, int(state.get("concession_cost", 0) or 0)))
    return {
        "anger": new_anger,
        "turn": state["turn"] + 1,
        "anger_history": [new_anger],
        "emotion_history": [state.get("emotion", "neutral")],
        "cost_spent": int(state.get("cost_spent", 0) or 0) + cost,
    }


def classify_ending(state: GameState) -> dict:
    """判斷結局類型並寫進 state(沒結束 → None)。

    寫進 state 而非只在岔路回傳,是因為 conditional edge 的回傳值不會進 state,
    後面的 set_ending 需要從 state 讀 ending_type 才能取對應台詞。

    結局優先級(由高到低,務必維持此順序):
      1. fail    —— anger >= 100:顧客爆表/砸店/投訴。最優先,即使同回合 LLM 判和解也算砸店。
      2. success —— ended is True:**由 LLM(CustomerTurn.ended)判定「玩家提出完美方案、顧客願和解」**。
                    和解與否交給 LLM,不再用「血條歸零」自動判成功(血條低只代表顧客冷靜,不等於問題解決)。
      3. timeout —— turn >= max_turns:回合用盡仍未化解。success 優先於 timeout
                    (玩家在最後一回合談成也算成功)。
      4. None    —— 以上皆非,繼續對話。
    """
    if state["anger"] >= 100:
        et = "fail"  # 砸店 / 投訴(爆表最優先)
    elif state["ended"]:
        et = "success"  # 和解:由 LLM 判定完美方案(不靠血條歸零搶判)
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
    ending_lines = state["scenario"].get("ending_lines", {})
    # 防禦:理論上 loader 已驗證過,但若關卡缺該結局台詞,退一句通用收尾而非 KeyError 崩潰
    line = ending_lines.get(ending_type) or "(對話結束。)"
    return {
        "ended": True,
        "emotion": _ENDING_EMOTION.get(ending_type, "neutral"),
        "messages": [AIMessage(line)],
    }


def _cost_control_score(cost_spent: int, budget: int) -> int:
    """讓步成本 → 成本控制分(0~100,後端確定性公式,可解釋)。

    中等力道(超支封頂 B):
      - 預算內:100 →(花滿預算)75,鼓勵低成本和解。
      - 超支:75 線性降到 0(花到兩倍預算歸零)。
    讓「照單全收/無腦讓步」成本爆表 → 成本控制分低 → 拉低綜合分。
    """
    budget = max(1, int(budget or 1))
    c = max(0, int(cost_spent or 0))
    if c <= budget:
        return int(round(100 - (c / budget) * 25))
    return max(0, int(round(75 - (c - budget) / budget * 75)))


def judge(state: GameState) -> dict:
    """評審大腦:跳出角色,審視整場對話,輸出結構化報告。

    連同結局、憤怒值軌跡、讓步成本一起餵給評審,讓評分呼應勝負、不與結果矛盾。
    cost_control_score 由後端公式算(穩定、可解釋),覆寫進報告;讓步成本也一併附上供前端顯示。
    """
    budget = int(state["scenario"].get("cost_budget", 80) or 80)
    cost_spent = int(state.get("cost_spent", 0) or 0)
    report = llm.judge_report(
        state["messages"],
        ending_type=state["ending_type"],
        anger_history=state.get("anger_history"),
        max_turns=state["max_turns"],
        cost_spent=cost_spent,
        cost_budget=budget,
    )
    data = report.model_dump()
    data["cost_control_score"] = _cost_control_score(cost_spent, budget)
    data["cost_spent"] = cost_spent
    data["cost_budget"] = budget
    return {"report": data}
