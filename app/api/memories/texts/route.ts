import { NextResponse } from "next/server"

import logger from "@/lib/logger"
import { buildMemoryTextMap, type MemoryTextDbRow } from "@/lib/server/memory-records"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: number[] }
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

    const { rows } = await apiRequest<{ rows: MemoryTextDbRow[] }>("/api/memories/texts", {
      method: "POST",
      body: JSON.stringify({ ids }),
    })

    return NextResponse.json({ texts: buildMemoryTextMap(rows) })
  } catch (error) {
    logger.error("[memories/texts] POST error:", error)
    const message = error instanceof Error ? error.message : "메모리 본문을 불러오지 못했습니다."
    return jsonError(message, 500)
  }
}
