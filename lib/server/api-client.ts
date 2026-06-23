import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/server"

const API_BASE = process.env.API_SERVER_URL

async function getAccessToken(): Promise<string | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!API_BASE) {
    throw new Error("API_SERVER_URL 환경변수가 설정되지 않았습니다.")
  }

  const token = await getAccessToken()
  if (!token) {
    throw new Error("인증이 필요합니다.")
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `API 오류 (${res.status})`)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}
