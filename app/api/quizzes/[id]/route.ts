import { ScoringMode } from "@prisma/client";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const updateQuizSchema = z.object({
  title: z.string().min(3),
  questionIds: z.array(z.string()).min(1),
  shuffleQuestions: z.boolean().optional().default(false),
  shuffleOptions: z.boolean().optional().default(false),
  scoringMode: z.nativeEnum(ScoringMode).optional().default(ScoringMode.CLASSIC),
  initialBudget: z.number().int().min(0).max(1000000).optional().default(0),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateQuizSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid quiz payload");

  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) return badRequest("Quiz not found", 404);

  const uniqueIds = [...new Set(parsed.data.questionIds)];
  await prisma.$transaction([
    prisma.quizQuestion.deleteMany({ where: { quizId: id } }),
    prisma.quiz.update({
      where: { id },
      data: {
        title: parsed.data.title,
        scoringMode: parsed.data.scoringMode,
        initialBudget: parsed.data.scoringMode === ScoringMode.BUDGET ? parsed.data.initialBudget : 0,
        shuffleQuestions: parsed.data.shuffleQuestions,
        shuffleOptions: parsed.data.shuffleOptions,
      },
    }),
    prisma.quizQuestion.createMany({
      data: uniqueIds.map((questionId, idx) => ({ quizId: id, questionId, order: idx })),
    }),
  ]);

  const updated = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { include: { question: true }, orderBy: { order: "asc" } } },
  });

  return ok({ ok: true, quiz: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.quiz.delete({ where: { id } }).catch(() => null);
  return ok({ ok: true });
}
