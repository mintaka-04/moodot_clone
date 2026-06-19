# agents/rules/engine.py
import logging
from typing import Dict, Any, Optional, List

from .base import Rule
from .config import RULES_CONFIG
from .frequency_limit import FrequencyLimitRule
from .no_recent_record import NoRecentRecordRule
from .negative_streak import NegativeStreakRule
from .negative_ratio import NegativeRatioRule
from .positive_streak import PositiveStreakRule

import json as _json
from collections import Counter
from security.memory_crypto import decrypt_memory_text

logger = logging.getLogger(__name__)

class RuleEngine:
    """
    규칙 엔진
    
    등록된 규칙들을 우선순위 순서로 평가합니다.
    
    Example:
        >>> engine = RuleEngine(supabase)
        >>> result = await engine.evaluate(user_id)
        >>> if result:
        >>>     print(f"개입 필요: {result['reason']}")
    """
    
    def __init__(self, pool):
        self.pool = pool
        
        # 규칙 등록 (config.py에서 숫자/on-off 관리, 순서 무관 — priority로 자동 정렬)
        cfg = RULES_CONFIG
        self.rules: List[Rule] = [
            r for r in [
                FrequencyLimitRule(
                    max_per_day=cfg.frequency_limit.max_per_day,
                    min_hours_between=cfg.frequency_limit.min_hours_between,
                ) if cfg.frequency_limit.enabled else None,
                NegativeStreakRule(
                    threshold=cfg.negative_streak.threshold,
                    severity_2_at=cfg.negative_streak.severity_2_at,
                    severity_3_at=cfg.negative_streak.severity_3_at,
                ) if cfg.negative_streak.enabled else None,
                NoRecentRecordRule(
                    threshold_days=cfg.no_recent_record.threshold_days,
                    severity_2_at=cfg.no_recent_record.severity_2_at,
                    severity_3_at=cfg.no_recent_record.severity_3_at,
                ) if cfg.no_recent_record.enabled else None,
                NegativeRatioRule(
                    threshold_ratio=cfg.negative_ratio.threshold_ratio,
                    min_count=cfg.negative_ratio.min_count,
                    severity_2_at=cfg.negative_ratio.severity_2_at,
                    severity_3_at=cfg.negative_ratio.severity_3_at,
                ) if cfg.negative_ratio.enabled else None,
                PositiveStreakRule(
                    threshold=cfg.positive_streak.threshold,
                    severity_2_at=cfg.positive_streak.severity_2_at,
                    severity_3_at=cfg.positive_streak.severity_3_at,
                ) if cfg.positive_streak.enabled else None,
            ] if r is not None
        ]
        
        # 우선순위 순으로 정렬
        self.rules.sort(key=lambda r: r.priority)
        
        logger.info(f"🎯 규칙 엔진 초기화: {len(self.rules)}개 규칙 등록")
        for rule in self.rules:
            logger.debug(f"  - {rule}")
    
    async def evaluate(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        모든 규칙을 평가합니다.
        
        Args:
            user_id: 사용자 ID
        
        Returns:
            {
                "should_intervene": True/False,
                "reason": "no_recent_record",
                "tone": "curious",
                "context": {...}
            }
            또는 None (개입 불필요)
        """
        # 1. 컨텍스트 수집
        context = await self._build_context(user_id)
        
        logger.debug(f"📊 컨텍스트 수집 완료:")
        logger.debug(f"  - 오늘 개입: {context['today_count']}회")
        logger.debug(f"  - 마지막 개입: {context.get('hours_since_last', 'N/A')}시간 전")
        logger.debug(f"  - 마지막 기록: {context.get('days_since_last_record', 'N/A')}일 전")
        logger.debug(f"  - 연속 부정: {context.get('consecutive_negative', 0)}개")
        
        # 2. 규칙 평가
        for rule in self.rules:
            try:
                is_matched = await rule.check(context)
                
                # 부정 규칙 처리
                if hasattr(rule, 'is_negative_rule') and rule.is_negative_rule():
                    if is_matched:
                        logger.info(f"⛔ 개입 차단: {rule.name}")
                        return {
                            "should_intervene": False,
                            "reason": rule.get_reason(),
                            "rule": rule.name,
                            "context": context
                        }
                    else:
                        logger.debug(f"✓ 통과: {rule.name}")
                        continue
                
                # 긍정 규칙 처리
                if is_matched:
                    tone = rule.get_tone()
                    severity = rule.get_severity(context)
                    
                    logger.info(f"✅ 규칙 매칭: {rule.name}")
                    logger.info(f"   우선순위: {rule.priority}")
                    logger.info(f"   톤: {tone.value} ({tone.get_description()})")
                    logger.info(f"   심각도: {severity}/3")
                    
                    return {
                        "should_intervene": True,
                        "reason": rule.get_reason(),
                        "tone": tone.value,
                        "template": rule.get_template(),
                        "rule": rule.name,
                        "severity": severity,
                        "context": rule.get_context_data(context)
                    }
                else:
                    logger.debug(f"⏭️ 불일치: {rule.name}")
            
            except Exception as e:
                logger.error(f"❌ 규칙 평가 실패: {rule.name} - {e}", exc_info=True)
                continue
        
        logger.info("⏭️ 개입 불필요: 모든 규칙 불일치")
        return {
            "should_intervene": False,
            "reason": "no_trigger",
            "context": context
        }
    
    async def _build_context(self, user_id: str) -> Dict[str, Any]:
        _FALLBACK = {
            'user_id': user_id,
            'today_count': 0,
            'hours_since_last': None,
            'days_since_last_record': None,
            'consecutive_negative': 0,
            'consecutive_positive': 0,
            'recent_emotions': [],
            'emotion_stats': {
                'total_count': 0, 'positive_count': 0, 'negative_count': 0,
                'neutral_count': 0, 'most_frequent_emotion': None, 'emotion_distribution': {},
            },
            'feedback_avg_score': None,
        }
        try:
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    WITH recent_memories AS (
                        SELECT
                            m.id, m.emotion_id, m.text, m.text_ciphertext, m.text_iv,
                            m.created_at, m.user_id, ec.emotion,
                            ROW_NUMBER() OVER (ORDER BY m.created_at DESC) AS rn
                        FROM memories m
                        LEFT JOIN emotion_categories ec ON ec.emotion_id = m.emotion_id
                        WHERE m.user_id = $1
                        ORDER BY m.created_at DESC
                        LIMIT 50
                    ),
                    last_intervention AS (
                        SELECT created_at FROM interventions
                        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
                    ),
                    recent_7d AS (
                        SELECT * FROM recent_memories
                        WHERE created_at >= NOW() - INTERVAL '7 days'
                    ),
                    feedback_recent AS (
                        SELECT feedback_score FROM interventions
                        WHERE user_id = $1 AND status IN ('shown', 'interacted')
                        ORDER BY created_at DESC LIMIT 5
                    )
                    SELECT
                        (SELECT COUNT(*)::int FROM interventions
                         WHERE user_id = $1
                           AND created_at >= date_trunc('day', NOW())
                        ) AS today_count,

                        EXTRACT(EPOCH FROM (NOW() - (SELECT created_at FROM last_intervention))) / 3600
                            AS hours_since_last,

                        FLOOR(EXTRACT(EPOCH FROM (NOW() - (SELECT created_at FROM recent_memories WHERE rn = 1))) / 86400)::int
                            AS days_since_last_record,

                        COALESCE(
                            (SELECT MIN(rn)::int - 1 FROM recent_memories
                             WHERE rn <= 10 AND (emotion IS NULL OR emotion NOT IN ('bad', 'sad'))),
                            (SELECT COUNT(*)::int FROM recent_memories WHERE rn <= 10)
                        ) AS consecutive_negative,

                        COALESCE(
                            (SELECT MIN(rn)::int - 1 FROM recent_memories
                             WHERE rn <= 10 AND (emotion IS NULL OR emotion NOT IN ('good'))),
                            (SELECT COUNT(*)::int FROM recent_memories WHERE rn <= 10)
                        ) AS consecutive_positive,

                        (SELECT json_agg(
                            json_build_object(
                                'id', id, 'emotion_id', emotion_id,
                                'emotion_name', COALESCE(emotion, 'Unknown'),
                                'text', text, 'text_ciphertext', text_ciphertext,
                                'text_iv', text_iv,
                                'created_at', created_at::text,
                                'user_id', user_id::text
                            ) ORDER BY created_at DESC
                         ) FROM recent_7d) AS recent_emotions_json,

                        (SELECT COUNT(*)::int FROM recent_7d) AS emotion_total,
                        (SELECT COUNT(*)::int FILTER (WHERE emotion = 'good') FROM recent_7d) AS emotion_positive,
                        (SELECT COUNT(*)::int FILTER (WHERE emotion IN ('bad', 'sad')) FROM recent_7d) AS emotion_negative,
                        (SELECT COUNT(*)::int FILTER (WHERE emotion = 'calm') FROM recent_7d) AS emotion_neutral,

                        CASE WHEN (SELECT COUNT(*) FROM feedback_recent) = 0 THEN NULL
                             ELSE (SELECT AVG(COALESCE(feedback_score, 0)) FROM feedback_recent)
                        END AS feedback_avg_score
                    """,
                    user_id,
                )

            raw_emotions = _json.loads(row['recent_emotions_json'] or 'null') or []
            recent_emotions = []
            for item in raw_emotions:
                try:
                    plain_text = decrypt_memory_text(
                        item.get('text_ciphertext'),
                        item.get('text_iv'),
                        item.get('text'),
                    )
                except Exception as e:
                    logger.warning(f"텍스트 복호화 실패: {e}")
                    plain_text = item.get('text', '')

                recent_emotions.append({
                    'id': item['id'],
                    'emotion_id': item['emotion_id'],
                    'emotion_name': item.get('emotion_name', 'Unknown'),
                    'text': plain_text or '',
                    'created_at': item.get('created_at'),
                    'user_id': item.get('user_id'),
                })

            emotion_counts = Counter(e['emotion_name'] for e in recent_emotions)

            return {
                'user_id': user_id,
                'today_count': row['today_count'] or 0,
                'hours_since_last': round(float(row['hours_since_last']), 2) if row['hours_since_last'] is not None else None,
                'days_since_last_record': row['days_since_last_record'],
                'consecutive_negative': row['consecutive_negative'] or 0,
                'consecutive_positive': row['consecutive_positive'] or 0,
                'recent_emotions': recent_emotions,
                'emotion_stats': {
                    'total_count': row['emotion_total'] or 0,
                    'positive_count': row['emotion_positive'] or 0,
                    'negative_count': row['emotion_negative'] or 0,
                    'neutral_count': row['emotion_neutral'] or 0,
                    'most_frequent_emotion': emotion_counts.most_common(1)[0][0] if emotion_counts else None,
                    'emotion_distribution': dict(emotion_counts),
                },
                'feedback_avg_score': float(row['feedback_avg_score']) if row['feedback_avg_score'] is not None else None,
            }

        except Exception as e:
            logger.error(f"❌ 컨텍스트 수집 실패: {e}", exc_info=True)
            return _FALLBACK
    
    def add_rule(self, rule: Rule) -> None:
        """
        새 규칙을 추가합니다.
        
        Args:
            rule: Rule 인스턴스
        """
        self.rules.append(rule)
        self.rules.sort(key=lambda r: r.priority)
        logger.info(f"➕ 규칙 추가: {rule}")
    
    def remove_rule(self, rule_name: str) -> bool:
        """
        규칙을 제거합니다.
        
        Args:
            rule_name: 규칙 이름
        
        Returns:
            제거 성공 여부
        """
        for i, rule in enumerate(self.rules):
            if rule.name == rule_name:
                removed = self.rules.pop(i)
                logger.info(f"➖ 규칙 제거: {removed}")
                return True
        return False