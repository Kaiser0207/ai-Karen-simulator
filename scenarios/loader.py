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


def _build_system_prompt(scenario: dict) -> str:
    """用角色變數填充共用骨架模板。

    用 str.replace 而非 str.format —— 模板裡含有 {anger}/JSON 範例之類的大括號時,
    format() 會崩潰(這是設計階段踩過的雷)。
    """
    template = _load_template()
    for key in ("persona", "situation", "triggers"):
        template = template.replace("{" + key + "}", scenario.get(key, ""))
    return template


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
        "ai_reply": "",
        "anger_change": 0,
        "emotion": "annoyed",
        "ended": False,
        "ending_type": None,
        "report": None,
    }
