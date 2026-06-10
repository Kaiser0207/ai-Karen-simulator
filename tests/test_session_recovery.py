"""回歸測試:結束後重送防護(健檢報告 H1)。

情境:對局結束時 web 層會把記憶體 session pop 掉,但 checkpointer 仍永久保留該場 state。
若同一 thread_id 再來一個 /api/say(連點 / 網路重送 / 多分頁),`_get_session` 會從
checkpointer 把它「還原成可繼續玩」→ 再跑一次 graph(多花一次評審 LLM)+ 覆寫並污染歷史。

修正:`_get_session` 還原時若該場 `ended` 為 True,回 None(擋掉,/api/say 回 404)。

本測試驗證三種情況,且不需 API key、不碰真實 DB(強制 mock + monkeypatch checkpointer 查詢)。
"""

import os

os.environ.setdefault("OKEKE_USE_MOCK", "1")  # import config 前就設,確保走 mock

import web.server as ws


class _FakeSnap:
    """模擬 checkpointer 回傳的快照,只需要 .values。"""

    def __init__(self, values):
        self.values = values


def _patch_state(monkeypatch, values):
    monkeypatch.setattr(ws, "_graph_get_state", lambda cfg: _FakeSnap(values))


def test_ended_session_not_recovered(monkeypatch):
    # 已結束的場:checkpointer 還留著,但不該被還原成「可繼續玩」→ 回 None
    _patch_state(monkeypatch, {"scenario": {"scenario_id": "x"}, "ended": True})
    assert ws._get_session("t-ended-regression") is None


def test_in_progress_session_recovered(monkeypatch):
    # 進行中的場:伺服器重啟後仍應能還原續玩(別誤傷這個正常功能)
    _patch_state(monkeypatch, {"scenario": {"scenario_id": "x", "name": "n"}, "ended": False})
    sess = ws._get_session("t-inprogress-regression")
    assert sess is not None
    assert sess["first"] is False
    assert sess["scenario"]["scenario_id"] == "x"


def test_never_started_session_is_none(monkeypatch):
    # 從沒開始過(checkpointer 無 scenario)→ 回 None
    _patch_state(monkeypatch, {"ended": False})
    assert ws._get_session("t-never-regression") is None
