import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  teamCode: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return badRequest("Session not found", 404);
  if (session.phase === "ENDED") return badRequest("Session has ended");
  if (session.phase === "DRAFT") return badRequest("Session has not started yet");

  const code = parsed.data.teamCode.trim().toUpperCase();
  const team = await prisma.team.upsert({
    where: {
      code_sessionId: {
        code,
        sessionId: id,
      },
    },
    update: {},
    create: {
      code,
      sessionId: id,
    },
  });

  return ok({
    ok: true,
    team: {
      id: team.id,
      code: team.code,
      sessionId: team.sessionId,
    },
  });
}
