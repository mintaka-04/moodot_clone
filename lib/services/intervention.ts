import { getSupabaseBrowserClient } from "@/lib/supabase/client"

// ---------- Types ----------

export type Intervention = {
  id: string
  reason: string
  message: string
  status: "pending" | "shown" | "interacted" | "dismissed"
  message_type: "empathy" | "encouragement" | "checkin" | null
  created_at: string
}

// ---------- Functions ----------

export async function getLatestPendingIntervention(): Promise<Intervention | null> {
  const supabase = getSupabaseBrowserClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("interventions")
    .select("*")
    .eq("status", "pending")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  if (!data || data.length === 0) return null
  return data[0] as Intervention
}

export async function markInterventionAsShown(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from("interventions")
    .update({ status: "shown" })
    .eq("id", id)

  if (error) throw error
}

export async function markInterventionAsInteracted(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase
    .from("interventions")
    .update({ status: "interacted" })
    .eq("id", id)

  if (error) throw error
}

export async function submitFeedback(
  interventionId: string,
  explicitScore: 2 | -2
): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from("intervention_feedback")
    .insert({
      intervention_id: interventionId,
      user_id: user.id,
      explicit_score: explicitScore,
    })

  if (error) throw error
}
