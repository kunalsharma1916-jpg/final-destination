import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const TEAM_COOKIE = "fd_team";
const ADMIN_COOKIE = "fd_admin";
const SESSION_TTL = 60 * 60 * 16;
const secret = new TextEncoder().encode(env.SESSION_SECRET);
const isSecureCookie = process.env.NODE_ENV === "production";

type TeamPayload = { teamId: string; type: "team" };
type AdminPayload = { type: "admin" };

async function sign(payload: TeamPayload | AdminPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(secret);
}

export async function setTeamSession(teamId: string) {
  const token = await sign({ teamId, type: "team" });
  const jar = await cookies();
  jar.set(TEAM_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookie,
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

export async function setAdminSession() {
  const token = await sign({ type: "admin" });
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookie,
    sameSite: "lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
}

export async function clearSessions() {
  const jar = await cookies();
  jar.delete(TEAM_COOKIE);
  jar.delete(ADMIN_COOKIE);
}

async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    const out = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return out.payload as T;
  } catch {
    return null;
  }
}

export async function requireTeamSession() {
  const jar = await cookies();
  const token = jar.get(TEAM_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken<TeamPayload>(token);
  if (!payload || payload.type !== "team") return null;
  return payload;
}

export async function requireAdminSession() {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const payload = await verifyToken<AdminPayload>(token);
  return Boolean(payload && payload.type === "admin");
}
