import { SessionPhase } from "@prisma/client";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { emitDestinationUpdated, emitSessionUpdated } from "@/lib/quiz-realtime";
import { getRouteLocations } from "@/lib/route-locations";
import { buildDestinationSnapshot, getSessionFull, toSessionSnapshot } from "@/lib/quiz-service";
import { prisma } from "@/lib/prisma";

const schema = z
  .object({
    action: z.enum(["next", "previous", "jump"]),
    locationNumber: z.coerce.number().int().positive().optional(),
  })
  .strict();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid destination payload");

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      phase: true,
      destinationIndex: true,
      destinationCount: true,
    },
  });
  if (!session) return badRequest("Session not found", 404);
  if (session.phase === SessionPhase.ENDED) return badRequest("Session has ended");

  const locations = await getRouteLocations();
  const total = locations.length > 0 ? locations.length : Math.max(session.destinationCount, 1);
  const currentIndex = clamp(session.destinationIndex, 0, total - 1);
  let targetIndex = currentIndex;

  if (parsed.data.action === "next") {
    if (currentIndex >= total - 1) return badRequest("Already at last location");
    targetIndex = currentIndex + 1;
  } else if (parsed.data.action === "previous") {
    if (currentIndex <= 0) return badRequest("Already at first location");
    targetIndex = currentIndex - 1;
  } else {
    const number = parsed.data.locationNumber;
    if (!number) return badRequest("locationNumber is required for jump");
    if (number < 1 || number > total) return badRequest(`locationNumber must be between 1 and ${total}`);
    targetIndex = number - 1;
  }

  if (targetIndex === currentIndex) {
    const unchangedSession = await getSessionFull(id, { applyTimeoutClose: false });
    if (!unchangedSession) return badRequest("Session not found", 404);
    return ok({
      ok: true,
      session: toSessionSnapshot(unchangedSession),
      destination: buildDestinationSnapshot(unchangedSession, locations),
    });
  }

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      destinationIndex: session.destinationIndex,
      phase: { not: SessionPhase.ENDED },
    },
    data: {
      destinationIndex: targetIndex,
      destinationCount: total,
    },
  });

  if (updatedCount.count === 0) {
    return badRequest("Destination changed concurrently. Refresh and retry.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return badRequest("Session not found", 404);

  await Promise.all([emitSessionUpdated(id), emitDestinationUpdated(id)]);
  return ok({
    ok: true,
    session: toSessionSnapshot(updated),
    destination: buildDestinationSnapshot(updated, locations),
  });
}
