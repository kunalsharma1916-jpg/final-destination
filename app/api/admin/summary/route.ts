import { assertAdmin } from "@/lib/server-data";
import { badRequest, ok } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/env";

export async function GET() {
  if (!isSupabaseConfigured) {
    return badRequest("Supabase env is not configured", 503);
  }

  const db = await assertAdmin();
  if (!db) return badRequest("Unauthorized", 401);

  try {
    const [{ data: eventState }, { data: teams }, { data: submissions }] = await Promise.all([
      db.from("event_state").select("*").eq("id", 1).single(),
      db
        .from("teams")
        .select("id, team_name, budget, current_stage, is_active, last_submit_at")
        .order("team_name", { ascending: true }),
      db
        .from("submissions")
        .select("id, stage_no, answer_type, is_correct, delta, created_at, reverted, meta, teams(team_name)")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    return ok({
      ok: true,
      event_state:
        eventState ?? {
          is_live: false,
          freeze_leaderboard: false,
          global_stage_unlock: 1,
          hint_unlocked_stage: 0,
        },
      teams: teams ?? [],
      submissions:
        submissions?.map((s) => ({
          id: s.id,
          stage_no: s.stage_no,
          answer_type: s.answer_type,
          is_correct: s.is_correct,
          delta: s.delta,
          created_at: s.created_at,
          reverted: s.reverted,
          meta: s.meta,
          team_name: (s.teams as { team_name?: string } | null)?.team_name ?? "Unknown",
        })) ?? [],
    });
  } catch {
    return badRequest("Admin summary failed due to DB/network issue", 500);
  }
}
