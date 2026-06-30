import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import logger from "@/lib/logger"
import type { CreateMemoryInput } from "@/lib/services/memory"
import { encryptMemoryText } from "@/lib/server/memory-text-crypto"
import { toPublicMemoryRow, type MemoryDbRow } from "@/lib/server/memory-records"
import { apiRequest } from "@/lib/server/api-client"
import { getSupabaseServerClient } from "@/lib/supabase/server"

const sqsClient = new SQSClient({ region: process.env.AWS_REGION })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(request: NextRequest) {
  const t0 = Date.now()
  logger.info("[perf][memories/list] start")

  try {
    const limitParam = request.nextUrl.searchParams.get("limit")
    const offsetParam = request.nextUrl.searchParams.get("offset")

    let path = "/api/memories"
    if (limitParam) {
      const params = new URLSearchParams({ limit: limitParam, offset: offsetParam ?? "0" })
      path += `?${params.toString()}`
    }

    const rows = await apiRequest<MemoryDbRow[]>(path)
    const result = rows.map(toPublicMemoryRow)

    logger.info(`[perf][memories/list] total: ${Date.now() - t0}ms`)
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (error) {
    logger.error("[memories/list] GET error:", error)
    const message = error instanceof Error ? error.message : "메모리를 불러오지 못했습니다."
    return jsonError(message, 500)
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as CreateMemoryInput
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return jsonError("인증이 필요합니다.", 401)
    }

    const encryptedText = encryptMemoryText(input.text)

    const { id: memoryId } = await apiRequest<{ id: number }>("/api/memories", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        text: null,
        status: "pending",
        ...encryptedText,
      }),
    })

    if (process.env.SQS_EVENT_QUEUE_URL) {
      try {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: process.env.SQS_EVENT_QUEUE_URL,
            MessageBody: JSON.stringify({ memory_id: Number(memoryId) }),
          }),
        )
        logger.info(`[SQS] 전송 성공 (memory_id=${memoryId})`)
      } catch (err) {
        logger.error("[SQS] 전송 실패:", err)
      }
    }

    return NextResponse.json({ id: memoryId })
  } catch (error) {
    logger.error("[memories/list] POST error:", error)
    const message = error instanceof Error ? error.message : "메모리 저장에 실패했습니다."
    return jsonError(message, 500)
  }
}
