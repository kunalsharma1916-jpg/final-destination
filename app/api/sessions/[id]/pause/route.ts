import { SessionPhase } from "@prisma/client";
import { badRequest, ok } from "@/lib/http";
import { emitSessionUpdated } from "@/lib/quiz-realtime";
import { assertPauseable, getSessionFull, phasePatch, toSessionSnapshot } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFull(id);
  if (!session) return badRequest("Session not found", 404);

  try {
    assertPauseable(session);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot pause session");
  }

  const remainingSec =
    session.phase === SessionPhase.QUESTION_LIVE && session.questionEndAt
      ? Math.max(0, Math.ceil((session.questionEndAt.getTime() - Date.now()) / 1000))
      : null;

  const patch = phasePatch(SessionPhase.PAUSED, session.phase);
  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: {
        in: [SessionPhase.LOBBY, SessionPhase.QUESTION_LIVE, SessionPhase.QUESTION_CLOSED, SessionPhase.REVEALED],
      },
    },
    data: {
      ...patch,
      pauseRemainingSec: remainingSec,
      questionEndAt: null,
    },
  });

  if (updatedCount.count === 0) {
    return badRequest("Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return badRequest("Session not found", 404);

  await emitSessionUpdated(id);
  return ok({ ok: true, session: toSessionSnapshot(updated) });
}
