import { clearSessions } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  await clearSessions();
  return ok({ ok: true });
}
