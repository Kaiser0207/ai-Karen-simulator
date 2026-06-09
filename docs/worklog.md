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

### 2026-06-09 全面審查 + 強化(branch `feat/review-hardening`)
派兩個 review agent(後端/前端)做完整性掃描,確認 + 修真實問題(過濾掉誤報,如「RAF 無限跑」其實會自停、「Enter 連點雙送」因 busy 在 await 前就設而不會發生)。
- **整合確認**:朋友的 Gradio `app.py` 不受後端改動影響(它用自己的 `gr.State` 累加 anger/emotion,且 `init` 已帶 `emotion_history:[]`;classify_ending 改動只改「何時結束」,由 `ending_type` 處理)。**未改 app.py**。
- 後端強化:
  - `loader._validate_scenario`:載入即驗證關卡必備欄位 + 三結局台詞,缺了就明確報錯(不再拖到中途 KeyError)。
  - prompt 骨架/評審 prompt **啟動快取**(不每次讀檔)。
  - `set_ending` 缺結局台詞時退通用收尾(防禦)。
  - LLM 結構化輸出後備改用 `logger.warning` 記錄降級(可觀測性);`_outcome_note` 防 `anger_history` 過短。
- 前端強化:
  - 每幀 `querySelectorAll('.rev')` → **預先快取**(revCache/introInner/footPanels)。
  - 滾輪 `preventDefault` 改**有條件**(到頭/尾不攔截 → 頁面可往下看 footer)。
  - 新增**觸控拖曳**(touchstart/move)與**左右方向鍵**選關(a11y/行動裝置)。
  - `flex-basis` 防 NaN/負值;`trajectorySVG` 加 `Array.isArray` 護欄;`.rev` 加 `backface-visibility`(Safari);`.foot-panel` 寬改 `min(60vw,100%)`。
  - 「換一關」清掉 `STATE`;Enter 送出加 `busy/ended` 護欄 + `preventDefault`;Esc / 點背景關閉評審報告。
- 測試:新增 `tests/test_integration.py`(端對端跑完整場、#1 血條歸零不結束、loader 驗證、所有關卡可載入),全套 **25 passed**。

### 2026-06-09 自訂網頁前端接語音輸入(branch `feat/web-stt`)
- 後端 `web/server.py` 加 `POST /api/stt`:`UploadFile`(瀏覽器 webm/opus)→ 暫存 → `run_in_threadpool(stt.transcribe)` → 回 `{text}`;
  啟動背景 `stt.warmup`(`STT_WARMUP`)預載模型,第一次錄音不卡。沿用朋友的 `services/stt.py`(未改其核心)。
- 前端 composer 加 🎤 鈕:`MediaRecorder` 按一下錄、再按一下停 → POST `/api/stt` → 文字填回輸入框(可再編輯送出);
  錄音中紅色脈動;與 `#send` 一起啟用/停用。
- **標點符號**(medium 常漏):`stt.transcribe` 加 `initial_prompt`(含標點的引導句,`config.STT_PROMPT`)+ `vad_filter=True`;
  引導句本身帶標點 → Whisper 延續風格把標點補出來。大模型(large-v3)效果最佳(本機 RTX 3090/24GB 跑 large-v3 float16 僅約 5GB,綽綽有餘)。
- 驗證:`/api/stt` 回 200(sine 測試音→空字串正確);GPU 用量 11→2243MiB 確認走 cuda;pytest 25 passed。
- **靜音自動送出 + 左側可調設定**:`VOICE={auto,sec}` 存 localStorage;左面板加「語音輸入」卡(勾選自動 + 秒數 1–15)。
  錄音時用 Web Audio `AnalyserNode` 量 RMS:偵測到說話後、連續靜音超過設定秒數 → 自動 `stop()` → 辨識 → 自動 `send()`;
  關閉自動則回手動(按一下開始、再按一下■結束,文字填輸入框讓使用者檢查再送)。手動■在自動模式=提早結束。

### 2026-06-09 關閉 Gemini thinking → 回應從 ~60s 降到 ~7.6s
- 症狀:真實 `gemini-2.5-flash` 一回合要 ~1 分鐘。主因:2.5 預設開 reasoning(thinking),扮演奧客根本不需要。
- 解法:`config.GEMINI_THINKING_BUDGET`(預設 0=關),`_get_chat` 的 gemini 分支傳 `thinking_budget=`;
  langchain-google-genai 有 `thinking_budget` 欄位。實測同一句 60s → **7.6s**,品質/語意不變,也省 thinking token。
- 想更快(同等品質):`CUSTOMER_MODEL=gemini-2.5-flash-lite` 或 `gemini-2.0-flash`(.env 改即可)。
- **flash-lite 實測**(thinking off):短句 2.6s(首呼暖機)、中句 1.2s、長句 1.6s → 比 flash(關 thinking)7.6s 再快 ~5×,扮演品質接得上。

### 2026-06-09 歷史紀錄改「中等彈窗」回放
- 原本點歷史卡片是 inline 展開(偏簡潔)→ 改成**覆蓋層彈窗**(複用 `report-overlay`/`report-card`,與培訓報告同款 540px/90vh)。
- 內容:結局標籤 + 關卡名 + 憤怒值軌跡 + **完整對話紀錄**(transcript)+ 完整評審(三分數條 + 做得好/可改進 + 總評)。
- 關閉:關閉鈕 / Esc / 點背景。移除 inline `#history-detail`(及其 CSS)。

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

### 2026-06-09 模型混搭 + 彈窗加寬 + 自訂滑桿 + 難度計劃
- **模型混搭(.env)**:`CUSTOMER_MODEL=gemini-2.5-flash-lite`(實測中句約 1.2s、長句 1.6s,比 flash 關 thinking 的 7.6s 再快 ~5×,現場 demo 不卡)/ `JUDGE_MODEL=gemini-2.5-flash`(報告保品質,結束才跑一次)。重啟生效。
- **結算/歷史彈窗加寬**:`.report-card` 寬度改 `min(92vw, clamp(460px, 40vw, 860px))`(約螢幕 40%、置中、下限 460/上限 860、手機 ≤92vw)。報告與歷史回放共用,一起變寬。
- **語音滑桿全自訂(融入結算語彙)**:`#vs-sec` 改純自訂圓角滑桿——軌道 8px 圓角、填充與拇指用**本關顏色** `--lvl`(`startGame` 依 genre 寫入 `.game-side`)、拇指白底彩框 + 陰影、hover/active 放大。填充比例由 `updateVoiceUI` 算 `--fill`。checkbox accent 也改本關色。webkit/moz 雙前綴。
- **計劃文件**:新增 [`難度與關卡計劃.md`](難度與關卡計劃.md)(三階難度 easy/normal/hard、6–8 關擴充清單、前後端最小改動、選用怒氣衰減係數、實作順序)。

### 2026-06-09 趣味性 ① 立繪 + 倒數 + 音效(純前端)
- **奧客立繪(emoji 換臉)**:`okeke-card` 加圓形 `#okeke-face`,依後端 `emotion`(angry/annoyed/neutral/calm/happy)換 emoji;開場用 `emotionForAnger()`(門檻對齊 `services/llm.py:_emotion_for`)。換臉有 pop 動畫、angry 額外抖動。之後可換手繪圖。
- **回合倒數(壓力模式)**:新 `.timer-card`(checkbox `#ts-on` + 滑桿 `#ts-sec` 10–60s,預設關)。輪到玩家就 `startTurnTimer()`(RAF 跑 `#timer-bar`),最後 5 秒滴答音 + 變紅 + 卡片告警邊框。時間到:有打字→自動送出;沒打字→爆表音 + 催促 toast + 重新計時。送出/AI 思考/錄音中/離開遊戲都會暫停,回合回來再續。設定存 `localStorage(okeke_timer)`。
- **音效(WebAudio 即時合成,免音檔)**:`SFX` 模組——倒數滴答、怒氣一回合飆 ≥12 的緊張音、爆表/逾時 buzzer、和解勝利音。開局點擊解鎖 AudioContext。`🔊 音效` checkbox 可關。
- **本關色貫穿**:立繪外框、計時條、滑桿填充都吃 `--lvl`(`.game-side` 依 genre 設)。
- 靜態檔即時生效,無需重啟;`node -c app.js` 通過。

### 2026-06-09 趣味性 ② 難度衰減 + 成本預算機制 + 身分簡報 + 4 新關卡
鎖定決議:固定身分簡報 / 成本中等(超支封頂B)/ 短班次3–4人(無盡留計劃)/ 四新關卡全做。詳見 [`難度與關卡計劃.md`](難度與關卡計劃.md)。
- **怒氣衰減係數 `calm_resistance`**:`apply_state` 只縮放「安撫成功」的負 delta(`round(delta/resistance)`),惹怒不打折;困難關 1.4 → 安撫 −20 變 −14。scenario 缺省 1.0。
- **成本預算機制(修『照單全收滿分』)**:
  - `CustomerTurn` 加 `concession_cost`(0~100,LLM 估這句讓掉多少);mock 用關鍵字(大讓步 55/小讓步 20)。
  - `GameState` 加 `concession_cost`/`cost_spent`;`apply_state` 累加 `cost_spent`(單值替換,resume 不重複)。
  - `cost_control_score` **後端公式算**(`nodes._cost_control_score`,中等力道:預算內 100→75、超支線性到 0),覆寫進報告 + 附 `cost_spent`/`cost_budget`。JudgeReport schema 不動(測試不破)。
  - judge prompt + `_cost_note`:拿公司資源換和平 → compliance 重扣 + 點進可改進。
  - 報告綜合分改 **4 維平均**(同理/危機/法規/成本控制);前端報告加第 4 條 + 讓步成本提示。
  - meter 加**讓步成本條**(本關色,超支變紅);`/api/say`/`/api/start` 回 `cost_spent`/`cost_budget`/`concession_cost`。
  - 真實 Gemini 實測:免單+退費+免費送 → `concession_cost 70`、`cost_spent 70/70`。
- **身分簡報**:scenario 加 `shop`/`player_role`;`/api/start` 回傳,遊戲 okeke-card 顯示「🏪 店家 · 你的身分:…」。
- **`swear_level`(0/1/2)**:`loader._build_system_prompt` 依等級附語氣指引(火爆可情緒粗口,禁性/歧視/問候家人)。
- **4 新關卡**:速食炸雞『雞還在養?』(餐飲 hard sw2)、早餐店常客『不知道我都點什麼?』(餐飲 normal sw1)、3C 維修人為損壞硬凹(客服 hard sw2)、網購瑕疵揚言上消保會(客服 normal sw1)。共 6 關。`客服` 走 fallback 綠。
- 既有 2 關補齊新欄位;全部 6 關 `loader.load` 驗證通過。
- 測試:新增 calm_resistance/cost 累加/cost_control 公式共 7 個;**`pytest` 32 passed**。後端改完已重啟(real Gemini, flash-lite)。

### 2026-06-09 選關卡改「難度色階」(班次模式 step 1)
- 需求(如 AKARU 圖):**藍=簡單 / 粉=中等 / 綠=困難**,一關一關排,捲動機制不變,休息態**藍寬→綠窄**。
- 前端 `DIFF_STYLE`:easy `#8ca2b4`(rest .16)/ normal `#b692a1`(.11)/ hard `#798e7b`(.075)。
- `loadScenarios` 依難度排序(easy→normal→hard,同級依初始憤怒);`okekePanel` 顏色/標籤/`data-diff` 改吃難度,emoji 仍依情境。
- `initHScroll`:`restCache` 依各 panel `data-diff` 給休息態寬度;`fracFor` 收尾插值到該難度寬(藍寬/粉中/綠窄),移除固定 STRIP/STRIP2。
- 遊戲內 `--lvl`(滑桿/立繪/成本條)+ okeke pill 也改吃難度色,關卡顏色全程一致。
- `liu_dong` 重標 `easy`(calm_resistance 0.9);`/api/scenarios` 多回 `difficulty`/`shop`。
- 順序實測:easy 劉董 → normal×4 → hard×2(炸雞哥)。**單關啟動流程不變**(「其餘邏輯一致」)。
- ⏭ 未做:真正的「多客人佇列」play(服務完一個換下一個 + 班次總報告)+ 簡單/好客內容,為 step 2。

### 2026-06-09 多客人「班次」模式 + 折疊聊天(班次模式 step 2)
- 點任一難度關卡 = 進入**該難度班次**,連續服務同難度多位客人(從點的那位起、輪一圈)。前端編排,後端 `/api/say` 不動。
- `startShift(diff,fromId)` → 依 `SCENARIOS`(快取)依難度建佇列 → `startCustomer()` 逐位;結束 `finishCustomer()` 給「下一位客人 → / 看班次總結 →」鈕推進。
- **聊天紀錄改折疊**:每位客人一個 `.cust-block`(可點標題展開/收合),換下一位自動收合前一位;標題徽章顯示結果色(綠和解/紅客訴/橘逾時)。解決班次對話過長。
- **班次總報告 `showShiftReport`**:平均分(4 維)、滿意/客訴/逾時數、🔥連續和解、💸總讓步成本 + 每位客人可展開明細(分數條/軌跡/做得好可改進/總評)。
- `--lvl`/立繪/成本條每位客人重置;`#quit` 重置 SHIFT。移除單關 `startGame`/`showReport`(改 shift 流程)。
- **2 個好客/簡單關**:客氣詢問退換的林小姐(零售)、順口稱讚的暖心常客(餐飲),`customer_kind:nice`、低怒氣當喘息。共 **8 關**(easy3/normal3/hard2)。
- 真實實測:免單退費 concession 70;暖心常客怒氣低檔(15→13)、成本 0、流程無誤。`pytest 32 passed`,`node -c` 通過。
- **修正(原本搞錯)**:選關畫面**只放 3 個難度關卡**(藍簡單/粉中等/綠困難,`tierPanel`),不再攤開 8 個客人;**點進難度才**連續面對該難度多位客人。藍寬→綠窄維持。`startShift(difficulty)` 從第一位開始。
- **carousel 起始寬度修正**:原本第一關吃 0.40「on-deck」寬,三關加總超過畫面 → 綠色被擠出。`fracFor` 移除 NEXT(0.40),焦點直接收成「難度細條」→ 起始(標題聚焦)時**三色細條並列**(藍 0.16 / 粉 0.11 / 綠 0.075,+標題 0.52 +敬請期待 0.085 = 0.95 全進畫面),如 AKARU 圖。聚焦某關時它長到 FOCUS 0.60。

### 2026-06-09 手繪立繪接入(取代 emoji)
- 玩家畫了**男生角色 5 表情**(`character_image/{ang,annoy,neu,calm,hap}_boy.png`,黑白線稿、白底、~640²)→ 複製到 `web/static/characters/`。
- scenario 加 `char` 欄位(`boy`×5 / `girl`×3,依性別);`/api/start` 回傳 `char`。
- 前端 `setOkekeFace`:有 `char` → 用 `/characters/<前綴>_<角色>.png`(前綴 ang/annoy/neu/calm/hap),**載入失敗(如 girl 尚未畫)`onerror` 退回 emoji**。`STATE.char` 來自 `d.scenario.char`。
- CSS `.okeke-face.has-img`:124px、白底、`object-fit:cover`、`object-position 50% 18%`(對齊臉)、本關色外框。
- 男生立繪 server 重啟後生效;女生關卡暫用 emoji,等 `_girl` 圖到位自動換。

### 2026-06-09 立繪補齊 4 套(boy/girl/aunt/uncle)+ 炸雞哥改女
- 玩家陸續補上 **girl / aunt(大媽)/ uncle(大叔)** 各 5 表情;`neu_aunt` 是 jpg → PIL 轉 png(其餘皆 png,前端硬抓 `.png`)。全部複製到 `web/static/characters/`。
- 中年人設原本錯配年輕臉 → 重新分配 `char`:**aunt**=張大媽、炸雞姐;**uncle**=劉董、維修客、早餐常客;**girl**=林小姐、暖心常客;**boy**=網購客。char 是自由字串,**前端零改 code** 自動抓圖。
- **炸雞哥 → 炸雞姐**:`su_shi_chicken` 名稱/persona(中年男子→中年婦人、加「叉腰開嗆」)/`char`(boy→aunt)/`tts_voice`(Yunyang 男聲→Xiaoxiao 女聲)。困難關不再清一色男臉。
- 班次每難度臉孔不撞:易=叔+女+女、中=媽+叔+男、難=媽+叔。
- 重啟 server 後 `/api/start` 實測 char 正確流通(炸雞姐 aunt / 劉董 uncle / 張大媽 aunt / 林小姐 girl / 網購客 boy)。

### 2026-06-09 CRAB 語音情緒(SER)訓練完成 — MSP 4 類 LoRA
- run `msp4_lora_warmA_lr1e4`:MSP-Podcast 8→4 類(Angry/Happy/Neutral/Anxious),warm-start strategyA_fullft,LoRA r16/α32,bs16、contrastive_weight 2.0、lr 1e-4/encoder 1e-5、8 epochs、AMP+grad_ckpt、num_workers 0。**全程 GPU 單跑、無 OOM**(遊戲 server 先關)。
- LR 校正後不再 collapse(早前 lr 1e-3 崩;改 Strategy A 的 1e-4)。dev macroF1 逐 epoch:0.577→0.544→**0.615**(e2)→0.596→0.592→0.6215(e5)→0.6245(e6)→**0.6265(e7,best)**。**e5→e7 一路爬升、最後 epoch 仍在進步 = epoch 數其實太少**(加到 12~15 大概率更高,ROI > 換全量資料)。e3–4 的下滑是雜訊非過擬合(dev loss 同步下降)。
- **TEST(6000):macroF1 0.6297 / UAR 0.6323 / loss 0.912**,略高於 dev best → 無過擬合、泛化良好。
- 各類 F1(test):Angry 0.679(R 0.725,寧可多抓爆氣→**對遊戲有利**)、Happy 0.685(最佳)、Neutral 0.579、Anxious 0.577。
- **混淆結構**(P/R 反推):**Anxious 被吞進 Neutral**(Anxious R 0.461、Neutral P 0.530)—— 低喚醒、語調平,聲學近似,接近資料天花板,非訓練問題。遊戲核心(爆氣/開心)偵測可靠。
- 訓練 process 結束後 GPU 歸還(24GB free),**重啟遊戲 server(real Gemini)**,立繪/char/成本/難度全生效。
- ⏭ 可選:跑精確 NxN 混淆矩陣 + 校準 Angry 閾值;加 epochs 重跑榨分;接 STT→SER 串到語音輸入。
- 模型架構/準確度完整寫進 **`docs/語音情緒模型.md`**(可放答辯)。

### 2026-06-09 選關 carousel 微調(休息寬 + 標語延後顯示)
- 三難度休息寬加大 `DIFF_STYLE.rest` 0.16/0.11/0.075 → **0.20/0.16/0.12**:標題 0.52 + 三關 0.48 = 填滿一屏;「敬請期待」溢出被 `overflow:hidden` 裁掉(起始只見藍/粉/綠,捲到底才現)。
- 標語 `.s-genre`(低怒氣・好安撫…)改包 `.rev` → 休息態藏起、聚焦才逐字上滑(與下方大名同機制);藥丸樣式移到內層 `span` 避免露空殼。
- 驗:`node -c` OK、`pytest 32 passed`、8 關 JSON 欄位齊全、4×5 立繪齊、靜態檔即時生效。
- 另記:`localhost:8000` 黑畫面 = IPv6(`::1`)解析坑,改 `127.0.0.1:8000` 解(詳見除錯筆記)。

## 2026-06-09(晚)~ 06-10(branch `feat/web-stt`)

### UI 大改:設定移上方、HUD 倒數、結束關卡、歷史分組
- **設定移到頂部 nav**(演練藍/歷史粉/設定綠三彩點),設定變**隨時可開的覆蓋層**(關卡前中後皆可調),壓力模式 + 語音輸入收進去。
- **HUD 回合倒數**常駐側欄(秒數 + 進度條,用難度色,最後 5 秒變紅閃 + 滴答);設定條留在設定 modal。
- 「換一關」→ **「結束關卡」**,直接回首頁、清乾淨狀態。
- **報告精簡**:judge prompt 限 good/bad 各 ≤3 點、每點 ≤30 字、summary ≤40 字。
- **歷史頁分組**:同一班次的客人聚成一張可摺疊卡(難度色 + 立繪頭像 + 結果徽章 + 班次平均分);舊紀錄各自單筆。
- **報告/歷史卷軸 + 分數條用難度色**;聊天框拉高、側欄精簡。

### 對話流程硬化(async 競態 / 卡死 / 跳針)
- **換關殘留亂入**:離開/換關時舊 `/api/say` 回來會污染新對局 → 加 **thread 守衛**(回應回來時 thread 已變就整個丟棄)。
- **「思考中」卡死**:`/api/say` 90s、`/api/start` 45s **client 逾時**(AbortController),逾時友善提示 + 還原輸入。
- **重複「你」泡泡 + 自動重送迴圈**:送失敗收回泡泡、不自動重啟倒數(根因見除錯筆記)。
- **跳針**:奧客 prompt 加「絕不重複、每則推進對話」硬指令(Groq llama 比 Gemini 易繞圈)。
- **超時懲罰**:倒數歸零沒打字 → 顯示端怒氣 +10(疊在 AI 怒氣上、跨回合累積)、變臉、催促。

### 好客人必超時修正(找到根因)
- `customer_kind:"nice"` 一直被忽略 → 好客人套到奧客 prompt(只有「完美方案解客訴」才 `ended`)→ 永遠無法和解、每場必超時。
- `loader._build_system_prompt` 依 `customer_kind` 附加 **nice 覆蓋**:被親切招待/給好建議就 `ended=success`、不硬拖、不重複問。

### 立繪表情 / 報告 / 卷軸 細修
- 立繪表情改**完全以怒氣決定**(`emotionForAnger`,怒氣0=最開心),不再用 LLM 自報情緒(常亂報)。立繪放大 124→152px。
- 分數全改 **0~100**(報告大分、四面向、歷史);分數字放大。
- 報告卷軸戳邊:改**外層 `.report-frame`(圓角 + `overflow:hidden` + `translateZ` GPU 合成)裁切、內層才捲動**,物理上不戳出 + 捲動順;滑塊離圓角 16px。

### LLM 供應商:Gemini ↔ Groq
- Gemini 免費層 RPM 連續壓測狂 429(成功率 ~24%)→ 測試切 **Groq**(`llama-3.3-70b-versatile`,~2s、額度大);最終 demo 再切回 Gemini。切換 = `LLM_PROVIDER` + `CUSTOMER_MODEL`/`JUDGE_MODEL` 三行(`config` 讀單值,模型名要一起改)。
- 撞額度的友善 toast(`_friendly_error`)已驗:回「AI 服務暫時達到使用上限…」而非沉默台詞。

### 寶可夢背景音樂系統
- 後端 `app.mount("/music")` 直接服務專案根 `music/`(不搬檔)。前端 `MUSIC` 模組(HTML5 Audio,快取重用 + 預載 + crossfade)。
- **首頁/歷史**大廳三曲隨機循環(剩 1.6s 提前交疊 → 無縫);**戰鬥曲依班次第幾位**(野生/訓練家/道館);**和解**播對應勝利曲;**進歷史/開設定**壓低背景 + Healed 一聲。
- 設定加**音量滑桿**;壓低 = 主音量 × 12%(隨滑桿縮放);Healed = 背景 + 主音量×35%(跟著縮放、固定高一截)。兩個壓低來源(設定/歷史)獨立可疊加。
- **載入優化**:WAV(125MB)→ **MP3(12MB,ffmpeg `-q:a 4`)**,`music/*.wav` gitignore;大廳曲 + 全立繪改 `requestIdleCallback` 預載(不擋首屏)。

### 語音情緒(SER)接進遊戲 — 獨立微服務
- **推論封裝** `Crab/api/okeke_infer.py`(`OkekeSER`):base XLS-R-300M + `PeftModel(audio_lora_adapter)`、base XLM-R-large + `PeftModel(text_lora_adapter)`、`final_ser.pt`(4 類)、波形 `train_norm_stat` 正規化。驗:test 48 clip acc 0.50(random 0.25)、Angry recall 強、Anxious↔Neutral 混 → 與訓練一致。
- **斷句演算法** `split_long_sentence`(玩家給的:句末標點 > 子句標點≥25% > 等時平衡),長語句切段、`predict_chunked` 依段長加權平均(已單元測)。
- **微服務** `Crab/api/ser_service.py`(FastAPI;`/health`、`/predict`(檔)、`/predict_pcm`(JSON base64))跑在 `Crab/.venv`,遊戲用 HTTP 呼叫、零依賴衝突。
- **遊戲串接**:`stt.transcribe_full`(`faster_whisper.decode_audio` 解碼一次 → text + 詞級時間戳 + 16k 波形)→ `ser_client`(stdlib urllib 送 PCM base64)→ `/api/stt` 回 `{text, emotion}`(`SER_URL` 沒開就略過、純文字照跑)。
- **語氣影響奧客**:`voice_emotion` 經 `/api/say`→state→`llm._voice_note` 注入 prompt(Happy 安撫加成 / Neutral 照舊 / Anxious 稍打折 / Angry 砍半甚至轉正)。前端 STT 拿語氣存 `STATE.voiceEmotion`、send 帶上、打字清掉、toast 顯示。
- **限制**:模型英文 MSP 訓練,中文玩家屬 OOD(音訊靠 XLS-R 跨語言遷移、文字分支弱)→ 之後混 EmotionTalk(ZH)做雙語。

### Footer 文案
- 介紹加長(帶到語音/語氣賣點)、刪 CineRooms/AKARU 句、版權加 `guenchen1`、改「為熱愛跟奧客溝通的你練心打造」。