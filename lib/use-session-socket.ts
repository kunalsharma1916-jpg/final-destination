"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveSocketBaseUrl() {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (socketUrl) return trimSlash(socketUrl);
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (backendUrl) return trimSlash(backendUrl);
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function readSocketToken() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("fd_admin_token") || localStorage.getItem("fd_participant_token");
  } catch {
    return null;
  }
}

export function useSessionSocket(sessionId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId || sessionId === "none") {
      setSocket(null);
      setConnected(false);
      return;
    }

    let mounted = true;
    let s: Socket | null = null;

    const connect = async () => {
      const baseUrl = resolveSocketBaseUrl();
      s = io(baseUrl, {
        path: "/socket.io",
        reconnection: true,
        transports: ["websocket", "polling"],
        auth: {
          token: readSocketToken(),
        },
      });

      s.on("connect", () => {
        if (!mounted) return;
        setConnected(true);
        s?.emit("join_session", sessionId);
      });

      s.on("disconnect", () => {
        if (mounted) setConnected(false);
      });

      if (mounted) setSocket(s);
    };

    void connect();

    return () => {
      mounted = false;
      s?.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [sessionId]);

  return useMemo(() => ({ socket, connected }), [socket, connected]);
}
