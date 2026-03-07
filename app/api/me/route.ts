import { badRequest, ok } from "@/lib/http";
import { getTeamContext } from "@/lib/server-data";

export async function GET() {
  try {
    const context = await getTeamContext();
    if (!context) return badRequest("Not logged in", 401);

    return ok({
      ok: true,
      team: context.team,
      event_state: context.eventState,
      stage: context.stage,
      stages: context.stages,
    });
  } catch {
    return badRequest("Unable to load session data", 500);
  }
}
