import { clearSessions } from "@/lib/auth";
import { ok } from "@/lib/http";
import { setApiAuthCookies } from "@/lib/api-auth";

export async function POST() {
  await clearSessions();
  const response = ok({ ok: true });
  setApiAuthCookies(response, { adminToken: null, participantToken: null });
  return response;
}
