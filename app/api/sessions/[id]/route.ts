import { badRequest, ok } from "@/lib/http";
import { getRouteLocations } from "@/lib/route-locations";
import {
  buildDestinationSnapshot,
  computeAnswerStats,
  computeLeaderboard,
  getSessionFull,
  toPublicQuestion,
  toSessionSnapshot,
} from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const teamCode = url.searchParams.get("teamCode")?.trim().toUpperCase() ?? null;

  let session = await getSessionFull(id);
  if (!session) return badRequest("Session not found", 404);
  const routeLocations = await getRouteLocations();

  const total = routeLocations.length > 0 ? routeLocations.length : Math.max(session.destinationCount, 1);
  const clampedIndex = Math.max(0, Math.min(session.destinationIndex, total - 1));
  if (session.destinationCount !== total || session.destinationIndex !== clampedIndex) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        destinationCount: total,
        destinationIndex: clampedIndex,
      },
    });
    const refreshed = await getSessionFull(id, { applyTimeoutClose: false });
    if (refreshed) session = refreshed;
  }

  const publicQuestion = toPublicQuestion(session);
  const currentQuestionId = session.quiz.questions[session.currentQuestionIndex]?.questionId ?? null;
  const [leaderboard, team, stats] = await Promise.all([
    computeLeaderboard(session.id),
    teamCode ? prisma.team.findUnique({ where: { code_sessionId: { code: teamCode, sessionId: session.id } } }) : null,
    currentQuestionId ? computeAnswerStats(session.id, currentQuestionId) : null,
  ]);

  let myAnswer = null;
  if (team && currentQuestionId) {
    myAnswer = await prisma.answer.findUnique({
      where: {
        sessionId_teamId_questionId: {
          sessionId: session.id,
          teamId: team.id,
          questionId: currentQuestionId,
        },
      },
      select: {
        optionId: true,
        answerText: true,
        isCorrect: true,
        pointsAwarded: true,
      },
    });
  }

  return ok({
    ok: true,
    session: toSessionSnapshot(session),
    destination: buildDestinationSnapshot(session, routeLocations),
    question: publicQuestion,
    leaderboard,
    stats,
    myAnswer,
  });
}
