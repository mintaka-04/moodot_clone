import { Router, Response } from "express"
import { getPool } from "../db"
import { AuthRequest } from "../auth"

const router = Router()

// POST /api/auth/merge — 익명 유저 데이터를 현재 계정으로 병합
router.post("/merge", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const currentUserId = req.userId!
  const { anon_user_id } = req.body

  if (!anon_user_id) {
    res.status(400).json({ error: "anon_user_id가 필요합니다." })
    return
  }

  if (anon_user_id === currentUserId) {
    res.status(200).json({ message: "동일한 유저입니다." })
    return
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await client.query("UPDATE memories SET user_id = $1 WHERE user_id = $2", [currentUserId, anon_user_id])
    await client.query("UPDATE collections SET user_id = $1 WHERE user_id = $2", [currentUserId, anon_user_id])
    await client.query("UPDATE interventions SET user_id = $1 WHERE user_id = $2", [currentUserId, anon_user_id])
    await client.query("UPDATE intervention_feedback SET user_id = $1 WHERE user_id = $2", [currentUserId, anon_user_id])

    await client.query("COMMIT")
    res.status(200).json({ message: "병합 완료" })
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("[auth/merge] error:", err)
    res.status(500).json({ error: "병합 실패" })
  } finally {
    client.release()
  }
})

export default router
