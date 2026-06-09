"""對局存檔 —— 把每場遊戲的完整紀錄落地成 JSON,供「歷史紀錄」頁回顧。

每場一個檔:logs/{thread_id}.json,內容含:
  對話逐句、奧客情緒變化、憤怒值軌跡、結局、評審報告、時間戳。
時間戳在這層(應用層)產生,不放進 LangGraph 節點(保持節點純函式)。
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

_LOG_DIR = Path(__file__).parent / "logs"


def _report_score(report) -> int | None:
    """報告四面向(有成本面向才算)平均 → 0~100 總分;與前端 _scoreOf 一致,給歷史頁顯示。"""
    if not isinstance(report, dict):
        return None
    dims = [report.get("empathy_score"), report.get("crisis_score"), report.get("compliance_score")]
    if isinstance(report.get("cost_control_score"), (int, float)):
        dims.append(report["cost_control_score"])
    dims = [d for d in dims if isinstance(d, (int, float))]
    return round(sum(dims) / len(dims)) if dims else None


def save_game(
    thread_id: str,
    scenario: dict,
    ending_type: str,
    anger_history: list[int],
    emotion_history: list[str],
    transcript: list[dict],
    report: dict,
    shift_id: str | None = None,
    shift_index: int | None = None,
    shift_total: int | None = None,
) -> None:
    _LOG_DIR.mkdir(exist_ok=True)
    data = {
        "thread_id": thread_id,
        "scenario_id": scenario.get("scenario_id"),
        "scenario_name": scenario.get("name"),
        "difficulty": scenario.get("difficulty"),   # 回放報告用關卡色畫分數條/卷軸條
        "char": scenario.get("char"),               # 立繪頭像(歷史分組用)
        "shift_id": shift_id,                        # 同一班次的客人共用,歷史頁聚成一組
        "shift_index": shift_index,
        "shift_total": shift_total,
        "ending_type": ending_type,
        "final_anger": anger_history[-1] if anger_history else None,
        "turns": len(emotion_history),
        "anger_history": anger_history,       # 含開局值,長度 = 回合數 + 1
        "emotion_history": emotion_history,   # 每回合奧客情緒,長度 = 回合數
        "transcript": transcript,             # [{"role","content"}, ...]
        "report": report,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    path = _LOG_DIR / f"{thread_id}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def list_games() -> list[dict]:
    """回傳所有對局的摘要,最新在前。"""
    if not _LOG_DIR.exists():
        return []
    items = []
    for p in _LOG_DIR.glob("*.json"):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        items.append({
            "thread_id": d.get("thread_id", p.stem),
            "scenario_name": d.get("scenario_name", "?"),
            "difficulty": d.get("difficulty"),
            "char": d.get("char"),
            "shift_id": d.get("shift_id"),
            "shift_index": d.get("shift_index"),
            "shift_total": d.get("shift_total"),
            "ending_type": d.get("ending_type", "?"),
            "turns": d.get("turns", 0),
            "final_anger": d.get("final_anger"),
            "score": _report_score(d.get("report")),   # 歷史頁顯示分數(像遊戲)
            "created_at": d.get("created_at", ""),
        })
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


def load_game(thread_id: str) -> dict | None:
    path = _LOG_DIR / f"{thread_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
