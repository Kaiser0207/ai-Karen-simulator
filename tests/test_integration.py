"""端對端:用真實 graph(mock LLM)跑完整一場,驗證狀態機 + emotion_history + 結局 + 報告。

不需 API key:強制 mock。每個測試用各自的 in-memory SQLite checkpointer。
"""

import os

os.environ.setdefault("OKEKE_USE_MOCK", "1")  # 在 import config 前確保走 mock

import sqlite3

import pytest
from langgraph.checkpoint.sqlite import SqliteSaver

from graph.build import build_graph
from scenarios import loader


def _fresh_graph():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    return build_graph(SqliteSaver(conn))


def _play(graph, scenario_id, moves, thread):
    init = loader.load(scenario_id)
    cfg = {"configurable": {"thread_id": thread}}
    result = None
    for i, m in enumerate(moves):
        payload = {**init, "player_input": m} if i == 0 else {"player_input": m}
        result = graph.invoke(payload, cfg)
        if result.get("ended"):
            break
    return result


def test_full_game_success_via_ended():
    graph = _fresh_graph()
    sid = loader.list_scenarios()[0]["scenario_id"]
    moves = ["這是我們的規定", "真的很抱歉,我理解您的心情",
             "我幫您免單並重做一份,再給您折價優惠,真的很抱歉"]
    r = _play(graph, sid, moves, "t-success")
    assert r["ended"] is True
    assert r["ending_type"] == "success"
    assert r["report"] is not None
    # anger_history 含開局值(= 回合數 + 1);emotion_history 一回合一個
    assert len(r["anger_history"]) == r["turn"] + 1
    assert len(r["emotion_history"]) == r["turn"]


def test_full_game_zero_anger_does_not_auto_end():
    # 修正驗證(#1):純道歉把怒值壓到 0、mock 不給 ended → 不應結束
    graph = _fresh_graph()
    sid = loader.list_scenarios()[0]["scenario_id"]
    r = _play(graph, sid, ["抱歉,我理解您的心情"] * 5, "t-zero")
    assert r["anger"] == 0
    assert r["ended"] is False
    assert r["ending_type"] is None


def test_loader_validates_missing_fields():
    from scenarios.loader import _validate_scenario
    with pytest.raises(ValueError):
        _validate_scenario({"scenario_id": "x"})  # 缺多數必備欄位
    with pytest.raises(ValueError):
        _validate_scenario({  # 有必備欄位但缺結局台詞
            "scenario_id": "x", "name": "n", "genre": "g", "persona": "p",
            "situation": "s", "triggers": "t", "opening_line": "o",
            "initial_anger": 50, "max_turns": 8,
        })


def test_all_bundled_scenarios_load_ok():
    # 既有關卡 JSON 應全部通過驗證(防止有人改壞欄位)
    for meta in loader.list_scenarios():
        loader.load(meta["scenario_id"])  # 不丟例外即通過
