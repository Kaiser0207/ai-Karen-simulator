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

# STT(faster-whisper)語音輸入設定
STT_MODEL = os.getenv("STT_MODEL", "medium")  # tiny/base/small/medium/large-v3
STT_DEVICE = os.getenv("STT_DEVICE", "cpu")  # cpu 或 cuda
STT_COMPUTE = os.getenv("STT_COMPUTE", "int8")  # CPU 用 int8;GPU 用 float16
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "zh")
STT_WARMUP = os.getenv("STT_WARMUP", "1") == "1"  # 1=網頁啟動就預載模型到 GPU
