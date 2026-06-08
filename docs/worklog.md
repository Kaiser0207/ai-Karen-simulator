# Worklog — Kaiser0207

> 本檔記錄我(Kaiser0207)在朋友既有基礎上的**後續開發**,與同目錄朋友的原始文件
> (功能與架構說明、開發錯誤紀錄、學習_*)區隔。問題與除錯細節另記於 [`除錯筆記.md`](除錯筆記.md)。

## 2026-06-08 ~ 06-09

### 遊戲流程調整(branch `feat/gameplay-tuning`)
- 奧客 prompt 加入 `anger_change` 級距對照表 + 範例,讓真實 LLM 每回合評分一致、合理。
- 評審改 **outcome-aware**:`GameState` 新增 `anger_history`,judge 連同結局/憤怒軌跡餵給評審,
  報告不再與勝負矛盾;`judge_system.txt` 加結局校準規則與評分錨點。
- 前端:憤怒條上方顯示「回合 X/8」;結束回合把奧客台詞合併成一則。

### 版控與 GitHub
- 在 `final_project` 內 `git init`,把朋友原始版本 commit 成 `main` 基準。
- 推上 **github.com/Kaiser0207/ai-Karen-simulator**(public)。
- 把所有 commit 作者改寫為 Kaiser0207(GitHub noreply email),移除 Co-Authored-By,讓我正確列為 contributor。

### CineRooms 風格嘗試(branch `feat/cinelog-theme`)
- 把 cinelog-frontend 的設計語言套到 Gradio(主題 + CSS)。結論:Gradio 元件外殼限制大 → 改走自訂前端。

### 自訂網頁前端(branch `feat/web-frontend`)
- `web/server.py`:FastAPI 把遊戲 LangGraph 包成 JSON API(`/api/scenarios`、`start`、`say`、`history`)。
- `web/static`:vanilla HTML/CSS/JS。啟動 `uv run python -m web.server`(http://127.0.0.1:8000)。

### 2026-06-09 前端改版
- 修正 footer:改全幅(`.footer` 滿版 + `.footer-inner` 置中),不再是浮在中間的色塊。
- 改成 **AKARU(akaru.fr)風格的橫向滾動場景**:
  - 開場 panel = 超大窄體字標(Anton);滾輪 `deltaY` → 整條 `.h-track` 水平平移(lerp 緩動,非硬跳)。
  - 每位奧客 = 一個 panel(上半漸層視覺 + emoji,下半大名 + 標籤 + 圓形「開始挑戰」鈕),從右側依序登場。
  - 底部紅色進度條;結尾放「敬請期待」panel 示意可橫向延伸。
- 建立長期文件習慣:`docs/worklog.md` + `docs/除錯筆記.md`,每次開發都更新(與朋友 docs 區隔)。

### 2026-06-09 AKARU 細修
- 配色改用 AKARU 實際 12 色盤(底 #f1efeb、灰藍 #bfccd8、近黑 #0e0e0e、藕粉 #b692a1、灰綠 #798e7b、白)。
- 遊戲英文名定案:**I Want to Speak to the Manager!**;英文字體用自架 **Justus-Bold.ttf**(`web/static/fonts/`,`@font-face`)。
- 選關卡改 AKARU「手風琴」:標題占左 ~55%、右側關卡依離焦點距離縮放(最多 3 個漸小)、
  滾輪驅動、當前關卡放大、白盒大名隨寬度淡入(不平移 track,靠 flex 重排)。

### 待辦
- 依實際畫面微調手風琴常數(STEP 緩動、WMAX/WMIN、淡入門檻、行動裝置觸控)。
- Phase 5 TTS(主線,仍未動)。
