"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { BottomNavigation } from "@/components/moodot/bottom-navigation"
import { CollectionForm } from "@/components/moodot/collection-form"
import {
  getAvailableMemories,
  createCollection,
  type CollectionFormInput,
} from "@/lib/services/collection"
import type { MemoryRow } from "@/lib/services/memory"
import logger from "@/lib/logger"

export default function NewCollectionPage() {
  const router = useRouter()
  const [availableMemories, setAvailableMemories] = useState<MemoryRow[]>([])
  const [isLoadingMemories, setIsLoadingMemories] = useState(true)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    let mounted = true
    getAvailableMemories()
      .then((data) => { if (mounted) setAvailableMemories(data) })
      .catch((e) => {
        logger.error("[collection/new] load error:", e)
        if (mounted)
          setLoadError(
            e instanceof Error ? e.message : "기록을 불러오지 못했습니다."
          )
      })
      .finally(() => { if (mounted) setIsLoadingMemories(false) })
    return () => { mounted = false }
  }, [])

  async function handleSave(input: CollectionFormInput) {
    const newId = await createCollection(input)
    router.push(`/collection/${newId}`)
  }

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
            새 컬렉션 만들기
          </h1>
        </div>
      </header>

      <main className="relative mx-auto max-w-[375px] px-5 pt-20 pb-32">
        {isLoadingMemories ? (
          <div className="space-y-3 pt-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-16 w-full animate-pulse rounded-xl bg-mb-unselected"
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-xl bg-red-50 px-5 py-6 text-center">
            <p className="font-body text-sm text-red-500">{loadError}</p>
          </div>
        ) : (
          <CollectionForm
            availableMemories={availableMemories}
            onSave={handleSave}
          />
        )}
      </main>
      <BottomNavigation />
    </div>
  )
}
