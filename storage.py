"""對局存檔 —— 把每場遊戲的完整紀錄落地成 JSON,供「歷史紀錄」頁回顧。

整理方式(同一班次合成一檔):
  - 班次:同一個 shift_id 的幾關**合成一個檔** logs/shift_{shift_id}.json,
    裡面用 rounds 陣列裝各關(依 shift_index 排序),外層帶 shift_id/shift_total/起訖時間。
  - 單場(無 shift_id):logs/solo/{thread_id}.json,內容就是該關紀錄本身。
每一關(round)含:對話逐句、奧客情緒變化、憤怒值軌跡、結局、評審報告、時間戳。
時間戳在這層(應用層)產生,不放進 LangGraph 節點(保持節點純函式)。

對外三個函式維持原本介面、不影響前端:
  - save_game(...)              落地一關(自動併進對應班次檔 / 單場檔)
  - list_games() -> [摘要,...]  每關一筆摘要(前端歷史頁再依 shift_id 分組)
  - load_game(thread_id)        依 thread_id 取回單一關的完整紀錄
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

_LOG_DIR = Path(__file__).parent / "logs"
_SOLO_DIR = _LOG_DIR / "solo"


def _report_score(report) -> int | None:
    """報告四面向(有成本面向才算)平均 → 0~100 總分;與前端 _scoreOf 一致,給歷史頁顯示。"""
    if not isinstance(report, dict):
        return None
    dims = [report.get("empathy_score"), report.get("crisis_score"), report.get("compliance_score")]
    if isinstance(report.get("cost_control_score"), (int, float)):
        dims.append(report["cost_control_score"])
    dims = [d for d in dims if isinstance(d, (int, float))]
    return round(sum(dims) / len(dims)) if dims else None


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 壞檔/非 JSON → 當不存在
        return None


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _iter_rounds(doc) -> list[dict]:
    """一個檔可能是『班次檔(含 rounds 陣列)』或『單場檔(單一 round)』,統一攤成 round 串列。

    也相容尚未遷移的舊式散檔(單一 round 無 rounds 欄位)。
    """
    if isinstance(doc, dict) and isinstance(doc.get("rounds"), list):
        return [r for r in doc["rounds"] if isinstance(r, dict)]
    if isinstance(doc, dict):
        return [doc]
    return []


def _round_index(r: dict) -> int:
    idx = r.get("shift_index")
    return idx if isinstance(idx, int) else 0


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
    round_rec = {
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

    if shift_id:
        # 併進該班次檔:讀舊檔 → 同 thread_id 視為重存(替換)→ 依 shift_index 排序 → 回寫
        path = _LOG_DIR / f"shift_{shift_id}.json"
        doc = _read_json(path)
        rounds = [r for r in _iter_rounds(doc) if r.get("thread_id") != thread_id]
        rounds.append(round_rec)
        rounds.sort(key=_round_index)
        stamps = [r.get("created_at") for r in rounds if r.get("created_at")]
        prev_total = doc.get("shift_total") if isinstance(doc, dict) else None
        _write_json(path, {
            "shift_id": shift_id,
            "shift_total": shift_total if shift_total is not None else prev_total,
            "created_at": min(stamps) if stamps else round_rec["created_at"],
            "updated_at": round_rec["created_at"],
            "rounds": rounds,
        })
    else:
        _write_json(_SOLO_DIR / f"{thread_id}.json", round_rec)


def list_games() -> list[dict]:
    """回傳所有對局的摘要(每關一筆),最新在前。班次檔會被攤平成多筆。"""
    if not _LOG_DIR.exists():
        return []
    items = []
    for p in _LOG_DIR.rglob("*.json"):
        for d in _iter_rounds(_read_json(p)):
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
    """依 thread_id 取回單一關的完整紀錄(從班次檔/單場檔中找)。回傳格式同舊式單關紀錄。"""
    if not _LOG_DIR.exists():
        return None
    for p in _LOG_DIR.rglob("*.json"):
        for d in _iter_rounds(_read_json(p)):
            if d.get("thread_id") == thread_id:
                return d
    return None
