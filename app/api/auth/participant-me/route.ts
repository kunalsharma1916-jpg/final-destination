import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readApiAuth, setApiAuthCookies } from "@/lib/api-auth";

export async function GET(req: Request) {
  const auth = readApiAuth(req);
  if (!auth || auth.role !== "participant") {
    return badRequest("Participant authentication required", 401);
  }

  const participant = await prisma.participantAccount.findUnique({
    where: { id: auth.sub },
    select: {
      id: true,
      username: true,
      displayName: true,
      teamCode: true,
      isActive: true,
    },
  });

  if (!participant || !participant.isActive) {
    const response = badRequest("Participant not active", 401);
    setApiAuthCookies(response, { participantToken: null });
    return response;
  }

  return ok({ ok: true, participant });
}
