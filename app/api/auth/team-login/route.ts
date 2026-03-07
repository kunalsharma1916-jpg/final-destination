import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { setTeamSession } from "@/lib/auth";

const schema = z.object({
  team_code: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) {
    return badRequest("Server is not connected to Supabase yet", 503);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  try {
    const db = getSupabaseAdmin();
    const code = parsed.data.team_code.trim().toUpperCase();
    const { data, error } = await db
      .from("teams")
      .select("id, team_name, is_active")
      .eq("team_code", code)
      .single();

    if (error || !data) return badRequest("Invalid team code", 401);
    if (!data.is_active) return badRequest("Team is inactive", 403);

    await setTeamSession(data.id);
    return ok({ ok: true, team_name: data.team_name });
  } catch {
    return badRequest("Team login failed due to DB/network issue", 500);
  }
}
