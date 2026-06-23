import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    const data = await apiRequest<unknown>("/api/collections")
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "컬렉션 목록 조회 실패"
    return jsonError(message, 500)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const data = await apiRequest<{ id: string }>("/api/collections", {
      method: "POST",
      body: JSON.stringify(body),
    })
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "컬렉션 생성 실패"
    return jsonError(message, 500)
  }
}
