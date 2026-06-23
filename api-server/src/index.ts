import express from "express"
import { requireAuth } from "./auth"
import memoriesRouter from "./routes/memories"
import interventionsRouter from "./routes/interventions"
import collectionsRouter from "./routes/collections"
import feedbackRouter from "./routes/feedback"
import authRouter from "./routes/auth"

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

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})
