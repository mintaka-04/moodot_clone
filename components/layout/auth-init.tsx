"use client"

import { useEffect } from "react"
import { getCurrentUser, signInAnonymously } from "@/lib/supabase/auth"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import logger from "@/lib/logger"

export function AuthInit() {
  useEffect(() => {
    const preAuthUid = localStorage.getItem("pre_auth_uid")

    getCurrentUser().then(async (user) => {
      const currentUid = user?.id ?? null

      logger.info("[AuthInit] getCurrentUser:", currentUid ?? "null", "| is_anonymous:", user?.is_anonymous ?? "-")
      logger.debug("[merge] pre_auth_uid:", preAuthUid ?? "null", "| current_uid:", currentUid ?? "null")

      if (!user) {
        if (preAuthUid) {
          // pre_auth_uid 있는데 세션 없음 = exchangeCodeForSession 실패
          // 새 익명 세션으로 덮으면 merge 기회가 사라지므로 스킵
          logger.warn("[AuthInit] pre_auth_uid 있음 + 세션 없음 → signInAnonymously 스킵 (OAuth exchange 실패 추정)")
          return
        }
        logger.info("[AuthInit] 세션 없음 → signInAnonymously 호출")
        await signInAnonymously()
        const after = await getCurrentUser()
        logger.info("[AuthInit] 익명 로그인 완료:", after?.id ?? "실패(null)")
        return
      }

      if (!preAuthUid) return

      if (preAuthUid === user.id) {
        logger.debug("[merge] skip: uid 동일")
        localStorage.removeItem("pre_auth_uid")
        return
      }

      // uid 변경됨 → 익명 데이터를 현재 계정으로 병합
      logger.debug("[merge] rpc called | anon_uid:", preAuthUid, "→ current_uid:", user.id)
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.rpc("merge_anonymous_to_current", {
        anon_user_id: preAuthUid,
      })

      if (error) {
        logger.error("[merge] rpc error:", error.code, error.message)
        // 실패 시 pre_auth_uid 유지 → 다음 로드에서 재시도
      } else {
        logger.debug("[merge] rpc success | anon_uid:", preAuthUid, "→ current_uid:", user.id)
        localStorage.removeItem("pre_auth_uid")
        // merge 완료 후 전체 페이지를 다시 로드해 최신 데이터를 반영한다.
        // merge와 데이터 fetching이 동시에 시작되므로 merge 전 상태가 화면에 남을 수 있다.
        window.location.reload()
      }
    })
  }, [])

  return null
}
