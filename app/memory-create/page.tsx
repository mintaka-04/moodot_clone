"use client"

import Image from "next/image"
import type { LeafletMap, LeafletMarker, LeafletClickEvent } from "@/types/leaflet"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  X,
  Smile,
  Frown,
  Meh,
  Leaf,
  Clock3,
  ChevronRight,
  ImagePlus,
  MapPinned,
} from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { compressImage } from "@/lib/image-compression"
import { uploadImage } from "@/lib/storage/image"
import { createMemory } from "@/lib/services/memory"
import logger from "@/lib/logger"
import { BottomNavigation } from "@/components/moodot/bottom-navigation"

type MoodType = "good" | "bad" | "sad" | "calm"
type WithType = "solo" | "together"
type UploadStatus = "idle" | "uploading" | "success" | "failed"

const EMOTION_ID_MAP: Record<MoodType, number> = {
  good: 1,
  bad: 2,
  sad: 3,
  calm: 4,
}

const moods: Array<{
  id: MoodType
  label: string
  icon: typeof Smile
  activeBg: string
  activeIcon: string
}> = [
  { id: "good", label: "Good", icon: Smile, activeBg: "#FFE8B8", activeIcon: "#8B6B23" },
  { id: "bad",  label: "Bad",  icon: Frown, activeBg: "#F8C8C8", activeIcon: "#A65E5E" },
  { id: "sad",  label: "Sad",  icon: Meh,   activeBg: "#B0E4F8", activeIcon: "#4A8BA6" },
  { id: "calm", label: "Calm", icon: Leaf,  activeBg: "#C0ECD8", activeIcon: "#4A8A6D" },
]

// ─── Leaflet loader (모듈 수준 싱글턴) ──────────────────────────────────────
let leafletLoader: Promise<void> | null = null

function loadLeafletAssets() {
  if (typeof window === "undefined") return Promise.resolve()
  if (window.L) return Promise.resolve()
  if (leafletLoader) return leafletLoader

  leafletLoader = new Promise((resolve, reject) => {
    const existingCss = document.querySelector('link[data-leaflet="true"]')
    if (!existingCss) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      link.dataset.leaflet = "true"
      document.head.appendChild(link)
    }

    const existingScript = document.querySelector('script[data-leaflet="true"]')
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve())
      existingScript.addEventListener("error", () => reject(new Error("Leaflet script load failed.")))
      return
    }

    const script = document.createElement("script")
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    script.async = true
    script.dataset.leaflet = "true"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Leaflet script load failed."))
    document.body.appendChild(script)
  })

  return leafletLoader
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko`,
    )
    if (!res.ok) throw new Error("Reverse geocoding failed")
    const data = await res.json()
    const label = typeof data?.display_name === "string" ? data.display_name : ""
    return label || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
}

function getBrowserCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 },
    )
  })
}

export default function CreatePage() {
  const router = useRouter()
  const [mood,            setMood]            = useState<MoodType>("good")
  const [withWho,         setWithWho]         = useState<WithType>("solo")
  const [memoryAt,        setMemoryAt]        = useState<string>("")
  const [title,           setTitle]           = useState<string>("")
  const [text,            setText]            = useState<string>("")
  const [imageUrl,        setImageUrl]        = useState<string | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploadStatus,    setUploadStatus]    = useState<UploadStatus>("idle")
  const [locationLabel,   setLocationLabel]   = useState<string>("")
  const [locationLat,     setLocationLat]     = useState<number | null>(null)
  const [locationLng,     setLocationLng]     = useState<number | null>(null)
  const [placeName,       setPlaceName]       = useState<string>("")
  const [isSaving,        setIsSaving]        = useState<boolean>(false)
  const [geoLoading,      setGeoLoading]      = useState<boolean>(false)
  const [mapLoading,      setMapLoading]      = useState<boolean>(false)

  const datetimeInputRef  = useRef<HTMLInputElement>(null)
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const mapContainerRef   = useRef<HTMLDivElement>(null)
  const mapRef            = useRef<LeafletMap | null>(null)
  const markerRef         = useRef<LeafletMarker | null>(null)
  const mapInitializedRef = useRef(false)

  const memoryAtText =
    memoryAt === ""
      ? "날짜와 시간을 선택하세요"
      : new Date(memoryAt).toLocaleString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })

  // ── 이미지 Blob URL 정리 ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  // ── 현재 시각 자동 세팅 (마운트 1회) ─────────────────────────────────────
  useEffect(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    setMemoryAt(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
    )
  }, [])

  // ── 인라인 지도 초기화 (마운트 1회) ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const initMap = async () => {
      if (!mapContainerRef.current) return
      setMapLoading(true)
      try {
        await loadLeafletAssets()
        if (cancelled || !mapContainerRef.current || !window.L) return

        const L = window.L
        // 서울 기본 좌표로 초기 렌더 — geolocation 완료 시 마커 sync effect가 이동시킴
        const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([37.5665, 126.978], 12)
        mapRef.current = map
        mapInitializedRef.current = true

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map)

        // 컨테이너 크기 재계산 (flex 레이아웃 확정 후)
        requestAnimationFrame(() => {
          if (!cancelled) map.invalidateSize()
        })

        // 지도 탭 → 마커 즉시 이동 + 상태 업데이트
        map.on("click", async (e: LeafletClickEvent) => {
          const { lat, lng } = e.latlng
          if (!markerRef.current) {
            markerRef.current = L.marker([lat, lng]).addTo(map)
          } else {
            markerRef.current.setLatLng([lat, lng])
          }
          const label = await reverseGeocode(lat, lng)
          if (!cancelled) {
            setLocationLat(lat)
            setLocationLng(lng)
            setLocationLabel(label)
          }
        })
      } catch {
        // 지도 로딩 실패 — 빈 영역 유지, 저장 차단 없음
      } finally {
        if (!cancelled) setMapLoading(false)
      }
    }

    void initMap()
    return () => { cancelled = true }
  }, [])

  // ── 언마운트 시 Leaflet 인스턴스 정리 ─────────────────────────────────────
  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      mapInitializedRef.current = false
    }
  }, [])

  // ── locationLat/Lng 변경 시 지도 마커·뷰 동기화 ──────────────────────────
  // geolocation 자동 세팅, 사용자 클릭, 초기화 모두 여기서 처리
  useEffect(() => {
    if (!mapInitializedRef.current || !mapRef.current || !window.L) return

    if (locationLat === null || locationLng === null) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return
    }

    if (!markerRef.current) {
      markerRef.current = window.L.marker([locationLat, locationLng]).addTo(mapRef.current)
    } else {
      markerRef.current.setLatLng([locationLat, locationLng])
    }
    mapRef.current.setView([locationLat, locationLng], 15)
  }, [locationLat, locationLng])

  // ── 현재 위치 자동 세팅 (마운트 1회, 실패·거부 시 빈값 유지) ─────────────
  useEffect(() => {
    setGeoLoading(true)
    getBrowserCurrentPosition()
      .then(async (pos) => {
        if (!pos) return
        const label = await reverseGeocode(pos.lat, pos.lng)
        setLocationLat(pos.lat)
        setLocationLng(pos.lng)
        setLocationLabel(label)
      })
      .catch(() => { /* 권한 거부 등 — 빈값 유지 */ })
      .finally(() => setGeoLoading(false))
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMemoryAtPick = () => {
    const input = datetimeInputRef.current
    if (!input) return
    if ("showPicker" in input) {
      input.showPicker()
      return
    }
    ;(input as HTMLInputElement).focus()
    ;(input as HTMLInputElement).click()
  }

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
    } catch (error) {
      logger.error("[memory-create] photo upload error:", error)
      setUploadStatus("failed")
      const message = error instanceof Error ? error.message : "사진 업로드에 실패했습니다."
      alert(`사진 업로드 실패: ${message}`)
    }
  }

  const handleClearLocation = () => {
    if (markerRef.current) {
      markerRef.current.remove()
      markerRef.current = null
    }
    setLocationLat(null)
    setLocationLng(null)
    setLocationLabel("")
  }

  // 감정만 필수 — 나머지는 선택
  const handleSaveMemory = async () => {
    if (!mood) {
      alert("감정을 선택해 주세요.")
      return
    }
    if (uploadStatus === "uploading") {
      alert("사진 업로드가 완료된 후 저장해 주세요.")
      return
    }
    if (uploadStatus === "failed") {
      alert("사진 업로드에 실패했습니다. 다시 업로드한 뒤 저장해 주세요.")
      return
    }

    setIsSaving(true)
    try {
      const newId = await createMemory({
        title:          title.trim() === "" ? null : title.trim(),
        text:           text.trim() === "" ? null : text.trim(),
        image_url:      imageUrl,
        emotion_id:     EMOTION_ID_MAP[mood],
        with_whom:      withWho === "solo" ? "Solo" : "Together",
        location_lat:   locationLat,
        location_lng:   locationLng,
        location_label: locationLabel.trim() === "" ? null : locationLabel.trim(),
        place_name:     placeName.trim() === "" ? null : placeName.trim(),
        memory_at:      memoryAt ? new Date(memoryAt).toISOString() : new Date().toISOString(),
      })
      router.replace(`/memory/${newId}`)
    } catch (error) {
      logger.error("[memory-create] save error:", error)
      const message = error instanceof Error ? error.message : "저장 중 오류가 발생했습니다."
      alert(`저장 실패: ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-mb-bg text-mb-dark">
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
          <h1 className="font-heading text-lg font-bold tracking-tight text-mb-dark">New Memory</h1>
          <div className="w-5" />
        </div>
      </header>

      <main className="mx-auto flex max-w-[375px] flex-col gap-6 px-5 pb-32 pt-24">
        <section>
          <h2 className="font-heading text-[36px] font-bold leading-[1.15] tracking-[-0.02em] text-mb-dark">
            오늘을 어떻게
            <br />
            기억하고 싶나요?
          </h2>
        </section>

        {/* 감정 */}
        <section className="grid grid-cols-4 gap-3">
          {moods.map((item) => {
            const Icon = item.icon
            const active = mood === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMood(item.id)}
                className="group flex flex-col items-center gap-2"
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full transition-all duration-200"
                  style={{
                    backgroundColor: active ? item.activeBg : "#EFF4F6",
                    boxShadow: active ? `0 0 0 4px ${item.activeBg}33` : "none",
                  }}
                >
                  <Icon
                    className="h-5 w-5 transition-colors duration-200"
                    style={{ color: active ? item.activeIcon : "#AAB3B6" }}
                  />
                </div>
                <span className="font-body text-[10px] font-bold" style={{ color: active ? "#485058" : "#AAB3B6" }}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </section>

        {/* 함께한 사람 */}
        <section className="flex flex-col gap-3">
          <h3 className="font-body text-[14px] font-bold text-mb-dark">Who were you with?</h3>
          <div className="flex rounded-full bg-[#EFF4F6] p-1">
            <button
              type="button"
              onClick={() => setWithWho("solo")}
              className="h-11 flex-1 rounded-full text-[14px] font-semibold transition-all duration-200"
              style={{
                background: withWho === "solo" ? "#7CC4D8" : "transparent",
                color: withWho === "solo" ? "#FFFFFF" : "#AAB3B6",
              }}
            >
              Solo
            </button>
            <button
              type="button"
              onClick={() => setWithWho("together")}
              className="h-11 flex-1 rounded-full text-[14px] font-semibold transition-all duration-200"
              style={{
                background: withWho === "together" ? "#7CC4D8" : "transparent",
                color: withWho === "together" ? "#FFFFFF" : "#AAB3B6",
              }}
            >
              Together
            </button>
          </div>
        </section>

        {/* 날짜 */}
        <section>
          <button
            type="button"
            onClick={handleMemoryAtPick}
            className="flex w-full items-center justify-between rounded-xl border border-[#AAB3B61A] bg-white px-4 py-4 shadow-[0px_2px_8px_rgba(43,52,54,0.02)]"
          >
            <div className="flex items-center gap-3">
              <Clock3 className="h-4 w-4 text-[#AAB3B6]" />
              <span className="text-[14px] font-semibold text-mb-dark">{memoryAtText}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-[#AAB3B6]" />
          </button>
          <input
            ref={datetimeInputRef}
            type="datetime-local"
            value={memoryAt}
            onChange={(e) => setMemoryAt(e.target.value)}
            className="sr-only"
          />
        </section>

        {/* 제목 */}
        <section>
          <input
            type="text"
            placeholder="Memory Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-semibold text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary"
          />
        </section>

        {/* 내용 */}
        <section>
          <textarea
            placeholder="Memory Content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-32 w-full resize-none rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-medium text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary"
          />
        </section>

        {/* 사진 */}
        <section>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#AAB3B633] bg-[#EFF4F64D] transition-colors duration-200 hover:bg-[#EFF4F6]"
          >
            {imagePreviewUrl ? (
              <Image src={imagePreviewUrl} alt="선택한 사진 미리보기" fill className="rounded-xl object-cover" unoptimized />
            ) : (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                  <ImagePlus className="h-5 w-5 text-[#737C7F]" />
                </div>
                <span className="text-[12px] font-semibold text-[#737C7F]">
                  {uploadStatus === "uploading" ? "사진 업로드 중..." : imageUrl ? "사진 업로드 완료" : "사진 추가하기 (선택)"}
                </span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
              setImagePreviewUrl(URL.createObjectURL(file))
              void handlePhotoUpload(file)
            }}
          />
        </section>

        {/* 위치 — 항상 노출되는 인라인 지도 */}
        <section className="flex flex-col gap-2">
          {/* 위치 레이블 + 초기화 */}
          <div className="flex items-center justify-between rounded-xl border border-[#AAB3B61A] bg-white px-4 py-4 shadow-[0px_2px_8px_rgba(43,52,54,0.02)]">
            <div className="flex min-w-0 items-center gap-3">
              <MapPinned
                className={`h-4 w-4 shrink-0 transition-colors duration-200 ${geoLoading ? "animate-pulse text-mb-primary" : "text-[#AAB3B6]"}`}
              />
              <span className="truncate text-[14px] font-semibold text-mb-dark">
                {geoLoading
                  ? "위치 가져오는 중..."
                  : locationLabel === ""
                    ? "지도를 탭하여 위치 선택"
                    : locationLabel}
              </span>
            </div>
            {locationLat !== null && locationLng !== null && !geoLoading && (
              <button
                type="button"
                onClick={handleClearLocation}
                className="ml-2 shrink-0 text-xs font-medium text-mb-muted transition-opacity hover:opacity-70"
              >
                초기화
              </button>
            )}
          </div>

          {/* 인라인 지도 컨테이너 */}
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
        {locationLat !== null && locationLng !== null ? (
          <section>
            <input
              type="text"
              placeholder="장소 별칭 입력 (예: 우리집, 회사)"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              className="w-full rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-semibold text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary"
            />
          </section>
        ) : null}

        {/* 저장 */}
        <section className="mt-2">
          <button
            type="button"
            onClick={() => void handleSaveMemory()}
            disabled={isSaving || uploadStatus === "uploading"}
            className="h-14 w-full rounded-full bg-gradient-to-br from-mb-primary to-mb-secondary font-heading text-[16px] font-semibold text-white shadow-[0px_8px_24px_rgba(124,196,216,0.3)] transition-transform duration-200 active:scale-[0.99] disabled:opacity-70"
          >
            {isSaving ? "저장 중..." : "기록하기"}
          </button>
        </section>
      </main>

      <BottomNavigation />
    </div>
  )
}
