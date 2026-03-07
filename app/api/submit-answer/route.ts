import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireTeamSession } from "@/lib/auth";

const schema = z.object({
  answer_type: z.enum(["HINT", "MAIN"]),
  answer_raw: z.string().min(1).max(300),
});

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured) return badRequest("Server is not connected to Supabase yet", 503);

  const session = await requireTeamSession();
  if (!session) return badRequest("Not logged in", 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  try {
    const db = getSupabaseAdmin();
    const meta = {
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
      ua: req.headers.get("user-agent") ?? null,
    };

    const { data, error } = await db.rpc("submit_answer", {
      p_team_id: session.teamId,
      p_answer_type: parsed.data.answer_type,
      p_answer_raw: parsed.data.answer_raw,
      p_meta: meta,
    });

    if (error) {
      const message = error.message || "Submission rejected";
      if (message.toLowerCase().includes("rate limit")) {
        const { data: team } = await db
          .from("teams")
          .select("last_submit_at")
          .eq("id", session.teamId)
          .single();

        const retryAfter = team?.last_submit_at
          ? Math.max(1, 8 - Math.floor((Date.now() - new Date(team.last_submit_at).getTime()) / 1000))
          : 8;

        return badRequest(message, 429, { retry_after_seconds: retryAfter });
      }

      return badRequest(message, 400);
    }

    return ok(data);
  } catch {
    return badRequest("Submission failed due to DB/network issue", 500);
  }
}
