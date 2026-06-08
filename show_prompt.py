"""把「實際送進 LLM 的 prompt」原封不動印出來(不呼叫 Gemini、不花額度)。

做法:把 services.llm._get_chat 換成「假模型」,它不連網,只把收到的訊息陣列印出來。
因為我們呼叫的是真正的 _real_customer_turn / _real_judge_report,
所以印出來的就是真實會送給 Gemini 的內容。

執行:  uv run python show_prompt.py
"""

from langchain_core.messages import AIMessage, HumanMessage

import services.llm as llmmod
from graph.schemas import CustomerTurn, JudgeReport
from scenarios import loader

SEP = "═" * 70


class _FakeStructured:
    """假的 with_structured_output 結果:只印訊息,回傳一個假物件讓流程不崩。"""

    def __init__(self, schema):
        self.schema = schema

    def invoke(self, messages):
        print(f"\n{SEP}\n📨 實際送給 LLM 的訊息陣列(共 {len(messages)} 則)\n{SEP}")
        for i, m in enumerate(messages, 1):
            role = type(m).__name__  # SystemMessage / HumanMessage / AIMessage
            print(f"\n──[{i}] {role}─────────────────────────────")
            print(m.content)
        print(f"\n{SEP}\n")
        if self.schema is CustomerTurn:
            return CustomerTurn(reply="(假回應)", anger_change=0, ended=False, emotion="neutral")
        return JudgeReport(
            empathy_score=0, crisis_score=0, compliance_score=0,
            good_practices=[], bad_practices=[], summary="(假報告)",
        )


class _FakeChat:
    def with_structured_output(self, schema, **kw):
        return _FakeStructured(schema)


# 把 _get_chat 換掉 → _real_* 內部就會拿到假模型(不連 Gemini)
llmmod._get_chat = lambda model, temperature: _FakeChat()


def main():
    # 模擬一場進行到第 3 回合的對話
    init = loader.load("zhang_dama")
    messages = init["messages"] + [
        HumanMessage("這是公司規定,我也沒辦法。"),
        AIMessage("你這什麼態度!根本沒在解決問題!"),
    ]
    anger = 72
    player_input = "不行就是不行。"

    print("\n############ 一、奧客大腦 customer_turn 收到的 prompt ############")
    llmmod._real_customer_turn(init["system_prompt"], anger, messages, player_input)

    print("\n############ 二、評審大腦 judge_report 收到的 prompt ############")
    # 評審看的是「整場對話」+「本場結果」,這裡用上面累積的 messages 當例子
    full = messages + [HumanMessage(player_input), AIMessage("(奧客回應)")]
    note = llmmod._outcome_note("fail", [50, 60, 72, 95], 8)
    llmmod._real_judge_report(full, note)


if __name__ == "__main__":
    main()
