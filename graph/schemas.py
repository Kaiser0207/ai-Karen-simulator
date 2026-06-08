"""結構化輸出 Schema。

奧客大腦與評審大腦的輸出都用 Pydantic 模型約束,
真實 LLM 模式下會用 with_structured_output() 強制 LLM 回傳這個格式,
mock 模式下則由 services/llm.py 直接建構這些物件。
"""

from typing import Literal

from pydantic import BaseModel, Field

# 情緒標籤鎖定選項,避免出現前端沒有對應立繪/語音的值
Emotion = Literal["angry", "annoyed", "neutral", "calm", "happy"]


class CustomerTurn(BaseModel):
    """奧客大腦每回合的輸出。"""

    reply: str = Field(description="奧客講的下一句台詞(繁體中文)")
    anger_change: int = Field(ge=-30, le=30, description="本回合憤怒值變化量,-30 ~ +30")
    ended: bool = Field(description="玩家是否提出完美解決方案,達成和解")
    emotion: Emotion = Field(description="當下情緒標籤(供前端換立繪/將來給 TTS)")


class JudgeReport(BaseModel):
    """評審大腦的結算報告。"""

    empathy_score: int = Field(ge=0, le=100, description="同理心表現 0~100")
    crisis_score: int = Field(ge=0, le=100, description="危機應變力 0~100")
    compliance_score: int = Field(ge=0, le=100, description="法規店規遵從度 0~100")
    good_practices: list[str] = Field(description="做得好的話術(具體引用)")
    bad_practices: list[str] = Field(description="可改進的話術 + 建議改法")
    summary: str = Field(description="總評")
