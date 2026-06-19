# tools/emotion_tools.py
"""
감정 데이터 조회 도구들
"""
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
from security.memory_crypto import decrypt_memory_text


logger = logging.getLogger(__name__)

# ✅ MVP용 기본 사용자 ID
DEFAULT_USER_ID = "default_user"

# ✅ 현재 지원하는 4가지 감정 분류
EMOTION_CATEGORIES = {
    'negative': ['bad', 'sad'],
    'positive': ['good'],
    'neutral': ['calm']
}


async def get_recent_emotions(
    pool,
    user_id: str = DEFAULT_USER_ID,
    days: int = 7,
    limit: int = 50
) -> List[Dict[str, Any]]:
    try:
        start_date = datetime.now() - timedelta(days=days)
        logger.debug(f"Querying emotions: user_id={user_id}, days={days}")

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT m.id, m.emotion_id, m.text, m.text_ciphertext, m.text_iv,
                       m.created_at, m.user_id, ec.emotion
                FROM memories m
                LEFT JOIN emotion_categories ec ON ec.id = m.emotion_id
                WHERE m.user_id = $1 AND m.created_at >= $2
                ORDER BY m.created_at DESC
                LIMIT $3
                """,
                user_id, start_date, limit,
            )

        emotions = []
        for row in rows:
            try:
                plain_text = decrypt_memory_text(
                    row['text_ciphertext'],
                    row['text_iv'],
                    row['text'],
                )
            except Exception as e:
                logger.warning(f"텍스트 복호화 실패 (id={row['id']}): {e}")
                plain_text = row['text'] or ''

            emotions.append({
                'id': row['id'],
                'emotion_id': row['emotion_id'],
                'emotion_name': row['emotion'] or 'Unknown',
                'text': plain_text or '',
                'created_at': row['created_at'],
                'user_id': row['user_id'],
            })

        logger.debug(f"Found {len(emotions)} emotions for user: {user_id}")
        return emotions

    except Exception as e:
        logger.error(f"Error getting recent emotions: {e}", exc_info=True)
        return []


async def get_days_since_last_record(
    pool,
    user_id: str = DEFAULT_USER_ID
) -> Optional[int]:
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT created_at FROM memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
                user_id,
            )

        if row:
            last_date = row['created_at']
            if last_date.tzinfo is None:
                from datetime import timezone
                last_date = last_date.replace(tzinfo=timezone.utc)
            days_since = (datetime.now(last_date.tzinfo) - last_date).days
            logger.debug(f"Days since last record: {days_since} (user: {user_id})")
            return days_since

        logger.debug(f"No records found for user: {user_id}")
        return None

    except Exception as e:
        logger.error(f"Error getting days since last record: {e}")
        return None


async def get_consecutive_emotions(
    pool,
    user_id: str = DEFAULT_USER_ID,
    emotion_type: str = "negative",
    limit: int = 10
) -> int:
    try:
        target_emotions = EMOTION_CATEGORIES.get(emotion_type, [])
        if not target_emotions:
            logger.warning(f"Unknown emotion_type: {emotion_type}")
            return 0

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT ec.emotion
                FROM memories m
                LEFT JOIN emotion_categories ec ON ec.id = m.emotion_id
                WHERE m.user_id = $1
                ORDER BY m.created_at DESC
                LIMIT $2
                """,
                user_id, limit,
            )

        consecutive_count = 0
        for row in rows:
            emotion_name = (row['emotion'] or '').lower()
            if emotion_name in target_emotions:
                consecutive_count += 1
            else:
                break

        logger.info(f"Consecutive {emotion_type} emotions: {consecutive_count} (user: {user_id})")
        return consecutive_count

    except Exception as e:
        logger.error(f"Error getting consecutive emotions: {e}", exc_info=True)
        return 0


async def get_emotion_statistics(
    pool,
    user_id: str = DEFAULT_USER_ID,
    days: int = 7
) -> Dict[str, Any]:
    """
    감정 통계 정보
    
    Args:
        supabase: Supabase 클라이언트
        user_id: 사용자 ID
        days: 통계 기간 (일)
    
    Returns:
        통계 딕셔너리
    """
    try:
        emotions = await get_recent_emotions(pool, user_id, days=days)
        
        if not emotions:
            return {
                "total_count": 0,
                "positive_count": 0,
                "negative_count": 0,
                "neutral_count": 0,
                "most_frequent_emotion": None,
                "emotion_distribution": {}
            }
        
        total = len(emotions)
        positive = sum(1 for e in emotions if e['emotion_name'].lower() == 'good')
        negative = sum(1 for e in emotions if e['emotion_name'].lower() in ['bad', 'sad'])
        neutral = sum(1 for e in emotions if e['emotion_name'].lower() == 'calm')
        
        from collections import Counter
        emotion_counts = Counter(e['emotion_name'] for e in emotions)
        most_frequent = emotion_counts.most_common(1)[0][0] if emotion_counts else None
        
        stats = {
            "total_count": total,
            "positive_count": positive,
            "negative_count": negative,
            "neutral_count": neutral,
            "most_frequent_emotion": most_frequent,
            "emotion_distribution": dict(emotion_counts)
        }
        
        logger.info(f"Emotion statistics for user {user_id}: {stats}")
        return stats
        
    except Exception as e:
        logger.error(f"Error getting emotion statistics: {e}", exc_info=True)
        return {
            "total_count": 0,
            "positive_count": 0,
            "negative_count": 0,
            "neutral_count": 0,
            "most_frequent_emotion": None,
            "emotion_distribution": {}
        }


async def get_emotion_by_id(
    pool,
    emotion_id: int
) -> Optional[Dict[str, Any]]:
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM emotion_categories WHERE id = $1",
                emotion_id,
            )
        return dict(row) if row else None

    except Exception as e:
        logger.error(f"Error getting emotion by id: {e}")
        return None