import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import https from "https"
import { createPublicKey } from "crypto"

export interface AuthRequest extends Request {
  userId?: string
  isAnonymous?: boolean
}

let cachedPublicKey: string | null = null

async function getPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey

  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) throw new Error("SUPABASE_URL 미설정")

  return new Promise((resolve, reject) => {
    https.get(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        try {
          const { keys } = JSON.parse(data)
          const key = createPublicKey({ key: keys[0], format: "jwk" })
          cachedPublicKey = key.export({ type: "spki", format: "pem" }) as string
          resolve(cachedPublicKey)
        } catch (e) {
          reject(e)
        }
      })
    }).on("error", reject)
  })
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "인증이 필요합니다." })
    return
  }

  const token = header.slice(7)

  try {
    const publicKey = await getPublicKey()
    const payload = jwt.verify(token, publicKey) as jwt.JwtPayload
    req.userId = payload.sub
    req.isAnonymous = payload.is_anonymous ?? false
    next()
  } catch (err) {
    console.error("[auth] jwt.verify failed:", err)
    res.status(401).json({ error: "유효하지 않은 토큰입니다." })
  }
}
