"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { BottomNavigation } from "@/components/moodot/bottom-navigation"
import { CollectionForm } from "@/components/moodot/collection-form"
import {
  getCollectionById,
  getAvailableMemories,
  updateCollection,
  deleteCollection,
  type CollectionWithMemories,
  type CollectionFormInput,
} from "@/lib/services/collection"
import type { MemoryRow } from "@/lib/services/memory"
import logger from "@/lib/logger"

export default function EditCollectionPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [collection, setCollection] = useState<CollectionWithMemories | null>(null)
  const [availableMemories, setAvailableMemories] = useState<MemoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    if (!id) {
      router.replace("/collection")
      return
    }

    let mounted = true
    setIsLoading(true)
    setLoadError("")

    Promise.all([getCollectionById(id), getAvailableMemories(id)])
      .then(([collectionData, memoriesData]) => {
        if (!mounted) return
        setCollection(collectionData)
        setAvailableMemories(memoriesData)
      })
      .catch((e) => {
        if (!mounted) return
        logger.error("[collection/edit] load error:", e)
        if (e?.code === "PGRST116" || e?.message?.includes("not found")) {
          router.replace("/collection")
          return
        }
        setLoadError(
          e instanceof Error ? e.message : "데이터를 불러오지 못했습니다."
        )
      })
      .finally(() => { if (mounted) setIsLoading(false) })

    return () => { mounted = false }
  }, [id, router])

  async function handleSave(input: CollectionFormInput) {
    await updateCollection(id, input)
    router.push(`/collection/${id}`)
  }

  async function handleDelete() {
    await deleteCollection(id)
    router.push("/collection")
  }

  // 현재 컬렉션에 속한 Memory ids (폼 초기값)
  const currentMemoryIds = collection?.memories.map((m) => m.id) ?? []

  return (
    <div className="min-h-screen bg-mb-bg relative">
      <header className="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-mb-bg/80 border-b border-mb-unselected/50">
        <div className="mx-auto max-w-[375px] h-full px-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-mb-card hover:bg-mb-unselected transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-mb-dark" />
          </button>
          <h1 className="font-heading text-[17px] font-bold text-mb-dark">
            컬렉션 수정
          </h1>
        </div>
      </header>

      <main className="relative mx-auto max-w-[375px] px-5 pt-20 pb-32">
        {isLoading && (
          <div className="space-y-3 pt-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-16 w-full animate-pulse rounded-xl bg-mb-unselected"
              />
            ))}
          </div>
        )}

        {!isLoading && loadError && (
          <div className="rounded-xl bg-red-50 px-5 py-6 text-center">
            <p className="font-body text-sm text-red-500">{loadError}</p>
            <button
              type="button"
              onClick={() => router.push("/collection")}
              className="mt-3 font-body text-sm font-semibold text-mb-primary underline"
            >
              목록으로 돌아가기
            </button>
          </div>
        )}

        {!isLoading && collection && (
          <CollectionForm
            collectionId={id}
            initialValues={{
              title: collection.title,
              location: collection.location,
              start_date: collection.start_date,
              end_date: collection.end_date,
              note: collection.note,
              cover_memory_id: collection.cover_memory_id,
              memory_ids: currentMemoryIds,
            }}
            availableMemories={availableMemories}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        )}
      </main>
      <BottomNavigation />
    </div>
  )
}
