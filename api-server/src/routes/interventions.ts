import { Router, Response } from "express"
import { getPool } from "../db"
import { AuthRequest } from "../auth"

const router = Router()

// GET /interventions/pending — 최신 pending 1건
router.get("/pending", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!

  try {
    const { rows } = await pool.query(
      `SELECT id, reason, message, status, message_type, created_at
       FROM interventions
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    )

    res.json(rows[0] ?? null)
  } catch (err) {
    console.error("[interventions] GET /pending error:", err)
    res.status(500).json({ error: "개입 조회 실패" })
  }
})

// PATCH /interventions/:id — status 업데이트
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const { id } = req.params
  const { status } = req.body

  const allowed = ["shown", "interacted", "dismissed"]
  if (!allowed.includes(status)) {
    res.status(400).json({ error: "유효하지 않은 status 값입니다." })
    return
  }

  try {
    const { rowCount } = await pool.query(
      "UPDATE interventions SET status = $1 WHERE id = $2 AND user_id = $3",
      [status, id, userId],
    )

    if (!rowCount) {
      res.status(404).json({ error: "개입을 찾을 수 없습니다." })
      return
    }

    res.status(204).send()
  } catch (err) {
    console.error("[interventions] PATCH /:id error:", err)
    res.status(500).json({ error: "상태 업데이트 실패" })
  }
})

export default router
