import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import logger from "@/lib/logger"
import type { CreateMemoryInput } from "@/lib/services/memory"
import {
  MEMORY_SELECT_COLUMNS,
  toPublicMemoryRow,
  type MemoryDbRow,
} from "@/lib/server/memory-records"
import { encryptMemoryText } from "@/lib/server/memory-text-crypto"
import { getSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function buildCreatePayload(input: CreateMemoryInput, userId: string) {
  const encryptedText = encryptMemoryText(input.text)

  return {
    ...input,
    user_id: userId,
    text: null,
    ...encryptedText,
  }
}

export async function GET(request: NextRequest) {
  const t0 = Date.now()
  logger.info("[perf][memories/list] start")

  try {
    const t1 = Date.now()
    const supabase = await getSupabaseServerClient()
    logger.info(`[perf][memories/list] supabase client: ${Date.now() - t1}ms`)

    const t2 = Date.now()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    logger.info(`[perf][memories/list] auth.getUser: ${Date.now() - t2}ms`)

    const limitParam = request.nextUrl.searchParams.get("limit")
    const offsetParam = request.nextUrl.searchParams.get("offset")

    if (!user) {
      return jsonError("인증이 필요합니다.", 401)
    }

    let query = supabase
      .from("memories")
      .select(MEMORY_SELECT_COLUMNS)
      .eq("user_id", user.id)
      .order("memory_at", { ascending: false })

    if (limitParam) {
      const limit = Number.parseInt(limitParam, 10)
      const offset = offsetParam ? Math.max(0, Number.parseInt(offsetParam, 10)) : 0
      if (Number.isFinite(limit) && limit > 0) {
        query = query.range(offset, offset + limit - 1)
      }
    }

    const t3 = Date.now()
    const { data, error } = await query
    logger.info(`[perf][memories/list] db query: ${Date.now() - t3}ms`)
    if (error) throw error

    const t4 = Date.now()
    const rows = ((data ?? []) as MemoryDbRow[]).map(toPublicMemoryRow)
    logger.info(`[perf][memories/list] decrypt: ${Date.now() - t4}ms`)

    logger.info(`[perf][memories/list] total: ${Date.now() - t0}ms`)
    return NextResponse.json(rows, {
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (error) {
    logger.error("[memories/list] GET error:", error)
    const message =
      error instanceof Error ? error.message : "메모리를 불러오지 못했습니다."
    return jsonError(message, 500)
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as CreateMemoryInput
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return jsonError("인증이 필요합니다.", 401)
    }

    const { data, error } = await supabase
      .from("memories")
      .insert(buildCreatePayload(input, user.id) as unknown as never)
      .select("id")
      .single()

    if (error) throw error

    return NextResponse.json({ id: (data as { id: number }).id })
  } catch (error) {
    logger.error("[memories/list] POST error:", error)
    const message =
      error instanceof Error ? error.message : "메모리 저장에 실패했습니다."
    return jsonError(message, 500)
  }
}
