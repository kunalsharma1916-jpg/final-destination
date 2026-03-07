import { SessionPhase } from "@prisma/client";
import { badRequest, ok } from "@/lib/http";
import { emitQuestionStarted, emitSessionUpdated } from "@/lib/quiz-realtime";
import { assertLaunchable, getCurrentQuizQuestion, getSessionFull, phasePatch, toPublicQuestion, toSessionSnapshot } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFull(id);
  if (!session) return badRequest("Session not found", 404);

  try {
    assertLaunchable(session);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot launch question");
  }

  const current = getCurrentQuizQuestion(session);
  if (!current) return badRequest("Question unavailable", 404);
  const now = new Date();
  const endAt = new Date(now.getTime() + current.question.timeLimitSec * 1000);
  const patch = phasePatch(SessionPhase.QUESTION_LIVE);

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: SessionPhase.LOBBY,
    },
    data: {
      ...patch,
      questionStartAt: now,
      questionEndAt: endAt,
      pauseRemainingSec: null,
    },
  });
  if (updatedCount.count === 0) {
    return badRequest("Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return badRequest("Session not found", 404);

  await Promise.all([emitSessionUpdated(id), emitQuestionStarted(id)]);
  return ok({
    ok: true,
    session: toSessionSnapshot(updated),
    question: toPublicQuestion(updated),
  });
}
