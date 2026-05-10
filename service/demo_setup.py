"""
시연 준비 스크립트
=============================

## 사전 조건
- service/ 디렉토리에 .env.local 파일이 있어야 함 (SUPABASE_URL, SUPABASE_SERVICE_KEY 필요)
- Python 가상환경 활성화 상태여야 함

## user_id 확인 방법
Supabase 대시보드 → Authentication → Users → 본인 계정의 UUID 복사

## 실행 방법
```
cd /Users/goorm/project/moodot_clone/service
source venv/bin/activate
python demo_setup.py <user_id>
```

## 실행하면 무슨 일이 일어나나
1. 오늘 생성된 intervention 전부 삭제 (AI 개입 횟수 초기화)
2. bad 감정 기록 2개 자동 insert
   - 1개: 약 30시간 전 (어제 오후)
   - 1개: 약 6시간 전 (오늘 오전)
3. 앱에서 bad 감정 1개 더 기록하면 → 연속 3개 충족 → AI 메시지 즉시 트리거

## 재촬영 시
스크립트 다시 실행하면 됨 (intervention 초기화 + 기록 재삽입)
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import os
from supabase import create_client

load_dotenv(".env.local")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# 자연스러운 텍스트 (빈 기록처럼 보이지 않게)
SEED_RECORDS = [
    {"hours_ago": 30, "with_whom": "혼자"},   # 어제 오후
    {"hours_ago": 6,  "with_whom": "혼자"},   # 오늘 오전
]


async def setup_demo(user_id: str):
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # bad 감정의 emotion_id 조회
    result = supabase.table("emotion_categories").select("id").eq("emotion", "bad").execute()
    if not result.data:
        print("❌ 'bad' 감정을 emotion_categories에서 찾을 수 없습니다.")
        return
    bad_emotion_id = result.data[0]["id"]
    print(f"✅ bad emotion_id: {bad_emotion_id}")

    # 오늘 intervention 삭제 (frequency limit 초기화)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    del_result = supabase.table("interventions")\
        .delete()\
        .eq("user_id", user_id)\
        .gte("created_at", today_start)\
        .execute()
    print(f"🗑️  오늘 intervention 초기화 완료")

    # bad 감정 기록 2개 insert
    now = datetime.now(timezone.utc)
    for i, record in enumerate(SEED_RECORDS):
        memory_at = (now - timedelta(hours=record["hours_ago"])).isoformat()
        data = {
            "user_id": user_id,
            "emotion_id": bad_emotion_id,
            "memory_at": memory_at,
            "with_whom": record["with_whom"],
            "text": None,
            "text_ciphertext": None,
            "text_iv": None,
            "image_url": None,
            "title": None,
            "location_lat": None,
            "location_lng": None,
            "location_label": None,
            "place_name": None,
            "processed": True,
        }
        supabase.table("memories").insert(data).execute()
        print(f"✅ 기록 {i+1} insert 완료 ({record['hours_ago']}시간 전)")

    print("\n🎬 시연 준비 완료! 앱에서 bad 감정 1개 기록하면 AI 메시지가 트리거됩니다.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python demo_setup.py <user_id>")
        sys.exit(1)
    asyncio.run(setup_demo(sys.argv[1]))
