import { SessionPhase } from "@prisma/client";
import { badRequest, ok } from "@/lib/http";
import { emitDestinationUpdated, emitLeaderboard, emitSessionUpdated } from "@/lib/quiz-realtime";
import { getSessionFull, phasePatch, toSessionSnapshot } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFull(id);
  if (!session) return badRequest("Session not found", 404);
  if (session.phase === SessionPhase.ENDED) return badRequest("Session ended");
  if (session.phase !== SessionPhase.DRAFT && session.phase !== SessionPhase.LOBBY) {
    return badRequest("Session can only be started from draft or lobby");
  }

  const patch = phasePatch(SessionPhase.LOBBY);
  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: { in: [SessionPhase.DRAFT, SessionPhase.LOBBY] },
    },
    data: {
      ...patch,
      questionStartAt: null,
      questionEndAt: null,
      pauseRemainingSec: null,
      currentQuestionIndex: 0,
      destinationIndex: 0,
    },
  });

  if (updatedCount.count === 0) {
    return badRequest("Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return badRequest("Session not found", 404);

  await Promise.all([emitSessionUpdated(id), emitLeaderboard(id), emitDestinationUpdated(id)]);
  return ok({ ok: true, session: toSessionSnapshot(updated) });
}
