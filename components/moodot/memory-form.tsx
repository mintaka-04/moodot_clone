"use client"

import { useRef } from "react"
import {
  ChevronRight,
  Clock3,
  Frown,
  ImagePlus,
  Leaf,
  MapPinned,
  Meh,
  Smile,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { MemoryMap } from "@/components/moodot/memory-map"

export type MoodType = "good" | "bad" | "sad" | "calm"
export type WithType = "solo" | "together"
export type UploadStatus = "idle" | "uploading" | "success" | "failed"

export const EMOTION_ID_MAP: Record<MoodType, number> = {
  good: 1,
  bad: 2,
  sad: 3,
  calm: 4,
}

export const EMOTION_ID_REVERSE: Record<number, MoodType> = {
  1: "good",
  2: "bad",
  3: "sad",
  4: "calm",
}

const moods: Array<{
  id: MoodType
  label: string
  icon: LucideIcon
  activeBg: string
  activeIcon: string
}> = [
  { id: "good", label: "Good", icon: Smile, activeBg: "#FFE8B8", activeIcon: "#8B6B23" },
  { id: "bad",  label: "Bad",  icon: Frown, activeBg: "#F8C8C8", activeIcon: "#A65E5E" },
  { id: "sad",  label: "Sad",  icon: Meh,   activeBg: "#B0E4F8", activeIcon: "#4A8BA6" },
  { id: "calm", label: "Calm", icon: Leaf,  activeBg: "#C0ECD8", activeIcon: "#4A8A6D" },
]

type MemoryFormProps = {
  mode: "create" | "edit"
  mood: MoodType
  onMoodChange: (mood: MoodType) => void
  withWho: WithType
  onWithWhoChange: (withWho: WithType) => void
  memoryAt: string
  onMemoryAtChange: (memoryAt: string) => void
  title: string
  onTitleChange: (title: string) => void
  text: string
  onTextChange: (text: string) => void
  imageUrl: string | null
  imagePreviewUrl: string | null
  uploadStatus: UploadStatus
  onPhotoSelected: (file: File) => void
  locationLabel: string
  locationLat: number | null
  locationLng: number | null
  placeName: string
  onPlaceNameChange: (placeName: string) => void
  geoLoading?: boolean
  onLocationSelect: (lat: number, lng: number) => void | Promise<void>
  onClearLocation: () => void
  isSaving: boolean
  onSave: () => void | Promise<void>
  onDelete?: () => void | Promise<void>
}

function formatMemoryAtText(memoryAt: string) {
  return memoryAt === ""
    ? "날짜와 시간을 선택하세요"
    : new Date(memoryAt).toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
}

export function MemoryForm({
  mode,
  mood,
  onMoodChange,
  withWho,
  onWithWhoChange,
  memoryAt,
  onMemoryAtChange,
  title,
  onTitleChange,
  text,
  onTextChange,
  imageUrl,
  imagePreviewUrl,
  uploadStatus,
  onPhotoSelected,
  locationLabel,
  locationLat,
  locationLng,
  placeName,
  onPlaceNameChange,
  geoLoading = false,
  onLocationSelect,
  onClearLocation,
  isSaving,
  onSave,
  onDelete,
}: MemoryFormProps) {
  const datetimeInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const memoryAtText = formatMemoryAtText(memoryAt)
  const hasLocation = locationLat !== null && locationLng !== null

  const handleMemoryAtPick = () => {
    const input = datetimeInputRef.current
    if (!input) return
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void }
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker()
      return
    }
    pickerInput.focus()
    pickerInput.click()
  }

  const photoText =
    mode === "create"
      ? uploadStatus === "uploading"
        ? "사진 업로드 중..."
        : imageUrl
          ? "사진 업로드 완료"
          : "사진 추가하기 (선택)"
      : uploadStatus === "uploading"
        ? "업로드 중..."
        : "사진 변경하기 (선택)"

  return (
    <>
      {mode === "create" && (
        <section>
          <h2 className="font-heading text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-mb-dark">
            오늘을 어떻게 기억하고 싶나요?
          </h2>
        </section>
      )}

      <section className="grid grid-cols-4 gap-3">
        {moods.map((item) => {
          const Icon = item.icon
          const active = mood === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onMoodChange(item.id)}
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

      <section className="flex flex-col gap-3">
        <h3 className="font-body text-[14px] font-bold text-mb-dark">Who were you with?</h3>
        <div className="flex rounded-full bg-[#EFF4F6] p-1">
          {(["solo", "together"] as WithType[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onWithWhoChange(value)}
              className="h-[29px] flex-1 rounded-full text-[14px] font-semibold transition-all duration-200"
              style={{
                background: withWho === value ? "#7CC4D8" : "transparent",
                color: withWho === value ? "#FFFFFF" : "#AAB3B6",
              }}
            >
              {value === "solo" ? "Solo" : "Together"}
            </button>
          ))}
        </div>
      </section>

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
          onChange={(event) => onMemoryAtChange(event.target.value)}
          className="sr-only"
        />
      </section>

      <section>
        <input
          type="text"
          placeholder="Memory Title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-semibold text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary"
        />
      </section>

      <section>
        <textarea
          placeholder="Memory Content"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          className="h-32 w-full resize-none rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-medium text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary"
        />
      </section>

      <section>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#AAB3B633] bg-[#EFF4F64D] transition-colors duration-200 hover:bg-[#EFF4F6]"
        >
          {imagePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreviewUrl}
              alt={mode === "create" ? "선택한 사진 미리보기" : "미리보기"}
              className="h-full w-full rounded-xl object-cover"
            />
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                <ImagePlus className="h-5 w-5 text-[#737C7F]" />
              </div>
              <span className="text-[12px] font-semibold text-[#737C7F]">{photoText}</span>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            onPhotoSelected(file)
          }}
        />
      </section>

      <section className="flex flex-col gap-2">
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
          {hasLocation && !geoLoading && (
            <button
              type="button"
              onClick={onClearLocation}
              className="ml-2 shrink-0 text-xs font-medium text-mb-muted transition-opacity hover:opacity-70"
            >
              초기화
            </button>
          )}
        </div>

        <div className="relative isolate h-48 overflow-hidden rounded-xl border border-[#AAB3B61A] bg-[#EFF4F6]">
          <MemoryMap lat={locationLat} lng={locationLng} onLocationSelect={onLocationSelect} />
        </div>
        <p className="text-[11px] text-mb-muted">지도를 탭하면 위치가 바로 변경됩니다.</p>
      </section>

      {hasLocation ? (
        <section>
          <input
            type="text"
            placeholder="장소 별칭 입력 (예: 우리집, 회사)"
            value={placeName}
            onChange={(event) => onPlaceNameChange(event.target.value)}
            className="w-full rounded-xl border border-[#AAB3B61A] bg-white px-5 py-4 text-[14px] font-semibold text-mb-dark placeholder:text-[#AAB3B6] shadow-[0px_2px_8px_rgba(43,52,54,0.02)] outline-none focus:ring-1 focus:ring-mb-primary"
          />
        </section>
      ) : null}

      <section className={mode === "edit" ? "mt-2 flex flex-col gap-3" : "mt-2"}>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={isSaving || uploadStatus === "uploading"}
          className="h-14 w-full rounded-full bg-gradient-to-br from-mb-primary to-mb-secondary font-heading text-[16px] font-semibold text-white shadow-[0px_8px_24px_rgba(124,196,216,0.3)] transition-transform duration-200 active:scale-[0.99] disabled:opacity-70"
        >
          {isSaving ? "저장 중..." : mode === "create" ? "기록하기" : "수정 완료"}
        </button>

        {onDelete ? (
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={isSaving}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#F8C8C8]/35 font-heading text-[16px] font-semibold text-[#A65E5E] transition-all duration-200 hover:bg-[#F8C8C8]/55 active:scale-[0.99] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            기록 삭제
          </button>
        ) : null}
      </section>
    </>
  )
}
