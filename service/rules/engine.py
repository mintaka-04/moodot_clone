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

from tools.emotion_tools import (
    get_days_since_last_record,
    get_consecutive_emotions,
    get_recent_emotions,
    get_emotion_statistics
)
from tools.intervention_tools import (
    count_today_interventions,
    get_hours_since_last_intervention
)
from scoring import get_feedback_trend

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
        """
        모든 규칙에서 필요한 컨텍스트를 한 번에 수집합니다.
        
        Args:
            user_id: 사용자 ID
        
        Returns:
            컨텍스트 딕셔너리
        """
        try:
            # 병렬로 데이터 수집 (성능 최적화)
            import asyncio
            
            results = await asyncio.gather(
                count_today_interventions(self.pool, user_id),
                get_hours_since_last_intervention(self.pool, user_id),
                get_days_since_last_record(self.pool, user_id),
                get_consecutive_emotions(self.pool, user_id, "negative"),
                get_consecutive_emotions(self.pool, user_id, "positive"),
                get_recent_emotions(self.pool, user_id, days=7),
                get_emotion_statistics(self.pool, user_id, days=7),
                get_feedback_trend(self.pool, user_id),
                return_exceptions=True  # 예외 발생해도 계속 진행
            )

            # 결과 언팩
            today_count, hours_since, days_since, consecutive_neg, consecutive_pos, recent_emotions, stats, feedback_avg = results

            return {
                'user_id': user_id,
                'today_count': today_count if not isinstance(today_count, Exception) else 0,
                'hours_since_last': hours_since if not isinstance(hours_since, Exception) else None,
                'days_since_last_record': days_since if not isinstance(days_since, Exception) else None,
                'consecutive_negative': consecutive_neg if not isinstance(consecutive_neg, Exception) else 0,
                'consecutive_positive': consecutive_pos if not isinstance(consecutive_pos, Exception) else 0,
                'recent_emotions': recent_emotions if not isinstance(recent_emotions, Exception) else [],
                'emotion_stats': stats if not isinstance(stats, Exception) else {},
                'feedback_avg_score': feedback_avg if not isinstance(feedback_avg, Exception) else None,
            }
        
        except Exception as e:
            logger.error(f"❌ 컨텍스트 수집 실패: {e}", exc_info=True)
            # 최소한의 기본값 반환
            return {
                'user_id': user_id,
                'today_count': 0,
                'hours_since_last': None,
                'days_since_last_record': None,
                'consecutive_negative': 0,
                'recent_emotions': [],
                'emotion_stats': {}
            }
    
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