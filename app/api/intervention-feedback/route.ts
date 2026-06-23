import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    await apiRequest<void>("/api/intervention-feedback", {
      method: "POST",
      body: JSON.stringify(body),
    })
    return new Response(null, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "피드백 저장 실패"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
