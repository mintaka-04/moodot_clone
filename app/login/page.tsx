"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { subscribeToAuth, signInWithGoogle } from "@/lib/supabase/auth"
import type { User } from "@supabase/supabase-js"
import logger from "@/lib/logger"

export default function LoginPage() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const isSignedIn = Boolean(user && !user.is_anonymous)
  const displayName = user?.user_metadata?.name ?? user?.email?.split("@")[0] ?? "사용자"

  useEffect(() => {
    return subscribeToAuth(setUser)
  }, [])

  // 이미 로그인된 상태면 홈으로 바로 이동
  useEffect(() => {
    if (isSignedIn) router.replace("/")
  }, [isSignedIn, router])

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
          <span className="text-sm font-medium text-mb-muted">로그인</span>
          <div className="h-9 w-9" />
        </div>

        <section className="flex flex-1 flex-col justify-center gap-7 py-8">
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-mb-accent via-mb-accent-mint to-mb-accent-cyan/80 shadow-[0_12px_30px_rgba(150,200,220,0.25)]">
              <Image
                src="/images/moodot-logo.png"
                alt="Moodot"
                width={72}
                height={72}
                className="h-14 w-auto"
                priority
              />
            </div>
            <div className="space-y-2">
              <p className="font-heading text-2xl font-semibold tracking-tight text-mb-dark">
                Moodot에 로그인하기
              </p>
              <p className="text-sm leading-6 text-mb-muted">
                감정 기록과 캘린더를 내 계정 기준으로 편하게 이어서 확인할 수 있어요.
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-mb-unselected/60 bg-white/90 p-5 shadow-[0_20px_50px_rgba(150,200,220,0.16)] backdrop-blur">
            {user === undefined ? (
              <div className="space-y-3">
                <div className="h-5 w-28 animate-pulse rounded-full bg-mb-card" />
                <div className="h-11 animate-pulse rounded-2xl bg-mb-card" />
                <div className="h-4 w-full animate-pulse rounded-full bg-mb-card/70" />
              </div>
            ) : isSignedIn ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl bg-mb-accent/15 px-4 py-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-mb-primary shadow-sm">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="space-y-1 text-left">
                    <p className="text-sm font-semibold text-mb-dark">
                      {displayName}님, 이미 로그인되어 있어요
                    </p>
                    <p className="text-xs leading-5 text-mb-muted">
                      홈으로 돌아가서 기록 작성이나 캘린더 확인을 바로 이어갈 수 있습니다.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => router.push("/")}
                  className="h-11 w-full rounded-2xl bg-mb-primary text-white hover:bg-mb-primary-dark"
                >
                  홈으로 돌아가기
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1 text-left">
                  <p className="text-sm font-semibold text-mb-dark">Google 계정으로 시작하기</p>
                  <p className="text-xs leading-5 text-mb-muted">
                    기록과 캘린더를 계정에 연결해두면 다른 기기에서도 같은 흐름으로 확인할 수 있어요.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setIsLoading(true)
                      await signInWithGoogle()
                    } catch (e) {
                      logger.error("[login] signInWithGoogle error:", e)
                      alert("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.")
                      setIsLoading(false)
                    }
                  }}
                  disabled={isLoading}
                  className="flex h-11 w-full items-center justify-center gap-3 rounded-2xl border border-[#dadce0] bg-white text-sm font-medium text-[#3c4043] transition-colors hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? (
                    <span className="text-sm text-mb-muted">연결 중...</span>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                        <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
                      </svg>
                      Google로 계속하기
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
