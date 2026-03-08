import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readApiAuth } from "@/lib/api-auth";

const createSchema = z.object({
  username: z.string().trim().min(3).max(40),
  displayName: z.string().trim().max(80).optional().nullable(),
  teamCode: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(8).max(100),
  isActive: z.boolean().optional().default(true),
});

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTeamCode(value: string) {
  return value.trim().toUpperCase();
}

export async function GET(req: Request) {
  const auth = readApiAuth(req);
  if (!auth || auth.role !== "admin") return badRequest("Admin authentication required", 401);

  const participants = await prisma.participantAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      teamCode: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  return ok({ ok: true, participants });
}

export async function POST(req: Request) {
  const auth = readApiAuth(req);
  if (!auth || auth.role !== "admin") return badRequest("Admin authentication required", 401);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return badRequest(first?.message || "Invalid participant payload", 400, {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const participant = await prisma.participantAccount.create({
      data: {
        username: normalizeUsername(parsed.data.username),
        displayName: parsed.data.displayName?.trim() || null,
        teamCode: normalizeTeamCode(parsed.data.teamCode),
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
        isActive: parsed.data.isActive,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        teamCode: true,
        isActive: true,
        createdAt: true,
      },
    });

    return ok({ ok: true, participant }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return badRequest("Username or team code already exists", 409);
    }
    return badRequest("Could not create participant", 500);
  }
}
