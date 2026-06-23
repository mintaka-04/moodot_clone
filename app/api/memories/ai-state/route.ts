import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await apiRequest<{ thinking: boolean }>("/api/memories/ai-state")
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ thinking: false })
  }
}
