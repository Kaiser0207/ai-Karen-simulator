"""集中設定 —— 從 .env 載入環境變數,全專案統一從這裡讀。

在任何模組讀設定前,import config 就會自動載入 .env。
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# 載入專案根目錄的 .env(若不存在則略過,不報錯)
load_dotenv(Path(__file__).parent / ".env")

# 是否使用 mock 奧客大腦(免 API key)
USE_MOCK = os.getenv("OKEKE_USE_MOCK", "1") == "1"

# LLM 供應商與金鑰
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq").lower()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# 模型名稱
CUSTOMER_MODEL = os.getenv("CUSTOMER_MODEL", "llama-3.3-70b-versatile")
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "llama-3.3-70b-versatile")

# Gemini 2.5「思考預算」:0=關閉 reasoning(扮演奧客不需推理 → 延遲大幅下降、也省 token);
# 想讓評審多想一點可設 >0(僅 gemini 供應商有效)。
GEMINI_THINKING_BUDGET = int(os.getenv("GEMINI_THINKING_BUDGET", "0"))

# 語音情緒辨識(SER)微服務:辨玩家講話的「語氣」,影響奧客反應。
# 預設指向本機 8100;服務沒開/逾時 → /api/stt 會自動略過,純文字照常跑(設成空字串可完全停用)。
SER_URL = os.getenv("SER_URL", "http://127.0.0.1:8100")
SER_TIMEOUT = float(os.getenv("SER_TIMEOUT", "8"))

# STT(faster-whisper)語音輸入設定
STT_MODEL = os.getenv("STT_MODEL", "medium")  # tiny/base/small/medium/large-v3
STT_DEVICE = os.getenv("STT_DEVICE", "cpu")  # cpu 或 cuda
STT_COMPUTE = os.getenv("STT_COMPUTE", "int8")  # CPU 用 int8;GPU 用 float16
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "zh")
STT_WARMUP = os.getenv("STT_WARMUP", "1") == "1"  # 1=網頁啟動就預載模型到 GPU
# 餵給 Whisper 的引導句(本身含標點)→ 顯著提升中文標點輸出;設空字串=不引導
STT_PROMPT = os.getenv("STT_PROMPT", "以下是一段繁體中文對話,內容包含逗號、句號、問號等標點符號。")
