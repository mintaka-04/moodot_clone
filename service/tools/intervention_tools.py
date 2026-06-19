# tools/intervention_tools.py
"""
개입 이력 조회 도구들
"""
import logging
from typing import Dict, Optional, Any
from datetime import datetime, timedelta


logger = logging.getLogger(__name__)

# ✅ MVP용 기본 사용자 ID
DEFAULT_USER_ID = "default_user"


async def check_intervention_history(
    pool,
    user_id: str = DEFAULT_USER_ID,
    hours: int = 24
) -> Dict[str, Any]:
    try:
        cutoff_time = datetime.now() - timedelta(hours=hours)
        logger.debug(f"Checking intervention history: user_id={user_id}, hours={hours}")

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, created_at FROM interventions
                WHERE user_id = $1 AND created_at >= $2
                ORDER BY created_at DESC
                """,
                user_id, cutoff_time,
            )

        count = len(rows)
        last_intervention = None
        hours_since_last = None

        if rows:
            last_dt = rows[0]['created_at']
            last_intervention = last_dt.isoformat()
            if last_dt.tzinfo is None:
                from datetime import timezone
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            hours_since_last = (datetime.now(last_dt.tzinfo) - last_dt).total_seconds() / 3600

        history = {
            "count": count,
            "last_intervention": last_intervention,
            "hours_since_last": round(hours_since_last, 2) if hours_since_last else None,
            "has_recent_intervention": count > 0,
        }
        logger.info(f"Intervention history for user {user_id}: {history}")
        return history

    except Exception as e:
        logger.error(f"Error checking intervention history: {e}", exc_info=True)
        return {"count": 0, "last_intervention": None, "hours_since_last": None, "has_recent_intervention": False}


async def count_today_interventions(
    pool,
    user_id: str = DEFAULT_USER_ID
) -> int:
    try:
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        async with pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM interventions WHERE user_id = $1 AND created_at >= $2",
                user_id, today_start,
            )

        logger.info(f"Today's interventions for user {user_id}: {count}")
        return count or 0

    except Exception as e:
        logger.error(f"Error counting today's interventions: {e}", exc_info=True)
        return 0


async def get_last_intervention_time(
    pool,
    user_id: str = DEFAULT_USER_ID
) -> Optional[datetime]:
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT created_at FROM interventions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
                user_id,
            )

        if row:
            last_time = row['created_at']
            if last_time.tzinfo is None:
                from datetime import timezone
                last_time = last_time.replace(tzinfo=timezone.utc)
            logger.debug(f"Last intervention time for user {user_id}: {last_time}")
            return last_time

        logger.debug(f"No previous interventions found for user: {user_id}")
        return None

    except Exception as e:
        logger.error(f"Error getting last intervention time: {e}", exc_info=True)
        return None


async def get_intervention_acceptance_rate(
    pool,
    user_id: str = DEFAULT_USER_ID,
    days: int = 30
) -> Dict[str, Any]:
    try:
        start_date = datetime.now() - timedelta(days=days)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT status FROM interventions
                WHERE user_id = $1 AND created_at >= $2
                  AND status IN ('responded', 'dismissed')
                """,
                user_id, start_date,
            )

        if not rows:
            return {"total": 0, "responded": 0, "dismissed": 0, "acceptance_rate": 0}

        total = len(rows)
        responded = sum(1 for r in rows if r['status'] == 'responded')
        dismissed = sum(1 for r in rows if r['status'] == 'dismissed')

        stats = {
            "total": total,
            "responded": responded,
            "dismissed": dismissed,
            "acceptance_rate": round(responded / total, 2),
        }
        logger.info(f"Acceptance rate for user {user_id} (last {days} days): {stats}")
        return stats

    except Exception as e:
        logger.error(f"Error getting acceptance rate: {e}", exc_info=True)
        return {"total": 0, "responded": 0, "dismissed": 0, "acceptance_rate": 0}


async def should_intervene_based_on_frequency(
    pool,
    user_id: str = DEFAULT_USER_ID,
    max_per_day: int = 2,  # ✅ 설정 가능하도록
    min_hours_between: int = 4
) -> Dict[str, Any]:
    """
    빈도 기반 개입 가능 여부 판단
    
    Args:
        supabase: Supabase 클라이언트
        user_id: 사용자 ID
        max_per_day: 하루 최대 개입 횟수
        min_hours_between: 최소 간격 (시간)
    
    Returns:
        판단 결과
        {
            "should_intervene": False,
            "reason": "daily_limit_reached",
            "today_count": 2,
            "hours_since_last": 1.5
        }
    
    Example:
        >>> result = should_intervene_based_on_frequency(supabase)
        >>> result['should_intervene']
        False
        >>> result['reason']
        'daily_limit_reached'
    """
    try:
        # 1. 오늘 개입 횟수 체크
        today_count = await count_today_interventions(pool, user_id)

        if today_count >= max_per_day:
            return {
                "should_intervene": False,
                "reason": "daily_limit_reached",
                "today_count": today_count,
                "hours_since_last": None
            }

        # 2. 마지막 개입 시간 체크
        last_time = await get_last_intervention_time(pool, user_id)
        
        if last_time:
            now = datetime.now(last_time.tzinfo)
            hours_since = (now - last_time).total_seconds() / 3600
            
            if hours_since < min_hours_between:
                return {
                    "should_intervene": False,
                    "reason": "too_soon",
                    "today_count": today_count,
                    "hours_since_last": round(hours_since, 2)
                }
        
        # 3. 개입 가능
        return {
            "should_intervene": True,
            "reason": "ok",
            "today_count": today_count,
            "hours_since_last": round(hours_since, 2) if last_time else None
        }
        
    except Exception as e:
        logger.error(f"Error checking intervention frequency: {e}", exc_info=True)
        return {
            "should_intervene": False,
            "reason": "error",
            "today_count": 0,
            "hours_since_last": None
        }
    
async def get_hours_since_last_intervention(
    pool,
    user_id: str = DEFAULT_USER_ID
) -> Optional[float]:
    """
    마지막 개입 이후 경과 시간 (시간 단위)
    
    Args:
        supabase: Supabase 클라이언트
        user_id: 사용자 ID
    
    Returns:
        경과 시간 (시간 단위), 개입 없으면 None
    
    Example:
        >>> hours = await get_hours_since_last_intervention(supabase)
        >>> hours
        5.5
    """
    last_time = await get_last_intervention_time(pool, user_id)
    
    if not last_time:
        return None
    
    now = datetime.now(last_time.tzinfo)
    hours = (now - last_time).total_seconds() / 3600
    
    return round(hours, 2)