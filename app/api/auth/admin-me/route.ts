import { badRequest, ok } from "@/lib/http";
import { readApiAuth } from "@/lib/api-auth";

export async function GET(req: Request) {
  const auth = readApiAuth(req);
  if (!auth || auth.role !== "admin") {
    return badRequest("Admin authentication required", 401);
  }

  return ok({
    ok: true,
    admin: {
      role: "admin",
    },
  });
}
