from dataclasses import dataclass, field


@dataclass
class FrequencyLimitConfig:
    enabled: bool = False
    max_per_day: int = 2        # 하루 최대 개입 횟수
    min_hours_between: int = 4  # 개입 최소 간격 (시간)


@dataclass
class NegativeStreakConfig:
    enabled: bool = True
    threshold: int = 3     # 개입 발동 최소 연속 횟수
    severity_2_at: int = 4  # 이상이면 severity 2 (지지 톤)
    severity_3_at: int = 5  # 이상이면 severity 3 (걱정 톤)


@dataclass
class NoRecentRecordConfig:
    enabled: bool = True
    threshold_days: int = 3  # 개입 발동 최소 미기록 일수
    severity_2_at: int = 5   # 이상이면 severity 2 (친근 톤)
    severity_3_at: int = 7   # 이상이면 severity 3 (걱정 톤)


@dataclass
class NegativeRatioConfig:
    enabled: bool = True
    threshold_ratio: float = 0.7  # 개입 발동 최소 부정 비율
    min_count: int = 5            # 비율 계산에 필요한 최소 기록 수
    severity_2_at: float = 0.8   # 이상이면 severity 2 (위로 톤)
    severity_3_at: float = 0.9   # 이상이면 severity 3 (걱정 톤)


@dataclass
class PositiveStreakConfig:
    enabled: bool = True
    threshold: int = 3     # 개입 발동 최소 연속 횟수
    severity_2_at: int = 4  # 이상이면 severity 2 (밝은 톤)
    severity_3_at: int = 5  # 이상이면 severity 3 (축하 톤)


@dataclass
class RulesConfig:
    frequency_limit: FrequencyLimitConfig = field(default_factory=FrequencyLimitConfig)
    negative_streak: NegativeStreakConfig = field(default_factory=NegativeStreakConfig)
    no_recent_record: NoRecentRecordConfig = field(default_factory=NoRecentRecordConfig)
    negative_ratio: NegativeRatioConfig = field(default_factory=NegativeRatioConfig)
    positive_streak: PositiveStreakConfig = field(default_factory=PositiveStreakConfig)


# 여기서 숫자와 on/off를 한 번에 관리합니다
RULES_CONFIG = RulesConfig()
