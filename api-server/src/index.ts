import express from "express"
import { requireAuth } from "./auth"
import memoriesRouter from "./routes/memories"
import interventionsRouter from "./routes/interventions"
import collectionsRouter from "./routes/collections"
import feedbackRouter from "./routes/feedback"
import authRouter from "./routes/auth"
import eventsRouter from "./routes/events"

const app = express()
const PORT = parseInt(process.env.PORT ?? "8080", 10)

app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

app.use("/api/auth", requireAuth, authRouter)
app.use("/api/memories", requireAuth, memoriesRouter)
app.use("/api/interventions", requireAuth, interventionsRouter)
app.use("/api/collections", requireAuth, collectionsRouter)
app.use("/api/intervention-feedback", requireAuth, feedbackRouter)
app.post("/api/events/notify", eventsRouter)      // 내부 통신 — requireAuth 없음
app.use("/api/events", requireAuth, eventsRouter) // 브라우저 SSE 연결

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})
