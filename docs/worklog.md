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

### 2026-06-09 AKARU 機制定案
- 改名定案 **I Want to Speak to the Manager!**;英文用自架 **Justus-Bold.ttf**(修正先前誤抓斜體);中文改**明體**(Noto Serif TC)。
- 選關卡互動從「手風琴縮放」改回**純水平平移**(滾輪→track translateX,GPU 合成,順):
  標題被推出左邊、下一關占主畫面、再下一關露邊;大名依「捲到的位置」淡入(不是依大小),白盒**去陰影**。
- 配色 AKARU 6 色盤。

### 2026-06-09 AKARU 機制定案二:展開橫向輪播
- 對照 akaru.fr 首頁截圖確認需求:藍/粉/綠=三關(可擴充),休息態 **藍寬、粉中、綠最小**(右側細條);
  滾動時標題推出左、**焦點關卡由細條長大占主畫面 ~60%**(下一關 ~40%),像水平捲動般連續放大。
- 純平移(固定寬)做不到「3 細條 + 長到 60%」,必須縮放;為了不卡 → 改 **裁切式 slice**:
  外框 `flex-basis`(JS 控:焦點 0.60 → 下一關 0.40 → 細條 0.14 → 0.085)+ `overflow:hidden`,
  內層 `.okeke-inner` 固定 60vw(= 焦點寬)。變寬 = 揭露更多 slice,內容不被壓扁/重排 → 滑順。
- 機制改成「焦點浮點 `curF`」:滾輪累加 → `targetF = accum/STEP(480)` → lerp 0.12;
  `fracFor(d)` 依 `索引−curF` 給寬度;大名在外框長到 >40% 才淡入(`smooth((frac−0.40)/0.20)`)。
- 結構調整:`.panel-okeke` 拆出 `.okeke-inner`(grid),`.panel-soon` 拆出 `.soon-inner`;移除各 panel 固定 `width`/`min-width`。

### 2026-06-09 AKARU 進場細節(依截圖回饋)
- **標題改「往左推出」**(非淡化):`.intro-inner` 不再動 opacity,改 `translateX(-(TITLE-frac)*VW)`,
  隨焦點離開整塊左移、被外框裁切離場。
- **圖示置中**:奧客 panel 改 `.okeke-visual{position:absolute;inset:0}` 鋪滿整個 panel(色塊變寬、emoji `left:50%` 永遠在 panel 中央)。
- **米色資訊條一開始不出現、滾動才上滑**:底部 `.foot-panel`(米色)`position:absolute;bottom:0`,
  初始 `translateY(100%)` 藏在下方,接近占主畫面時整條由下往上滑入(蓋住色塊底部)。
- **標籤/大名改階梯式上滑、無淡化**:初始憤怒、回合、大名各自包 `.rev` 遮罩 + `translateY(118%)`,
  依焦點量 `a` 錯開門檻(`a-0.30-k*0.16`)逐格上滑 → 像階梯一格一格出來,不再用 opacity。
- **滾動太靈敏**:`STEP 480 → 1100`(滾輪滾一點點不再衝太快)。

### 2026-06-09 AKARU 收尾三修
- **進度條被關卡蓋住** → `.foot-panel` z-index:2 比進度條高;給 `.scroll-progress` `z-index:20` 浮到最上。
- **大名上滑看不到** → 名字(k=2)門檻太晚、只在完全聚焦那瞬冒出 → 揭露起點提早(從 40% 起)、
  錯開門檻 `a-0.20-k*0.16`、窗口拉寬到 0.40,讓階梯上滑在捲入過程看得見。
- **大名去白底** → 移除 `.okeke-bigname` 白盒(`background/padding`),純文字、字級略放大。

### 2026-06-09 大名逐字上滑
- 需求修正:大名要**一個字一個字**錯開上滑,不是整塊一起 → 拆成單字,每字各自一個 `.rev` 遮罩。
- 修 bug:`transform` 對純 inline 元素無效 → `.rev > *` 補 `display:inline-block`(先前「標籤」其實沒被藏/動)。
- 揭露步距改**依項目數自動縮放**(`step = 0.62/(n-1)`,LEAD 0.08、WIN 0.30),名字 8–9 字也能在聚焦時全到位。

### 2026-06-09 字體換 Versalitas + 大名上滑更快
- 標題英文字體從 Justus-Bold 換成 **Justus-Versalitas**(小型大寫 small-caps;無下緣 descender → 上下不再相撞)。
  `@font-face` 指向 `/fonts/Justus-Versalitas.ttf`;`.akaru-mark` 行距收回 0.94、字距 .01em。授權:公有領域(Walbaum 逝世逾百年)。
- 大名逐字上滑「更快、更早顯示」:`LEAD 0.08→0.02`(更早起)、`WIN 0.30→0.20`(每字更快)、總跨度 `0.62→0.45`(更早全現)。

### 2026-06-09 後端高優先修正(branch `feat/backend-fixes`)
- 標題英文字體再換 **Justus-Italic**(Walbaum Didone 斜體);`.akaru-mark` 行距回 1.04(斜體有 descender)、字距 0。
- **#1 血條自動結束 bug**:`classify_ending` 移除 `anger<=0 → success`,和解只由 LLM `CustomerTurn.ended` 判。
  (驗證:怒值壓到 0 但 ended=False 時遊戲續行,不再被血條搶判成功。)
- **#2 結局優先級**:在 `classify_ending` docstring 明文化 **fail > success(ended) > timeout**;
  最後一回合談成(ended)優先於超時。
- **#3 SESSIONS 持久化/TTL/鎖**:改存 `{first, scenario, last, (init)}`;加 `_SESS_LOCK`;閒置 >1h GC;
  記憶體沒有時 `_get_session` 從 **checkpointer 還原**(伺服器重啟、進行中對局可續玩)。
  軌跡(anger/emotion_history)改以 graph state 為準;新增 `emotion_history` 進 `GameState`(reducer 累加、checkpointer 持久化)。
- **#4 SQLite 並發**:連線加 `timeout=30` + `PRAGMA journal_mode=WAL`;用 `_DB_LOCK` 把 graph 讀寫序列化(避免單連線多執行緒同 cursor)。
- **#5 結構化輸出無 fallback**:`services/llm._invoke_structured` 解析失敗退避重試 3 次;
  奧客全失敗 → 回中性台詞不卡關;評審全失敗 → 退回 mock 關鍵字報告(結束一定有結算)。
- **單元測試**(`tests/`,pytest):結局優先級 8 例(含 #1 血條歸零不搶判、#2 success>timeout)、
  apply_state 夾限/遞增/軌跡 7 例、mock 奧客+評審 7 例,共 **21 passed**。`uv add --dev pytest`。
- API 端對端手測:三結局(success via ended / fail 爆表 / 續行)、anger/emotion_history 長度皆正確。

### 2026-06-09 選關卡互動修正
- 「開始挑戰」鈕 hover 顏色改吃**該關卡顏色**(`--accent`=genre 色;零售藍/餐飲藕粉),字改深色 `--ink` 才清楚。
- **只准點「開始挑戰」鈕進關**:click 從整個 panel 移到鈕上(移除 `.panel-okeke` 的 cursor:pointer),
  修掉「點面板任何地方/滾動誤觸都會進關」的 bug。

### 後端分析待辦(2026-06-09 盤點,前端穩定後再做)
高優先:
- `graph/nodes.py:50` **anger<=0 自動判 success** 違反設計(該由 LLM `ended` 決定)→ 修掉血條自動結束。
- 結局判定優先級(fail/success/timeout)無文件、邊界(turn==max 且 ended=true)易誤判 → 補規則 + 測試。
- `web/server.py` **SESSIONS 記憶體 dict**:重啟即失、無 TTL、無鎖 → 持久化或加逾期清理。
- SQLite `check_same_thread=False` 無鎖 → 加 timeout / 鎖,避免並發不一致。
- `services/llm.py` 結構化輸出**無重試/fallback**(Groq 路徑未驗證)→ 解析失敗要退避重試。
中優先:
- **無單元測試** → 補 anger 邊界、結局判定、mock 評分。
- prompt 樣板每次讀檔 → 啟動快取;`str.replace` 填充易誤replace → 改 Jinja2/Template。
- 加結構化 logging + 錯誤碼;config 啟動驗證 env。
低優先:Phase 5 TTS(scenario 已留 `tts_voice` 欄位)、async 化、依賴注入便於測試。

### 待辦(前端)
- 依實際畫面微調手感(STEP 1100、lerp 0.12、LEAD/WIN/step、焦點寬 0.60/下一關 0.40)、行動裝置觸控。
