import os
import asyncio
import json
import logging
import boto3
import asyncpg
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv('.env.local')

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from models import InterventionRepository
from config import LLMFactory
from generators import MessageGenerator
from agents import Pipeline


async def create_db_pool():
    return await asyncpg.create_pool(
        dsn=os.getenv("DATABASE_URL"),
        min_size=1,
        max_size=4,
        ssl='require',
        statement_cache_size=0,
    )


def create_sqs_client():
    return boto3.client('sqs', region_name='ap-northeast-2')


async def get_memory_status(pool, memory_id: int) -> str | None:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status FROM memories WHERE id = $1",
            memory_id,
        )
    return row['status'] if row else None



async def update_status(pool, memory_id: int, status: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE memories SET status = $1, updated_at = NOW() WHERE id = $2",
            status, memory_id,
        )


async def process_single_message(sqs, queue_url: str, message: dict, pipeline: Pipeline, pool, semaphore: asyncio.Semaphore) -> None:
    receipt_handle = message['ReceiptHandle']
    try:
        payload = json.loads(message['Body'])
        memory_id = int(payload['memory_id'])
        enqueued_at = payload.get('enqueued_at')

        current_status = await get_memory_status(pool, memory_id)

        if current_status == 'done':
            logger.info(f"⏭️ 이미 처리됨, skip (memory_id={memory_id})")
            await asyncio.to_thread(
                sqs.delete_message,
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle,
            )
            return

        await update_status(pool, memory_id, 'processing')

        async with semaphore:
            result = await pipeline.process_emotion(
                memory_id=memory_id,
                user_id=payload['user_id'],
                reason=payload['reason'],
                context=payload.get('context', {}),
            )

        await update_status(pool, memory_id, 'done' if result is not False else 'failed')

        if enqueued_at:
            elapsed = (
                datetime.now(timezone.utc)
                - datetime.fromisoformat(enqueued_at).replace(tzinfo=timezone.utc)
            ).total_seconds()
            logger.info(f"⏱ 처리 지연: {elapsed:.1f}s (memory_id={memory_id})")

        await asyncio.to_thread(
            sqs.delete_message,
            QueueUrl=queue_url,
            ReceiptHandle=receipt_handle,
        )

    except Exception as e:
        logger.error(f"❌ 메시지 처리 실패 (재처리 대기): {e}", exc_info=True)


async def poll_and_process(sqs, queue_url: str, pipeline: Pipeline, pool, semaphore: asyncio.Semaphore) -> None:
    logger.info("🔄 SQS 폴링 시작...")
    while True:
        try:
            response = await asyncio.to_thread(
                sqs.receive_message,
                QueueUrl=queue_url,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20,
            )
            messages = response.get('Messages', [])
            if not messages:
                continue

            await asyncio.gather(*[
                process_single_message(sqs, queue_url, msg, pipeline, pool, semaphore)
                for msg in messages
            ])

        except Exception as e:
            logger.error(f"❌ SQS 폴링 오류: {e}", exc_info=True)
            await asyncio.sleep(5)


async def main() -> None:
    logger.info("🚀 AI 워커 시작...")

    queue_url = os.getenv("SQS_QUEUE_URL")
    if not queue_url:
        raise ValueError("SQS_QUEUE_URL 환경변수가 설정되지 않았습니다.")
    if not os.getenv("DATABASE_URL"):
        raise ValueError("DATABASE_URL 환경변수가 설정되지 않았습니다.")

    pool = await create_db_pool()
    logger.info("✅ DB pool 생성 완료")

    intervention_repo = InterventionRepository(pool)

    try:
        llm = LLMFactory.create()
        message_generator = MessageGenerator(llm)
        logger.info(f"✅ MessageGenerator 초기화 완료 ({llm.model_name})")
    except Exception as e:
        message_generator = None
        logger.warning(f"⚠️ LLM 연결 실패 — 템플릿 메시지로 동작합니다: {e}")

    pipeline = Pipeline(pool, intervention_repo, message_generator)
    sqs = create_sqs_client()

    concurrency = int(os.getenv("WORKER_CONCURRENCY", "3"))
    semaphore = asyncio.Semaphore(concurrency)
    logger.info(f"🔒 LLM 동시 호출 제한: {concurrency}")

    await poll_and_process(sqs, queue_url, pipeline, pool, semaphore)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 AI 워커 정상 종료됨")
