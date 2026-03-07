import { AnswerFormat, SessionPhase } from "@prisma/client";
import { badRequest, ok } from "@/lib/http";
import { emitAnswerStats, emitQuestionRevealed, emitSessionUpdated } from "@/lib/quiz-realtime";
import { assertRevealable, getCurrentQuizQuestion, getSessionFull, phasePatch, toSessionSnapshot } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFull(id);
  if (!session) return badRequest("Session not found", 404);

  try {
    assertRevealable(session);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Cannot reveal answer");
  }

  const current = getCurrentQuizQuestion(session);
  if (!current) return badRequest("No active question");

  let correctOptionId: string | null = null;
  if (current.question.answerFormat === AnswerFormat.MCQ) {
    const correctOption = current.question.options.find((opt) => opt.isCorrect);
    if (!correctOption) return badRequest("Correct option missing");
    correctOptionId = correctOption.id;
  }

  const patch = phasePatch(SessionPhase.REVEALED);
  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: { in: [SessionPhase.QUESTION_LIVE, SessionPhase.QUESTION_CLOSED] },
    },
    data: {
      ...patch,
      questionEndAt: new Date(),
      pauseRemainingSec: null,
    },
  });

  if (updatedCount.count === 0) {
    return badRequest("Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return badRequest("Session not found", 404);

  await Promise.all([
    emitSessionUpdated(id),
    emitQuestionRevealed(id, {
      correctOptionId,
      explanation: current.question.explanation ?? null,
    }),
    emitAnswerStats(id, current.questionId),
  ]);

  return ok({
    ok: true,
    session: toSessionSnapshot(updated),
    reveal: {
      correctOptionId,
      explanation: current.question.explanation ?? null,
    },
  });
}