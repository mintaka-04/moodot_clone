import logging
from typing import Optional, List

import asyncpg

from .intervention import Intervention, InterventionStatus

logger = logging.getLogger(__name__)


class InterventionRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def create(self, intervention: Intervention) -> Optional[str]:
        try:
            data = intervention.to_db_dict()
            logger.info(f"💾 Intervention 저장: {intervention.reason}")

            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    INSERT INTO interventions (user_id, reason, message, status, message_type)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id
                    """,
                    data['user_id'], data['reason'], data['message'],
                    data['status'], data['message_type'],
                )

            if row:
                intervention_id = str(row['id'])
                logger.info(f"✅ 저장 완료: {intervention_id}")
                return intervention_id

            logger.error("❌ 저장 실패: 응답 없음")
            return None

        except Exception as e:
            logger.error(f"❌ 저장 실패: {e}", exc_info=True)
            return None

    async def get_pending(self, user_id: str, limit: int = 1) -> List[Intervention]:
        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT * FROM interventions
                    WHERE user_id = $1 AND status = $2
                    ORDER BY created_at DESC
                    LIMIT $3
                    """,
                    user_id, InterventionStatus.PENDING.value, limit,
                )
            return [Intervention.from_db_dict(dict(r)) for r in rows]
        except Exception as e:
            logger.error(f"❌ Pending 조회 실패: {e}")
            return []

    async def update_status(self, intervention_id: str, status: InterventionStatus) -> bool:
        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute(
                    "UPDATE interventions SET status = $1 WHERE id = $2",
                    status.value, intervention_id,
                )
            if int(result.split()[-1]):
                logger.info(f"✅ 상태 업데이트: {intervention_id} → {status.value}")
                return True
            logger.warning(f"⚠️ 상태 업데이트 대상 없음: {intervention_id}")
            return False
        except Exception as e:
            logger.error(f"❌ 상태 업데이트 실패: {e}")
            return False

    async def count_today(self, user_id: str) -> int:
        try:
            async with self.pool.acquire() as conn:
                count = await conn.fetchval(
                    """
                    SELECT COUNT(*)::int FROM interventions
                    WHERE user_id = $1 AND created_at >= date_trunc('day', NOW())
                    """,
                    user_id,
                )
            return count or 0
        except Exception as e:
            logger.error(f"❌ 개입 횟수 조회 실패: {e}")
            return 0

    async def get_recent(self, user_id: str, hours: int = 24, limit: int = 10) -> List[Intervention]:
        try:
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT * FROM interventions
                    WHERE user_id = $1
                      AND created_at >= NOW() - ($2 * INTERVAL '1 hour')
                    ORDER BY created_at DESC
                    LIMIT $3
                    """,
                    user_id, hours, limit,
                )
            return [Intervention.from_db_dict(dict(r)) for r in rows]
        except Exception as e:
            logger.error(f"❌ 최근 개입 조회 실패: {e}")
            return []
