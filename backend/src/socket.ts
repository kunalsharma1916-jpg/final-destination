import type { Server as HttpServer } from "http";
import { parse as parseCookie } from "cookie";
import { Server as SocketIOServer } from "socket.io";
import { verifyToken } from "./auth";
import { registerIo } from "./realtime";

function parseAllowedOrigins() {
  const defaults = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const fromEnv = (process.env.BACKEND_CORS_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set([...defaults, ...fromEnv])];
}

export function initSocketServer(httpServer: HttpServer) {
  const allowedOrigins = parseAllowedOrigins();
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    const bearerHeader = socket.handshake.headers.authorization;
    const bearerToken =
      typeof bearerHeader === "string" && bearerHeader.toLowerCase().startsWith("bearer ")
        ? bearerHeader.slice(7).trim()
        : null;
    const cookieToken = parseCookie(socket.handshake.headers.cookie || "").fd_admin_token;
    const handshakeToken =
      (typeof socket.handshake.auth?.token === "string" && socket.handshake.auth.token) ||
      bearerToken ||
      cookieToken ||
      null;

    socket.on("join_session", (sessionId: string) => {
      if (sessionId && typeof sessionId === "string") {
        socket.join(`session:${sessionId}`);
      }
    });

    socket.on("join_admin", (sessionId: string) => {
      if (!sessionId || typeof sessionId !== "string") return;
      if (!handshakeToken) return;
      const decoded = verifyToken(handshakeToken);
      if (!decoded || decoded.role !== "admin") return;
      socket.join(`admin:${sessionId}`);
      socket.join(`session:${sessionId}`);
    });
  });

  registerIo(io);
  return io;
}
