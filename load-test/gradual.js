import http from "k6/http"
import { check, sleep } from "k6"
import { Trend } from "k6/metrics"
import { COOKIE_0, COOKIE_1 } from "./auth.js"

const BASE_URL = "https://moodot-clone-olive.vercel.app"
const COOKIE_NAME = "sb-yxhhwebeokldyruuguwj-auth-token"

const createDuration = new Trend("create_duration")
const getDuration = new Trend("get_duration")


export const options = {
  stages: [
    { duration: "30s", target: 10 },   // 단계 1 진입
    { duration: "3m",  target: 10 },   // 단계 1 유지
    { duration: "30s", target: 30 },   // 단계 2 진입
    { duration: "3m",  target: 30 },   // 단계 2 유지
    { duration: "30s", target: 50 },   // 단계 3 진입
    { duration: "3m",  target: 50 },   // 단계 3 유지
    { duration: "30s", target: 100 },  // 단계 4 진입
    { duration: "3m",  target: 100 },  // 단계 4 유지
    { duration: "30s", target: 0 },    // 종료
  ],
  thresholds: {
    http_req_duration: ["avg<2000", "p(95)<2340"],
    http_req_failed: ["rate<0.01"],
  },
}

export function setup() {
  console.log(`🚀 점진적 부하 테스트 시작: ${new Date().toISOString()}`)
}

export function teardown() {
  console.log(`✅ 점진적 부하 테스트 종료: ${new Date().toISOString()}`)
}

export default function () {
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
