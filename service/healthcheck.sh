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

echo -e "${CYAN}==============================${NC}"
echo -e "${CYAN}  Python Service Health Check${NC}"
echo -e "${CYAN}==============================${NC}"

# ── 1. 환경변수 파일 확인 ─────────────────────────────────────────────────────
section "환경변수 파일"

ENV_FILE=".env.local"
if [ -f "$ENV_FILE" ]; then
  pass ".env.local 존재"
else
  fail ".env.local 없음 — 환경변수를 설정해주세요 (.env.example 참고)"
fi

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

check_env "SUPABASE_URL"
check_env "SUPABASE_SERVICE_KEY"
check_env "MEMORY_TEXT_ENCRYPTION_KEY"
check_env "LLM_PROVIDER"

LLM_PROVIDER=$(get_env "LLM_PROVIDER")
if [ "$LLM_PROVIDER" = "openai" ]; then
  check_env "OPENAI_API_KEY"
  check_env "OPENAI_MODEL"
elif [ "$LLM_PROVIDER" = "ollama" ]; then
  check_env "OLLAMA_BASE_URL"
  check_env "OLLAMA_MODEL"
else
  warn "LLM_PROVIDER 값이 올바르지 않습니다 (openai 또는 ollama): ${LLM_PROVIDER}"
fi

# ── 3. Python 환경 확인 ───────────────────────────────────────────────────────
section "Python 환경"

if command -v python3 > /dev/null 2>&1; then
  PYTHON_VERSION=$(python3 --version 2>&1)
  pass "Python 설치 확인: ${PYTHON_VERSION}"
else
  fail "python3 없음"
fi

# 필수 패키지 확인
check_package() {
  local pkg=$1
  if python3 -c "import ${pkg}" 2>/dev/null; then
    pass "패키지 확인: ${pkg}"
  else
    fail "패키지 없음: ${pkg} (pip install ${pkg})"
  fi
}

check_package "supabase"
check_package "dotenv"

if [ "$LLM_PROVIDER" = "openai" ]; then
  check_package "openai"
fi

# ── 4. Supabase 연결 확인 ─────────────────────────────────────────────────────
section "Supabase 연결"

SUPABASE_URL=$(get_env "SUPABASE_URL")
SUPABASE_SERVICE_KEY=$(get_env "SUPABASE_SERVICE_KEY")

if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_KEY" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    "${SUPABASE_URL}/rest/v1/" 2>/dev/null)
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ]; then
    pass "Supabase 연결 정상 (HTTP ${STATUS})"
  else
    fail "Supabase 연결 실패 (HTTP ${STATUS})"
  fi

  # memories 테이블 접근 확인
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    "${SUPABASE_URL}/rest/v1/memories?limit=1" 2>/dev/null)
  if [ "$STATUS" = "200" ]; then
    pass "memories 테이블 접근 정상"
  else
    fail "memories 테이블 접근 실패 (HTTP ${STATUS}) — 스키마 확인 필요"
  fi
else
  warn "SUPABASE_URL 또는 SUPABASE_SERVICE_KEY 없어서 연결 확인 스킵"
fi

# ── 5. OpenAI 연결 확인 ───────────────────────────────────────────────────────
if [ "$LLM_PROVIDER" = "openai" ]; then
  section "OpenAI 연결"

  OPENAI_API_KEY=$(get_env "OPENAI_API_KEY")
  if [ -n "$OPENAI_API_KEY" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -H "Authorization: Bearer ${OPENAI_API_KEY}" \
      "https://api.openai.com/v1/models" 2>/dev/null)
    if [ "$STATUS" = "200" ]; then
      pass "OpenAI API 연결 정상"
    elif [ "$STATUS" = "401" ]; then
      fail "OpenAI API 키가 유효하지 않습니다"
    else
      fail "OpenAI API 연결 실패 (HTTP ${STATUS})"
    fi
  else
    warn "OPENAI_API_KEY 없어서 연결 확인 스킵"
  fi
fi

# ── 6. Ollama 연결 확인 ───────────────────────────────────────────────────────
if [ "$LLM_PROVIDER" = "ollama" ]; then
  section "Ollama 연결"

  OLLAMA_BASE_URL=$(get_env "OLLAMA_BASE_URL")
  if [ -n "$OLLAMA_BASE_URL" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
      "${OLLAMA_BASE_URL}/api/tags" 2>/dev/null)
    if [ "$STATUS" = "200" ]; then
      pass "Ollama 연결 정상"
    else
      fail "Ollama 연결 실패 (HTTP ${STATUS}) — Ollama가 실행 중인지 확인하세요"
    fi
  else
    warn "OLLAMA_BASE_URL 없어서 연결 확인 스킵"
  fi
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
