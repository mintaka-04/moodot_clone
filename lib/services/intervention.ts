// ---------- Types ----------

export type Intervention = {
  id: number
  reason: string
  message: string
  status: "pending" | "shown" | "interacted" | "dismissed"
  message_type: "empathy" | "encouragement" | "checkin" | null
  created_at: string
}

// ---------- Functions ----------

export async function getLatestPendingIntervention(): Promise<Intervention | null> {
  const res = await fetch("/api/interventions", { cache: "no-store" })
  if (!res.ok) return null
  return res.json() as Promise<Intervention | null>
}

export async function markInterventionAsShown(id: number): Promise<void> {
  await fetch(`/api/interventions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "shown" }),
  })
}

export async function markInterventionAsInteracted(id: number): Promise<void> {
  await fetch(`/api/interventions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "interacted" }),
  })
}

export async function submitFeedback(
  interventionId: number,
  explicitScore: 2 | -2,
): Promise<void> {
  await fetch("/api/intervention-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      intervention_id: interventionId,
      explicit_score: explicitScore,
    }),
  })
}
