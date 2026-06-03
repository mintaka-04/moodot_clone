# main.py
import os
import asyncio
import json
import logging
import boto3
from dotenv import load_dotenv
from supabase import acreate_client
from typing import Dict, Any
from datetime import datetime, timedelta

load_dotenv('.env.local')

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def create_supabase_client():
    client = await acreate_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_KEY")
    )
    client.realtime.timeout = 30
    return client


def create_sqs_client():
    return boto3.client('sqs', region_name='ap-northeast-2')


async def send_to_sqs(sqs, queue_url: str, payload: Dict[str, Any]) -> None:
    try:
        payload['enqueued_at'] = datetime.utcnow().isoformat()
        await asyncio.to_thread(
            sqs.send_message,
            QueueUrl=queue_url,
            MessageBody=json.dumps(payload)
        )
        record_id = payload.get('record', {}).get('id', '?')
        logger.info(f"📤 SQS 전송 완료: id={record_id}")
    except Exception as e:
        logger.error(f"❌ SQS 전송 실패: {e}", exc_info=True)


async def process_missed_emotions(supabase, sqs, queue_url: str) -> None:
    logger.info("🔍 놓친 감정 확인 중...")
    try:
        one_minute_ago = (datetime.now() - timedelta(minutes=1)).isoformat()
        result = await supabase.table('memories') \
            .select('*') \
            .eq('processed', False) \
            .lt('created_at', one_minute_ago) \
            .order('created_at') \
            .limit(10) \
            .execute()

        missed = result.data if hasattr(result, 'data') else []
        if not missed:
            logger.info("✅ 놓친 감정 없음")
            return

        logger.warning(f"⚠️ 놓친 감정 {len(missed)}개 발견! SQS 재전송...")
        for record in missed:
            await send_to_sqs(sqs, queue_url, {'record': record})
        logger.info("✅ 놓친 감정 SQS 재전송 완료")

    except Exception as e:
        logger.error(f"❌ 놓친 감정 처리 실패: {e}", exc_info=True)


async def periodic_check(supabase, sqs, queue_url: str) -> None:
    while True:
        await asyncio.sleep(5 * 60)
        await process_missed_emotions(supabase, sqs, queue_url)


async def initial_check(supabase, sqs, queue_url: str) -> None:
    await asyncio.sleep(5)
    await process_missed_emotions(supabase, sqs, queue_url)


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


async def subscribe_channels(supabase, sqs, queue_url: str) -> None:
    emotion_channel = supabase.channel('emotion_events')
    emotion_channel.on_postgres_changes(
        event='INSERT',
        schema='public',
        table='memories',
        callback=lambda payload: asyncio.get_running_loop().create_task(
            send_to_sqs(sqs, queue_url, payload)
        )
    )
    await emotion_channel.subscribe()
    logger.info(f"📡 emotion_channel state: {emotion_channel.state}")
    logger.info("✅ Realtime 구독 시작!")


async def realtime_watchdog(supabase, sqs, queue_url: str) -> None:
    await asyncio.sleep(60)
    while True:
        await asyncio.sleep(60)
        if not supabase.realtime.is_connected:
            logger.warning("⚠️ Realtime 연결 끊김 감지. 재연결 시도...")
            for attempt in range(3):
                try:
                    await supabase.realtime.remove_all_channels()
                    await subscribe_channels(supabase, sqs, queue_url)
                    logger.info("✅ Realtime 재연결 성공")
                    break
                except Exception as e:
                    logger.error(f"재연결 실패 (시도 {attempt + 1}/3): {e}")
                    if attempt < 2:
                        await asyncio.sleep(5)
            else:
                logger.error("❌ Realtime 재연결 최종 실패. 워커를 재시작하세요.")


async def main() -> None:
    logger.info("🚀 수신 프로세스 시작...")
    logger.info(f"📡 Supabase URL: {os.getenv('SUPABASE_URL')}")

    queue_url = os.getenv("SQS_QUEUE_URL")
    if not queue_url:
        raise ValueError("SQS_QUEUE_URL 환경변수가 설정되지 않았습니다.")

    supabase = await create_supabase_client()
    sqs = create_sqs_client()

    for attempt in range(3):
        try:
            await subscribe_channels(supabase, sqs, queue_url)
            logger.info("👂 이벤트 대기 중... (Ctrl+C로 종료)")
            break
        except Exception as e:
            logger.error(f"구독 실패 (시도 {attempt + 1}/3): {e}")
            if attempt == 2:
                raise
            await asyncio.sleep(5)

    await asyncio.gather(
        health_server(),
        initial_check(supabase, sqs, queue_url),
        periodic_check(supabase, sqs, queue_url),
        realtime_watchdog(supabase, sqs, queue_url),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 수신 프로세스 정상 종료됨")
