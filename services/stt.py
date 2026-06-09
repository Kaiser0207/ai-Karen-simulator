"""STT 語音轉文字服務(faster-whisper)。

- 模型只在第一次用到時載入(lazy),且只載一次(singleton)。
- 第一次執行會自動下載模型權重(medium 約 1.5GB),之後用本地快取。
- 預設 CPU + int8(不吃 VRAM、不搶 GPU);要用 GPU 改 .env 的 STT_DEVICE=cuda。
- 輸出會用 opencc 轉繁體(s2twp);若 opencc 不可用則回原文。
"""

from __future__ import annotations

import config

_model = None
_cc = None
_cuda_loaded = False


def _preload_cuda_libs():
    """從 venv 內的 nvidia 套件預載 CUDA 函式庫(cuBLAS/cuDNN)。

    faster-whisper 的後端 ctranslate2 在 GPU 上會 dlopen libcublas.so.12 等,
    但 pip 裝的 .so 不在系統 loader 路徑上。這裡用 ctypes 以 RTLD_GLOBAL 先載入,
    之後 ctranslate2 依 soname dlopen 就會找到已載入的版本。
    好處:不必設 LD_LIBRARY_PATH、不碰系統,完全隔離在本專案 venv。
    """
    global _cuda_loaded
    if _cuda_loaded:
        return
    import ctypes
    import glob
    import os

    try:
        import nvidia
    except ImportError:
        return  # 沒裝 CUDA 套件(CPU 模式)就略過

    # nvidia 是命名空間套件,用 __path__(__file__ 會是 None)
    so_files = []
    for base in list(nvidia.__path__):
        for sub in ("cublas", "cudnn", "cuda_nvrtc"):
            so_files += glob.glob(os.path.join(base, sub, "lib", "*.so*"))

    # 多輪載入以處理彼此相依的順序(依賴未就緒會在下一輪成功)
    remaining = list(so_files)
    for _ in range(4):
        still = []
        for so in remaining:
            try:
                ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                still.append(so)
        remaining = still
        if not remaining:
            break
    _cuda_loaded = True


def _get_model():
    global _model
    if _model is None:
        if config.STT_DEVICE == "cuda":
            _preload_cuda_libs()  # GPU 模式才需要,且只做一次
        from faster_whisper import WhisperModel  # 重,延後到真的要用才載入

        _model = WhisperModel(
            config.STT_MODEL, device=config.STT_DEVICE, compute_type=config.STT_COMPUTE
        )
    return _model


def _to_traditional(text: str) -> str:
    """簡體→繁體(台灣用語)。opencc 不可用時原樣回傳。"""
    global _cc
    if not text:
        return text
    try:
        if _cc is None:
            from opencc import OpenCC

            _cc = OpenCC("s2twp")
        return _cc.convert(text)
    except Exception:
        return text


def transcribe(audio_path: str) -> str:
    """把音檔轉成繁體中文文字。空輸入直接回空字串(不載入模型)。

    initial_prompt 餵一句「含標點的中文」→ Whisper 會延續該風格、把標點補出來
    (medium 常漏標點,大模型 + 引導句最有效);vad_filter 去除靜音段、減少幻聽。
    """
    if not audio_path:
        return ""
    segments, _ = _get_model().transcribe(
        audio_path,
        language=config.STT_LANGUAGE,
        initial_prompt=config.STT_PROMPT or None,
        vad_filter=True,
    )
    text = "".join(seg.text for seg in segments).strip()
    return _to_traditional(text)


def transcribe_full(audio_path: str):
    """轉文字 + 詞級時間戳 + 解碼後的 16k 波形(給 SER 用,免再解一次 webm)。

    回傳 (text, words, audio):
      - text:繁體文字
      - words:[{"start","end","word"}, ...](word_timestamps;供 SER 長語句依時間戳切段)
      - audio:np.float32 @16k 單聲道(faster-whisper 解碼;轉成 PCM 丟給 SER 微服務)
    解碼用 faster_whisper.decode_audio(底層 PyAV/ffmpeg),webm/opus 都能讀。
    """
    if not audio_path:
        return "", [], None
    try:
        from faster_whisper import decode_audio
    except Exception:  # 舊版位置
        from faster_whisper.audio import decode_audio
    audio = decode_audio(audio_path, sampling_rate=16000)   # np.float32 16k mono
    segments, _ = _get_model().transcribe(
        audio,
        language=config.STT_LANGUAGE,
        initial_prompt=config.STT_PROMPT or None,
        vad_filter=True,
        word_timestamps=True,
    )
    parts, words = [], []
    for seg in segments:
        parts.append(seg.text)
        for w in (seg.words or []):
            words.append({"start": float(w.start), "end": float(w.end), "word": w.word})
    text = _to_traditional("".join(parts).strip())
    return text, words, audio


def warmup() -> bool:
    """預先把模型載到裝置並跑一次空音訊暖機(初始化 CUDA kernel)。

    在網頁啟動時呼叫,讓「第一次錄音」不卡。失敗不影響程式(會退回首次錄音時才載入)。
    回傳是否成功。
    """
    try:
        import numpy as np

        model = _get_model()
        segments, _ = model.transcribe(np.zeros(16000, dtype=np.float32), language=config.STT_LANGUAGE)
        list(segments)  # 消耗 generator 才會真的跑一次推論
        print(f"[STT] 模型已預載到 {config.STT_DEVICE}({config.STT_MODEL})")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[STT] 預載失敗,將於首次錄音時再載入:{e}")
        return False
