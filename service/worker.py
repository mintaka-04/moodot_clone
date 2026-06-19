# worker.py
import os
import asyncio
import json
import logging
import boto3
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import acreate_client

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


async def create_supabase_client():
    client = await acreate_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_KEY")
    )
    return client


def create_sqs_client():
    return boto3.client('sqs', region_name='ap-northeast-2')


async def update_status(supabase, memory_id: int, status: str) -> None:
    await supabase.table('memories').update({'status': status}).eq('id', memory_id).execute()


async def process_single_message(sqs, queue_url: str, message: dict, pipeline: Pipeline, supabase) -> None:
    receipt_handle = message['ReceiptHandle']
    try:
        payload = json.loads(message['Body'])
        memory_id = payload['memory_id']
        enqueued_at = payload.get('enqueued_at')

        result = await supabase.table('memories') \
            .select('status') \
            .eq('id', memory_id) \
            .single() \
            .execute()
        current_status = result.data.get('status') if result.data else None

        if current_status == 'done':
            logger.info(f"⏭️ 이미 처리됨, skip (memory_id={memory_id})")
            await asyncio.to_thread(
                sqs.delete_message,
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle,
            )
            return

        await update_status(supabase, memory_id, 'processing')

        success = await pipeline.process_emotion(
            memory_id=memory_id,
            user_id=payload['user_id'],
            reason=payload['reason'],
            context=payload.get('context', {}),
        )

        await update_status(supabase, memory_id, 'done' if success else 'failed')

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


async def poll_and_process(sqs, queue_url: str, pipeline: Pipeline, supabase) -> None:
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
                process_single_message(sqs, queue_url, msg, pipeline, supabase)
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

    supabase = await create_supabase_client()
    intervention_repo = InterventionRepository(supabase)

    try:
        llm = LLMFactory.create()
        message_generator = MessageGenerator(llm)
        logger.info(f"✅ MessageGenerator 초기화 완료 ({llm.model_name})")
    except Exception as e:
        message_generator = None
        logger.warning(f"⚠️ LLM 연결 실패 — 템플릿 메시지로 동작합니다: {e}")

    pipeline = Pipeline(supabase, intervention_repo, message_generator)
    sqs = create_sqs_client()

    await poll_and_process(sqs, queue_url, pipeline, supabase)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 AI 워커 정상 종료됨")
