import jwt from "jsonwebtoken";
import { parse as parseCookie } from "cookie";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export type ApiAuthRole = "admin" | "participant";

export type ApiAuthPayload = {
  sub: string;
  role: ApiAuthRole;
  username?: string;
  teamCode?: string;
};

const TOKEN_TTL_SEC = 60 * 60 * 16;
const jwtSecret = (process.env.JWT_SECRET || process.env.SESSION_SECRET || env.SESSION_SECRET).trim();
const secureCookie = process.env.NODE_ENV === "production";

function extractBearer(req: Request) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

function extractCookieToken(req: Request) {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const cookies = parseCookie(raw);
  return cookies.fd_admin_token || cookies.fd_participant_token || null;
}

export function issueApiToken(payload: ApiAuthPayload) {
  return jwt.sign(payload, jwtSecret, {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL_SEC,
  });
}

export function readApiAuth(req: Request): ApiAuthPayload | null {
  const token = extractBearer(req) || extractCookieToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as ApiAuthPayload;
    if (!decoded || (decoded.role !== "admin" && decoded.role !== "participant")) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function setApiAuthCookies(
  response: NextResponse,
  input: { adminToken?: string | null; participantToken?: string | null },
) {
  const base = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax" as const,
    path: "/",
  };

  if (input.adminToken !== undefined) {
    response.cookies.set("fd_admin_token", input.adminToken || "", {
      ...base,
      maxAge: input.adminToken ? TOKEN_TTL_SEC : 0,
    });
  }

  if (input.participantToken !== undefined) {
    response.cookies.set("fd_participant_token", input.participantToken || "", {
      ...base,
      maxAge: input.participantToken ? TOKEN_TTL_SEC : 0,
    });
  }
}
