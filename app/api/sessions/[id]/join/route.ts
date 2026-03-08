import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readApiAuth } from "@/lib/api-auth";

const schema = z.object({
  teamCode: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/).optional(),
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

  let code = parsed.data.teamCode?.trim().toUpperCase() ?? "";
  if (!code) {
    const auth = readApiAuth(req);
    if (!auth || auth.role !== "participant") return badRequest("Participant authentication required", 401);
    const participant = await prisma.participantAccount.findUnique({
      where: { id: auth.sub },
      select: { teamCode: true, isActive: true },
    });
    if (!participant || !participant.isActive) return badRequest("Participant account is inactive", 401);
    code = participant.teamCode.trim().toUpperCase();
  }

  if (!code) return badRequest("Missing team code");

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
