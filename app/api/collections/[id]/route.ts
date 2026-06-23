import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"
import { toPublicMemoryRow, type MemoryDbRow } from "@/lib/server/memory-records"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const data = await apiRequest<{ memories: MemoryDbRow[]; [key: string]: unknown }>(
      `/api/collections/${id}`,
    )

    // memory 텍스트 복호화 (암호화된 필드를 Next.js 서버에서 처리)
    const memories = data.memories.map((row) => ({
      ...toPublicMemoryRow(row),
      position: (row as MemoryDbRow & { position: number }).position,
    }))

    return NextResponse.json({ ...data, memories })
  } catch (error) {
    const message = error instanceof Error ? error.message : "컬렉션 조회 실패"
    const status = message.includes("찾을 수 없습니다") ? 404 : 500
    return jsonError(message, status)
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    await apiRequest<void>(`/api/collections/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    })
    return new Response(null, { status: 204 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "컬렉션 수정 실패"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await apiRequest<void>(`/api/collections/${id}`, { method: "DELETE" })
    return new Response(null, { status: 204 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "컬렉션 삭제 실패"
    return jsonError(message, 500)
  }
}
