import { Router, Response } from "express"
import { getPool } from "../db"
import { AuthRequest } from "../auth"

const router = Router()

const SELECT_COLUMNS = `
  id, title, text, text_ciphertext, text_iv, text_key_version,
  image_url, emotion_id, with_whom, memory_at, place_name,
  location_label, location_lat, location_lng
`

// GET /memories/ai-state — AI 처리 중 여부 확인 (최신 메모리 status 기반)
router.get("/ai-state", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!

  try {
    const { rows } = await pool.query(
      `SELECT status FROM memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId],
    )
    const status = rows[0]?.status ?? null
    const thinking = status === "pending" || status === "processing"
    res.json({ thinking })
  } catch (err) {
    console.error("[memories] GET /ai-state error:", err)
    res.status(500).json({ error: "상태 조회 실패" })
  }
})

// GET /memories
router.get("/", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0

  try {
    let query = `SELECT ${SELECT_COLUMNS} FROM memories WHERE user_id = $1 ORDER BY memory_at DESC`
    const params: unknown[] = [userId]

    if (limit && limit > 0) {
      query += ` LIMIT $2 OFFSET $3`
      params.push(limit, offset)
    }

    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (err) {
    console.error("[memories] GET / error:", err)
    res.status(500).json({ error: "메모리 목록 조회 실패" })
  }
})

// GET /memories/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const memoryId = parseInt(req.params.id, 10)

  if (!Number.isInteger(memoryId) || memoryId <= 0) {
    res.status(400).json({ error: "잘못된 메모리 ID입니다." })
    return
  }

  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS} FROM memories WHERE id = $1 AND user_id = $2`,
      [memoryId, userId],
    )

    if (rows.length === 0) {
      res.status(404).json({ error: "기록을 찾을 수 없습니다." })
      return
    }

    res.json(rows[0])
  } catch (err) {
    console.error("[memories] GET /:id error:", err)
    res.status(500).json({ error: "메모리 조회 실패" })
  }
})

// POST /memories
router.post("/", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const body = req.body

  try {
    const { rows } = await pool.query(
      `INSERT INTO memories
        (user_id, title, text, text_ciphertext, text_iv, text_key_version,
         image_url, emotion_id, with_whom, memory_at, place_name,
         location_label, location_lat, location_lng, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        userId,
        body.title ?? null,
        body.text ?? null,
        body.text_ciphertext ?? null,
        body.text_iv ?? null,
        body.text_key_version ?? null,
        body.image_url ?? null,
        body.emotion_id,
        body.with_whom ?? null,
        body.memory_at,
        body.place_name ?? null,
        body.location_label ?? null,
        body.location_lat ?? null,
        body.location_lng ?? null,
        body.status ?? "pending",
      ],
    )
    res.status(201).json({ id: rows[0].id })
  } catch (err) {
    console.error("[memories] POST / error:", err)
    res.status(500).json({ error: "메모리 저장 실패" })
  }
})

// PATCH /memories/:id
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const memoryId = parseInt(req.params.id, 10)

  if (!Number.isInteger(memoryId) || memoryId <= 0) {
    res.status(400).json({ error: "잘못된 메모리 ID입니다." })
    return
  }

  const body = req.body

  try {
    const { rowCount } = await pool.query(
      `UPDATE memories SET
        title = $1, text = $2, text_ciphertext = $3, text_iv = $4,
        text_key_version = $5, image_url = $6, emotion_id = $7,
        with_whom = $8, memory_at = $9, place_name = $10,
        location_label = $11, location_lat = $12, location_lng = $13,
        updated_at = NOW()
       WHERE id = $14 AND user_id = $15`,
      [
        body.title ?? null,
        body.text ?? null,
        body.text_ciphertext ?? null,
        body.text_iv ?? null,
        body.text_key_version ?? null,
        body.image_url ?? null,
        body.emotion_id,
        body.with_whom ?? null,
        body.memory_at,
        body.place_name ?? null,
        body.location_label ?? null,
        body.location_lat ?? null,
        body.location_lng ?? null,
        memoryId,
        userId,
      ],
    )

    if (!rowCount) {
      res.status(404).json({ error: "기록을 찾을 수 없습니다." })
      return
    }

    res.status(204).send()
  } catch (err) {
    console.error("[memories] PATCH /:id error:", err)
    res.status(500).json({ error: "메모리 수정 실패" })
  }
})

// DELETE /memories/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const memoryId = parseInt(req.params.id, 10)

  if (!Number.isInteger(memoryId) || memoryId <= 0) {
    res.status(400).json({ error: "잘못된 메모리 ID입니다." })
    return
  }

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM memories WHERE id = $1 AND user_id = $2",
      [memoryId, userId],
    )

    if (!rowCount) {
      res.status(404).json({ error: "기록을 찾을 수 없습니다." })
      return
    }

    res.status(204).send()
  } catch (err) {
    console.error("[memories] DELETE /:id error:", err)
    res.status(500).json({ error: "메모리 삭제 실패" })
  }
})

// POST /memories/texts — 암호화된 텍스트 일괄 조회 (복호화는 Next.js에서)
router.post("/texts", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const ids: number[] = (req.body.ids ?? [])
    .map((id: unknown) => Number(id))
    .filter((id: number) => Number.isInteger(id) && id > 0)

  if (ids.length === 0) {
    res.json({ texts: {} })
    return
  }

  try {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(",")
    const { rows } = await pool.query(
      `SELECT id, text, text_ciphertext, text_iv, text_key_version
       FROM memories WHERE user_id = $1 AND id IN (${placeholders})`,
      [userId, ...ids],
    )
    res.json({ rows })
  } catch (err) {
    console.error("[memories] POST /texts error:", err)
    res.status(500).json({ error: "텍스트 일괄 조회 실패" })
  }
})

export default router
