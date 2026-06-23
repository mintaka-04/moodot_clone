import { Router, Response } from "express"
import { getPool } from "../db"
import { AuthRequest } from "../auth"

const router = Router()

// GET /collections — 전체 목록 (cover_memory, memory_count 포함)
router.get("/", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!

  try {
    const { rows } = await pool.query(
      `SELECT
         c.*,
         m.image_url AS cover_image_url,
         COUNT(cm.memory_id)::int AS memory_count
       FROM collections c
       LEFT JOIN memories m ON m.id = c.cover_memory_id
       LEFT JOIN collection_memories cm ON cm.collection_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id, m.image_url
       ORDER BY c.created_at DESC`,
      [userId],
    )

    const result = rows.map((row) => ({
      id: row.id,
      title: row.title,
      note: row.note,
      location: row.location,
      start_date: row.start_date,
      end_date: row.end_date,
      cover_memory_id: row.cover_memory_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      cover_memory: row.cover_image_url ? { image_url: row.cover_image_url } : null,
      memory_count: row.memory_count,
    }))

    res.json(result)
  } catch (err) {
    console.error("[collections] GET / error:", err)
    res.status(500).json({ error: "컬렉션 목록 조회 실패" })
  }
})

// GET /collections/available-memories — 컬렉션에 추가 가능한 memories
router.get("/available-memories", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const currentId = (req.query.current_collection_id as string) ?? null

  try {
    const { rows } = await pool.query(
      `SELECT id, title, image_url, emotion_id, with_whom, memory_at, place_name,
              text, text_ciphertext, text_iv, text_key_version,
              location_label, location_lat, location_lng
       FROM memories
       WHERE user_id = $1
         AND id NOT IN (
           SELECT memory_id FROM collection_memories
           WHERE ($2::uuid IS NULL OR collection_id != $2::uuid)
         )
       ORDER BY memory_at DESC`,
      [userId, currentId],
    )
    res.json(rows)
  } catch (err) {
    console.error("[collections] GET /available-memories error:", err)
    res.status(500).json({ error: "사용 가능한 기록 조회 실패" })
  }
})

// GET /collections/:id — 단건 + memories 목록
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const { id } = req.params

  try {
    const { rows: colRows } = await pool.query(
      `SELECT c.*, m.image_url AS cover_image_url
       FROM collections c
       LEFT JOIN memories m ON m.id = c.cover_memory_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    )

    if (colRows.length === 0) {
      res.status(404).json({ error: "컬렉션을 찾을 수 없습니다." })
      return
    }

    const col = colRows[0]

    const { rows: memRows } = await pool.query(
      `SELECT cm.position,
              m.id, m.title, m.image_url, m.emotion_id, m.with_whom, m.memory_at,
              m.place_name, m.location_label, m.location_lat, m.location_lng,
              m.text, m.text_ciphertext, m.text_iv, m.text_key_version
       FROM collection_memories cm
       JOIN memories m ON m.id = cm.memory_id
       WHERE cm.collection_id = $1
       ORDER BY cm.position ASC`,
      [id],
    )

    res.json({
      id: col.id,
      title: col.title,
      note: col.note,
      location: col.location,
      start_date: col.start_date,
      end_date: col.end_date,
      cover_memory_id: col.cover_memory_id,
      created_at: col.created_at,
      updated_at: col.updated_at,
      cover_memory: col.cover_image_url ? { image_url: col.cover_image_url } : null,
      memories: memRows,
    })
  } catch (err) {
    console.error("[collections] GET /:id error:", err)
    res.status(500).json({ error: "컬렉션 조회 실패" })
  }
})

// POST /collections
router.post("/", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const { title, note, location, start_date, end_date, cover_memory_id, memory_ids } = req.body

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const { rows } = await client.query(
      `INSERT INTO collections (user_id, title, note, location, start_date, end_date, cover_memory_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [userId, title, note ?? null, location ?? null, start_date ?? null, end_date ?? null, cover_memory_id ?? null],
    )
    const collectionId = rows[0].id

    if (memory_ids?.length > 0) {
      const values = (memory_ids as number[])
        .map((memId: number, i: number) => `($1, $${i + 2}, $${memory_ids.length + i + 2})`)
        .join(",")
      const positions = (memory_ids as number[]).map((_: number, i: number) => i)
      await client.query(
        `INSERT INTO collection_memories (collection_id, memory_id, position) VALUES ${values}`,
        [collectionId, ...memory_ids, ...positions],
      )
    }

    await client.query("COMMIT")
    res.status(201).json({ id: collectionId })
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("[collections] POST / error:", err)
    res.status(500).json({ error: "컬렉션 생성 실패" })
  } finally {
    client.release()
  }
})

// PUT /collections/:id
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const { id } = req.params
  const { title, note, location, start_date, end_date, cover_memory_id, memory_ids } = req.body

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const { rowCount } = await client.query(
      `UPDATE collections SET
         title=$1, note=$2, location=$3, start_date=$4, end_date=$5,
         cover_memory_id=$6, updated_at=NOW()
       WHERE id=$7 AND user_id=$8`,
      [title, note ?? null, location ?? null, start_date ?? null, end_date ?? null, cover_memory_id ?? null, id, userId],
    )

    if (!rowCount) {
      await client.query("ROLLBACK")
      res.status(404).json({ error: "컬렉션을 찾을 수 없습니다." })
      return
    }

    await client.query("DELETE FROM collection_memories WHERE collection_id = $1", [id])

    if (memory_ids?.length > 0) {
      const values = (memory_ids as number[])
        .map((memId: number, i: number) => `($1, $${i + 2}, $${memory_ids.length + i + 2})`)
        .join(",")
      const positions = (memory_ids as number[]).map((_: number, i: number) => i)
      await client.query(
        `INSERT INTO collection_memories (collection_id, memory_id, position) VALUES ${values}`,
        [id, ...memory_ids, ...positions],
      )
    }

    await client.query("COMMIT")
    res.status(204).send()
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("[collections] PUT /:id error:", err)
    res.status(500).json({ error: "컬렉션 수정 실패" })
  } finally {
    client.release()
  }
})

// DELETE /collections/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const pool = getPool()
  const userId = req.userId!
  const { id } = req.params

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM collections WHERE id = $1 AND user_id = $2",
      [id, userId],
    )

    if (!rowCount) {
      res.status(404).json({ error: "컬렉션을 찾을 수 없습니다." })
      return
    }

    res.status(204).send()
  } catch (err) {
    console.error("[collections] DELETE /:id error:", err)
    res.status(500).json({ error: "컬렉션 삭제 실패" })
  }
})

export default router
