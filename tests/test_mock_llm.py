"""mock 奧客大腦與評審 —— 關鍵字評分的一致性與結局校準。

直接呼叫 _mock_* 純函式,不經 USE_MOCK 分支,也不碰真實 LLM。
"""

from langchain_core.messages import AIMessage, HumanMessage

from services.llm import _mock_customer_turn, _mock_judge_report


def test_dismissive_raises_anger():
    turn = _mock_customer_turn(anger=40, player_input="這是我們的規定,沒辦法")
    assert turn.anger_change > 0
    assert turn.ended is False


def test_apology_lowers_anger():
    turn = _mock_customer_turn(anger=60, player_input="真的很抱歉,我理解您的心情")
    assert turn.anger_change < 0


def test_idle_input_slightly_annoys():
    # 沒同理、沒方案、沒踩雷 → 拖時間,微升
    turn = _mock_customer_turn(anger=40, player_input="嗯嗯我看看")
    assert turn.anger_change == 8


def test_apology_plus_solution_can_end_when_calm():
    # 同時道歉 + 方案,且情緒已壓低 → 和解(ended=True)
    turn = _mock_customer_turn(anger=45, player_input="很抱歉,我幫您免單並重做一份")
    assert turn.ended is True


def test_anger_change_within_schema_range():
    for inp in ["規定規定規定", "抱歉抱歉免單退費", "嗯"]:
        turn = _mock_customer_turn(anger=50, player_input=inp)
        assert -30 <= turn.anger_change <= 30


def test_judge_calibrates_down_on_fail():
    msgs = [HumanMessage("這是規定沒辦法"), AIMessage("你這什麼態度!")]
    rep = _mock_judge_report(msgs, ending_type="fail")
    assert rep.empathy_score <= 50
    assert rep.crisis_score <= 45
    assert any("爆走" in b or "加強" in b for b in rep.bad_practices)


def test_judge_report_scores_in_range():
    msgs = [HumanMessage("抱歉,我幫您免單"), AIMessage("好吧")]
    rep = _mock_judge_report(msgs, ending_type="success")
    for s in (rep.empathy_score, rep.crisis_score, rep.compliance_score):
        assert 0 <= s <= 100
    assert rep.good_practices and rep.bad_practices  # 不為空
