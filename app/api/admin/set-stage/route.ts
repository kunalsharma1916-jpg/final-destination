import { NextRequest } from "next/server";
import { z } from "zod";
import { assertAdmin } from "@/lib/server-data";
import { badRequest, ok } from "@/lib/http";

const schema = z.object({
  team_id: z.string().uuid(),
  new_stage: z.number().int().min(1),
  reason: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const db = await assertAdmin();
  if (!db) return badRequest("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  const { data, error } = await db.rpc("admin_set_stage", {
    p_team_id: parsed.data.team_id,
    p_new_stage: parsed.data.new_stage,
    p_reason: parsed.data.reason,
  });

  if (error) return badRequest(error.message);
  return ok(data);
}
