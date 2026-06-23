import type { MemoryRow } from "./memory"

// ---------- Types ----------

export type CoverMemory = { image_url: string | null } | null

export type CollectionRow = {
  id: string
  title: string
  note: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
  cover_memory_id: number | null
  created_at: string
  updated_at: string
}

export type CollectionSummary = CollectionRow & {
  cover_memory: CoverMemory
  memory_count: number
}

export type MemoryInCollection = MemoryRow & { position: number }

export type CollectionWithMemories = CollectionRow & {
  cover_memory: CoverMemory
  memories: MemoryInCollection[]
}

export type CollectionFormInput = {
  title: string
  note: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
  cover_memory_id: number | null
  memory_ids: number[]
}

// ---------- Helpers ----------

async function getErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    if (typeof data.error === "string" && data.error.trim() !== "") {
      return data.error
    }
  } catch {
    // ignore
  }
  return `요청이 실패했습니다. (${response.status})`
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) throw new Error(await getErrorMessage(res))
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------- Queries ----------

export async function getCollections(): Promise<CollectionSummary[]> {
  return requestJson<CollectionSummary[]>("/api/collections")
}

export async function getCollectionById(id: string): Promise<CollectionWithMemories> {
  return requestJson<CollectionWithMemories>(`/api/collections/${id}`)
}

export async function getAvailableMemories(currentCollectionId?: string): Promise<MemoryRow[]> {
  const path = currentCollectionId
    ? `/api/collections/available-memories?current_collection_id=${currentCollectionId}`
    : "/api/collections/available-memories"
  return requestJson<MemoryRow[]>(path)
}

// ---------- Mutations ----------

export async function createCollection(input: CollectionFormInput): Promise<string> {
  const data = await requestJson<{ id: string }>("/api/collections", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return data.id
}

export async function updateCollection(id: string, input: CollectionFormInput): Promise<void> {
  await requestJson<void>(`/api/collections/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
}

export async function deleteCollection(id: string): Promise<void> {
  await requestJson<void>(`/api/collections/${id}`, { method: "DELETE" })
}
