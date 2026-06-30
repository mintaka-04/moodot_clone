import express from "express"
import cors from "cors"
import { requireAuth } from "./auth"
import memoriesRouter from "./routes/memories"
import interventionsRouter from "./routes/interventions"
import collectionsRouter from "./routes/collections"
import feedbackRouter from "./routes/feedback"
import authRouter from "./routes/auth"

const app = express()
const PORT = parseInt(process.env.PORT ?? "8080", 10)

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error("Not allowed by CORS"))
    }
  },
  credentials: true,
}))

app.use(express.json())
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

app.use("/api/auth", requireAuth, authRouter)
app.use("/api/memories", requireAuth, memoriesRouter)
app.use("/api/interventions", requireAuth, interventionsRouter)
app.use("/api/collections", requireAuth, collectionsRouter)
app.use("/api/intervention-feedback", requireAuth, feedbackRouter)

app.listen(PORT, () => {
  console.log(`API server v2 running on port ${PORT}`)
})
