import { NextRequest } from "next/server";
import { z } from "zod";
import { assertAdmin } from "@/lib/server-data";
import { badRequest, ok } from "@/lib/http";

const schema = z.object({
  team_id: z.string().uuid(),
  is_active: z.boolean(),
});

export async function POST(req: NextRequest) {
  const db = await assertAdmin();
  if (!db) return badRequest("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  const { data, error } = await db.rpc("admin_set_team_active", {
    p_team_id: parsed.data.team_id,
    p_is_active: parsed.data.is_active,
  });

  if (error) return badRequest(error.message);

  return ok(data);
}
