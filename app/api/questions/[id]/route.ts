import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const updateQuestionSchema = z.object({
  prompt: z.string().min(3),
  options: z.array(z.object({ id: z.string().optional(), text: z.string().min(1) })).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  timeLimitSec: z.number().int().min(5).max(180).default(20),
  points: z.number().int().min(100).max(5000).default(1000),
  explanation: z.string().optional().nullable(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateQuestionSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid question payload");
  if (parsed.data.correctOptionIndex >= parsed.data.options.length) {
    return badRequest("correctOptionIndex out of range");
  }

  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return badRequest("Question not found", 404);

  await prisma.option.deleteMany({ where: { questionId: id } });
  const question = await prisma.question.update({
    where: { id },
    data: {
      prompt: parsed.data.prompt,
      timeLimitSec: parsed.data.timeLimitSec,
      points: parsed.data.points,
      explanation: parsed.data.explanation ?? null,
      options: {
        create: parsed.data.options.map((option, idx) => ({
          text: option.text,
          isCorrect: idx === parsed.data.correctOptionIndex,
        })),
      },
    },
    include: { options: true },
  });

  return ok({ ok: true, question });
}
