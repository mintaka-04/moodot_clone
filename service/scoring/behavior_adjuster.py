"""
누적 피드백 점수 기반 에이전트 행동 조정
"""
import logging
from typing import Optional

REASON_TO_DEFAULT_ACTION = {
    "negative_pattern":      "empathy",
    "negative_ratio":        "empathy",
    "positive_reinforcement": "encouragement",
    "no_recent_record":      "checkin",
}

ACTION_DIRECTIVE = {
    "checkin":       "가볍게 안부만 물어보세요. 감정 분석이나 깊은 공감 없이 짧고 가볍게 접근하세요.",
    "empathy":       "적극적으로 공감하며 감정에 깊게 공명해도 됩니다.",
    "encouragement": "격려하는 톤으로 긍정적으로 접근하세요.",
}

logger = logging.getLogger(__name__)


async def get_feedback_trend(
    pool,
    user_id: str,
    limit: int = 5
) -> Optional[float]:
    """
    최근 shown/interacted intervention들의 평균 feedback_score 반환.
    feedback_score가 NULL(피드백 없이 무시됨)이면 0점으로 처리.
    shown 기록이 없으면 None.
    """
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT feedback_score FROM interventions
                WHERE user_id = $1 AND status IN ('shown', 'interacted')
                ORDER BY created_at DESC
                LIMIT $2
                """,
                user_id, limit,
            )

        if not rows:
            return None

        scores = [r['feedback_score'] or 0 for r in rows]
        avg = sum(scores) / len(scores)
        logger.debug(f"피드백 트렌드: user={user_id}, avg={avg:.2f} ({len(scores)}개, 무시={sum(1 for r in rows if r['feedback_score'] is None)}개)")
        return avg

    except Exception as e:
        logger.error(f"❌ 피드백 트렌드 조회 실패: {e}")
        return None


def get_adjusted_max_per_day(avg_score: Optional[float], base: int = 2) -> int:
    """
    평균 피드백 점수에 따라 하루 최대 개입 횟수 조정.
        avg ≥ 2  → +1 (반응 좋음)
        avg < 0  → -1 (반응 나쁨), 최소 1
        그 외    → base 유지
    """
    if avg_score is None:
        return base
    if avg_score >= 2:
        return base + 1
    if avg_score < 0:
        return max(1, base - 1)
    return base


def decide_action(avg_score: Optional[float], reason: str) -> str:
    """
    피드백 트렌드 + reason 기반으로 실제 행동(action) 결정.
    반환값: "empathy" | "encouragement" | "checkin"

        avg < 0  → checkin  (반응 나쁨 → 가볍게만)
        avg >= 2 → reason에 맞게 적극 접근 (empathy or encouragement)
        그 외    → reason의 자연스러운 매핑 따름
    """
    if avg_score is not None and avg_score < 0:
        return "checkin"
    if avg_score is not None and avg_score >= 2:
        if reason in ("negative_pattern", "negative_ratio"):
            return "empathy"
        return "encouragement"
    return REASON_TO_DEFAULT_ACTION.get(reason, "checkin")


def get_action_directive(action: str) -> str:
    """action에 대응하는 LLM 프롬프트 지시문 반환"""
    return ACTION_DIRECTIVE.get(action, "")
