"""apply_state —— 憤怒值夾限、回合遞增、歷史軌跡追加。"""

from graph.nodes import apply_state


def _state(anger, anger_change, turn=2, emotion="neutral"):
    return {"anger": anger, "anger_change": anger_change, "turn": turn, "emotion": emotion}


def test_anger_change_clamped_to_plus_30():
    out = apply_state(_state(anger=50, anger_change=999))
    assert out["anger"] == 80  # 50 + min(30, 999)


def test_anger_change_clamped_to_minus_30():
    out = apply_state(_state(anger=50, anger_change=-999))
    assert out["anger"] == 20  # 50 - 30


def test_anger_clamped_to_100():
    out = apply_state(_state(anger=90, anger_change=30))
    assert out["anger"] == 100  # 不會超過 100


def test_anger_clamped_to_0():
    out = apply_state(_state(anger=10, anger_change=-30))
    assert out["anger"] == 0  # 不會低於 0


def test_turn_increments():
    assert apply_state(_state(anger=50, anger_change=0, turn=4))["turn"] == 5


def test_histories_appended():
    out = apply_state(_state(anger=50, anger_change=10, emotion="angry"))
    # reducer 是 operator.add(list 串接),所以節點回傳「單元素 list」
    assert out["anger_history"] == [60]
    assert out["emotion_history"] == ["angry"]


def test_emotion_history_defaults_when_missing():
    out = apply_state({"anger": 50, "anger_change": 0, "turn": 1})  # 沒 emotion 鍵
    assert out["emotion_history"] == ["neutral"]
