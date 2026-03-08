import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readApiAuth } from "@/lib/api-auth";

const updateSchema = z.object({
  displayName: z.string().trim().max(80).optional().nullable(),
  teamCode: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/).optional(),
  password: z.string().min(8).max(100).optional(),
  isActive: z.boolean().optional(),
});

function normalizeTeamCode(value: string) {
  return value.trim().toUpperCase();
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = readApiAuth(req);
  if (!auth || auth.role !== "admin") return badRequest("Admin authentication required", 401);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid participant payload");

  const updateData: Prisma.ParticipantAccountUpdateInput = {};
  if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName?.trim() || null;
  if (parsed.data.teamCode !== undefined) updateData.teamCode = normalizeTeamCode(parsed.data.teamCode);
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.password) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const participant = await prisma.participantAccount.update({
      where: { id },
      data: updateData,
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

    return ok({ ok: true, participant });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return badRequest("Participant not found", 404);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return badRequest("Username or team code already exists", 409);
    }
    return badRequest("Could not update participant", 500);
  }
}
