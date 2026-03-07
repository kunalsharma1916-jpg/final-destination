import { NextRequest } from "next/server";
import { z } from "zod";
import { assertAdmin } from "@/lib/server-data";
import { badRequest, ok } from "@/lib/http";

const schema = z.object({
  is_live: z.boolean(),
  freeze_leaderboard: z.boolean(),
  global_stage_unlock: z.number().int().min(1),
  hint_unlocked_stage: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const db = await assertAdmin();
  if (!db) return badRequest("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  const { data, error } = await db.rpc("admin_update_event_state", {
    p_is_live: parsed.data.is_live,
    p_freeze_leaderboard: parsed.data.freeze_leaderboard,
    p_global_stage_unlock: parsed.data.global_stage_unlock,
    p_hint_unlocked_stage: parsed.data.hint_unlocked_stage,
  });

  if (error) return badRequest(error.message);
  return ok(data);
}
