import { NextResponse } from "next/server"

import logger from "@/lib/logger"
import {
  buildMemoryTextMap,
  type MemoryTextDbRow,
} from "@/lib/server/memory-records"
import { getSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type MemoryTextsRequest = {
  ids?: number[]
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MemoryTextsRequest
    const ids = Array.from(
      new Set(
        (body.ids ?? [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    )

    if (ids.length === 0) {
      return NextResponse.json({ texts: {} })
    }

    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return jsonError("인증이 필요합니다.", 401)
    }

    const { data, error } = await supabase
      .from("memories")
      .select("id,text,text_ciphertext,text_iv,text_key_version")
      .eq("user_id", user.id)
      .in("id", ids)

    if (error) throw error

    return NextResponse.json({
      texts: buildMemoryTextMap((data ?? []) as MemoryTextDbRow[]),
    })
  } catch (error) {
    logger.error("[memories/texts] POST error:", error)
    const message =
      error instanceof Error ? error.message : "메모리 본문을 불러오지 못했습니다."
    return jsonError(message, 500)
  }
}
