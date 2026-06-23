import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"
import { buildMemoryTextMap, toPublicMemoryRow, type MemoryDbRow, type MemoryTextDbRow } from "@/lib/server/memory-records"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const currentId = request.nextUrl.searchParams.get("current_collection_id")
    const path = currentId
      ? `/api/collections/available-memories?current_collection_id=${currentId}`
      : "/api/collections/available-memories"

    const rows = await apiRequest<MemoryDbRow[]>(path)

    // 텍스트 복호화
    const textMap = buildMemoryTextMap(rows as MemoryTextDbRow[])
    const result = rows.map((row) => ({
      ...toPublicMemoryRow(row),
      text: textMap[row.id] ?? null,
    }))

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "사용 가능한 기록 조회 실패"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
