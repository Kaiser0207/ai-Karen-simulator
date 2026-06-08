"""結局判定(classify_ending)—— 鎖定優先級與「血條歸零不搶判」的修正。

優先級規則(務必維持):fail(爆表)> success(ended)> timeout(回合用盡)> None(續行)。
"""

from graph.nodes import classify_ending


def _state(anger, ended, turn, max_turns=8):
    return {"anger": anger, "ended": ended, "turn": turn, "max_turns": max_turns}


def _et(**kw):
    return classify_ending(_state(**kw))["ending_type"]


def test_anger_max_is_fail():
    assert _et(anger=100, ended=False, turn=3) == "fail"
    assert _et(anger=120, ended=False, turn=3) == "fail"  # 防禦:>100 也算


def test_fail_beats_ended():
    # 同回合爆表又被 LLM 判和解 → 砸店優先
    assert _et(anger=100, ended=True, turn=3) == "fail"


def test_ended_is_success():
    assert _et(anger=40, ended=True, turn=3) == "success"


def test_zero_anger_without_ended_is_NOT_success():
    # 修正重點(#1):血條歸零但 LLM 沒判和解 → 不該自動成功,應續行
    assert _et(anger=0, ended=False, turn=3) is None


def test_success_beats_timeout():
    # 修正重點(#2):最後一回合談成 → 成功優先於超時
    assert _et(anger=50, ended=True, turn=8, max_turns=8) == "success"


def test_timeout_when_turns_used_up():
    assert _et(anger=50, ended=False, turn=8, max_turns=8) == "timeout"
    assert _et(anger=50, ended=False, turn=9, max_turns=8) == "timeout"


def test_continue_midgame():
    assert _et(anger=50, ended=False, turn=3, max_turns=8) is None
