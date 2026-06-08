"""關卡載入器。

- list_scenarios():給前端下拉選單用。
- load(scenario_id):讀 JSON + 組合 system_prompt + 建立開局 state。
"""

import json
from pathlib import Path

from langchain_core.messages import AIMessage

_SCENARIO_DIR = Path(__file__).parent
_PROMPT_DIR = _SCENARIO_DIR.parent / "prompts"


def _load_template() -> str:
    return (_PROMPT_DIR / "customer_system.txt").read_text(encoding="utf-8")


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
    return {
        "scenario_id": scenario["scenario_id"],
        "scenario": scenario,
        "system_prompt": _build_system_prompt(scenario),
        "max_turns": scenario["max_turns"],
        "anger": scenario["initial_anger"],
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
