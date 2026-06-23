import { getSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await getSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const apiBase = process.env.API_SERVER_URL
  if (!apiBase) {
    return new Response("API_SERVER_URL not configured", { status: 500 })
  }

  const upstream = await fetch(`${apiBase}/api/events`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: "text/event-stream",
    },
  })

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
