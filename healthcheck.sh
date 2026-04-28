#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}  ✅ $1${NC}"; }
fail() { echo -e "${RED}  ❌ $1${NC}"; FAILED=1; }
warn() { echo -e "${YELLOW}  ⚠️  $1${NC}"; }
section() { echo -e "\n${CYAN}[ $1 ]${NC}"; }

FAILED=0
SERVER_STARTED=0

echo -e "${CYAN}==============================${NC}"
echo -e "${CYAN}  Next.js Health Check${NC}"
echo -e "${CYAN}==============================${NC}"

# ── 1. 환경변수 파일 확인 ─────────────────────────────────────────────────────
section "환경변수 파일"

ENV_FILE=".env.local"
if [ -f "$ENV_FILE" ]; then
  pass ".env.local 존재"
else
  fail ".env.local 없음 — 환경변수를 설정해주세요 (.env.example 참고)"
fi

# .env.local에서 값 읽는 헬퍼
get_env() {
  local key=$1
  local val
  val=$(grep -s "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  if [ -z "$val" ]; then
    val="${!key}"
  fi
  echo "$val"
}

# ── 2. 필수 환경변수 확인 ─────────────────────────────────────────────────────
section "필수 환경변수"

check_env() {
  local key=$1
  local val
  val=$(get_env "$key")
  if [ -n "$val" ]; then
    pass "${key}"
  else
    fail "${key} 누락"
  fi
}

check_env "NEXT_PUBLIC_SUPABASE_URL"

# ANON KEY: 두 가지 이름 모두 허용
ANON_KEY=$(get_env "NEXT_PUBLIC_SUPABASE_ANON_KEY")
if [ -z "$ANON_KEY" ]; then
  ANON_KEY=$(get_env "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
fi
if [ -n "$ANON_KEY" ]; then
  pass "NEXT_PUBLIC_SUPABASE_ANON_KEY"
else
  fail "NEXT_PUBLIC_SUPABASE_ANON_KEY 누락"
fi

check_env "MEMORY_TEXT_ENCRYPTION_KEY"

# ── 3. Supabase 연결 확인 ─────────────────────────────────────────────────────
section "Supabase 연결"

SUPABASE_URL=$(get_env "NEXT_PUBLIC_SUPABASE_URL")
if [ -n "$SUPABASE_URL" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${SUPABASE_URL}/rest/v1/" 2>/dev/null)
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
    pass "Supabase URL 응답 정상 (HTTP ${STATUS})"
  else
    fail "Supabase URL 응답 실패 (HTTP ${STATUS})"
  fi
else
  warn "SUPABASE_URL 없어서 연결 확인 스킵"
fi

# ── 4. 서버 확인 및 시작 ──────────────────────────────────────────────────────
section "Next.js 서버"

if lsof -i:3000 -t > /dev/null 2>&1; then
  pass "서버 이미 실행 중 (port 3000)"
else
  warn "서버가 없습니다. 임시로 시작합니다..."
  npm run dev > /tmp/nextjs-health.log 2>&1 &
  SERVER_PID=$!
  SERVER_STARTED=1

  echo "  서버 시작 대기 중..."
  READY=0
  for i in $(seq 1 40); do
    if curl -s -o /dev/null http://localhost:3000; then
      READY=1
      break
    fi
    sleep 1
  done

  if [ "$READY" = "1" ]; then
    pass "서버 시작 완료"
  else
    fail "서버 시작 타임아웃 (40초 초과)"
  fi
fi

# ── 5. API 라우트 확인 ────────────────────────────────────────────────────────
section "API 라우트"

check_api() {
  local name=$1
  local method=$2
  local url=$3
  local expected=$4
  local with_body=${5:-false}

  if [ "$with_body" = "true" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
      -X "$method" -H "Content-Type: application/json" -d '{}' "$url" 2>/dev/null)
  else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X "$method" "$url" 2>/dev/null)
  fi

  if [ "$STATUS" = "$expected" ]; then
    pass "${method} ${name} (HTTP ${STATUS})"
  else
    fail "${method} ${name} — 예상: ${expected}, 실제: ${STATUS}"
  fi
}

# 인증 없이 호출 → 401이 정상 (서버가 뜨고 라우팅이 동작한다는 의미)
check_api "/api/memories"       "GET"   "http://localhost:3000/api/memories"        "401"
check_api "/api/memories"       "POST"  "http://localhost:3000/api/memories"        "401" true
check_api "/api/memories/1"     "GET"   "http://localhost:3000/api/memories/1"      "401"
check_api "/api/memories/1"     "PATCH" "http://localhost:3000/api/memories/1"      "401" true
check_api "/api/memories/texts" "POST"  "http://localhost:3000/api/memories/texts"  "200" true

# ── 6. 임시 서버 종료 ─────────────────────────────────────────────────────────
if [ "$SERVER_STARTED" = "1" ]; then
  section "서버 종료"
  kill "$(lsof -t -i:3000)" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  pass "임시 서버 종료 완료"
fi

# ── 결과 ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}==============================${NC}"
if [ "$FAILED" = "0" ]; then
  echo -e "${GREEN}  모든 체크 통과 ✅${NC}"
else
  echo -e "${RED}  일부 체크 실패 ❌${NC}"
fi
echo -e "${CYAN}==============================${NC}"

exit $FAILED
