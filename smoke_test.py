"""快速煙霧測試:用真實 LLM 跑一個回合,確認 API key 與結構化輸出正常。

執行:  uv run python smoke_test.py
(不會印出 API key)
"""

import config
from scenarios import loader
from services import llm

print(f"Provider={config.LLM_PROVIDER}  Model={config.CUSTOMER_MODEL}  USE_MOCK={config.USE_MOCK}")

init = loader.load("zhang_dama")
print("開場白:", init["scenario"]["opening_line"])

player = "真的很抱歉造成您的困擾,我馬上幫您這餐免單,並請廚房重做一份新的給您。"
print("店員:", player)

turn = llm.customer_turn(init["system_prompt"], init["anger"], init["messages"], player)
print("奧客:", turn.reply)
print(f"anger_change={turn.anger_change}  emotion={turn.emotion}  ended={turn.ended}")
print("\n✅ Gemini 結構化輸出正常!")
