"""
피드백 점수 계산
"""
import logging

logger = logging.getLogger(__name__)


async def calculate_score(pool, intervention_id: str) -> int:
    try:
        async with pool.acquire() as conn:
            total = await conn.fetchval(
                "SELECT COALESCE(SUM(explicit_score), 0) FROM intervention_feedback WHERE intervention_id = $1",
                intervention_id,
            )
        logger.debug(f"점수 계산 완료: intervention={intervention_id}, score={total}")
        return total or 0

    except Exception as e:
        logger.error(f"❌ 점수 계산 실패: {e}")
        return 0


async def save_score(pool, intervention_id: str, score: int) -> None:
    """총점을 interventions.feedback_score에 저장"""
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE interventions SET feedback_score = $1 WHERE id = $2",
                score, intervention_id,
            )
        logger.info(f"✅ feedback_score 저장: intervention={intervention_id}, score={score}")
    except Exception as e:
        logger.error(f"❌ feedback_score 저장 실패: {e}")
