"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft,
  Pencil,
  MapPin,
  CalendarDays,
  MessageSquare,
} from "lucide-react"
import { BottomNavigation } from "@/components/moodot/bottom-navigation"
import {
  getCollectionById,
  type CollectionWithMemories,
  type MemoryInCollection,
} from "@/lib/services/collection"
import { SignedImage } from "@/components/moodot/signed-image"
import logger from "@/lib/logger"

const EMOTION_COLOR_MAP: Record<number, string> = {
  1: "#FFE8B8",
  2: "#F8C8C8",
  3: "#B0E4F8",
  4: "#C0ECD8",
}


const GRADIENT_PLACEHOLDERS = [
  "from-mb-accent via-mb-accent-mint to-mb-accent-cyan",
  "from-mb-secondary/40 via-mb-accent-lavender/50 to-mb-accent-cyan/60",
  "from-mb-accent-mint via-mb-accent-cyan to-mb-secondary/30",
  "from-mb-sparkle/50 via-mb-accent/60 to-mb-accent-mint/50",
]

function getPlaceholderGradient(id: string): string {
  const lastChar = id.charCodeAt(id.length - 1)
  return GRADIENT_PLACEHOLDERS[lastChar % GRADIENT_PLACEHOLDERS.length]
}

function formatDateTime(value: string | null): string {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return ""
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
  if (start && end) {
    if (start === end) return fmt(start)
    return `${fmt(start)} - ${fmt(end)}`
  }
  return fmt((start ?? end)!)
}

function MemoryItem({ memory }: { memory: MemoryInCollection }) {
  const color = EMOTION_COLOR_MAP[memory.emotion_id ?? 1] ?? EMOTION_COLOR_MAP[1]
  const lines = (memory.text ?? "").split("\n")

  return (
    <div className="relative pl-6">
      {/* 타임라인 도트 */}
      <div
        className="absolute left-0 top-3 h-3 w-3 rounded-full border-2 border-white shadow"
        style={{ backgroundColor: color }}
      />

      <div className="rounded-xl bg-mb-card px-4 py-4 shadow-sm">
        {/* 시각 */}
        <div className="mb-2 flex items-center gap-2">
          <span className="font-body text-[11px] text-mb-muted">
            {formatDateTime(memory.memory_at)}
          </span>
        </div>

        {/* 제목 */}
        {memory.title?.trim() && (
          <h3 className="mb-1 font-heading text-[14px] font-bold text-mb-dark">
            {memory.title}
          </h3>
        )}

        {/* 내용 */}
        {memory.text?.trim() && (
          <div className="font-body text-sm leading-relaxed text-mb-dark/80">
            {lines.map((line, i) => (
              <p key={i} className={i === 0 ? "font-semibold" : ""}>
                {line || "\u00A0"}
              </p>
            ))}
          </div>
        )}

        {/* 이미지 (4:3) */}
        {memory.image_url && (
          <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl">
            <SignedImage
              path={memory.image_url}
              alt={memory.title ?? "memory image"}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        )}

        {/* 위치 */}
        {(memory.place_name || memory.location_label) && (
          <div className="mt-2 flex items-center gap-1 font-body text-[11px] text-mb-muted">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span>{memory.place_name ?? memory.location_label}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CollectionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [collection, setCollection] = useState<CollectionWithMemories | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    if (!id) {
      router.replace("/collection")
      return
    }

    let mounted = true
    setIsLoading(true)
    setErrorMessage("")

    getCollectionById(id)
      .then((data) => { if (mounted) setCollection(data) })
      .catch((e) => {
        if (!mounted) return
        logger.error("[collection/detail] load error:", e)
        if (e?.code === "PGRST116" || e?.message?.includes("not found")) {
          router.replace("/collection")
          return
        }
        setErrorMessage(
          e instanceof Error ? e.message : "컬렉션을 불러오지 못했습니다."
        )
      })
      .finally(() => { if (mounted) setIsLoading(false) })

    return () => { mounted = false }
  }, [id, router])

  const dateRange = collection
    ? formatDateRange(collection.start_date, collection.end_date)
    : ""

  const gradientClass = getPlaceholderGradient(id ?? "0")

  // cover_memory?.image_url 기반으로 안전하게 추출
  const coverImageUrl = collection?.cover_memory?.image_url ?? null

  return (
    <div className="min-h-screen bg-mb-bg relative">
      {/* 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-xl bg-mb-bg/80 border-b border-mb-unselected/50">
        <div className="mx-auto max-w-[375px] h-full px-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/collection")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-mb-card hover:bg-mb-unselected transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-mb-dark" />
          </button>
          <h1 className="font-heading text-[17px] font-bold text-mb-dark truncate max-w-[220px]">
            {collection?.title ?? "컬렉션"}
          </h1>
          <button
            type="button"
            onClick={() => router.push(`/collection/${id}/edit`)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-mb-card hover:bg-mb-unselected transition-colors"
          >
            <Pencil className="h-4 w-4 text-mb-dark" />
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-[375px] pb-32 pt-16">
        {/* 로딩 */}
        {isLoading && (
          <div className="px-5 pt-6 space-y-4">
            <div className="h-52 w-full animate-pulse rounded-none bg-mb-unselected" />
            <div className="h-7 w-2/3 animate-pulse rounded-xl bg-mb-unselected" />
            <div className="h-4 w-1/2 animate-pulse rounded-xl bg-mb-unselected" />
          </div>
        )}

        {/* 에러 */}
        {!isLoading && errorMessage && (
          <div className="px-5 pt-6">
            <div className="rounded-xl bg-red-50 px-5 py-6 text-center">
              <p className="font-body text-sm text-red-500">{errorMessage}</p>
              <button
                type="button"
                onClick={() => router.push("/collection")}
                className="mt-3 font-body text-sm font-semibold text-mb-primary underline"
              >
                목록으로 돌아가기
              </button>
            </div>
          </div>
        )}

        {/* 본문 */}
        {!isLoading && collection && (
          <>
            {/* 커버 이미지: cover_memory?.image_url 기반 */}
            <div className="relative h-52 w-full overflow-hidden">
              {coverImageUrl ? (
                <SignedImage
                  path={coverImageUrl}
                  alt={collection.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div
                  className={`h-full w-full bg-gradient-to-br ${gradientClass}`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>

            {/* 메타 정보 */}
            <div className="px-5 py-5">
              <h2 className="font-heading text-[24px] font-bold leading-tight text-mb-dark">
                {collection.title}
              </h2>

              <div className="mt-2 flex flex-col gap-1.5">
                {collection.location && (
                  <div className="flex items-center gap-1.5 font-body text-[13px] text-mb-muted">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-mb-primary" />
                    <span>{collection.location}</span>
                  </div>
                )}
                {dateRange && (
                  <div className="flex items-center gap-1.5 font-body text-[13px] text-mb-muted">
                    <CalendarDays className="h-3.5 w-3.5 flex-shrink-0 text-mb-primary" />
                    <span>{dateRange}</span>
                  </div>
                )}
              </div>

              {collection.note && (
                <div className="mt-3 flex gap-2 rounded-xl bg-mb-accent/20 px-4 py-3">
                  <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-mb-primary" />
                  <p className="font-body text-[13px] italic leading-relaxed text-mb-dark/80 whitespace-pre-line">
                    {collection.note}
                  </p>
                </div>
              )}

              <p className="mt-3 font-body text-[12px] text-mb-muted">
                기록 {collection.memories.length}개
              </p>
            </div>

            {/* 구분선 */}
            <div className="mx-5 border-t border-mb-unselected" />

            {/* Memory 타임라인 */}
            {collection.memories.length === 0 ? (
              <p className="py-8 text-center font-body text-sm text-mb-muted">
                포함된 기록이 없습니다.
              </p>
            ) : (
              <div className="px-5 py-6">
                <div className="relative space-y-4">
                  {/* 세로 타임라인 선 */}
                  <div className="absolute bottom-0 left-[5px] top-3 w-px bg-mb-unselected" />
                  {collection.memories.map((memory) => (
                    <MemoryItem key={memory.id} memory={memory} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <BottomNavigation />
    </div>
  )
}
