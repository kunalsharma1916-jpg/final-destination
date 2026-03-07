import { AnswerFormat, Prisma, SessionPhase } from "@prisma/client";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { emitAnswerStats } from "@/lib/quiz-realtime";
import { assertAnswerable, getCurrentQuizQuestion, getPointsAwarded, getSessionFull } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

const answerSchema = z.object({
  teamCode: z.string().min(2).max(24),
  optionId: z.string().nullable().optional(),
  textAnswer: z.string().max(200).nullable().optional(),
});

function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  const session = await getSessionFull(id);
  if (!session) return badRequest("Session not found", 404);

  try {
    assertAnswerable(session);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Question is not answerable");
  }

  const current = getCurrentQuizQuestion(session);
  if (!current) return badRequest("Question not found", 404);

  const teamCode = parsed.data.teamCode.trim().toUpperCase();
  const team = await prisma.team.findUnique({
    where: {
      code_sessionId: {
        code: teamCode,
        sessionId: id,
      },
    },
  });
  if (!team) return badRequest("Team not joined in this session", 404);

  let selectedOption = null as (typeof current.question.options)[number] | null;
  let isCorrect = false;
  let answerText: string | null = null;

  if (current.question.answerFormat === AnswerFormat.MCQ) {
    if (!parsed.data.optionId) return badRequest("optionId is required for MCQ questions");
    selectedOption = current.question.options.find((o) => o.id === parsed.data.optionId) ?? null;
    if (!selectedOption) return badRequest("Invalid option selected");
    const correctOption = current.question.options.find((o) => o.isCorrect) ?? null;
    if (!correctOption) return badRequest("Question missing correct option");
    isCorrect = selectedOption.id === correctOption.id;
  } else {
    answerText = (parsed.data.textAnswer ?? "").trim();
    if (!current.question.acceptedAnswers?.trim()) {
      return badRequest("Hint question is missing accepted answers", 500);
    }
    const accepted = current.question.acceptedAnswers
      .split("|")
      .map((v) => normalizeAnswer(v))
      .filter((v) => v.length > 0);
    const normalizedInput = normalizeAnswer(answerText);
    isCorrect = normalizedInput.length > 0 && accepted.includes(normalizedInput);
  }

  try {
    const answer = await prisma.$transaction(async (tx) => {
      const liveSession = await tx.session.findUnique({
        where: { id: session.id },
        select: {
          phase: true,
          questionEndAt: true,
          currentQuestionIndex: true,
        },
      });
      if (!liveSession) throw new Error("Session not found");
      if (liveSession.phase !== SessionPhase.QUESTION_LIVE) {
        throw new Error("Question is not open for answers");
      }
      if (!liveSession.questionEndAt || liveSession.questionEndAt.getTime() <= Date.now()) {
        throw new Error("Time is up");
      }
      if (liveSession.currentQuestionIndex !== session.currentQuestionIndex) {
        throw new Error("Question changed. Refresh and retry.");
      }

      const answeredAt = new Date();
      const pointsAwarded = getPointsAwarded({
        scoringMode: session.scoringMode,
        questionKind: current.question.kind,
        isCorrect,
        base: current.question.points,
        timeLimitSec: current.question.timeLimitSec,
        endAt: liveSession.questionEndAt,
        answeredAt,
      });

      return tx.answer.create({
        data: {
          sessionId: session.id,
          teamId: team.id,
          questionId: current.question.id,
          optionId: selectedOption?.id ?? null,
          answerText,
          answeredAt,
          isCorrect,
          pointsAwarded,
        },
      });
    });

    await emitAnswerStats(session.id, current.question.id);
    return ok({
      ok: true,
      answer: {
        id: answer.id,
        isCorrect: answer.isCorrect,
        pointsAwarded: answer.pointsAwarded,
        answerText: answer.answerText,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return badRequest("Answer already submitted for this question", 409);
    }
    if (error instanceof Error) {
      return badRequest(error.message, 409);
    }
    return badRequest("Answer submission failed", 409);
  }
}