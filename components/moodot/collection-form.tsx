"use client"

import { useState } from "react"
import {
  MapPin,
  CalendarDays,
  FileText,
  Star,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { MemoryPicker } from "@/components/moodot/memory-picker"
import { SignedImage } from "@/components/moodot/signed-image"
import type { CollectionFormInput } from "@/lib/services/collection"
import type { MemoryRow } from "@/lib/services/memory"
import logger from "@/lib/logger"

type Props = {
  /** 수정 모드일 때 기존 컬렉션 id (UUID) */
  collectionId?: string
  initialValues?: Partial<CollectionFormInput>
  /** 선택 가능한 Memory 목록 (현재 컬렉션 소속 포함, 다른 컬렉션 소속 제외) */
  availableMemories: MemoryRow[]
  onSave: (input: CollectionFormInput) => Promise<void>
  onDelete?: () => Promise<void>
}

export function CollectionForm({
  collectionId,
  initialValues,
  availableMemories,
  onSave,
  onDelete,
}: Props) {
  const isEdit = !!collectionId

  const [title, setTitle] = useState(initialValues?.title ?? "")
  const [location, setLocation] = useState(initialValues?.location ?? "")
  const [startDate, setStartDate] = useState(initialValues?.start_date ?? "")
  const [endDate, setEndDate] = useState(initialValues?.end_date ?? "")
  const [note, setNote] = useState(initialValues?.note ?? "")
  const [selectedIds, setSelectedIds] = useState<number[]>(
    initialValues?.memory_ids ?? []
  )
  const [coverMemoryId, setCoverMemoryId] = useState<number | null>(
    initialValues?.cover_memory_id ?? null
  )

  const [showMemoryPicker, setShowMemoryPicker] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // 기간 필터링된 메모리 목록
  const filteredMemories = availableMemories.filter((m) => {
    if (!startDate && !endDate) return true
    if (!m.memory_at) return true
    const memDate = m.memory_at.slice(0, 10)
    if (startDate && memDate < startDate) return false
    if (endDate && memDate > endDate) return false
    return true
  })

  function handleStartDateChange(val: string) {
    setStartDate(val)
    if (val) {
      const newIds = selectedIds.filter((id) => {
        const m = availableMemories.find((am) => am.id === id)
        if (!m?.memory_at) return true
        return m.memory_at.slice(0, 10) >= val
      })
      if (newIds.length !== selectedIds.length) handleSelectedChange(newIds)
    }
  }

  function handleEndDateChange(val: string) {
    setEndDate(val)
    if (val) {
      const newIds = selectedIds.filter((id) => {
        const m = availableMemories.find((am) => am.id === id)
        if (!m?.memory_at) return true
        return m.memory_at.slice(0, 10) <= val
      })
      if (newIds.length !== selectedIds.length) handleSelectedChange(newIds)
    }
  }
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // 대표 이미지 오버레이
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null)

  const canSave = title.trim().length > 0 && selectedIds.length > 0 && !isSaving

  // 대표 이미지 후보: 선택된 Memory 중 image_url이 있는 것
  const coverCandidates = availableMemories.filter(
    (m) => selectedIds.includes(m.id) && !!m.image_url
  )

  // 선택에서 제거된 경우 coverMemoryId 초기화
  const resolvedCoverMemoryId =
    coverMemoryId && selectedIds.includes(coverMemoryId) ? coverMemoryId : null

  function handleSelectedChange(ids: number[]) {
    setSelectedIds(ids)
    if (coverMemoryId && !ids.includes(coverMemoryId)) {
      setCoverMemoryId(null)
    }
  }

  function openOverlay(index: number) {
    setOverlayIndex(index)
  }

  function closeOverlay() {
    setOverlayIndex(null)
  }

  function overlayPrev() {
    if (overlayIndex === null) return
    setOverlayIndex((overlayIndex - 1 + coverCandidates.length) % coverCandidates.length)
  }

  function overlayNext() {
    if (overlayIndex === null) return
    setOverlayIndex((overlayIndex + 1) % coverCandidates.length)
  }

  function overlaySelect() {
    if (overlayIndex === null) return
    setCoverMemoryId(coverCandidates[overlayIndex].id)
    closeOverlay()
  }

  async function handleSave() {
    if (!canSave) return
    const resolvedEndDate =
      startDate && endDate && endDate < startDate ? startDate : endDate

    setIsSaving(true)
    setErrorMsg("")
    try {
      await onSave({
        title: title.trim(),
        location: location.trim() || null,
        start_date: startDate || null,
        end_date: resolvedEndDate || null,
        note: note.trim() || null,
        cover_memory_id: resolvedCoverMemoryId,
        memory_ids: selectedIds,
      })
    } catch (e) {
      logger.error("[collection-form] save error:", e)
      setErrorMsg(e instanceof Error ? e.message : "저장에 실패했습니다.")
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!onDelete) return
    setIsDeleting(true)
    setErrorMsg("")
    try {
      await onDelete()
    } catch (e) {
      logger.error("[collection-form] delete error:", e)
      setErrorMsg(e instanceof Error ? e.message : "삭제에 실패했습니다.")
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const overlayMemory = overlayIndex !== null ? coverCandidates[overlayIndex] : null

  return (
    <>
      <div className="space-y-5">
        {/* 제목 */}
        <div>
          <label className="mb-1.5 block font-heading text-[13px] font-semibold text-mb-dark/70">
            제목 <span className="text-mb-primary">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="이 컬렉션의 이름을 입력하세요"
            maxLength={60}
            className="h-12 w-full rounded-xl bg-mb-card px-4 font-body text-sm text-mb-dark outline-none transition-all duration-200 placeholder:text-mb-muted focus:ring-2 focus:ring-mb-primary/40"
          />
        </div>

        {/* 기간 */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 font-heading text-[12px] font-semibold text-mb-dark/60">
            <CalendarDays className="h-3.5 w-3.5" /> 기간
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="h-11 flex-1 rounded-xl bg-mb-card px-3 font-body text-sm text-mb-dark outline-none focus:ring-2 focus:ring-mb-primary/40"
            />
            <span className="font-body text-sm text-mb-muted">-</span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="h-11 flex-1 rounded-xl bg-mb-card px-3 font-body text-sm text-mb-dark outline-none focus:ring-2 focus:ring-mb-primary/40"
            />
          </div>
        </div>

        {/* 전체 메모 */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 font-heading text-[12px] font-semibold text-mb-dark/60">
            <FileText className="h-3.5 w-3.5" /> 전체 메모
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="이 컬렉션에 대한 메모를 남겨보세요..."
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-xl bg-mb-card px-4 py-3 font-body text-sm text-mb-dark outline-none transition-all duration-200 placeholder:text-mb-muted focus:ring-2 focus:ring-mb-primary/40"
          />
        </div>

        {/* 장소 */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 font-heading text-[12px] font-semibold text-mb-dark/60">
            <MapPin className="h-3.5 w-3.5" /> 장소
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="예: 이탈리아 로마"
            maxLength={80}
            className="h-11 w-full rounded-xl bg-mb-card px-4 font-body text-sm text-mb-dark outline-none transition-all duration-200 placeholder:text-mb-muted focus:ring-2 focus:ring-mb-primary/40"
          />
        </div>

        {/* 기록 선택 */}
        <div>
          <button
            type="button"
            onClick={() => setShowMemoryPicker((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-mb-card px-4 py-3 font-heading text-[13px] font-semibold text-mb-dark/70 transition-colors hover:bg-mb-unselected/60"
          >
            <span>
              기록 선택 <span className="text-mb-primary">*</span>
              {selectedIds.length > 0 && (
                <span className="ml-2 rounded-full bg-mb-primary/15 px-2 py-0.5 text-[11px] font-bold text-mb-primary">
                  {selectedIds.length}개 선택됨
                </span>
              )}
            </span>
          </button>
          {showMemoryPicker && (
            <div className="mt-2 rounded-xl bg-mb-unselected/30 p-3">
              {(startDate || endDate) && filteredMemories.length === 0 ? (
                <p className="py-4 text-center font-body text-sm text-mb-muted">
                  해당 기간에 해당하는 기록이 없습니다.
                </p>
              ) : (
                <MemoryPicker
                  memories={filteredMemories}
                  selectedIds={selectedIds}
                  onChange={handleSelectedChange}
                />
              )}
            </div>
          )}
        </div>

        {/* 대표 이미지 */}
        {coverCandidates.length > 0 && (
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-heading text-[12px] font-semibold text-mb-dark/60">
              <Star className="h-3.5 w-3.5" /> 대표 이미지
            </label>
            <div className="flex flex-wrap gap-2">
              {coverCandidates.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openOverlay(idx)}
                  className={cn(
                    "relative h-16 w-16 overflow-hidden rounded-xl border-2 transition-all duration-150",
                    resolvedCoverMemoryId === m.id
                      ? "border-mb-primary shadow-md"
                      : "border-transparent opacity-70 hover:opacity-100"
                  )}
                >
                  <SignedImage
                    path={m.image_url!}
                    alt={m.title ?? "memory"}
                    className="h-full w-full object-cover"
                  />
                  {resolvedCoverMemoryId === m.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-mb-primary/30">
                      <Star className="h-4 w-4 fill-white text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {errorMsg && (
          <p className="rounded-xl bg-red-50 px-4 py-3 font-body text-sm text-red-500">
            {errorMsg}
          </p>
        )}

        {/* 저장 버튼 */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={cn(
            "h-13 w-full rounded-2xl font-heading text-[15px] font-bold text-white transition-all duration-200",
            canSave
              ? "bg-gradient-to-br from-mb-primary to-mb-secondary shadow-[0px_6px_20px_rgba(124,196,216,0.3)] active:scale-95"
              : "bg-mb-muted/40 cursor-not-allowed"
          )}
        >
          {isSaving ? "저장 중..." : isEdit ? "수정 저장" : "컬렉션 만들기"}
        </button>

        {/* 삭제 버튼 (수정 모드) */}
        {isEdit && onDelete && (
          <>
            {showDeleteConfirm ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="mb-3 font-body text-sm text-red-600">
                  컬렉션을 삭제하면 되돌릴 수 없습니다. 포함된 기록들은
                  아카이브로 복귀됩니다.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 rounded-xl border border-mb-muted/30 bg-white py-2.5 font-body text-sm text-mb-dark"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 rounded-xl bg-red-500 py-2.5 font-body text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isDeleting ? "삭제 중..." : "삭제 확인"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-transparent py-3 font-body text-sm text-red-400 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                컬렉션 삭제
              </button>
            )}
          </>
        )}
      </div>

      {/* 대표 이미지 선택 오버레이 */}
      {overlayMemory && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black/90">
          {/* 상단 닫기 */}
          <div className="flex items-center justify-between px-5 pt-12 pb-4">
            <button
              type="button"
              onClick={closeOverlay}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="font-body text-sm text-white/60">
              {overlayIndex! + 1} / {coverCandidates.length}
            </span>
            <div className="w-9" />
          </div>

          {/* 이미지 + 좌우 화살표 */}
          <div className="relative flex flex-1 items-center justify-center px-4">
            {coverCandidates.length > 1 && (
              <button
                type="button"
                onClick={overlayPrev}
                className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
                aria-label="이전"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <div className="relative h-[60vw] max-h-[360px] w-full max-w-[360px] overflow-hidden rounded-2xl">
              <SignedImage
                path={overlayMemory.image_url!}
                alt={overlayMemory.title ?? "memory"}
                className="h-full w-full object-cover"
              />
            </div>

            {coverCandidates.length > 1 && (
              <button
                type="button"
                onClick={overlayNext}
                className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
                aria-label="다음"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* 타이틀 */}
          {overlayMemory.title && (
            <p className="px-6 pt-4 text-center font-heading text-[15px] font-semibold text-white/80">
              {overlayMemory.title}
            </p>
          )}

          {/* 선택 버튼 */}
          <div className="px-6 pb-12 pt-4">
            <button
              type="button"
              onClick={overlaySelect}
              className={cn(
                "h-13 w-full rounded-2xl font-heading text-[15px] font-bold transition-all duration-200",
                resolvedCoverMemoryId === overlayMemory.id
                  ? "bg-mb-primary/40 text-white"
                  : "bg-white text-mb-dark active:scale-95"
              )}
            >
              {resolvedCoverMemoryId === overlayMemory.id ? "✓ 대표 이미지로 선택됨" : "대표 이미지로 선택"}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
