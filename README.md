# AI 奧客應對演練

> AI 即時情緒模擬 × 危機溝通訓練
> *AI Difficult Customer Simulator*

玩家扮演店員,在有限回合內安撫 AI 扮演的奧客。每回合 AI 評估你的話術、調整「憤怒值」;
憤怒爆表=砸店(失敗),AI 判定你提出完美方案/達成和解=成功(由 AI 決定,非血條歸零),回合用完=超時。
結束後由 AI 評審產出培訓報告。

設計文件見 `../indextts2_r/lang_doc/設計文件.md`;新手導覽與逐課教材見 `docs/`。

## 環境

- Python 3.12,套件管理一律用 **uv**。
- 安裝依賴:`uv sync`
- 新增套件:`uv add <pkg>`(請勿用 pip)
- 金鑰/設定放 `.env`(`cp .env.example .env` 後填入)。已被 `.gitignore` 忽略。

## 啟動

```bash
uv run python app.py        # Gradio 網頁(預設 http://127.0.0.1:7860)
uv run python -m web.server # 自訂網頁前端(AKARU 風「I Want to Speak to the Manager!」,http://127.0.0.1:8000)
uv run python run_demo.py   # 純文字驗證:mock 跑三種結局
uv run python smoke_test.py # 真實 LLM 跑一回合
uv run python show_prompt.py# 看實際送給 LLM 的 prompt(不呼叫 API)
OKEKE_USE_MOCK=1 uv run pytest # 單元/端對端測試(免 API key)
```

語音情緒(SER)微服務為**選用**,跑在 CRAB 訓練 repo 的獨立 venv(沒開時遊戲自動略過、純文字照跑):

```bash
cd ../SAILER_test/Crab && source .venv/bin/activate
python -m uvicorn api.ser_service:app --host 127.0.0.1 --port 8100
```

## 目前進度

| Phase | 內容 | 狀態 |
|-------|------|------|
| 1 | LangGraph 狀態機核心 + mock LLM | ✅ |
| 2 | 真實 LLM(Gemini 2.5-flash)+ 評審 | ✅ |
| 3 | Gradio 網頁(對話/憤怒值/結算雷達圖) | ✅ |
| 3.5 | 對話存檔 + 歷史紀錄頁(對話/情緒/憤怒軌跡) | ✅ |
| 4 | STT 語音輸入(faster-whisper,GPU) | ✅ |
| 4.5 | 語音情緒辨識 SER(CRAB 4 類,獨立微服務)→ 玩家語氣影響奧客 | ✅ |
| 4.6 | 寶可夢風背景音樂(大廳/戰鬥/勝利/Healed) | ✅ |
| 5 | TTS 語音輸出(自研情緒模型) | ⬜ 規劃中 |

## 已實作功能

- 多回合對話狀態機(LangGraph)、動態憤怒值(後端夾限 ±30 防作弊)
- 三種結局判定 + 預寫結局台詞;結束後雙 LLM「評審大腦」出報告
- 結構化輸出(Pydantic + Gemini json_schema)、跨回合記憶(SqliteSaver)
- 多關卡(資料驅動,加角色只加 JSON)、mock/真實雙模式可切換
- Gradio 網頁:串流式即時回饋、彩色憤怒進度條、結算雷達圖
- 對話存檔(`logs/`)+ 歷史紀錄頁回放(對話、情緒/憤怒軌跡、報告)
- 語音輸入(麥克風 → faster-whisper → 繁中,GPU 加速,啟動預載)
- 自訂網頁前端(`web/`:FastAPI + 原生 HTML/CSS/JS,AKARU 風橫向選關卡、即時對戰、歷史回放、語音輸入;免 build)
- 結構化輸出解析失敗自動重試 + 後備(奧客中性台詞 / 評審退關鍵字報告,不會卡死或無報告)
- 工作階段持久化:伺服器重啟可從 checkpointer 還原進行中的對局
- **班次模式**:選難度 → 連續服務該難度多位客人 → 班次總結(平均分/連勝/總讓步成本/每位可展開);歷史頁同班次聚成一組
- **設定移上方 nav、隨時可開**;壓力模式回合倒數 HUD(難度色、最後 5 秒紅閃滴答);立繪 4 套依怒氣換臉
- **寶可夢風背景音樂**:首頁/歷史大廳曲循環、戰鬥曲依班次第幾位(野生/訓練家/道館)、和解勝利曲、進設定/歷史壓低 + Healed;音量滑桿(mp3、空閒預載)
- **語音情緒辨識(SER)**:CRAB 雙模態 4 類(Angry/Happy/Neutral/Anxious)獨立微服務;玩家「語氣」影響奧客反應(語氣加成/打折);長語句依詞級時間戳切段加權
- **LLM 供應商可切**(Gemini / Groq);撞額度回友善提示而非沉默
- 單元 + 端對端測試(`tests/`,pytest;結局優先級、憤怒值夾限、mock 評分、整場流程)

## 結構

```
app.py            # Gradio 網頁(遊戲頁 + 歷史紀錄頁)
config.py         # 從 .env 載入設定
storage.py        # 對局存檔/列表/讀取(logs/*.json)
run_demo.py       # mock 三結局驗證
smoke_test.py     # 真實 Gemini 單回合驗證
show_prompt.py    # 印出實際送給 LLM 的 prompt
graph/
  state.py        # GameState(共享狀態)
  schemas.py      # CustomerTurn / JudgeReport(結構化輸出)
  nodes.py        # 6 節點:customer_brain/apply_state/classify_ending/route/set_ending/judge
  build.py        # 組裝狀態圖
services/
  llm.py          # 奧客大腦 + 評審(mock / Gemini / Groq);語氣 _voice_note 注入 prompt
  stt.py          # 語音轉文字(faster-whisper + opencc;transcribe_full 另回詞級時間戳 + 16k 波形)
  ser_client.py   # SER 微服務薄客戶端(stdlib;送 PCM base64,best-effort、沒開就略過)
scenarios/
  loader.py       # 載入關卡(載入即驗證欄位)+ 組 system_prompt + 建開局 state
  *.json          # 奧客角色設定(zhang_dama / liu_dong)
prompts/          # customer_system.txt / judge_system.txt
web/              # 自訂網頁前端
  server.py       # FastAPI 薄層:把 graph 包成 JSON API(/api/scenarios|start|say|history|stt);mount /music
  static/         # 原生 HTML/CSS/JS + 自架字體(免 build);characters/ 立繪、app.js 內含 MUSIC 模組
music/            # 背景音樂(mp3 進 repo;原始 wav 留本機、gitignore)
tests/            # pytest:結局判定、apply_state、mock 評分、端對端整場
docs/             # 功能架構、LLM 詳解、開發錯誤紀錄、逐課學習教材;worklog.md / 除錯筆記.md / 語音情緒模型.md(Kaiser0207)
logs/             # 每場對話存檔(gitignore)

# SER 微服務住在 CRAB 訓練 repo(獨立 venv,避免依賴衝突):
#   ../SAILER_test/Crab/api/okeke_infer.py   # 推論封裝(LoRA + SER 頭 + 斷句演算法)
#   ../SAILER_test/Crab/api/ser_service.py   # FastAPI:/health、/predict、/predict_pcm
```

## 設定(.env)

| 變數 | 說明 |
|------|------|
| `OKEKE_USE_MOCK` | 1=mock(免 key);0=真實 LLM |
| `LLM_PROVIDER` / `GOOGLE_API_KEY` / `GROQ_API_KEY` | LLM 供應商與金鑰 |
| `CUSTOMER_MODEL` / `JUDGE_MODEL` | 模型名稱(Gemini:gemini-2.5-flash-lite/flash;Groq:llama-3.3-70b-versatile) |
| `SER_URL` / `SER_TIMEOUT` | 語音情緒微服務位址(預設 `http://127.0.0.1:8100`;空字串=停用,服務沒開會自動略過、純文字照跑) |
| `STT_DEVICE` / `STT_COMPUTE` / `STT_MODEL` | 語音:cuda/float16/medium(或 cpu/int8;標點建議 large-v3) |
| `STT_WARMUP` | 1=網頁啟動就把 STT 模型預載到 GPU |
| `STT_PROMPT` | 餵 Whisper 的引導句(含標點)→ 提升中文標點輸出;空=不引導 |

## 後續

Phase 5:TTS 語音輸出(可接自研情緒 TTS,讓奧客聲音情緒隨憤怒值變化)。
