import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"

import logger from "@/lib/logger"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  // redirect response를 먼저 만들고, 쿠키를 이 response에 직접 설정한다.
  // cookies() / cookieStore.set() 패턴은 NextResponse에 쿠키를 포함시키지 않는다.
  const response = NextResponse.redirect(new URL("/", origin))

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    try {
      await supabase.auth.exchangeCodeForSession(code)
      logger.info("[auth/callback] exchangeCodeForSession 완료")
    } catch (error) {
      logger.error("[auth/callback] exchangeCodeForSession error:", error)
    }
  }

  return response
}
