# `services/stt.py` 詳解 —— 語音轉文字(STT)

> 本文件逐一說明 `services/stt.py` 裡有什麼、每個函式做什麼、傳入傳出什麼,以及 GPU 怎麼接、為什麼這樣設計。
> 對應原始碼:[../services/stt.py](../services/stt.py);整合面(麥克風、錄完自動清空)見 [學習_8_多模態與資料持久化.md](學習_8_多模態與資料持久化.md)。

---

## 0. 這個檔在系統的位置

```
麥克風錄音(Gradio gr.Audio)
   │ 音檔路徑
   ▼
services/stt.py  ──>  faster-whisper(把語音轉成文字)
   │ 繁體中文文字
   ▼
player_say(...)  ──>  和「打字」完全一樣的回合流程 → graph.invoke
```

**關鍵**:STT 在 `graph.invoke` **之前**做掉,是個「**輸入轉接器**」。後端的 LangGraph 圖完全不知道有語音這回事(只收到文字)——這是刻意的解耦,好處是後端可純文字測試、語音壞了也不影響核心邏輯。

對外只暴露兩個函式:

| 函式 | 做什麼 | 何時呼叫 |
|------|--------|---------|
| `transcribe(audio_path)` | 音檔 → 繁體中文文字 | 每次錄完一段語音 |
| `warmup()` | 預先把模型載到 GPU 並暖機 | 網頁啟動時(背景執行緒) |

其餘 `_開頭` 的都是內部輔助函式。

---

## 1. `transcribe(audio_path)` —— 主功能

```python
def transcribe(audio_path: str) -> str:
    if not audio_path:
        return ""                                   # ① 空輸入直接回空(不載入模型)
    segments, _ = _get_model().transcribe(audio_path, language=config.STT_LANGUAGE)  # ②
    text = "".join(seg.text for seg in segments).strip()  # ③ 把片段拼成完整字串
    return _to_traditional(text)                    # ④ 轉繁體
```

- **傳入**:`audio_path`(錄音檔的路徑,由 Gradio `gr.Audio(type="filepath")` 提供)。
- **傳出**:辨識出的**繁體中文字串**(失敗或空音訊回 `""`)。
- **步驟**:
  1. 空路徑直接回 `""`(連模型都不載,省資源)。
  2. 取得模型(見 `_get_model`)並轉錄;whisper 回傳的是**一段段 `segments`**(generator)。
  3. 把每段 `seg.text` 接起來、去頭尾空白。
  4. 用 `_to_traditional` 把簡體轉繁體。

> 為什麼要拼接?whisper 會把長音訊切成多個片段,每段一個 `text`,所以要 `"".join(...)` 組回完整句子。

---

## 2. `_get_model()` —— 模型的延後載入 + 單例

```python
def _get_model():
    global _model
    if _model is None:                       # 只在第一次載入(singleton)
        if config.STT_DEVICE == "cuda":
            _preload_cuda_libs()             # GPU 模式才需要先載 CUDA 函式庫
        from faster_whisper import WhisperModel   # lazy import(很重,用到才載)
        _model = WhisperModel(
            config.STT_MODEL, device=config.STT_DEVICE, compute_type=config.STT_COMPUTE
        )
    return _model
```

三個設計重點:
- **lazy(延後載入)**:`_model` 一開始是 `None`,只有真的要轉錄時才建立。沒用語音時完全不佔記憶體/VRAM。
- **singleton(只載一次)**:模型很重(載入慢、佔記憶體),用模組層的 `_model` 快取,之後每次轉錄重用同一個。
- **`from faster_whisper import ...` 寫在函式內**:連 import 都延後——這樣 `import services.stt` 不會把整個 whisper 拉進來,CPU 模式或沒裝套件時程式也能跑。

---

## 3. `_preload_cuda_libs()` —— GPU 能跑的關鍵(較進階)

### 為什麼需要它?
faster-whisper 的後端 **ctranslate2** 在 GPU 上會去 `dlopen` CUDA 運算函式庫(`libcublas.so.12`、cuDNN…)。但這些函式庫是用 `pip` 裝進 venv 的,**不在系統的動態載入路徑上**,所以會報 `libcublas.so.12 is not found`(這是我們踩過的雷)。

### 它怎麼解?
```python
import ctypes
import nvidia                       # pip 裝的 nvidia-cublas-cu12 等
for base in list(nvidia.__path__): # nvidia 是命名空間套件,用 __path__
    for sub in ("cublas", "cudnn", "cuda_nvrtc"):
        so_files += glob.glob(os.path.join(base, sub, "lib", "*.so*"))
# 用 ctypes 以 RTLD_GLOBAL 把這些 .so 先載進來
ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
```

- **原理**:先用 `ctypes` 把 venv 裡的 `.so` **以 `RTLD_GLOBAL` 載入**;之後 ctranslate2 再依 soname `dlopen("libcublas.so.12")` 時,就會**命中已經載入的版本**。
- **好處**:**不必設 `LD_LIBRARY_PATH`、不碰系統** —— 完全隔離在專案 venv,不影響共用伺服器上的其他人。
- **兩個細節**:
  - `nvidia` 是**命名空間套件**,要用 `nvidia.__path__`(它的 `__file__` 是 `None`)。
  - **多輪載入**(`for _ in range(4)`):函式庫彼此相依,某個 `.so` 可能要等它依賴的先載好;載失敗的留到下一輪,通常幾輪就全部成功。
- 只在 `STT_DEVICE == "cuda"` 時呼叫,且用 `_cuda_loaded` 旗標確保只做一次。

---

## 4. `_to_traditional(text)` —— 簡轉繁

```python
def _to_traditional(text):
    if not text:
        return text
    try:
        if _cc is None:
            from opencc import OpenCC
            _cc = OpenCC("s2twp")    # s2twp = 簡體 → 繁體(台灣用語+慣用詞)
        return _cc.convert(text)
    except Exception:
        return text                  # opencc 不可用就回原文,不讓它擋住主流程
```

- whisper 對中文常輸出**簡體**,這裡用 **opencc** 轉成繁體台灣用語。
- `_cc` 也是單例(轉換器只建一次)。
- 包了 try/except:就算 opencc 出問題,也只是回原文,不會讓語音功能整個壞掉。

---

## 5. `warmup()` —— 開網頁就把模型掛上 GPU

```python
def warmup() -> bool:
    try:
        model = _get_model()                                   # 載入模型到裝置
        segments, _ = model.transcribe(np.zeros(16000, dtype=np.float32), language=config.STT_LANGUAGE)
        list(segments)                                         # 消耗 generator 才真的跑一次推論
        print(f"[STT] 模型已預載到 {config.STT_DEVICE}({config.STT_MODEL})")
        return True
    except Exception as e:
        print(f"[STT] 預載失敗,將於首次錄音時再載入:{e}")
        return False
```

- **目的**:原本是「第一次錄音才載入」→ 第一句很卡。`warmup()` 在**網頁啟動時**先載入模型 + 跑一次**空音訊(1 秒靜音)**,連 CUDA kernel 都初始化好。
- **為什麼要跑一次空音訊**:只 `WhisperModel(...)` 是載權重;**第一次 `transcribe` 還會初始化 CUDA 計算**。跑一次假音訊把這個成本也先付掉,真正第一次錄音才真的不卡。
- **在哪裡被呼叫**:`app.py` 啟動時用**背景執行緒** `threading.Thread(target=stt.warmup, daemon=True).start()` —— 不擋網頁開啟,模型在背景默默掛上 GPU。
- **失敗不影響程式**:包了 try/except,預載失敗就退回「首次錄音時再載入」。

---

## 6. 相關設定(`.env` / `config.py`)

| 變數 | 預設 | 說明 |
|------|------|------|
| `STT_MODEL` | `medium` | 模型大小 tiny/base/small/medium/large-v3(越大越準越慢) |
| `STT_DEVICE` | `cuda` | `cuda`(GPU)或 `cpu` |
| `STT_COMPUTE` | `float16` | GPU 用 `float16`;CPU 用 `int8` |
| `STT_LANGUAGE` | `zh` | 辨識語言 |
| `STT_WARMUP` | `1` | 1=網頁啟動就預載模型到裝置 |

---

## 7. 設計重點總覽(答辯可講)

| 設計 | 為什麼 |
|------|--------|
| STT 放在 `graph.invoke` **之前**(不進圖) | 解耦:後端可純文字測試、語音壞了不影響核心邏輯 |
| 模型 **lazy + singleton** | 重資源用到才載、且只載一次,沒用語音時不佔記憶體 |
| `import faster_whisper` 寫在函式內 | 連 import 都延後,沒裝套件/CPU 模式也能跑 |
| **ctypes 預載 CUDA 函式庫** | 讓 GPU 能用,又不必改系統環境(隔離在 venv) |
| **warmup 背景預載** | 把「首次載入延遲」從使用者操作移到啟動階段,且不擋網頁 |
| opencc 轉繁體、且失敗回原文 | 中文體驗好,又不讓附加功能擋住主流程 |

---

## 8. 老師可能問

**Q:語音輸入怎麼做的?會不會改到後端?**
A:用 faster-whisper 把麥克風音檔轉成文字,在 `graph.invoke` 之前完成,轉出的文字走和打字一樣的流程。後端的圖完全沒改——STT 只是輸入轉接器。

**Q:為什麼模型要 lazy load 和單例?**
A:whisper 模型很重(載入慢、佔顯存),lazy 讓沒用語音時不佔資源,singleton 讓只載一次、之後重用,避免每次轉錄都重載。

**Q:GPU 那個 `libcublas.so.12 not found` 你怎麼解的?**
A:CUDA 運算函式庫用 pip 裝進 venv,但不在系統載入路徑。我在程式裡用 `ctypes` 以 `RTLD_GLOBAL` 預載這些 `.so`,ctranslate2 之後 dlopen 就找得到——不必設 `LD_LIBRARY_PATH`、不碰系統,完全隔離。

**Q:第一次錄音為什麼不卡?**
A:網頁啟動時用背景執行緒呼叫 `warmup()`,先把模型載到 GPU 並跑一次空音訊暖機,把載入和 CUDA 初始化的成本提前付掉。

**Q:辨識出來是簡體還是繁體?**
A:whisper 中文常輸出簡體,我再用 opencc(`s2twp`)轉成繁體台灣用語;就算 opencc 出問題也只回原文,不影響主流程。
