import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, ok } from "@/lib/http";
import { env } from "@/lib/env";
import { issueApiToken, setApiAuthCookies } from "@/lib/api-auth";

const schema = z.object({
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid payload");

  if (parsed.data.password !== env.ADMIN_PASSWORD) {
    return badRequest("Invalid admin password", 401);
  }

  const token = issueApiToken({
    sub: "admin",
    role: "admin",
  });

  const response = ok({ ok: true, token });
  setApiAuthCookies(response, { adminToken: token });
  return response;
}
