import bcrypt from "bcryptjs";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { issueApiToken, setApiAuthCookies } from "@/lib/api-auth";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  const username = normalizeUsername(parsed.data.username);
  const participant = await prisma.participantAccount.findUnique({
    where: { username },
  });

  if (!participant || !participant.isActive) {
    return badRequest("Invalid credentials", 401);
  }

  const valid = await bcrypt.compare(parsed.data.password, participant.passwordHash);
  if (!valid) return badRequest("Invalid credentials", 401);

  await prisma.participantAccount.update({
    where: { id: participant.id },
    data: { lastLoginAt: new Date() },
  });

  const token = issueApiToken({
    sub: participant.id,
    role: "participant",
    username: participant.username,
    teamCode: participant.teamCode,
  });

  const response = ok({
    ok: true,
    token,
    participant: {
      id: participant.id,
      username: participant.username,
      displayName: participant.displayName,
      teamCode: participant.teamCode,
      isActive: participant.isActive,
    },
  });
  setApiAuthCookies(response, { participantToken: token });
  return response;
}
