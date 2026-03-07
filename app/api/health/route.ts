import { ok, badRequest } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  if (!isSupabaseConfigured) {
    return badRequest("Supabase env is not configured", 503);
  }

  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from("event_state").select("id").eq("id", 1).single();
    if (error) return badRequest(`DB error: ${error.message}`, 500);
    return ok({ ok: true, db: "connected", checked_at: new Date().toISOString() });
  } catch {
    return badRequest("Database request timed out or failed", 500);
  }
}
