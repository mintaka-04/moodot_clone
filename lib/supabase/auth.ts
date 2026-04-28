import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import logger from "@/lib/logger"

export async function signInAnonymously() {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.auth.signInAnonymously()
  if (error) logger.error("[auth] signInAnonymously error:", error)
}

export async function signInWithGoogle() {
  const supabase = getSupabaseBrowserClient()
  const redirectTo = `${window.location.origin}/auth/callback`

  const { data: { user } } = await supabase.auth.getUser()

  logger.debug(
    "[auth] signInWithGoogle | user.id:", user?.id ?? "null",
    "| is_anonymous:", user?.is_anonymous ?? "-"
  )

  // 익명 사용자인 경우 uid 저장 → 로그인 후 데이터 병합에 사용
  if (user?.is_anonymous) {
    localStorage.setItem("pre_auth_uid", user.id)
    logger.debug("[auth] pre_auth_uid 저장:", user.id)
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  })

  if (error) {
    logger.error("[auth] signInWithGoogle error:", error)
    localStorage.removeItem("pre_auth_uid")
    throw error
  }
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    logger.error("[auth] signOut error:", error)
    throw error
  }
}

export async function getCurrentUser() {
  try {
    const supabase = getSupabaseBrowserClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user ?? null
  } catch {
    return null
  }
}

/**
 * 컴포넌트에서 auth 상태를 실시간으로 구독합니다.
 * onAuthStateChange는 구독 즉시 현재 세션을 캐시에서 읽어 callback을 실행하므로
 * getUser()의 네트워크 요청 대기 없이 빠르게 초기 상태를 설정할 수 있습니다.
 *
 * @returns 구독 해제 함수 (useEffect cleanup에 사용)
 */
export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  const supabase = getSupabaseBrowserClient()
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
    callback(session?.user ?? null)
  })
  return () => subscription.unsubscribe()
}
