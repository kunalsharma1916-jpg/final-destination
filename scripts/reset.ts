import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { error: stateErr } = await db
    .from("event_state")
    .update({
      is_live: false,
      global_stage_unlock: 1,
      hint_unlocked_stage: 0,
      freeze_leaderboard: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (stateErr) throw stateErr;

  const { error: teamErr } = await db
    .from("teams")
    .update({ budget: 10000, current_stage: 1, last_submit_at: null, is_active: true });

  if (teamErr) throw teamErr;

  const { error: subErr } = await db.from("submissions").update({ reverted: true }).eq("reverted", false);
  if (subErr) throw subErr;

  console.log("Reset completed. All teams reset and submissions marked reverted=true.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
