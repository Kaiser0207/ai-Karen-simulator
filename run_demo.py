"""Phase 1 驗證腳本(mock 模式,免 API key)。

跑三場腳本化對話,分別觸發 success / fail / timeout 三種結局,
印出每回合的憤怒值變化與最終評審報告,用來驗證 LangGraph 狀態機正確。

執行:  uv run python run_demo.py
"""

from langgraph.checkpoint.sqlite import SqliteSaver

from graph.build import build_graph
from scenarios import loader

LINE = "─" * 56


def _render_report(report: dict) -> None:
    print("  📊 培訓報告")
    print(f"     同理心 {report['empathy_score']} / 危機應變 {report['crisis_score']} / 法規遵從 {report['compliance_score']}")
    print("     ✅ 做得好:")
    for g in report["good_practices"]:
        print(f"        ・{g}")
    print("     ❌ 可改進:")
    for b in report["bad_practices"]:
        print(f"        ・{b}")
    print(f"     總評:{report['summary']}")


def play_game(graph, title: str, scenario_id: str, inputs: list[str], thread_id: str) -> None:
    print(f"\n{LINE}\n🎬 {title}(關卡:{scenario_id})\n{LINE}")
    init = loader.load(scenario_id)
    config = {"configurable": {"thread_id": thread_id}}

    print(f"😠 奧客:{init['scenario']['opening_line']}")
    print(f"   憤怒值 {init['anger']}/100\n")

    first = True
    for text in inputs:
        payload = {**init, "player_input": text} if first else {"player_input": text}
        first = False

        result = graph.invoke(payload, config)

        print(f"🧑 店員:{text}")
        print(f"😠 奧客:{result['ai_reply']}")
        sign = f"+{result['anger_change']}" if result["anger_change"] >= 0 else str(result["anger_change"])
        print(f"   憤怒值 {result['anger']}/100  ({sign})  情緒={result['emotion']}  回合 {result['turn']}/{result['max_turns']}\n")

        if result.get("ended"):
            ending = {"fail": "💥 失敗(砸店/投訴)", "success": "⭐ 成功(和解)", "timeout": "⏰ 超時(無效溝通)"}
            print(f"   結局台詞:{result['messages'][-1].content}")
            print(f"   >>> {ending[result['ending_type']]} <<<\n")
            _render_report(result["report"])
            return

    print("   (輸入用完,本場尚未結束)")


def main() -> None:
    with SqliteSaver.from_conn_string(":memory:") as cp:
        graph = build_graph(cp)

        # 1) 成功:先同理 → 給方案 → 補償收尾
        play_game(
            graph, "示範一:成功平息", "zhang_dama",
            [
                "您好,我完全理解您的不滿,真的很不好意思讓您遇到這種狀況。",
                "我馬上幫您這餐免單,並請廚房重做一份新的給您。",
                "真的很抱歉造成您的困擾,這張折價券也請您收下,日後招待。",
            ],
            thread_id="demo-success",
        )

        # 2) 失敗:一路官腔推託 → 憤怒爆表
        play_game(
            graph, "示範二:越講越糟", "zhang_dama",
            [
                "這是我們公司規定,我也沒辦法。",
                "您要客訴請您自己打電話到總公司。",
                "不行就是不行。",
            ],
            thread_id="demo-fail",
        )

        # 3) 超時:話講很多卻沒給具體方案 → 撐到回合用完
        play_game(
            graph, "示範三:拖到超時", "zhang_dama",
            [
                "請您先在旁邊稍等一下喔。",
                "真的很抱歉讓您久等了。",
                "請您再給我們一點時間。",
                "不好意思,我這邊看一下喔。",
                "請您稍候,馬上就好。",
                "真的很抱歉一直讓您等。",
                "請您再等一下下喔。",
                "辛苦您了,真的很抱歉。",
            ],
            thread_id="demo-timeout",
        )


if __name__ == "__main__":
    main()
