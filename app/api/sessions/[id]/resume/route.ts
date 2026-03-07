import { SessionPhase } from "@prisma/client";
import { badRequest, ok } from "@/lib/http";
import { emitSessionUpdated } from "@/lib/quiz-realtime";
import { assertResumable, getSessionFull, phasePatch, toSessionSnapshot } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFull(id, { applyTimeoutClose: false });
  if (!session) return badRequest("Session not found", 404);

  try {
    assertResumable(session);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot resume session");
  }

  const restorePhase = session.pausedFromPhase ?? SessionPhase.LOBBY;
  const safeRestorePhase =
    restorePhase === SessionPhase.PAUSED || restorePhase === SessionPhase.ENDED || restorePhase === SessionPhase.DRAFT
      ? SessionPhase.LOBBY
      : restorePhase;
  const shouldResumeQuestion = safeRestorePhase === SessionPhase.QUESTION_LIVE;
  const hasRemaining = (session.pauseRemainingSec ?? 0) > 0;

  const resumedPhase = shouldResumeQuestion
    ? hasRemaining
      ? SessionPhase.QUESTION_LIVE
      : SessionPhase.QUESTION_CLOSED
    : safeRestorePhase;

  const endAt = resumedPhase === SessionPhase.QUESTION_LIVE ? new Date(Date.now() + (session.pauseRemainingSec ?? 0) * 1000) : null;
  const patch = phasePatch(resumedPhase);

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: SessionPhase.PAUSED,
    },
    data: {
      ...patch,
      questionEndAt: endAt,
      pauseRemainingSec: null,
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
