# worker.py
import os
import asyncio
import json
import logging
import boto3
from dotenv import load_dotenv
from supabase import acreate_client

load_dotenv('.env.local')

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from models import InterventionRepository
from rules import RuleEngine
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


async def poll_and_process(sqs, queue_url: str, pipeline: Pipeline) -> None:
    logger.info("🔄 SQS 폴링 시작...")
    while True:
        try:
            response = await asyncio.to_thread(
                sqs.receive_message,
                QueueUrl=queue_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=20,
            )
            messages = response.get('Messages', [])
            if not messages:
                continue

            message = messages[0]
            receipt_handle = message['ReceiptHandle']

            try:
                payload = json.loads(message['Body'])
                await pipeline.process_emotion(payload)

                await asyncio.to_thread(
                    sqs.delete_message,
                    QueueUrl=queue_url,
                    ReceiptHandle=receipt_handle
                )
            except Exception as e:
                logger.error(f"❌ 메시지 처리 실패 (재처리 대기): {e}", exc_info=True)

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
    rule_engine = RuleEngine(supabase)

    try:
        llm = LLMFactory.create()
        message_generator = MessageGenerator(llm)
        logger.info(f"✅ MessageGenerator 초기화 완료 ({llm.model_name})")
    except Exception as e:
        message_generator = None
        logger.warning(f"⚠️ LLM 연결 실패 — 템플릿 메시지로 동작합니다: {e}")

    pipeline = Pipeline(supabase, intervention_repo, rule_engine, message_generator)
    sqs = create_sqs_client()

    await poll_and_process(sqs, queue_url, pipeline)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 AI 워커 정상 종료됨")
