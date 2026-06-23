import { Router, Request, Response } from "express"
import { AuthRequest } from "../auth"

const router = Router()

// userId → SSE 응답 객체 맵
const clients = new Map<string, Response>()

// GET /api/events — 브라우저가 SSE 연결 오픈
router.get("/", (req: AuthRequest, res: Response) => {
  const userId = req.userId!

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  clients.set(userId, res)

  req.on("close", () => {
    clients.delete(userId)
  })
})

// POST /api/events/notify — AI 워커가 처리 완료 후 호출 (내부 통신)
router.post("/notify", (req: Request, res: Response) => {
  const { user_id, intervention_id } = req.body

  if (!user_id) {
    res.status(400).json({ error: "user_id가 필요합니다." })
    return
  }

  const client = clients.get(user_id)
  if (client) {
    const data = JSON.stringify({ intervention_id: intervention_id ?? null })
    client.write(`data: ${data}\n\n`)
  }

  res.json({ ok: true, delivered: !!client })
})

export { clients }
export default router
