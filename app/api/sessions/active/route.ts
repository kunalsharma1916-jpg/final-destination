import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { SessionPhase } from "@prisma/client";

export async function GET() {
  try {
    const active = await prisma.session.findFirst({
      where: {
        phase: {
          in: [SessionPhase.LOBBY, SessionPhase.QUESTION_LIVE, SessionPhase.QUESTION_CLOSED, SessionPhase.REVEALED, SessionPhase.PAUSED],
        },
      },
      orderBy: { createdAt: "desc" },
      include: { quiz: true },
    });

    return ok({
      ok: true,
      session: active
        ? {
            id: active.id,
            name: active.name,
            status: active.status,
            phase: active.phase,
            quizTitle: active.quiz.title,
          }
        : null,
    });
  } catch {
    return ok({ ok: false, message: "Database unavailable", session: null }, 500);
  }
}
