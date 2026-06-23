import asyncio
import logging
from typing import Dict, Any, Optional

from models import Intervention, InterventionRepository
from generators import MessageGenerator
from scoring import calculate_score, save_score, decide_action

logger = logging.getLogger(__name__)


class Pipeline:
    """LLM 메시지 생성 및 저장 파이프라인"""

    def __init__(
        self,
        pool,
        intervention_repo: InterventionRepository,
        message_generator: Optional[MessageGenerator],
    ):
        self.pool = pool
        self.intervention_repo = intervention_repo
        self.message_generator = message_generator

    async def process_emotion(
        self,
        memory_id: int,
        user_id: str,
        reason: str,
        context: Dict[str, Any],
    ) -> bool:
        """LLM 메시지 생성 및 intervention 저장. 성공 시 True 반환."""
        try:
            if not self.message_generator:
                logger.info("⏭️ LLM 미연결 — 개입 생성 생략")
                return False

            action = decide_action(context.get("feedback_avg_score"), reason)
            context["action"] = action

            logger.info(f"💬 LLM 메시지 생성 중 (memory_id={memory_id}, reason={reason}, action={action})")

            message, gen_meta = await asyncio.to_thread(
                self.message_generator.generate_with_validation,
                reason,
                context,
            )
            logger.info(f"   생성 방법: {gen_meta.get('generation_method')}")

            intervention = Intervention(
                user_id=user_id,
                reason=reason,
                message=message,
                message_type=action,
            )

            intervention_id = await self.intervention_repo.create(intervention)

            if intervention_id:
                logger.info(f"✅ Intervention 생성 완료: {intervention_id}")
                return True
            else:
                logger.error("❌ Intervention 생성 실패")
                return False

        except Exception as e:
            logger.error(f"❌ LLM 처리 실패 (memory_id={memory_id}): {e}", exc_info=True)
            return False

    async def process_feedback(self, payload: Dict[str, Any]) -> None:
        """피드백 INSERT 이벤트 처리 — feedback_score 갱신"""
        try:
            data = payload.get("data", payload)
            record = data.get("record") or data.get("new") or {}
            intervention_id = record.get("intervention_id")
            if not intervention_id:
                return

            score = await calculate_score(self.pool, intervention_id)
            await save_score(self.pool, intervention_id, score)
        except Exception as e:
            logger.error(f"❌ 피드백 처리 실패: {e}", exc_info=True)
