import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    await apiRequest<void>("/api/auth/merge", {
      method: "POST",
      body: JSON.stringify(body),
    })
    return NextResponse.json({ message: "병합 완료" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "병합 실패"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
