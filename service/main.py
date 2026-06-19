# main.py (rule-worker)
import os
import asyncio
import json
import logging
import boto3
import asyncpg
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from typing import Dict, Any

load_dotenv('.env.local')

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from rules import RuleEngine


async def create_db_pool():
    return await asyncpg.create_pool(
        dsn=os.getenv("DATABASE_URL"),
        min_size=1,
        max_size=4,
        ssl='require',
    )


def create_sqs_client():
    return boto3.client('sqs', region_name='ap-northeast-2')


async def update_status(pool, memory_id: int, status: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE memories SET status = $1, updated_at = NOW() WHERE id = $2",
            status, memory_id,
        )


async def send_to_ai_queue(sqs, queue_url: str, memory_id: int, user_id: str, decision: Dict[str, Any]) -> None:
    payload = {
        'memory_id': memory_id,
        'user_id': user_id,
        'reason': decision['reason'],
        'context': decision.get('context', {}),
        'enqueued_at': datetime.now(timezone.utc).isoformat(),
    }
    await asyncio.to_thread(
        sqs.send_message,
        QueueUrl=queue_url,
        MessageBody=json.dumps(payload),
    )
    logger.info(f"📤 ai-queue 전송 완료 (memory_id={memory_id}, reason={decision['reason']})")


async def send_to_event_queue(sqs, queue_url: str, memory_id: int) -> None:
    await asyncio.to_thread(
        sqs.send_message,
        QueueUrl=queue_url,
        MessageBody=json.dumps({'memory_id': memory_id}),
    )
    logger.info(f"📤 event-queue 재전송 (memory_id={memory_id})")


async def process_single_message(sqs, event_queue_url: str, ai_queue_url: str, message: dict, pool, rule_engine: RuleEngine) -> None:
    receipt_handle = message['ReceiptHandle']
    try:
        payload = json.loads(message['Body'])
        memory_id = payload['memory_id']

        async with pool.acquire() as conn:
            memory = await conn.fetchrow(
                "SELECT id, user_id, status FROM memories WHERE id = $1",
                memory_id,
            )

        if not memory:
            logger.warning(f"⚠️ memory 없음, skip (memory_id={memory_id})")
            await asyncio.to_thread(
                sqs.delete_message,
                QueueUrl=event_queue_url,
                ReceiptHandle=receipt_handle,
            )
            return

        user_id = memory['user_id']

        # 1. status = 'processing' (가장 먼저)
        await update_status(pool, memory_id, 'processing')

        # 2. rule 판단
        decision = await rule_engine.evaluate(user_id)

        if decision.get('should_intervene'):
            # 3a. ai-queue 전송
            await send_to_ai_queue(sqs, ai_queue_url, memory_id, user_id, decision)
        else:
            # 3b. AI 불필요 → filtered
            logger.info(f"⏭️ 개입 불필요, filtered (memory_id={memory_id}, reason={decision.get('reason')})")
            await update_status(pool, memory_id, 'filtered')

        # 4. event-queue 메시지 삭제 (가장 마지막)
        await asyncio.to_thread(
            sqs.delete_message,
            QueueUrl=event_queue_url,
            ReceiptHandle=receipt_handle,
        )

    except Exception as e:
        logger.error(f"❌ 메시지 처리 실패 (재처리 대기): {e}", exc_info=True)


async def poll_and_process(sqs, event_queue_url: str, ai_queue_url: str, pool, rule_engine: RuleEngine) -> None:
    logger.info("🔄 event-queue 폴링 시작...")
    while True:
        try:
            response = await asyncio.to_thread(
                sqs.receive_message,
                QueueUrl=event_queue_url,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20,
            )
            messages = response.get('Messages', [])
            if not messages:
                continue

            await asyncio.gather(*[
                process_single_message(sqs, event_queue_url, ai_queue_url, msg, pool, rule_engine)
                for msg in messages
            ])

        except Exception as e:
            logger.error(f"❌ SQS 폴링 오류: {e}", exc_info=True)
            await asyncio.sleep(5)


async def process_fallback(pool, sqs, event_queue_url: str) -> None:
    """pending/stuck-processing 항목을 event-queue로 재전송"""
    logger.info("🔍 fallback 확인 중...")
    try:
        five_min_ago = datetime.now(timezone.utc) - timedelta(minutes=5)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id FROM memories
                WHERE status = 'pending'
                   OR (status = 'processing' AND updated_at < $1)
                ORDER BY created_at
                LIMIT 20
                """,
                five_min_ago,
            )

        targets = [dict(r) for r in rows]

        if not targets:
            logger.info("✅ fallback 대상 없음")
            return

        logger.warning(f"⚠️ fallback 대상 {len(targets)}개 발견, event-queue 재전송...")
        for record in targets:
            await send_to_event_queue(sqs, event_queue_url, record['id'])
        logger.info("✅ fallback 재전송 완료")

    except Exception as e:
        logger.error(f"❌ fallback 처리 실패: {e}", exc_info=True)


async def periodic_fallback(pool, sqs, event_queue_url: str) -> None:
    while True:
        await asyncio.sleep(5 * 60)
        await process_fallback(pool, sqs, event_queue_url)


async def initial_fallback(pool, sqs, event_queue_url: str) -> None:
    await asyncio.sleep(5)
    await process_fallback(pool, sqs, event_queue_url)


async def health_server() -> None:
    port = int(os.getenv("PORT", 8000))

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            await asyncio.wait_for(reader.read(1024), timeout=5)
            body = b'{"status":"ok"}'
            writer.write(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: application/json\r\n"
                b"Content-Length: " + str(len(body)).encode() + b"\r\n"
                b"\r\n" + body
            )
            await writer.drain()
        except Exception:
            pass
        finally:
            writer.close()

    server = await asyncio.start_server(handle, "0.0.0.0", port)
    logger.info(f"🌐 Health server 시작: port={port}")
    async with server:
        await server.serve_forever()


async def main() -> None:
    logger.info("🚀 rule-worker 시작...")

    event_queue_url = os.getenv("SQS_EVENT_QUEUE_URL")
    ai_queue_url = os.getenv("SQS_QUEUE_URL")

    if not event_queue_url:
        raise ValueError("SQS_EVENT_QUEUE_URL 환경변수가 설정되지 않았습니다.")
    if not ai_queue_url:
        raise ValueError("SQS_QUEUE_URL 환경변수가 설정되지 않았습니다.")
    if not os.getenv("DATABASE_URL"):
        raise ValueError("DATABASE_URL 환경변수가 설정되지 않았습니다.")

    import socket
    db_host = os.getenv("DATABASE_URL", "").split("@")[-1].split(":")[0]
    try:
        ip = socket.gethostbyname(db_host)
        logger.info(f"🔍 DB host={db_host} → {ip}")
    except Exception as e:
        logger.error(f"🔍 DB host DNS 실패: {e}")

    pool = await create_db_pool()
    logger.info("✅ DB pool 생성 완료")

    rule_engine = RuleEngine(pool)
    sqs = create_sqs_client()

    await asyncio.gather(
        health_server(),
        poll_and_process(sqs, event_queue_url, ai_queue_url, pool, rule_engine),
        initial_fallback(pool, sqs, event_queue_url),
        periodic_fallback(pool, sqs, event_queue_url),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 rule-worker 정상 종료됨")
