import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await apiRequest<unknown>("/api/interventions/pending")
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "개입 조회 실패"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
