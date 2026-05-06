"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Character } from "@/components/ai/character"
import {
  getLatestPendingIntervention,
  markInterventionAsShown,
  markInterventionAsInteracted,
  submitFeedback,
  type Intervention,
} from "@/lib/services/intervention"
import { getRecentMemories } from "@/lib/services/memory"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import logger from "@/lib/logger"

type BgScheme = { gradient: string; glow: string; border: string }

const EMOTION_BG: Record<number, BgScheme> = {
  1: { gradient: "linear-gradient(to bottom right, rgba(255,232,184,0.20), rgba(192,236,216,0.10), rgba(255,255,255,1))", glow: "rgba(255,232,184,0.50)", border: "rgba(255,232,184,0.25)" }, // good
  2: { gradient: "linear-gradient(to bottom right, rgba(248,200,200,0.20), rgba(248,200,200,0.10), rgba(255,255,255,1))", glow: "rgba(248,200,200,0.50)", border: "rgba(248,200,200,0.25)" }, // bad
  3: { gradient: "linear-gradient(to bottom right, rgba(176,228,248,0.20), rgba(176,228,248,0.10), rgba(255,255,255,1))", glow: "rgba(176,228,248,0.50)", border: "rgba(176,228,248,0.25)" }, // sad
  4: { gradient: "linear-gradient(to bottom right, rgba(255,232,184,0.20), rgba(192,236,216,0.12), rgba(255,255,255,1))", glow: "rgba(192,236,216,0.50)", border: "rgba(192,236,216,0.25)" }, // calm
}

const DEFAULT_BG: BgScheme = { gradient: "linear-gradient(to bottom right, rgba(180,200,230,0.14), rgba(180,200,230,0.07), rgba(255,255,255,1))", glow: "rgba(180,200,230,0.28)", border: "rgba(180,200,230,0.18)" }

const BUBBLES = [
  { left: "30%", delay: 0,   duration: 3.0 },
  { left: "55%", delay: 1.4, duration: 3.5 },
  { left: "68%", delay: 2.6, duration: 2.8 },
]

const EMOTION_BUBBLE_COLOR: Record<number, string> = {
  1: "#C4956A",
  2: "#C48B8B",
  3: "#6BAAC4",
  4: "#97B48B",
}
const DEFAULT_BUBBLE_COLOR = "#B8CADC"

type FeedbackVariant = {
  prompt: string
  positive: string
  negative: string
}

const FEEDBACK_VARIANTS: Record<string, [FeedbackVariant, FeedbackVariant]> = {
  empathy: [
    { prompt: "", positive: "비슷한 것 같아", negative: "조금 달라" },
    { prompt: "", positive: "맞는 편이야", negative: "다른 느낌이야" },
  ],
  encouragement: [
    { prompt: "", positive: "도움 됐어", negative: "잘 모르겠어" },
    { prompt: "", positive: "괜찮았어", negative: "지금은 아닌 것 같아" },
  ],
  checkin: [
    { prompt: "", positive: "괜찮았어", negative: "조금 뜬금없었어" },
    { prompt: "", positive: "이 정도 좋아", negative: "조금 줄여도 될 것 같아" },
  ],
}

const FEEDBACK_RESPONSES: Record<string, { positive: string; negative: string }> = {
  empathy:       { positive: "그럴 수도 있겠다 싶었어.", negative: "그렇게 느낄 수도 있겠다." },
  encouragement: { positive: "천천히 해도 괜찮아.", negative: "지금은 그런 얘기가 아닐 수도 있겠네." },
  checkin:       { positive: "그렇구나, 그렇게 지내고 있었네.", negative: "조금 어색했을 수도 있겠다." },
}

function FloatingBubbles({ color }: { color: string }) {
  return (
    <>
      {BUBBLES.map((b, i) => (
        <motion.span
          key={i}
          className="absolute bottom-[30%] text-2xl font-black pointer-events-none select-none"
          style={{ left: b.left, color }}
          animate={{ y: [0, -28, -52], opacity: [0, 0.6, 0] }}
          transition={{ duration: b.duration, delay: b.delay, repeat: Infinity, repeatDelay: 1.5, ease: "easeOut" }}
        >
          !
        </motion.span>
      ))}
    </>
  )
}

export function AIInsight() {
  const [showMessage, setShowMessage] = useState(false)
  const [intervention, setIntervention] = useState<Intervention | null>(null)
  const [latestEmotionId, setLatestEmotionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [feedbackGiven, setFeedbackGiven] = useState(false)
  const [feedbackResponse, setFeedbackResponse] = useState<string | null>(null)
  const [aiState, setAiState] = useState<"idle" | "thinking" | "has_message">("idle")

  // 초기 로드
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    getLatestPendingIntervention().then((data) => {
      if (data) {
        setIntervention(data)
        setAiState("has_message")
      }
    })

    // 최근 기록이 미처리 상태면 생각중
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("memories")
        .select("processed")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data }) => {
          if (data?.[0]?.processed === false) setAiState("thinking")
        })
    })

    getRecentMemories(1)
      .then((memories) => {
        setLatestEmotionId(memories[0]?.emotion_id ?? null)
      })
      .catch((e) => {
        logger.error("[ai-insight] load error:", e)
        setLatestEmotionId(null)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  // Realtime 구독 — memories INSERT/UPDATE + interventions INSERT
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    const memoriesChannel = supabase
      .channel("memories-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "memories" }, () => {
        setAiState("thinking")
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "memories" }, (payload) => {
        if (payload.new?.processed === true) {
          setAiState((prev) => prev === "thinking" ? "idle" : prev)
        }
      })
      .subscribe()

    const interventionsChannel = supabase
      .channel("interventions-insert")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "interventions" }, (payload) => {
        setIntervention(payload.new as Intervention)
        setAiState("has_message")
      })
      .subscribe()

    return () => {
      supabase.removeChannel(memoriesChannel)
      supabase.removeChannel(interventionsChannel)
    }
  }, [])

  const bg = (isLoading || latestEmotionId == null || !EMOTION_BG[latestEmotionId]) ? DEFAULT_BG : EMOTION_BG[latestEmotionId]

  const variantIdx = intervention?.id != null ? Number(intervention.id) % 2 : 0

  const handleCardClick = () => {
    if (!intervention) return
    if (showMessage) {
      setShowMessage(false)
      setAiState("idle")
      setTimeout(() => {
        setIntervention(null)
        setFeedbackGiven(false)
        setFeedbackResponse(null)
      }, 600)
    } else {
      setShowMessage(true)
      markInterventionAsShown(intervention.id)
    }
  }

  const handleFeedback = async (e: React.MouseEvent, score: 2 | -2) => {
    e.stopPropagation()
    if (!intervention) return
    const type = intervention.message_type ?? "checkin"
    const responses = FEEDBACK_RESPONSES[type] ?? FEEDBACK_RESPONSES.checkin
    setFeedbackResponse(score === 2 ? responses.positive : responses.negative)
    setFeedbackGiven(true)
    try {
      await submitFeedback(intervention.id, score)
      await markInterventionAsInteracted(intervention.id)
    } catch (err) {
      logger.error("[ai-insight] feedback save error:", err)
    }
  }

  return (
    <section className="pt-8">
      <div
        className="relative"
        style={{ perspective: "1000px" }}
        onClick={handleCardClick}
      >
        <motion.div
          className="relative w-full"
          animate={{ rotateY: showMessage ? 180 : 0 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* 앞면 — 캐릭터 */}
          <div
            className="relative overflow-hidden rounded-xl p-5 border transition-colors duration-700"
            style={{ background: bg.gradient, borderColor: bg.border, backfaceVisibility: "hidden" }}
          >
            <div
              className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl transition-colors duration-700"
              style={{ background: bg.glow }}
            />
            <div className="relative flex items-center justify-center h-[120px]">
              {!!intervention && (
                <FloatingBubbles
                  color={latestEmotionId != null ? (EMOTION_BUBBLE_COLOR[latestEmotionId] ?? DEFAULT_BUBBLE_COLOR) : DEFAULT_BUBBLE_COLOR}
                />
              )}
              <Character emotionId={latestEmotionId} hasMessage={aiState === "has_message"} isThinking={aiState === "thinking"} />
            </div>
          </div>

          {/* 뒷면 — 메시지 */}
          <div
            className="absolute inset-0 overflow-hidden rounded-xl p-5 border flex flex-col items-center justify-center gap-4 transition-colors duration-700"
            style={{ background: bg.gradient, borderColor: bg.border, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <div
              className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl"
              style={{ background: bg.glow }}
            />
            <p className="relative font-body text-sm text-mb-dark leading-relaxed text-center">
              {feedbackGiven ? feedbackResponse : intervention?.message}
            </p>
            {!feedbackGiven && intervention?.message_type && (() => {
              const variants = FEEDBACK_VARIANTS[intervention.message_type]
              const variant = variants?.[variantIdx] ?? variants?.[0]
              if (!variant) return null
              return (
                <div className="relative flex flex-col items-center gap-2 w-full">
                  {variant.prompt && <p className="font-body text-xs text-mb-dark/50 text-center">{variant.prompt}</p>}
                  <div className="flex gap-3">
                    <button
                      className="px-3 py-1 rounded-full text-xs font-body border transition-colors"
                      style={{ borderColor: bg.border, color: "var(--color-mb-dark)" }}
                      onClick={(e) => handleFeedback(e, 2)}
                    >
                      {variant.positive}
                    </button>
                    <button
                      className="px-3 py-1 rounded-full text-xs font-body border transition-colors"
                      style={{ borderColor: bg.border, color: "var(--color-mb-dark)" }}
                      onClick={(e) => handleFeedback(e, -2)}
                    >
                      {variant.negative}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
