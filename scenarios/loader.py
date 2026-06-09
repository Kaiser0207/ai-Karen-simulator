"""關卡載入器。

- list_scenarios():給前端下拉選單用。
- load(scenario_id):讀 JSON + 組合 system_prompt + 建立開局 state。
"""

import json
from pathlib import Path

from langchain_core.messages import AIMessage

_SCENARIO_DIR = Path(__file__).parent
_PROMPT_DIR = _SCENARIO_DIR.parent / "prompts"

# 奧客 system prompt 骨架快取(整場啟動只讀一次檔)
_CUSTOMER_TEMPLATE: str | None = None

# scenario JSON 必備欄位(載入時驗證,缺了就明確報錯,而非到遊戲中途才 KeyError)
_REQUIRED_FIELDS = ("scenario_id", "name", "genre", "persona", "situation",
                    "triggers", "opening_line", "initial_anger", "max_turns")
_REQUIRED_ENDINGS = ("fail", "success", "timeout")


def _load_template() -> str:
    global _CUSTOMER_TEMPLATE
    if _CUSTOMER_TEMPLATE is None:
        _CUSTOMER_TEMPLATE = (_PROMPT_DIR / "customer_system.txt").read_text(encoding="utf-8")
    return _CUSTOMER_TEMPLATE


def _validate_scenario(scenario: dict) -> None:
    """載入時即驗證關卡必備欄位,避免缺欄位拖到遊戲中途才 KeyError。"""
    sid = scenario.get("scenario_id", "?")
    missing = [f for f in _REQUIRED_FIELDS if f not in scenario]
    if missing:
        raise ValueError(f"關卡 '{sid}' 缺少必備欄位:{', '.join(missing)}")
    endings = scenario.get("ending_lines", {})
    miss_end = [e for e in _REQUIRED_ENDINGS if e not in endings]
    if miss_end:
        raise ValueError(f"關卡 '{sid}' 缺少結局台詞 ending_lines:{', '.join(miss_end)}")


# swear_level → 語氣強度指引(0 溫和 / 1 帶刺 / 2 火爆),展示場合可控,避免過度髒話
_SWEAR_TONE = {
    0: "語氣不滿但保持基本客氣,固執地盧,但不講髒話、不人身攻擊。",
    1: "語氣帶刺、嗆、沒禮貌,可以酸言酸語、翻白眼式吐槽,但不講重度髒話。",
    2: "語氣火爆,可用情緒性粗口(如『靠』『搞屁啊』『什麼爛服務』),會拍桌、嗆要投訴/告;"
       "但嚴禁性暗示、歧視(性別/地域/種族)、問候對方家人或霸凌式人身攻擊。",
}


# 友善客人(customer_kind=nice)覆蓋:骨架模板是為「奧客」寫的(ended 只在「完美方案解決客訴」才 true),
# 套到好客人身上 → 永遠不會和解 → 每場必超時。這段把成功條件改成「被好好招待就滿意」。
_NICE_OVERRIDE = (
    "【重要:你其實是友善的好客人,不是奧客】\n"
    "你本質上有禮貌、講道理、不是來找碴的 —— 你只是有個小需求或想被當熟客好好對待。請據此調整:\n"
    "- ended=true 的條件改成:店員『親切、有耐心、給了實用又貼心的協助/建議』讓你滿意即可,"
    "不需要免單/退費那種大讓步。\n"
    "- 一旦店員態度好、你的需求被妥善回應,就大方表達滿意並 ended=true,別硬拖到回合用盡。\n"
    "- 只有被冷淡、敷衍、推薦得很隨便、不被當一回事時,anger 才上升;正常友善互動 anger 應緩降。\n"
    "- 不要每回合重複問同一件事(例如一直問有沒有優惠);店員回應後就往下走、做出決定。"
)


def _build_system_prompt(scenario: dict) -> str:
    """用角色變數填充共用骨架模板,並依 swear_level 附上語氣強度指引。

    用 str.replace 而非 str.format —— 模板裡含有 {anger}/JSON 範例之類的大括號時,
    format() 會崩潰(這是設計階段踩過的雷)。
    customer_kind=nice 時附加「好客人」覆蓋,修正好客人永遠無法和解→必超時的問題。
    """
    template = _load_template()
    for key in ("persona", "situation", "triggers"):
        template = template.replace("{" + key + "}", scenario.get(key, ""))
    level = int(scenario.get("swear_level", 1) or 0)
    tone = _SWEAR_TONE.get(level, _SWEAR_TONE[1])
    out = template + f"\n\n【語氣強度】{tone}"
    if scenario.get("customer_kind") == "nice":
        out += "\n\n" + _NICE_OVERRIDE
    return out


def list_scenarios() -> list[dict]:
    """回傳 [{scenario_id, name, genre}, ...],給下拉選單。"""
    items = []
    for path in sorted(_SCENARIO_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        items.append({"scenario_id": data["scenario_id"], "name": data["name"], "genre": data["genre"]})
    return items


def _read_scenario(scenario_id: str) -> dict:
    path = _SCENARIO_DIR / f"{scenario_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"找不到關卡:{scenario_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def load(scenario_id: str) -> dict:
    """建立開局 state。注意:開場白要放進 messages,否則奧客第一回合會失憶。"""
    scenario = _read_scenario(scenario_id)
    _validate_scenario(scenario)
    return {
        "scenario_id": scenario["scenario_id"],
        "scenario": scenario,
        "system_prompt": _build_system_prompt(scenario),
        "max_turns": scenario["max_turns"],
        "anger": scenario["initial_anger"],
        "anger_history": [scenario["initial_anger"]],  # 開局值,後續每回合 apply_state 會追加
        "emotion_history": [],  # 每回合 apply_state 追加(長度=回合數);開局不計
        "turn": 0,
        "messages": [AIMessage(scenario["opening_line"])],
        "player_input": "",
        "voice_emotion": None,
        "ai_reply": "",
        "anger_change": 0,
        "emotion": "annoyed",
        "concession_cost": 0,
        "cost_spent": 0,
        "ended": False,
        "ending_type": None,
        "report": None,
    }
