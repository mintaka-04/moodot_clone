import http from "k6/http"
import { check, sleep } from "k6"
import { Trend } from "k6/metrics"
import { COOKIE_0, COOKIE_1 } from "./auth.js"

const BASE_URL = "https://moodot-clone-olive.vercel.app"
const COOKIE_NAME = "sb-yxhhwebeokldyruuguwj-auth-token"

const createDuration = new Trend("create_duration")
const getDuration = new Trend("get_duration")

const TARGET_VUS = 50
const RAMP_UP_S = 30
const HOLD_S = 30 * 60
const RAMP_DOWN_S = 30
const TOTAL_S = RAMP_UP_S + HOLD_S + RAMP_DOWN_S

export const options = {
  scenarios: {
    // 실제 부하 (50 VU까지 진입 → 30분 유지 → 종료)
    soak: {
      executor: "ramping-vus",
      exec: "loadTest",
      startVUs: 0,
      stages: [
        { duration: `${RAMP_UP_S}s`, target: TARGET_VUS },
        { duration: `${HOLD_S}s`, target: TARGET_VUS },
        { duration: `${RAMP_DOWN_S}s`, target: 0 },
      ],
    },
    // 목표 VU 도달 시점(유지 구간 진입)을 알리는 1회성 로그
    loadStartMarker: {
      executor: "shared-iterations",
      exec: "logLoadStart",
      vus: 1,
      iterations: 1,
      startTime: `${RAMP_UP_S}s`,
    },
    // 전체 테스트 구간 동안 1분마다 진행 상황 로그
    monitor: {
      executor: "constant-vus",
      exec: "logProgress",
      vus: 1,
      duration: `${TOTAL_S}s`,
      startTime: "0s",
    },
  },
  thresholds: {
    http_req_duration: ["avg<2040", "p(95)<2680"],
    http_req_failed: ["rate<0.01"],
  },
}

export function setup() {
  console.log(`🚀 Soak 테스트 시작 (목표 ${TARGET_VUS}VU, 유지 ${HOLD_S / 60}분): ${new Date().toISOString()}`)
  return { startTime: Date.now() }
}

export function teardown(data) {
  const elapsedMin = ((Date.now() - data.startTime) / 60000).toFixed(1)
  console.log(`✅ Soak 테스트 종료 (총 ${elapsedMin}분 경과): ${new Date().toISOString()}`)
}

export function logLoadStart() {
  console.log(`🔥 목표 부하(${TARGET_VUS} VU) 도달, 유지 구간 시작: ${new Date().toISOString()}`)
}

export function logProgress() {
  console.log(`⏱ 진행 중: ${new Date().toISOString()}`)
  sleep(60)
}

export function loadTest() {
  const cookieHeader = `${COOKIE_NAME}.0=${COOKIE_0}; ${COOKIE_NAME}.1=${COOKIE_1}`
  const headers = {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  }

  const payload = JSON.stringify({
    title: null,
    text: "부하 테스트 기록",
    image_url: null,
    emotion_id: 1,
    with_whom: "alone",
    memory_at: new Date().toISOString(),
    location_lat: 37.5665,
    location_lng: 126.9780,
    location_label: "서울특별시 중구",
    place_name: "서울시청",
  })

  const createRes = http.post(`${BASE_URL}/api/memories`, payload, { headers })
  createDuration.add(createRes.timings.duration)
  check(createRes, { "생성 200": (r) => r.status === 200 })

  if (createRes.status !== 200) {
    console.error(`생성 실패: ${createRes.status} ${createRes.body}`)
    sleep(1)
    return
  }

  const memoryId = createRes.json("id")

  const getRes = http.get(`${BASE_URL}/api/memories/${memoryId}`, { headers, tags: { name: "GET /api/memories/:id" } })
  getDuration.add(getRes.timings.duration)
  check(getRes, { "조회 200": (r) => r.status === 200 })

  sleep(1)
}
