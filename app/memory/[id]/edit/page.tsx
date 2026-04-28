"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import type { LeafletMap, LeafletMarker, LeafletClickEvent } from "@/types/leaflet"
import {
  X, Smile, Frown, Meh, Leaf,
  Clock3, ChevronRight, ImagePlus, MapPinned, Trash2,
} from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { compressImage } from "@/lib/image-compression"
import { uploadImage, getSignedUrl } from "@/lib/storage/image"
import { getMemoryById, updateMemory, deleteMemory } from "@/lib/services/memory"
import logger from "@/lib/logger"
import { BottomNavigation } from "@/components/moodot/bottom-navigation"

// ─── Leaflet loader (모듈 수준 싱글턴) ──────────────────────────────────────
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

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`,
    )
    if (!res.ok) throw new Error("failed")
    const data = await res.json()
    return typeof data?.display_name === "string" && data.display_name
      ? data.display_name
      : `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────
type MoodType = "good" | "bad" | "sad" | "calm"
type WithType = "solo" | "together"
type UploadStatus = "idle" | "uploading" | "success" | "failed"

const EMOTION_ID_MAP: Record<MoodType, number> = { good: 1, bad: 2, sad: 3, calm: 4 }
const EMOTION_ID_REVERSE: Record<number, MoodType> = { 1: "good", 2: "bad", 3: "sad", 4: "calm" }

const moods: Array<{ id: MoodType; label: string; icon: typeof Smile; activeBg: string; activeIcon: string }> = [
  { id: "good",  label: "Good",  icon: Smile, activeBg: "#FFE8B8", activeIcon: "#8B6B23" },
  { id: "bad",   label: "Bad",   icon: Frown, activeBg: "#F8C8C8", activeIcon: "#A65E5E" },
  { id: "sad",   label: "Sad",   icon: Meh,   activeBg: "#B0E4F8", activeIcon: "#4A8BA6" },
  { id: "calm",  label: "Calm",  icon: Leaf,  activeBg: "#C0ECD8", activeIcon: "#4A8A6D" },
]

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function EditMemoryPage() {
  const params   = useParams<{ id: string }>()
  const router   = useRouter()
  const memoryId = Number(params.id)

  // form state
  const [mood,            setMood]            = useState<MoodType>("good")
  const [withWho,         setWithWho]         = useState<WithType>("solo")
  const [memoryAt,        setMemoryAt]        = useState("")
  const [title,           setTitle]           = useState("")
  const [text,            setText]            = useState("")
  const [imageUrl,        setImageUrl]        = useState<string | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploadStatus,    setUploadStatus]    = useState<UploadStatus>("idle")
  const [locationLabel,   setLocationLabel]   = useState("")
  const [locationLat,     setLocationLat]     = useState<number | null>(null)
  const [locationLng,     setLocationLng]     = useState<number | null>(null)
  const [placeName,       setPlaceName]       = useState("")
  const [isSaving,        setIsSaving]        = useState(false)
  const [isLoading,       setIsLoading]       = useState(true)
  const [mapLoading,      setMapLoading]      = useState(false)

  const datetimeInputRef  = useRef<HTMLInputElement>(null)
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const mapContainerRef   = useRef<HTMLDivElement>(null)
  const mapRef            = useRef<LeafletMap | null>(null)
  const markerRef         = useRef<LeafletMarker | null>(null)
  // 지도는 데이터 로드 후 1회만 초기화 — 위치 변경 시 마커만 업데이트
  const mapInitializedRef = useRef(false)

  // ── 기존 기록 로드 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const data = await getMemoryById(memoryId)
        setMood(EMOTION_ID_REVERSE[data.emotion_id ?? 1] ?? "good")
        setWithWho((data.with_whom ?? "Solo").toLowerCase() === "together" ? "together" : "solo")
        setMemoryAt(toDatetimeLocal(data.memory_at))
        setTitle(data.title ?? "")
        setText(data.text ?? "")
        setImageUrl(data.image_url ?? null)
        if (data.image_url) {
          getSignedUrl(data.image_url)
            .then((url) => setImagePreviewUrl(url))
            .catch(() => setImagePreviewUrl(null))
          setUploadStatus("success")
        } else {
          setImagePreviewUrl(null)
        }
        setLocationLabel(data.location_label ?? "")
        setLocationLat(data.location_lat ?? null)
        setLocationLng(data.location_lng ?? null)
        setPlaceName(data.place_name ?? "")
      } catch (e) {
        logger.error("[memory/edit] load error:", e)
        alert("기존 기록을 불러오지 못했습니다.")
        router.back()
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [memoryId, router])

  // ── 인라인 지도 초기화 (데이터 로드 완료 후 1회) ───────────────────────────
  // locationLat/Lng는 deps에서 의도적으로 제외 — 마운트 시점 값을 한 번만 읽음
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isLoading || mapInitializedRef.current) return

    let cancelled = false

    const initMap = async () => {
      if (!mapContainerRef.current) return
      setMapLoading(true)
      try {
        await loadLeafletAssets()
        if (cancelled || !mapContainerRef.current || !window.L) return

        const L = window.L
        const lat  = locationLat ?? 37.5665
        const lng  = locationLng ?? 126.978
        const zoom = locationLat !== null && locationLng !== null ? 15 : 12

        const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([lat, lng], zoom)
        mapRef.current = map
        mapInitializedRef.current = true

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map)

        if (locationLat !== null && locationLng !== null) {
          markerRef.current = L.marker([locationLat, locationLng]).addTo(map)
        }

        // 지도 클릭 시 마커 이동 + 위치 상태 즉시 반영 (모달·확인 버튼 불필요)
        map.on("click", async (e: LeafletClickEvent) => {
          const { lat: clat, lng: clng } = e.latlng
          if (!markerRef.current) {
            markerRef.current = L.marker([clat, clng]).addTo(map)
          } else {
            markerRef.current.setLatLng([clat, clng])
          }
          const label = await reverseGeocode(clat, clng)
          if (!cancelled) {
            setLocationLat(clat)
            setLocationLng(clng)
            setLocationLabel(label)
          }
        })
      } catch {
        // 지도 로딩 실패 — 지도 영역 빈 상태 유지, 저장 차단 없음
      } finally {
        if (!cancelled) setMapLoading(false)
      }
    }

    void initMap()
    return () => { cancelled = true }
  }, [isLoading])

  // ── 언마운트 시 Leaflet 인스턴스 정리 ─────────────────────────────────────
  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      mapInitializedRef.current = false
    }
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const memoryAtText = memoryAt === ""
    ? "날짜와 시간을 선택하세요"
    : new Date(memoryAt).toLocaleString("ko-KR", {
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })

  const handlePhotoUpload = async (file: File) => {
    setUploadStatus("uploading")
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("로그인이 필요합니다.")
      const uploadFile = await compressImage(file)
      const path = await uploadImage(uploadFile, user.id)
      setImageUrl(path)
      setUploadStatus("success")
    } catch (e) {
      logger.error("[memory/edit] photo upload error:", e)
      setUploadStatus("failed")
      alert(`사진 업로드 실패: ${e instanceof Error ? e.message : ""}`)
    }
  }

  // 위치 초기화 — 마커 제거 + 상태 초기화
  const handleClearLocation = () => {
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
    setLocationLat(null)
    setLocationLng(null)
    setLocationLabel("")
  }

  const handleDelete = async () => {
    if (!confirm("이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return
    try {
      await deleteMemory(memoryId)
      router.replace("/records")
    } catch (e) {
      logger.error("[memory/edit] delete error:", e)
      alert(`삭제 실패: ${e instanceof Error ? e.message : ""}`)
    }
  }

  // 감정만 필수 — 나머지는 선택, memoryAt 빈값 시 현재 시각으로 대체
  const handleSave = async () => {
    if (uploadStatus === "uploading") { alert("사진 업로드가 완료된 후 저장해 주세요."); return }

    setIsSaving(true)
    try {
      await updateMemory(memoryId, {
        title:          title.trim() || null,
        text:           text.trim() || null,
        image_url:      imageUrl,
        emotion_id:     EMOTION_ID_MAP[mood],
        with_whom:      withWho === "solo" ? "Solo" : "Together",
        memory_at:      memoryAt ? new Date(memoryAt).toISOString() : new Date().toISOString(),
        location_lat:   locationLat,
        location_lng:   locationLng,
        location_label: locationLabel.trim() || null,
        place_name:     placeName.trim() || null,
      })
      router.push(`/memory/${memoryId}`)
    } catch (e) {
      logger.error("[memory/edit] save error:", e)
      alert(`저장 실패: ${e instanceof Error ? e.message : ""}`)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mb-bg">
        <p className="text-sm text-mb-muted">불러오는 중...</p>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-mb-bg text-mb-dark">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-mb-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[375px] items-center justify-between px-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-mb-dark/80 transition-opacity duration-200 hover:opacity-70"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
          <h1 className="font-heading text-lg font-bold tracking-tight text-mb-dark">Edit Memory</h1>
          <div className="w-5" />
        </div>
      </header>

      <main className="mx-auto flex max-w-[375px] flex-col gap-6 px-5 pb-32 pt-24">
        {/* 감정 */}
        <section className="grid grid-cols-4 gap-3">
          {moods.map((item) => {
            const Icon = item.icon
            const active = mood === item.id
            return (
              <button key={item.id} type="button" onClick={() => setMood(item.id)}
                className="group flex flex-col items-center gap-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200"
                  style={{
                    backgroundColor: active ? item.activeBg : "#EFF4F6",
                    boxShadow: active ? `0 0 0 4px ${item.activeBg}33` : "none",
                  }}>
                  <Icon className="h-5 w-5 transition-colors duration-200"
                    style={{ color: active ? item.activeIcon : "#AAB3B6" }} />
                </div>
                <span className="font-body text-[10px] font-bold"
                  style={{ color: active ? "#485058" : "#AAB3B6" }}>{item.label}</span>
              </button>
            )
          })}
        </section>

        {/* 함께한 사람 */}
        <section className="flex flex-col gap-3">
          <h3 className="font-body text-[14px] font-bold text-mb-dark">Who were you with?</h3>
          <div className="flex rounded-full bg-[#EFF4F6] p-1">
            {(["solo", "together"] as WithType[]).map((w) => (
              <button key={w} type="button" onClick={() => setWithWho(w)}
                className="h-11 flex-1 rounded-full text-[14px] font-semibold transition-all duration-200"
                style={{
                  background: withWho === w ? "#7CC4D8" : "transparent",
                  color:      withWho === w ? "#FFFFFF" : "#AAB3B6",
                }}>
                {w === "solo" ? "Solo" : "Together"}
              </button>
            ))}
          </div>
        </section>

        {/* 날짜 */}
        <section>
          <button type="button"
            onClick={() => datetimeInputRef.current?.showPicker?.() ?? datetimeInputRef.current?.click()}
            className="flex w-full items-center justify-between rounded-xl border border-[#AAB3B61A] bg-white px-4 py-4 shadow-[0px_2px_8px_rgba(43,52,54,0.02)]">
            <div className="flex items-center gap-3">
              <Clock3 className="h-4 w-4 text-[#AAB3B6]" />
              <span className="text-[14px] font-semibold text-mb-dark">{memoryAtText}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-[#AAB3B6]" />
          </button>
          <input ref={datetimeInputRef} type="datetime-local" value={memoryAt}
            onChange={(e) => setMemoryAt(e.target.value)} className="sr-only" />
        </section>

        {/* 제목 */}
        <section>
          <input type="text" placeholder="Memory Title" value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-semibold text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary" />
        </section>

        {/* 내용 */}
        <section>
          <textarea placeholder="Memory Content" value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-32 w-full resize-none rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-medium text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary" />
        </section>

        {/* 사진 */}
        <section>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#AAB3B633] bg-[#EFF4F64D] transition-colors duration-200 hover:bg-[#EFF4F6]">
            {imagePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreviewUrl} alt="미리보기" className="h-full w-full rounded-xl object-cover" />
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                  <ImagePlus className="h-5 w-5 text-[#737C7F]" />
                </div>
                <span className="text-[12px] font-semibold text-[#737C7F]">
                  {uploadStatus === "uploading" ? "업로드 중..." : "사진 변경하기 (선택)"}
                </span>
              </>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (imagePreviewUrl && imagePreviewUrl !== imageUrl) URL.revokeObjectURL(imagePreviewUrl)
              setImagePreviewUrl(URL.createObjectURL(file))
              void handlePhotoUpload(file)
            }} />
        </section>

        {/* 위치 — 항상 노출되는 인라인 지도 */}
        <section className="flex flex-col gap-2">
          {/* 현재 위치 레이블 + 초기화 버튼 */}
          <div className="flex items-center justify-between rounded-xl border border-[#AAB3B61A] bg-white px-4 py-4 shadow-[0px_2px_8px_rgba(43,52,54,0.02)]">
            <div className="flex min-w-0 items-center gap-3">
              <MapPinned className="h-4 w-4 shrink-0 text-[#AAB3B6]" />
              <span className="truncate text-[14px] font-semibold text-mb-dark">
                {locationLabel || "지도를 탭하여 위치 선택"}
              </span>
            </div>
            {locationLat !== null && locationLng !== null && (
              <button
                type="button"
                onClick={handleClearLocation}
                className="ml-2 shrink-0 text-xs font-medium text-mb-muted transition-opacity hover:opacity-70"
              >
                초기화
              </button>
            )}
          </div>

          {/* 인라인 지도 컨테이너 — h-48(192px)으로 레이아웃 과하게 커지지 않게 고정 */}
          <div className="relative h-48 overflow-hidden rounded-xl border border-[#AAB3B61A] bg-[#EFF4F6]">
            {mapLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-mb-muted">
                지도 로딩 중...
              </div>
            )}
            <div ref={mapContainerRef} className="h-full w-full" />
          </div>
          <p className="text-[11px] text-mb-muted">지도를 탭하면 위치가 바로 변경됩니다.</p>
        </section>

        {/* 장소 별칭 — 위치 선택 시에만 표시 */}
        {locationLat !== null && locationLng !== null && (
          <section>
            <input type="text" placeholder="장소 별칭 입력 (예: 우리집, 회사)"
              value={placeName} onChange={(e) => setPlaceName(e.target.value)}
              className="w-full rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-semibold text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary" />
          </section>
        )}

        {/* 저장 / 삭제 */}
        <section className="mt-2 flex flex-col gap-3">
          <button type="button" onClick={() => void handleSave()}
            disabled={isSaving || uploadStatus === "uploading"}
            className="h-14 w-full rounded-full bg-gradient-to-br from-mb-primary to-mb-secondary font-heading text-[16px] font-semibold text-white shadow-[0px_8px_24px_rgba(124,196,216,0.3)] transition-transform duration-200 active:scale-[0.99] disabled:opacity-70">
            {isSaving ? "저장 중..." : "수정 완료"}
          </button>
          <button type="button" onClick={() => void handleDelete()}
            disabled={isSaving}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#F8C8C8]/35 font-heading text-[16px] font-semibold text-[#A65E5E] transition-all duration-200 hover:bg-[#F8C8C8]/55 active:scale-[0.99] disabled:opacity-50">
            <Trash2 className="h-4 w-4" />
            기록 삭제
          </button>
        </section>
      </main>

      <BottomNavigation />
    </div>
  )
}
