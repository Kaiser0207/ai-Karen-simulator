"""GameState — 貫穿整場遊戲的共享狀態(LangGraph 的「筆記本」)。

所有節點都讀寫這份 state。一次 graph.invoke = 一個回合。
跨回合的記憶由 checkpointer(SqliteSaver)自動保存,以 thread_id 為鍵。
"""

import operator
from typing import Annotated, Optional, TypedDict

from langgraph.graph.message import add_messages


class GameState(TypedDict):
    # --- 關卡靜態設定(開局載入,整場不變) ---
    scenario_id: str
    scenario: dict  # 完整關卡設定(含 ending_lines、avatar 等,供節點取用)
    system_prompt: str  # 組合後的奧客 system prompt(骨架模板 + 角色變數)
    max_turns: int  # 回合上限(如 8)

    # --- 動態狀態(每回合變化) ---
    anger: int  # 當前憤怒值 0~100
    turn: int  # 已進行回合數
    messages: Annotated[list, add_messages]  # 對話歷史(add_messages reducer 會自動追加)
    anger_history: Annotated[list, operator.add]  # 每回合結束後的憤怒值(含開局),供評審看軌跡
    emotion_history: Annotated[list, operator.add]  # 每回合奧客情緒(長度=回合數),由 checkpointer 持久化

    # --- 本回合 I/O ---
    player_input: str  # 本回合玩家文字(STT 後 / 直接打字)
    ai_reply: str  # 本回合奧客台詞
    anger_change: int  # 本回合憤怒變化量(供前端動畫)
    emotion: str  # 本回合情緒標籤(供前端換立繪 / 將來 TTS)

    # --- 結束相關 ---
    ended: bool
    ending_type: Optional[str]  # "fail" | "success" | "timeout" | None
    report: Optional[dict]  # 評審報告(只有結束才有)
