"""
감정 이벤트 및 피드백 처리 파이프라인
"""
import logging
from typing import Dict, Any, Optional

from models import Intervention, InterventionRepository, REASON_TO_MESSAGE_TYPE
from rules import RuleEngine
from generators import MessageGenerator
from scoring import calculate_score, save_score, decide_action

logger = logging.getLogger(__name__)

DEFAULT_USER_ID = "default_user"


class Pipeline:
    """감정 → 판단 → 메시지 생성 → 저장 파이프라인"""

    def __init__(
        self,
        supabase,
        intervention_repo: InterventionRepository,
        rule_engine: RuleEngine,
        message_generator: Optional[MessageGenerator],
    ):
        self.supabase = supabase
        self.intervention_repo = intervention_repo
        self.rule_engine = rule_engine
        self.message_generator = message_generator

    async def process_emotion(self, payload: Dict[str, Any]) -> None:
        """새 감정 INSERT 이벤트 처리"""
        try:
            data = payload.get("data", payload)
            emotion = data.get("record") or data.get("new") or {}
            user_id = emotion.get("user_id", DEFAULT_USER_ID)

            emotion_id = emotion.get("emotion_id")
            try:
                result = await self.supabase.table("emotion_categories") \
                    .select("emotion") \
                    .eq("emotion_id", emotion_id) \
                    .single() \
                    .execute()
                emotion_name = result.data["emotion"] if result.data else "Unknown"
            except Exception as e:
                logger.error(f"감정 카테고리 조회 실패: {e}")
                emotion_name = "Unknown"

            logger.info("=" * 50)
            logger.info("📥 새 감정 감지!")
            logger.info(f"   ID: {emotion['id']}")
            logger.info(f"   사용자: {user_id}")
            logger.info(f"   감정: {emotion_name}")
            logger.info(f"   내용: {emotion.get('text', 'N/A')}")
            logger.info(f"   시간: {emotion['created_at']}")
            logger.info("=" * 50)

            decision = await self.rule_engine.evaluate(user_id)

            if not decision.get("should_intervene"):
                logger.info(f"⏭️ 개입 불필요: {decision.get('reason')}")
                await self._mark_as_processed(emotion["id"])
                return

            logger.info(f"💬 개입 생성 중...")
            logger.info(f"   규칙: {decision.get('rule')}")
            logger.info(f"   이유: {decision['reason']}")
            logger.info(f"   톤: {decision.get('tone')}")
            logger.info(f"   심각도: {decision.get('severity', 1)}/3")

            if not self.message_generator:
                logger.info("⏭️ LLM 미연결 — 개입 생성 생략 (미처리 상태 유지)")
                return

            context = decision.get("context", {})
            action = decide_action(context.get("feedback_avg_score"), decision["reason"])
            context["action"] = action
            logger.info(f"   행동: {action}")

            message, gen_meta = self.message_generator.generate_with_validation(
                decision["reason"],
                context
            )
            logger.info(f"   생성 방법: {gen_meta.get('generation_method')}")

            intervention = Intervention(
                user_id=user_id,
                reason=decision["reason"],
                message=message,
                message_type=action
            )

            intervention_id = await self.intervention_repo.create(intervention)

            if intervention_id:
                logger.info(f"✅ Intervention 생성: {intervention_id}")
                logger.info(f"   메시지: {message}")
                await self._mark_as_processed(emotion["id"])
                logger.info("✅ 처리 완료\n")
            else:
                logger.error("❌ Intervention 생성 실패 — 재처리 대기")

        except Exception as e:
            logger.error(f"❌ 이벤트 처리 중 에러: {e}", exc_info=True)

    async def process_feedback(self, payload: Dict[str, Any]) -> None:
        """피드백 INSERT 이벤트 처리 — feedback_score 갱신"""
        try:
            data = payload.get("data", payload)
            record = data.get("record") or data.get("new") or {}
            intervention_id = record.get("intervention_id")
            if not intervention_id:
                return

            score = await calculate_score(self.supabase, intervention_id)
            await save_score(self.supabase, intervention_id, score)
        except Exception as e:
            logger.error(f"❌ 피드백 처리 실패: {e}", exc_info=True)

    async def _mark_as_processed(self, emotion_id: str) -> None:
        """감정 기록을 처리 완료 상태로 변경"""
        try:
            result = await self.supabase.table("memories") \
                .update({"processed": True}) \
                .eq("id", emotion_id) \
                .execute()

            if hasattr(result, "data") and result.data:
                logger.debug(f"Processed 플래그 업데이트 성공: {emotion_id}")
            else:
                logger.warning(f"Processed 플래그 업데이트 실패: {emotion_id}")
        except Exception as e:
            logger.error(f"❌ Processed 업데이트 실패: {e}")
