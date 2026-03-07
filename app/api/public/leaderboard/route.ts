import { ok } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAnon } from "@/lib/supabase";

export async function GET() {
  if (!isSupabaseConfigured) {
    return ok({ ok: true, freeze_leaderboard: false, leaderboard: [] });
  }

  try {
    const db = getSupabaseAnon();
    const [{ data: leaderboard }, { data: state }] = await Promise.all([
      db.from("leaderboard_public").select("*").limit(10),
      db.from("event_state").select("freeze_leaderboard").eq("id", 1).single(),
    ]);

    return ok({
      ok: true,
      freeze_leaderboard: state?.freeze_leaderboard ?? false,
      leaderboard: leaderboard ?? [],
    });
  } catch {
    return ok({ ok: true, freeze_leaderboard: false, leaderboard: [] });
  }
}
