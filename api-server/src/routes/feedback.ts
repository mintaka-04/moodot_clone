import { Router, Response } from "express"
import { getPool } from "../db"
import { AuthRequest } from "../auth"

const router = Router()

// POST /intervention-feedback
router.post("/", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const { intervention_id, explicit_score } = req.body

  if (req.isAnonymous) {
    res.status(403).json({ error: "로그인이 필요합니다." })
    return
  }

  if (!intervention_id) {
    res.status(400).json({ error: "intervention_id가 필요합니다." })
    return
  }

  if (explicit_score !== 2 && explicit_score !== -2) {
    res.status(400).json({ error: "explicit_score는 2 또는 -2여야 합니다." })
    return
  }

  try {
    await pool.query(
      `INSERT INTO intervention_feedback (intervention_id, user_id, explicit_score)
       VALUES ($1, $2, $3)`,
      [intervention_id, userId, explicit_score],
    )
    res.status(201).send()
  } catch (err) {
    console.error("[feedback] POST / error:", err)
    res.status(500).json({ error: "피드백 저장 실패" })
  }
})

export default router
