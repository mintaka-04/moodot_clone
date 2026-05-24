export const MEMORY_TEXT_MAX_LENGTH = 10_000
export const MEMORY_TITLE_MAX_LENGTH = 100
export const MEMORY_PLACE_NAME_MAX_LENGTH = 80
export const MEMORY_LOCATION_LABEL_MAX_LENGTH = 500

const ALLOWED_EMOTION_IDS = new Set([1, 2, 3, 4])
const ALLOWED_WITH_WHOM = new Set(["Solo", "Together"])

export type MemoryMutationInput = {
  title: string | null
  text: string | null
  image_url: string | null
  emotion_id: number
  with_whom: string
  memory_at: string | null
  location_lat: number | null
  location_lng: number | null
  location_label: string | null
  place_name: string | null
}

type ValidationResult =
  | { ok: true; value: MemoryMutationInput }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function optionalString(
  value: unknown,
  maxLength: number,
  tooLongMessage: string,
  invalidMessage: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== "string") return { ok: false, error: invalidMessage }
  if (value.length > maxLength) return { ok: false, error: tooLongMessage }
  return { ok: true, value }
}

function optionalCoordinate(
  value: unknown,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    return { ok: false, error: "위치 정보가 올바르지 않습니다." }
  }
  return { ok: true, value }
}

function optionalMemoryAt(
  value: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null }
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return { ok: false, error: "날짜 형식이 올바르지 않습니다." }
  }
  return { ok: true, value }
}

export function validateMemoryMutationInput(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: "요청 형식이 올바르지 않습니다." }
  }

  if (
    typeof input.emotion_id !== "number" ||
    !Number.isInteger(input.emotion_id) ||
    !ALLOWED_EMOTION_IDS.has(input.emotion_id)
  ) {
    return { ok: false, error: "지원하지 않는 감정 값입니다." }
  }

  if (typeof input.with_whom !== "string" || !ALLOWED_WITH_WHOM.has(input.with_whom)) {
    return { ok: false, error: "동행 여부가 올바르지 않습니다." }
  }

  const title = optionalString(
    input.title,
    MEMORY_TITLE_MAX_LENGTH,
    "제목은 100자 이하로 입력해 주세요.",
    "제목 형식이 올바르지 않습니다.",
  )
  if (!title.ok) return title

  const text = optionalString(
    input.text,
    MEMORY_TEXT_MAX_LENGTH,
    "본문은 10,000자 이하로 입력해 주세요.",
    "본문 형식이 올바르지 않습니다.",
  )
  if (!text.ok) return text

  const placeName = optionalString(
    input.place_name,
    MEMORY_PLACE_NAME_MAX_LENGTH,
    "장소 별칭은 80자 이하로 입력해 주세요.",
    "장소 별칭 형식이 올바르지 않습니다.",
  )
  if (!placeName.ok) return placeName

  const locationLabel = optionalString(
    input.location_label,
    MEMORY_LOCATION_LABEL_MAX_LENGTH,
    "위치 설명은 500자 이하로 입력해 주세요.",
    "위치 설명 형식이 올바르지 않습니다.",
  )
  if (!locationLabel.ok) return locationLabel

  const imageUrl = optionalString(
    input.image_url,
    2048,
    "이미지 경로가 너무 깁니다.",
    "이미지 경로가 올바르지 않습니다.",
  )
  if (!imageUrl.ok) return imageUrl

  const memoryAt = optionalMemoryAt(input.memory_at)
  if (!memoryAt.ok) return memoryAt

  const locationLat = optionalCoordinate(input.location_lat, -90, 90)
  if (!locationLat.ok) return locationLat

  const locationLng = optionalCoordinate(input.location_lng, -180, 180)
  if (!locationLng.ok) return locationLng

  return {
    ok: true,
    value: {
      title: title.value,
      text: text.value,
      image_url: imageUrl.value,
      emotion_id: input.emotion_id,
      with_whom: input.with_whom,
      memory_at: memoryAt.value,
      location_lat: locationLat.value,
      location_lng: locationLng.value,
      location_label: locationLabel.value,
      place_name: placeName.value,
    },
  }
}
