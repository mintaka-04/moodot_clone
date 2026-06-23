import { NextResponse } from "next/server"

import logger from "@/lib/logger"
import type { UpdateMemoryInput } from "@/lib/services/memory"
import { toPublicMemoryRow, type MemoryDbRow } from "@/lib/server/memory-records"
import { encryptMemoryText } from "@/lib/server/memory-text-crypto"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function parseMemoryId(rawId: string) {
  const id = Number(rawId)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const memoryId = parseMemoryId(rawId)
    if (!memoryId) return jsonError("잘못된 메모리 ID입니다.", 400)

    const row = await apiRequest<MemoryDbRow>(`/api/memories/${memoryId}`)
    return NextResponse.json(toPublicMemoryRow(row), {
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (error) {
    logger.error("[memories/detail] GET error:", error)
    const message = error instanceof Error ? error.message : "메모리를 불러오지 못했습니다."
    const status = message.includes("찾을 수 없습니다") ? 404 : 500
    return jsonError(message, status)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const memoryId = parseMemoryId(rawId)
    if (!memoryId) return jsonError("잘못된 메모리 ID입니다.", 400)

    const input = (await request.json()) as UpdateMemoryInput
    const encryptedText = encryptMemoryText(input.text)

    await apiRequest<void>(`/api/memories/${memoryId}`, {
      method: "PATCH",
      body: JSON.stringify({ ...input, text: null, ...encryptedText }),
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    logger.error("[memories/detail] PATCH error:", error)
    const message = error instanceof Error ? error.message : "메모리 수정에 실패했습니다."
    return jsonError(message, 500)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const memoryId = parseMemoryId(rawId)
    if (!memoryId) return jsonError("잘못된 메모리 ID입니다.", 400)

    await apiRequest<void>(`/api/memories/${memoryId}`, { method: "DELETE" })
    return new Response(null, { status: 204 })
  } catch (error) {
    logger.error("[memories/detail] DELETE error:", error)
    const message = error instanceof Error ? error.message : "메모리 삭제에 실패했습니다."
    return jsonError(message, 500)
  }
}
