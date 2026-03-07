import jwt from "jsonwebtoken";
import { parse as parseCookie } from "cookie";
import type { NextFunction, Request, Response } from "express";

type AuthRole = "admin" | "participant";

type AuthPayload = {
  sub: string;
  role: AuthRole;
  username?: string;
  teamCode?: string;
};

const TOKEN_TTL_SEC = 60 * 60 * 16;

const jwtSecret = (process.env.JWT_SECRET || process.env.SESSION_SECRET || "").trim() || "dev-session-secret-12345";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload | null;
    }
  }
}

function readCookies(req: Request) {
  const raw = req.headers.cookie;
  return raw ? parseCookie(raw) : {};
}

export function issueToken(payload: AuthPayload) {
  return jwt.sign(payload, jwtSecret, {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL_SEC,
  });
}

function extractBearer(req: Request) {
  const header = req.headers.authorization;
  if (!header) return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function extractToken(req: Request) {
  const bearer = extractBearer(req);
  if (bearer) return bearer;
  const cookies = readCookies(req);
  return cookies.fd_admin_token || cookies.fd_participant_token || null;
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as AuthPayload;
    if (!decoded || (decoded.role !== "admin" && decoded.role !== "participant")) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function setAuthCookies(res: Response, input: { adminToken?: string | null; participantToken?: string | null }) {
  const secure = process.env.NODE_ENV === "production";
  const opts = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_TTL_SEC * 1000,
  };

  if (input.adminToken !== undefined) {
    res.cookie("fd_admin_token", input.adminToken || "", {
      ...opts,
      maxAge: input.adminToken ? opts.maxAge : 0,
    });
  }
  if (input.participantToken !== undefined) {
    res.cookie("fd_participant_token", input.participantToken || "", {
      ...opts,
      maxAge: input.participantToken ? opts.maxAge : 0,
    });
  }
}

export function attachAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  req.auth = token ? verifyToken(token) : null;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.role !== "admin") {
    res.status(401).json({ ok: false, message: "Admin authentication required" });
    return;
  }
  next();
}

export function requireParticipant(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.role !== "participant") {
    res.status(401).json({ ok: false, message: "Participant authentication required" });
    return;
  }
  next();
}

export function getTokenTtlSec() {
  return TOKEN_TTL_SEC;
}
