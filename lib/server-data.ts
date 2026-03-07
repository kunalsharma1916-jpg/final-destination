import { requireAdminSession, requireTeamSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function getTeamContext() {
  if (!isSupabaseConfigured) return null;
  const session = await requireTeamSession();
  if (!session) return null;

  const db = getSupabaseAdmin();
  const [{ data: team, error: teamErr }, { data: eventState, error: stateErr }] = await Promise.all([
    db
      .from("teams")
      .select("id, team_name, budget, current_stage, is_active, last_submit_at")
      .eq("id", session.teamId)
      .single(),
    db.from("event_state").select("*").eq("id", 1).single(),
  ]);

  if (teamErr || stateErr || !team || !eventState) return null;

  const [{ data: stage }, { data: allStages }] = await Promise.all([
    db
      .from("stages")
      .select("stage_no, country, location_name, lat, lng, clue_text, hint_question, main_question")
      .eq("stage_no", team.current_stage)
      .single(),
    db.from("stages").select("stage_no, lat, lng, location_name").order("stage_no", { ascending: true }),
  ]);

  return { team, eventState, stage, stages: allStages ?? [] };
}

export async function assertAdmin() {
  const isAdmin = await requireAdminSession();
  if (!isAdmin) return null;
  if (!isSupabaseConfigured) return null;
  return getSupabaseAdmin();
}

export async function getPublicDisplayData() {
  if (!isSupabaseConfigured) {
    return {
      eventState: {
        is_live: false,
        freeze_leaderboard: false,
        global_stage_unlock: 1,
        hint_unlocked_stage: 0,
      },
      leaderboard: [],
      featuredStage: null,
      stageMarkers: [],
      recent: [],
    };
  }

  const db = getSupabaseAdmin();
  const [{ data: eventState }, { data: leaderboard }, { data: recent }, { data: stageMarkers }] = await Promise.all([
    db.from("event_state").select("*").eq("id", 1).single(),
    db.from("leaderboard_public").select("*").limit(10),
    db
      .from("submissions")
      .select("stage_no, answer_type, is_correct, delta, created_at, reverted, teams(team_name)")
      .in("answer_type", ["HINT", "MAIN"])
      .eq("reverted", false)
      .order("created_at", { ascending: false })
      .limit(10),
    db.from("stages").select("stage_no, lat, lng, location_name").order("stage_no", { ascending: true }),
  ]);

  const featured = eventState
    ? await db
        .from("stages")
        .select("stage_no, location_name, country, lat, lng")
        .eq("stage_no", eventState.global_stage_unlock)
        .single()
    : { data: null };

  return {
    eventState:
      eventState ?? {
        is_live: false,
        freeze_leaderboard: false,
        global_stage_unlock: 1,
        hint_unlocked_stage: 0,
      },
    leaderboard: leaderboard ?? [],
    featuredStage: featured.data,
    stageMarkers: stageMarkers ?? [],
    recent:
      recent?.map((item) => ({
        stage_no: item.stage_no,
        answer_type: item.answer_type,
        is_correct: item.is_correct,
        delta: item.delta,
        created_at: item.created_at,
        team_name: (item.teams as { team_name?: string } | null)?.team_name ?? "Unknown",
      })) ?? [],
  };
}
