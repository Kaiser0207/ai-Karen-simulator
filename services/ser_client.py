"""SER 微服務的薄客戶端 —— 把玩家語音的「語氣」問出來(best-effort)。

只用標準庫(urllib + json + base64),不新增依賴。任何錯誤(服務沒開、逾時、格式不符)
都回 None,讓 /api/stt 純文字照常跑 —— SER 是加分項,絕不能擋住主流程。

送的是 16k 單聲道 int16 PCM 的 base64(遊戲已用 faster-whisper 解好碼),
所以微服務端不必再解 webm。長語句附 words(詞級時間戳)讓對方依時間戳切段加權。
"""

from __future__ import annotations

import base64
import json
import logging
import urllib.request

import numpy as np

import config

logger = logging.getLogger(__name__)


def voice_emotion(audio_16k, text: str = "", words=None):
    """回 {label, confidence, probs, ...} 或 None(關閉/失敗)。audio_16k:np.float32 @16k。"""
    url = (config.SER_URL or "").strip()
    if not url or audio_16k is None or not len(audio_16k):
        return None
    try:
        pcm = (np.clip(np.asarray(audio_16k, dtype=np.float32), -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
        body = json.dumps({
            "pcm_b64": base64.b64encode(pcm).decode("ascii"),
            "sr": 16000,
            "text": text or "",
            "words": words or None,
        }).encode("utf-8")
        req = urllib.request.Request(url.rstrip("/") + "/predict_pcm", data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=config.SER_TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001 服務沒開/逾時/任何錯 → 略過
        logger.info("SER 略過(服務未啟用或失敗):%s", e)
        return None
