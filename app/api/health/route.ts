import { ok, badRequest } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
    return ok({ ok: true, db: "connected", checked_at: new Date().toISOString() });
  } catch {
    return badRequest("Database request timed out or failed", 500);
  }
}
