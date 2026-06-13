# main.py (rule-worker)
import os
import asyncio
import json
import logging
import boto3
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import acreate_client
from typing import Dict, Any

load_dotenv('.env.local')

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from rules import RuleEngine


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


async def process_single_message(sqs, event_queue_url: str, ai_queue_url: str, message: dict, supabase, rule_engine: RuleEngine) -> None:
    receipt_handle = message['ReceiptHandle']
    try:
        payload = json.loads(message['Body'])
        memory_id = payload['memory_id']

        result = await supabase.table('memories') \
            .select('id, user_id, status') \
            .eq('id', memory_id) \
            .single() \
            .execute()

        if not result.data:
            logger.warning(f"⚠️ memory 없음, skip (memory_id={memory_id})")
            await asyncio.to_thread(
                sqs.delete_message,
                QueueUrl=event_queue_url,
                ReceiptHandle=receipt_handle,
            )
            return

        memory = result.data
        user_id = memory['user_id']

        # 1. status = 'processing' (가장 먼저)
        await update_status(supabase, memory_id, 'processing')

        # 2. rule 판단
        decision = await rule_engine.evaluate(user_id)

        if decision.get('should_intervene'):
            # 3a. ai-queue 전송
            await send_to_ai_queue(sqs, ai_queue_url, memory_id, user_id, decision)
        else:
            # 3b. AI 불필요 → filtered
            logger.info(f"⏭️ 개입 불필요, filtered (memory_id={memory_id}, reason={decision.get('reason')})")
            await update_status(supabase, memory_id, 'filtered')

        # 4. event-queue 메시지 삭제 (가장 마지막)
        await asyncio.to_thread(
            sqs.delete_message,
            QueueUrl=event_queue_url,
            ReceiptHandle=receipt_handle,
        )

    except Exception as e:
        logger.error(f"❌ 메시지 처리 실패 (재처리 대기): {e}", exc_info=True)


async def poll_and_process(sqs, event_queue_url: str, ai_queue_url: str, supabase, rule_engine: RuleEngine) -> None:
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
                process_single_message(sqs, event_queue_url, ai_queue_url, msg, supabase, rule_engine)
                for msg in messages
            ])

        except Exception as e:
            logger.error(f"❌ SQS 폴링 오류: {e}", exc_info=True)
            await asyncio.sleep(5)


async def process_fallback(supabase, sqs, event_queue_url: str) -> None:
    """pending/stuck-processing 항목을 event-queue로 재전송"""
    logger.info("🔍 fallback 확인 중...")
    try:
        five_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()

        pending_result = await supabase.table('memories') \
            .select('id') \
            .eq('status', 'pending') \
            .order('created_at') \
            .limit(10) \
            .execute()

        stuck_result = await supabase.table('memories') \
            .select('id') \
            .eq('status', 'processing') \
            .lt('updated_at', five_min_ago) \
            .order('created_at') \
            .limit(10) \
            .execute()

        targets = (pending_result.data or []) + (stuck_result.data or [])

        if not targets:
            logger.info("✅ fallback 대상 없음")
            return

        logger.warning(f"⚠️ fallback 대상 {len(targets)}개 발견, event-queue 재전송...")
        for record in targets:
            await send_to_event_queue(sqs, event_queue_url, record['id'])
        logger.info("✅ fallback 재전송 완료")

    except Exception as e:
        logger.error(f"❌ fallback 처리 실패: {e}", exc_info=True)


async def periodic_fallback(supabase, sqs, event_queue_url: str) -> None:
    while True:
        await asyncio.sleep(5 * 60)
        await process_fallback(supabase, sqs, event_queue_url)


async def initial_fallback(supabase, sqs, event_queue_url: str) -> None:
    await asyncio.sleep(5)
    await process_fallback(supabase, sqs, event_queue_url)


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
    logger.info(f"📡 Supabase URL: {os.getenv('SUPABASE_URL')}")

    event_queue_url = os.getenv("SQS_EVENT_QUEUE_URL")
    ai_queue_url = os.getenv("SQS_QUEUE_URL")

    if not event_queue_url:
        raise ValueError("SQS_EVENT_QUEUE_URL 환경변수가 설정되지 않았습니다.")
    if not ai_queue_url:
        raise ValueError("SQS_QUEUE_URL 환경변수가 설정되지 않았습니다.")

    supabase = await create_supabase_client()
    rule_engine = RuleEngine(supabase)
    sqs = create_sqs_client()

    await asyncio.gather(
        health_server(),
        poll_and_process(sqs, event_queue_url, ai_queue_url, supabase, rule_engine),
        initial_fallback(supabase, sqs, event_queue_url),
        periodic_fallback(supabase, sqs, event_queue_url),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 rule-worker 정상 종료됨")
