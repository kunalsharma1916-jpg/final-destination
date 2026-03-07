import { ok } from "@/lib/http";
import { getPublicDisplayData } from "@/lib/server-data";

export async function GET() {
  try {
    const payload = await getPublicDisplayData();
    return ok({ ok: true, ...payload });
  } catch {
    return ok({
      ok: true,
      eventState: {
        is_live: false,
        freeze_leaderboard: false,
        global_stage_unlock: 1,
        hint_unlocked_stage: 0,
      },
      featuredStage: null,
      stageMarkers: [],
      leaderboard: [],
      recent: [],
    });
  }
}
