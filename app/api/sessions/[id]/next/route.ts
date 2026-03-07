import { SessionPhase } from "@prisma/client";
import { badRequest, ok } from "@/lib/http";
import { emitLeaderboard, emitSessionUpdated } from "@/lib/quiz-realtime";
import { assertNextable, getSessionFull, phasePatch, toSessionSnapshot } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFull(id);
  if (!session) return badRequest("Session not found", 404);

  try {
    assertNextable(session);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot move to next question");
  }

  const nextIndex = session.currentQuestionIndex + 1;
  const hasMore = nextIndex < session.quiz.questions.length;
  const patch = hasMore ? phasePatch(SessionPhase.LOBBY) : phasePatch(SessionPhase.ENDED);

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: SessionPhase.REVEALED,
      currentQuestionIndex: session.currentQuestionIndex,
    },
    data: {
      ...patch,
      currentQuestionIndex: hasMore ? nextIndex : session.currentQuestionIndex,
      questionStartAt: null,
      questionEndAt: null,
      pauseRemainingSec: null,
    },
  });

  if (updatedCount.count === 0) {
    return badRequest("Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return badRequest("Session not found", 404);

  await Promise.all([emitSessionUpdated(id), emitLeaderboard(id)]);
  return ok({ ok: true, session: toSessionSnapshot(updated) });
}
