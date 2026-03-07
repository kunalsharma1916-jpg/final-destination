import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const createQuestionSchema = z.object({
  prompt: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  timeLimitSec: z.number().int().min(5).max(180).default(20),
  points: z.number().int().min(100).max(5000).default(1000),
  explanation: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const questions = await prisma.question.findMany({
      include: { options: true },
      orderBy: { createdAt: "desc" },
    });
    return ok({ ok: true, questions });
  } catch {
    return badRequest("Database unavailable. Run Prisma migrate and check DATABASE_URL.", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = createQuestionSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid question payload");
    if (parsed.data.correctOptionIndex >= parsed.data.options.length) {
      return badRequest("correctOptionIndex out of range");
    }

    const question = await prisma.question.create({
      data: {
        prompt: parsed.data.prompt,
        timeLimitSec: parsed.data.timeLimitSec,
        points: parsed.data.points,
        explanation: parsed.data.explanation ?? null,
        options: {
          create: parsed.data.options.map((text, idx) => ({
            text,
            isCorrect: idx === parsed.data.correctOptionIndex,
          })),
        },
      },
      include: { options: true },
    });

    return ok({ ok: true, question }, 201);
  } catch {
    return badRequest("Failed to create question. Check database connection.", 500);
  }
}
