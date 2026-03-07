import { getSupabaseAdmin } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-slate-700 bg-panel/70 p-6">
        <h1 className="text-2xl font-bold">Health Check</h1>
        <p className="mt-3 text-lg">DB: NOT CONFIGURED</p>
        <p className="mt-2 text-sm text-slate-300">Set real Supabase env values in `.env.local`.</p>
      </div>
    );
  }

  let errorMessage: string | null = null;
  try {
    const db = getSupabaseAdmin();
    const { error } = await db.from("event_state").select("id").eq("id", 1).single();
    errorMessage = error?.message ?? null;
  } catch {
    errorMessage = "Database request timed out or failed";
  }

  return (
    <div className="mx-auto max-w-xl rounded-lg border border-slate-700 bg-panel/70 p-6">
      <h1 className="text-2xl font-bold">Health Check</h1>
      <p className="mt-3 text-lg">DB: {errorMessage ? "FAILED" : "OK"}</p>
      <p className="mt-2 text-sm text-slate-300">Checked at: {new Date().toISOString()}</p>
      {errorMessage && <p className="mt-2 text-sm text-danger">{errorMessage}</p>}
    </div>
  );
}
