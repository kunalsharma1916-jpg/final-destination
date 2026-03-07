import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getRouteLocations } from "@/lib/route-locations";
import { phasePatch, toSessionSnapshot } from "@/lib/quiz-service";
import { SessionPhase } from "@prisma/client";

const createSessionSchema = z.object({
  quizId: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
});

export async function GET() {
  const sessions = await prisma.session.findMany({
    include: { quiz: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return ok({
    ok: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      phase: s.phase,
      questionState: s.questionState,
      currentQuestionIndex: s.currentQuestionIndex,
      scoringMode: s.scoringMode,
      initialBudget: s.initialBudget,
      createdAt: s.createdAt.toISOString(),
      quizTitle: s.quiz.title,
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  const quiz = await prisma.quiz.findUnique({
    where: { id: parsed.data.quizId },
    include: { questions: true },
  });
  if (!quiz) return badRequest("Quiz not found", 404);
  if (quiz.questions.length === 0) return badRequest("Quiz has no questions");

  const locations = await getRouteLocations();
  const destinationCount = locations.length > 0 ? locations.length : quiz.questions.length;
  const initialPhase = SessionPhase.DRAFT;

  const session = await prisma.session.create({
    data: {
      quizId: quiz.id,
      name: parsed.data.name?.trim() || null,
      scoringMode: quiz.scoringMode,
      initialBudget: quiz.initialBudget,
      ...phasePatch(initialPhase),
      destinationIndex: 0,
      destinationCount,
    },
    include: {
      quiz: {
        include: {
          questions: { include: { question: { include: { options: true } } }, orderBy: { order: "asc" } },
        },
      },
    },
  });

  return ok({ ok: true, session: toSessionSnapshot(session) }, 201);
}
