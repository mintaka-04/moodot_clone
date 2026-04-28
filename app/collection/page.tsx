"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus } from "lucide-react"
import { TopAppBar } from "@/components/moodot/top-app-bar"
import { BottomNavigation } from "@/components/moodot/bottom-navigation"
import { CollectionCard } from "@/components/moodot/collection-card"
import { getCollections, type CollectionSummary } from "@/lib/services/collection"
import logger from "@/lib/logger"

export default function CollectionPage() {
  const router = useRouter()
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [searchText, setSearchText] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  function load() {
    setIsLoading(true)
    setErrorMessage("")
    getCollections()
      .then(setCollections)
      .catch((e) => {
        logger.error("[collection] load error:", e)
        setErrorMessage(
          e instanceof Error ? e.message : "컬렉션을 불러오지 못했습니다."
        )
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setErrorMessage("")
    getCollections()
      .then((data) => { if (mounted) setCollections(data) })
      .catch((e) => {
        logger.error("[collection] load error:", e)
        if (mounted)
          setErrorMessage(
            e instanceof Error ? e.message : "컬렉션을 불러오지 못했습니다."
          )
      })
      .finally(() => { if (mounted) setIsLoading(false) })
    return () => { mounted = false }
  }, [])

  const filtered =
    searchText.trim() === ""
      ? collections
      : collections.filter((c) => {
          const kw = searchText.toLowerCase()
          return (
            c.title.toLowerCase().includes(kw) ||
            (c.location ?? "").toLowerCase().includes(kw)
          )
        })

  const isEmpty = !isLoading && !errorMessage && collections.length === 0
  const noResults =
    !isLoading && !errorMessage && collections.length > 0 && filtered.length === 0

  return (
    <div className="min-h-screen bg-mb-bg relative">
      <TopAppBar />
      <main className="relative mx-auto max-w-[375px] px-5 pt-16 pb-32">
        <section className="pt-6">
          {/* 헤더 */}
          <div className="mb-5">
            <h1 className="font-heading text-[22px] font-bold text-mb-dark">
              컬렉션
            </h1>
            <p className="mt-1 font-body text-[13px] text-mb-muted">
              기억들을 하나의 이야기로 묶어보세요
            </p>
          </div>

          {/* 검색 */}
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mb-muted" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="제목 또는 위치로 검색..."
              className="h-14 w-full rounded-xl bg-mb-card pl-11 pr-4 font-body text-sm text-mb-dark outline-none transition-all duration-200 placeholder:text-mb-muted focus:ring-2 focus:ring-mb-accent-cyan/50"
            />
          </div>

          {/* 새 컬렉션 만들기 버튼 */}
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={() => router.push("/collection/new")}
              className="flex items-center justify-center gap-2 h-11 rounded-full bg-gradient-to-br from-mb-primary to-mb-secondary font-heading text-[14px] font-semibold text-white shadow-[0px_6px_20px_rgba(124,196,216,0.3)] transition-transform duration-200 active:scale-95"
              style={{ width: "80%" }}
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              새 컬렉션 만들기
            </button>
          </div>

          {/* 로딩 스켈레톤 */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-44 w-full animate-pulse rounded-2xl bg-mb-unselected"
                />
              ))}
            </div>
          )}

          {/* 에러 */}
          {!isLoading && errorMessage && (
            <div className="rounded-xl bg-red-50 px-5 py-6 text-center">
              <p className="font-body text-sm text-red-500">{errorMessage}</p>
              <button
                type="button"
                onClick={load}
                className="mt-3 font-body text-sm font-semibold text-mb-primary underline"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 전체 빈 상태 */}
          {isEmpty && (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-mb-accent via-mb-accent-mint to-mb-accent-cyan">
                <span className="text-2xl">🧵</span>
              </div>
              <p className="font-heading text-[16px] font-bold text-mb-dark">
                아직 컬렉션이 없습니다
              </p>
              <p className="mt-2 font-body text-sm text-mb-muted">
                여러 기억을 묶어 하나의 이야기를 만들어보세요
              </p>
            </div>
          )}

          {/* 검색 결과 없음 */}
          {noResults && (
            <p className="py-8 text-center font-body text-sm text-mb-muted">
              &quot;{searchText}&quot;에 대한 검색 결과가 없습니다.
            </p>
          )}

          {/* 컬렉션 목록 */}
          {!isLoading && !errorMessage && filtered.length > 0 && (
            <div className="space-y-4">
              {filtered.map((collection) => (
                <CollectionCard
                  key={collection.id}
                  collection={collection}
                  onClick={() => router.push(`/collection/${collection.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      <BottomNavigation />
    </div>
  )
}
