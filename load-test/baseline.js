import http from "k6/http"
import { check, sleep } from "k6"
import { COOKIE_0, COOKIE_1 } from "./auth.js"

const BASE_URL = "https://moodot-clone-olive.vercel.app"
const COOKIE_NAME = "sb-yxhhwebeokldyruuguwj-auth-token"

export const options = {
  vus: 1,
  iterations: 1,
}

export function setup() {
  console.log(`🚀 베이스라인 시작: ${new Date().toISOString()}`)
}

export function teardown() {
  console.log(`✅ 베이스라인 종료: ${new Date().toISOString()}`)
}

export default function () {
  const cookieHeader = `${COOKIE_NAME}.0=${COOKIE_0}; ${COOKIE_NAME}.1=${COOKIE_1}`

  const headers = {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  }

  // 1. 메모리 생성
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

  check(createRes, {
    "생성 200": (r) => r.status === 200,
  })

  if (createRes.status !== 200) {
    console.error(`생성 실패: ${createRes.status} ${createRes.body}`)
    return
  }

  const memoryId = createRes.json("id")

  // 2. 상세 조회
  const getRes = http.get(`${BASE_URL}/api/memories/${memoryId}`, { headers, tags: { name: "GET /api/memories/:id" } })

  check(getRes, {
    "조회 200": (r) => r.status === 200,
  })

  sleep(1)
}
