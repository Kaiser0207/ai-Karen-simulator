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

## 目前進度

| Phase | 內容 | 狀態 |
|-------|------|------|
| 1 | LangGraph 狀態機核心 + mock LLM | ✅ |
| 2 | 真實 LLM(Gemini 2.5-flash)+ 評審 | ✅ |
| 3 | Gradio 網頁(對話/憤怒值/結算雷達圖) | ✅ |
| 3.5 | 對話存檔 + 歷史紀錄頁(對話/情緒/憤怒軌跡) | ✅ |
| 4 | STT 語音輸入(faster-whisper,GPU) | ✅ |
| 5 | TTS 語音輸出(自研情緒模型) | ⬜ 規劃中 |

## 已實作功能

- 多回合對話狀態機(LangGraph)、動態憤怒值(後端夾限 ±30 防作弊)
- 三種結局判定 + 預寫結局台詞;結束後雙 LLM「評審大腦」出報告
- 結構化輸出(Pydantic + Gemini json_schema)、跨回合記憶(SqliteSaver)
- 多關卡(資料驅動,加角色只加 JSON)、mock/真實雙模式可切換
- Gradio 網頁:串流式即時回饋、彩色憤怒進度條、結算雷達圖
- 對話存檔(`logs/`)+ 歷史紀錄頁回放(對話、情緒/憤怒軌跡、報告)
- 語音輸入(麥克風 → faster-whisper → 繁中,GPU 加速,啟動預載)
- 自訂網頁前端(`web/`:FastAPI + 原生 HTML/CSS/JS,AKARU 風橫向選關卡、即時對戰、歷史回放;免 build)
- 結構化輸出解析失敗自動重試 + 後備(奧客中性台詞 / 評審退關鍵字報告,不會卡死或無報告)
- 工作階段持久化:伺服器重啟可從 checkpointer 還原進行中的對局
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
  llm.py          # 奧客大腦 + 評審(mock 與真實 Gemini)
  stt.py          # 語音轉文字(faster-whisper + opencc,GPU 預載)
scenarios/
  loader.py       # 載入關卡(載入即驗證欄位)+ 組 system_prompt + 建開局 state
  *.json          # 奧客角色設定(zhang_dama / liu_dong)
prompts/          # customer_system.txt / judge_system.txt
web/              # 自訂網頁前端
  server.py       # FastAPI 薄層:把 graph 包成 JSON API(/api/scenarios|start|say|history)
  static/         # 原生 HTML/CSS/JS + 自架字體(免 build)
tests/            # pytest:結局判定、apply_state、mock 評分、端對端整場
docs/             # 功能架構、LLM 詳解、開發錯誤紀錄、逐課學習教材;worklog.md / 除錯筆記.md(Kaiser0207)
logs/             # 每場對話存檔(gitignore)
```

## 設定(.env)

| 變數 | 說明 |
|------|------|
| `OKEKE_USE_MOCK` | 1=mock(免 key);0=真實 LLM |
| `LLM_PROVIDER` / `GOOGLE_API_KEY` / `GROQ_API_KEY` | LLM 供應商與金鑰 |
| `CUSTOMER_MODEL` / `JUDGE_MODEL` | 模型名稱(預設 gemini-2.5-flash) |
| `STT_DEVICE` / `STT_COMPUTE` / `STT_MODEL` | 語音:cuda/float16/medium(或 cpu/int8) |
| `STT_WARMUP` | 1=網頁啟動就把 STT 模型預載到 GPU |

## 後續

Phase 5:TTS 語音輸出(可接自研情緒 TTS,讓奧客聲音情緒隨憤怒值變化)。
