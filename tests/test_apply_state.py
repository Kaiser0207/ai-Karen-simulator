"""apply_state —— 憤怒值夾限、回合遞增、歷史軌跡追加、難度衰減、讓步成本累加。"""

from graph.nodes import _cost_control_score, apply_state


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


# --- 難度:怒氣衰減係數 calm_resistance ---
def test_calm_resistance_only_scales_calming():
    # 困難關 1.4:安撫 -20 應被縮成 round(-20/1.4) = -14
    st = {"anger": 70, "anger_change": -20, "turn": 1, "emotion": "calm",
          "scenario": {"calm_resistance": 1.4}}
    assert apply_state(st)["anger"] == 56  # 70 - 14


def test_calm_resistance_does_not_scale_provocation():
    # 正向(被惹怒)不打折,即使有係數
    st = {"anger": 50, "anger_change": 20, "turn": 1, "emotion": "angry",
          "scenario": {"calm_resistance": 1.4}}
    assert apply_state(st)["anger"] == 70  # 50 + 20(不縮)


def test_calm_resistance_defaults_to_one_without_scenario():
    out = apply_state(_state(anger=60, anger_change=-20))  # 無 scenario
    assert out["anger"] == 40  # 60 - 20(係數視為 1.0)


# --- 讓步成本累加 ---
def test_cost_spent_accumulates():
    st = {"anger": 50, "anger_change": 0, "turn": 1, "emotion": "neutral",
          "concession_cost": 30, "cost_spent": 20}
    assert apply_state(st)["cost_spent"] == 50  # 20 + 30


def test_cost_spent_defaults_zero():
    out = apply_state(_state(anger=50, anger_change=0))  # 無 concession/cost_spent
    assert out["cost_spent"] == 0


# --- 成本控制分公式(中等力道,超支封頂 B)---
def test_cost_control_in_budget():
    assert _cost_control_score(0, 80) == 100   # 零成本和解
    assert _cost_control_score(80, 80) == 75    # 花滿預算 = B


def test_cost_control_over_budget_drops():
    assert _cost_control_score(120, 80) < 50    # 超支明顯掉分
    assert _cost_control_score(160, 80) == 0     # 兩倍預算歸零
