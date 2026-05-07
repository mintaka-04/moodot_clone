import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import logger from "@/lib/logger"

// ---------- Types ----------

export type MemoryRow = {
  id: number
  title: string | null
  text: string | null
  image_url: string | null
  emotion_id: number | null
  with_whom: string | null
  memory_at: string | null
  place_name: string | null
  location_label: string | null
  location_lat: number | null
  location_lng: number | null
}

export type CreateMemoryInput = {
  title: string | null
  text: string | null
  image_url: string | null
  emotion_id: number
  with_whom: string
  memory_at: string
  location_lat: number | null
  location_lng: number | null
  location_label: string | null
  place_name: string | null
}

export type UpdateMemoryInput = {
  title: string | null
  text: string | null
  image_url: string | null
  emotion_id: number
  with_whom: string
  memory_at: string
  location_lat: number | null
  location_lng: number | null
  location_label: string | null
  place_name: string | null
}

type ApiErrorResponse = {
  error?: string
}

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as ApiErrorResponse
    if (typeof data.error === "string" && data.error.trim() !== "") {
      return data.error
    }
  } catch {
    // 응답 본문이 JSON이 아니어도 기존 흐름 유지
  }

  return `요청이 실패했습니다. (${response.status})`
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

// ---------- Queries ----------

/** 목록 조회 (memory_at 내림차순). limit/offset 미전달 시 전체 반환. 에러 시 throw. */
export async function getMemories(limit?: number, offset?: number): Promise<MemoryRow[]> {
  if (limit !== undefined) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset ?? 0) })
    return requestJson<MemoryRow[]>(`/api/memories?${params.toString()}`)
  }
  return requestJson<MemoryRow[]>("/api/memories")
}

/** 최신 N개 (memory_at 내림차순). 에러 시 throw. */
export async function getRecentMemories(limit: number): Promise<MemoryRow[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  return requestJson<MemoryRow[]>(`/api/memories?${params.toString()}`)
}

/** 단건 조회. 에러 시 throw. */
export async function getMemoryById(id: number): Promise<MemoryRow> {
  return requestJson<MemoryRow>(`/api/memories/${id}`)
}

// ---------- Mutations ----------

/** 새 메모리 생성. 에러 시 throw. */
export async function createMemory(input: CreateMemoryInput): Promise<number> {
  const supabase = getSupabaseBrowserClient()

  // 세션 확인 — 없으면 익명 로그인 후 재시도
  let { data: { user } } = await supabase.auth.getUser()
  logger.debug("[createMemory] getUser:", user?.id ?? "null", "| is_anonymous:", user?.is_anonymous ?? "-")

  if (!user) {
    logger.debug("[createMemory] 세션 없음 → signInAnonymously")
    const { data, error: anonErr } = await supabase.auth.signInAnonymously()
    if (anonErr || !data.user) {
      console.error("[createMemory] signInAnonymously 실패:", anonErr)
      throw new Error("인증에 실패했습니다. 잠시 후 다시 시도해주세요.")
    }
    user = data.user
    logger.debug("[createMemory] 익명 사용자 생성:", user.id)
  }

  const { data: sessionData } = await supabase.auth.getSession()
  logger.debug("[createMemory] access_token:", sessionData.session?.access_token ? "있음" : "없음(MISSING)")

  const data = await requestJson<{ id: number }>("/api/memories", {
    method: "POST",
    body: JSON.stringify(input),
  })

  return data.id
}

/** 기존 메모리 수정. 에러 시 throw. */
export async function updateMemory(id: number, input: UpdateMemoryInput): Promise<void> {
  await requestJson<void>(`/api/memories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })
}

/** 메모리 삭제. 에러 시 throw. */
export async function deleteMemory(id: number): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.from("memories").delete().eq("id", id)
  if (error) throw error
}
