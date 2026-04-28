"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { LeafletMap, LeafletMarker } from "@/types/leaflet"
import { Smile, Frown, CloudRain, Leaf, User, Users, MapPin, Pencil } from "lucide-react"
import { getMemoryById, type MemoryRow } from "@/lib/services/memory"
import logger from "@/lib/logger"
import { SignedImage } from "@/components/moodot/signed-image"
import { MemoryExportDrawer } from "@/components/moodot/memory-export-drawer"


let leafletLoader: Promise<void> | null = null
function loadLeafletAssets(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.L) return Promise.resolve()
  if (leafletLoader) return leafletLoader

  leafletLoader = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet="true"]')) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      link.dataset.leaflet = "true"
      document.head.appendChild(link)
    }

    const existing = document.querySelector('script[data-leaflet="true"]')
    if (existing) {
      // 이미 로딩 완료된 경우
      if (window.L) { resolve(); return }
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("Leaflet load failed")))
      return
    }

    const script = document.createElement("script")
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    script.async = true
    script.dataset.leaflet = "true"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Leaflet load failed"))
    document.body.appendChild(script)
  })
  return leafletLoader
}


const EMOTION_MAP: Record<number, { icon: React.ElementType; color: string }> = {
  1: { icon: Smile,     color: "#FFE8B8" },
  2: { icon: Frown,     color: "#F8C8C8" },
  3: { icon: CloudRain, color: "#B0E4F8" },
  4: { icon: Leaf,      color: "#C0ECD8" },
}

function formatDate(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (isNaN(date.getTime())) return ""
  return date.toLocaleString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

// --- Read-only map ---
function LocationMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LeafletMap | null>(null)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      await loadLeafletAssets()
      if (cancelled || !containerRef.current || !window.L) return

      // 이미 지도가 있으면 제거 후 재생성
      mapRef.current?.remove()

      const L = window.L
      const map = L.map(containerRef.current, {
        zoomControl: true,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      }).setView([lat, lng], 15)
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map)

      L.marker([lat, lng]).addTo(map)

      // 컨테이너 크기 확정 후 타일 재계산
      setTimeout(() => {
        if (!cancelled) map.invalidateSize()
      }, 100)
    }

    void init()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [lat, lng])

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "208px" }}
    />
  )
}

// --- Main component ---
export function MemoryDetail({ id }: { id: number }) {
  const [memory,    setMemory]    = useState<MemoryRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState("")
  const router = useRouter()

  useEffect(() => {
    let mounted = true

    const fetchMemory = async () => {
      try {
        const data = await getMemoryById(id)
        if (!mounted) return
        setMemory(data)
      } catch (e) {
        if (!mounted) return
        logger.error("[memory-detail] load error:", e)
        setError(e instanceof Error ? e.message : "불러오지 못했습니다.")
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void fetchMemory()
    return () => { mounted = false }
  }, [id])

  if (isLoading) return <p className="py-12 text-center text-sm text-mb-muted">불러오는 중...</p>
  if (error || !memory) return <p className="py-12 text-center text-sm text-mb-muted">{error || "기록을 찾을 수 없습니다."}</p>

  const emotion      = EMOTION_MAP[memory.emotion_id ?? 1] ?? EMOTION_MAP[1]
  const EmotionIcon  = emotion.icon
  const isTogether   = (memory.with_whom ?? "").toLowerCase() === "together"
  const WithWhomIcon = isTogether ? Users : User
  const withWhomLabel = isTogether ? "TOGETHER" : "SOLO"
  const hasLocation  = memory.location_lat !== null && memory.location_lng !== null

  return (
    <div className="flex flex-col gap-5 pt-4">
      {/* 제목 영역 */}
      <header className="flex flex-col items-center text-center gap-3">
        <div className="flex items-center justify-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(0,0,0,0.06)]"
            style={{ backgroundColor: emotion.color }}
          >
            <EmotionIcon className="w-5 h-5 text-mb-dark/80" />
          </div>
          <h2 className="font-heading text-2xl font-extrabold text-mb-dark tracking-tight leading-tight">
            {memory.title?.trim() || "Untitled Memory"}
          </h2>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="font-body text-[11px] font-bold text-mb-muted uppercase tracking-[0.15em]">
            {formatDate(memory.memory_at)}
          </p>
          <div className="flex items-center gap-1.5 text-mb-muted/70">
            <WithWhomIcon className="w-3.5 h-3.5" />
            <span className="font-body text-[10px] font-bold uppercase tracking-widest">
              {withWhomLabel}
            </span>
          </div>
        </div>
      </header>

      {/* 본문 */}
      {memory.text?.trim() && (
        <section className="bg-mb-card rounded-2xl p-6 shadow-[0px_8px_24px_rgba(43,52,54,0.04)]">
          <p className="font-body text-sm leading-relaxed text-mb-dark/80 whitespace-pre-wrap">
            {memory.text}
          </p>
        </section>
      )}

      {/* 이미지 */}
      {memory.image_url && (
        <section>
          <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-mb-unselected">
            <SignedImage
              path={memory.image_url}
              alt="Memory photo"
              className="w-full h-full object-cover transition-all duration-200"
            />
          </div>
        </section>
      )}

      {/* 지도 + 위치 */}
      {hasLocation && (
        <section className="overflow-hidden rounded-xl shadow-[0px_4px_16px_rgba(43,52,54,0.05)]">
          <div className="bg-mb-unselected" style={{ height: "208px" }}>
            <LocationMap lat={memory.location_lat!} lng={memory.location_lng!} />
          </div>
          {(memory.place_name || memory.location_label) && (
            <div className="bg-mb-unselected px-4 py-3 flex items-center gap-3 border-t border-white/40">
              <MapPin className="w-4 h-4 text-mb-primary flex-shrink-0" />
              <div className="min-w-0">
                {memory.place_name && (
                  <p className="font-body font-semibold text-sm text-mb-dark truncate">
                    {memory.place_name}
                  </p>
                )}
                {memory.location_label && (
                  <p className="font-body text-xs text-mb-muted truncate">
                    {memory.location_label}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 수정 버튼 */}
      <button
        type="button"
        onClick={() => router.push(`/memory/${memory.id}/edit`)}
        className="flex w-full items-center justify-center gap-2 h-14 rounded-full bg-transparent border border-mb-primary/30 font-heading text-[16px] font-semibold text-mb-primary transition-all duration-200 hover:bg-mb-primary/8 active:scale-[0.99]"
      >
        <Pencil className="w-4 h-4" />
        수정하기
      </button>

      {/* 내보내기 */}
      <MemoryExportDrawer memory={memory} />
    </div>
  )
}
