"use client"

import Link from "next/link"
import {
  ArrowLeft,
  CalendarDays,
  Info,
  LogOut,
  ShieldCheck,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { subscribeToAuth, signOut } from "@/lib/supabase/auth"
import type { User } from "@supabase/supabase-js"
import logger from "@/lib/logger"

export default function ProfilePage() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  const router = useRouter()

  useEffect(() => {
    return subscribeToAuth(setUser)
  }, [])

  const isSignedIn = Boolean(user && !user.is_anonymous)
  const displayName = user?.user_metadata?.name ?? user?.email?.split("@")[0] ?? "게스트"
  const avatarFallback = displayName.charAt(0).toUpperCase() || "G"
  const accountLabel = isSignedIn ? "Google 계정 연결됨" : "게스트 모드"
  const avatarUrl = user?.user_metadata?.avatar_url

  return (
    <main className="min-h-screen bg-gradient-to-b from-mb-bg via-white to-mb-accent/10 text-mb-dark">
      <div className="mx-auto flex min-h-screen max-w-[375px] flex-col px-5 py-8">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-mb-card/80 text-mb-muted hover:bg-mb-unselected"
            asChild
          >
            <Link href="/" aria-label="홈으로 돌아가기">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="text-sm font-medium text-mb-muted">프로필 및 설정</span>
          <div className="h-9 w-9" />
        </div>

        <section className="flex flex-1 flex-col gap-4 py-7">
          <div className="rounded-[28px] border border-mb-unselected/60 bg-white/90 p-5 shadow-[0_20px_50px_rgba(150,200,220,0.16)] backdrop-blur">
            {user === undefined ? (
              <div className="space-y-3">
                <div className="h-14 w-14 animate-pulse rounded-full bg-mb-card" />
                <div className="h-5 w-24 animate-pulse rounded-full bg-mb-card" />
                <div className="h-4 w-40 animate-pulse rounded-full bg-mb-card/70" />
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 ring-2 ring-mb-accent-mint/40">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                  <AvatarFallback className="bg-gradient-to-b from-mb-accent via-mb-accent-mint to-mb-accent-cyan font-heading font-semibold text-mb-dark">
                    {avatarFallback}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-mb-dark">{displayName}</p>
                  <p className="text-sm text-mb-muted">
                    {isSignedIn ? user?.email ?? "구글 계정으로 연결됨" : "아직 로그인하지 않았어요"}
                  </p>
                  <span className="inline-flex rounded-full bg-mb-accent-cyan/25 px-2.5 py-1 text-[11px] font-semibold text-mb-primary-dark">
                    {accountLabel}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-mb-unselected/60 bg-white/90 shadow-[0_20px_50px_rgba(150,200,220,0.16)] backdrop-blur divide-y divide-mb-unselected">
            <div className="flex items-start gap-3 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mb-accent/15 text-mb-primary">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-mb-dark">계정 상태</p>
                <p className="text-xs leading-5 text-mb-muted">
                  {isSignedIn
                    ? "이 계정으로 기록을 이어서 확인할 수 있어요."
                    : "로그인하면 기록을 계정 기준으로 관리할 수 있어요."}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mb-accent/15 text-mb-primary">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-mb-dark">기록 연결</p>
                <p className="text-xs leading-5 text-mb-muted">
                  작성한 기록은 캘린더에서 날짜별로 가볍게 확인할 수 있어요.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-mb-accent/15 text-mb-primary">
                <Info className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-mb-dark">앱 정보</p>
                <p className="text-xs leading-5 text-mb-muted">
                  Moodot 1.1 · 감정 기록을 가볍게 이어가는 공간
                </p>
              </div>
            </div>
          </div>

          {isSignedIn ? (
            <div className="space-y-2">
              {signOutError && (
                <p className="text-center text-xs text-red-400">
                  로그아웃에 실패했어요. 잠시 후 다시 시도해주세요.
                </p>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("로그아웃할까요?")) return
                  try {
                    setSignOutError(false)
                    setIsSigningOut(true)
                    await signOut()
                    router.push("/login")
                    router.refresh()
                  } catch (e) {
                    logger.error("[profile] signOut error:", e)
                    setSignOutError(true)
                    setIsSigningOut(false)
                  }
                }}
                disabled={isSigningOut}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white text-sm font-medium text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {isSigningOut ? "로그아웃 중..." : "로그아웃"}
              </button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => router.push("/login")}
              className="h-11 w-full rounded-2xl bg-mb-primary text-white hover:bg-mb-primary-dark"
            >
              로그인하러 가기
            </Button>
          )}
        </section>
      </div>
    </main>
  )
}
