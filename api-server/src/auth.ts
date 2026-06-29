import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export interface AuthRequest extends Request {
  userId?: string
  isAnonymous?: boolean
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "인증이 필요합니다." })
    return
  }

  const token = header.slice(7)
  const secret = process.env.SUPABASE_JWT_SECRET

  if (!secret) {
    res.status(500).json({ error: "JWT secret 미설정" })
    return
  }

  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload
    req.userId = payload.sub
    req.isAnonymous = payload.is_anonymous ?? false
    next()
  } catch (err) {
    console.error("[auth] jwt.verify failed:", err)
    res.status(401).json({ error: "유효하지 않은 토큰입니다." })
  }
}
