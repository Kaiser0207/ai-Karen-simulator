"""組裝 LangGraph 狀態圖。

圖的形狀:
    START → customer_brain → apply_state → classify_ending ─┬─[continue]→ END
                                                            └─[ending]→ set_ending → judge → END
"""

from langgraph.graph import END, START, StateGraph

from graph.nodes import (
    apply_state,
    classify_ending,
    customer_brain,
    judge,
    route_after_classify,
    set_ending,
)
from graph.state import GameState


def build_graph(checkpointer):
    g = StateGraph(GameState)

    g.add_node("customer_brain", customer_brain)
    g.add_node("apply_state", apply_state)
    g.add_node("classify_ending", classify_ending)
    g.add_node("set_ending", set_ending)
    g.add_node("judge", judge)

    g.add_edge(START, "customer_brain")
    g.add_edge("customer_brain", "apply_state")
    g.add_edge("apply_state", "classify_ending")
    g.add_conditional_edges(
        "classify_ending",
        route_after_classify,
        {
            "continue": END,  # 沒結束 → 結束本次 invoke,等玩家下一句
            "ending": "set_ending",  # 任一結局 → 播結局台詞 → 評審
        },
    )
    g.add_edge("set_ending", "judge")
    g.add_edge("judge", END)

    return g.compile(checkpointer=checkpointer)
