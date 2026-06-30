# config/openai_provider.py
"""
OpenAI API 프로바이더
"""
import os
import time
import logging
from openai import OpenAI, RateLimitError

from .base_llm import BaseLLMProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(BaseLLMProvider):
    """OpenAI API 프로바이더"""

    DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    def __init__(
        self,
        model: str = None,
        temperature: float = 0.5,
        max_tokens: int = 100,
    ):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY 환경변수가 설정되지 않았습니다.\n"
                ".env.local에 OPENAI_API_KEY=sk-... 를 추가하세요."
            )

        self._model = model or self.DEFAULT_MODEL
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._client = OpenAI(api_key=api_key)

        logger.info(f"✅ OpenAIProvider 초기화: model={self._model}, temp={temperature}")

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt: str) -> tuple[str, dict]:
        max_retries = 4
        for attempt in range(max_retries):
            try:
                start = time.time()

                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=self._temperature,
                    max_tokens=self._max_tokens,
                )

                elapsed = time.time() - start
                usage = response.usage

                metadata = {
                    "elapsed_time": elapsed,
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens,
                    "total_cost": self._calc_cost(usage.prompt_tokens, usage.completion_tokens),
                }

                text = response.choices[0].message.content.strip()
                logger.info(f"💬 OpenAI 호출 완료: {elapsed:.2f}초, {usage.total_tokens} 토큰")
                return text, metadata

            except RateLimitError as e:
                if attempt == max_retries - 1:
                    raise
                wait = 2 ** attempt  # 1s, 2s, 4s
                logger.warning(f"⚠️ Rate limit 429, {wait}초 후 재시도 ({attempt + 1}/{max_retries - 1}): {e}")
                time.sleep(wait)

    def _calc_cost(self, prompt_tokens: int, completion_tokens: int) -> float:
        """gpt-4o-mini 기준 비용 계산 (USD)"""
        # gpt-4o-mini: input $0.15 / 1M tokens, output $0.60 / 1M tokens
        input_cost = prompt_tokens * 0.15 / 1_000_000
        output_cost = completion_tokens * 0.60 / 1_000_000
        return round(input_cost + output_cost, 8)
