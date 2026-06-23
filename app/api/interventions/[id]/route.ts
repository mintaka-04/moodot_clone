import { NextResponse } from "next/server"
import { apiRequest } from "@/lib/server/api-client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    await apiRequest<void>(`/api/interventions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    return new Response(null, { status: 204 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "상태 업데이트 실패"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
