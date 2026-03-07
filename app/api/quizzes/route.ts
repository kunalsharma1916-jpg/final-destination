import { ScoringMode } from "@prisma/client";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createQuizSchema = z.object({
  title: z.string().min(3),
  questionIds: z.array(z.string()).min(1),
  shuffleQuestions: z.boolean().optional().default(false),
  shuffleOptions: z.boolean().optional().default(false),
  scoringMode: z.nativeEnum(ScoringMode).optional().default(ScoringMode.CLASSIC),
  initialBudget: z.number().int().min(0).max(1000000).optional().default(0),
});

export async function GET() {
  try {
    const quizzes = await prisma.quiz.findMany({
      include: {
        questions: {
          include: {
            question: {
              include: { options: true },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return ok({ ok: true, quizzes });
  } catch {
    return badRequest("Database unavailable while loading quizzes.", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = createQuizSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid quiz payload");

    const uniqueIds = [...new Set(parsed.data.questionIds)];
    const questionsFound = await prisma.question.count({
      where: { id: { in: uniqueIds } },
    });
    if (questionsFound !== uniqueIds.length) return badRequest("Some question IDs are invalid");

    const quiz = await prisma.quiz.create({
      data: {
        title: parsed.data.title,
        scoringMode: parsed.data.scoringMode,
        initialBudget: parsed.data.scoringMode === ScoringMode.BUDGET ? parsed.data.initialBudget : 0,
        shuffleQuestions: parsed.data.shuffleQuestions,
        shuffleOptions: parsed.data.shuffleOptions,
        questions: {
          create: uniqueIds.map((questionId, idx) => ({
            questionId,
            order: idx,
          })),
        },
      },
      include: {
        questions: {
          include: { question: { include: { options: true } } },
          orderBy: { order: "asc" },
        },
      },
    });

    return ok({ ok: true, quiz }, 201);
  } catch {
    return badRequest("Failed to create quiz. Check database connection.", 500);
  }
}
