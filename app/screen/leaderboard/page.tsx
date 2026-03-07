"use client";

import { useEffect, useState } from "react";
import { QuizLeaderboardTable } from "@/components/quiz-leaderboard-table";
import { readJsonSafe } from "@/lib/client-response";
import { useSessionSocket } from "@/lib/use-session-socket";
import type { LeaderboardRow, SessionSnapshot } from "@/types/quiz";

export default function ScreenLeaderboardPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const { socket } = useSessionSocket(sessionId || "none");

  useEffect(() => {
    const fromUrl = new URL(window.location.href).searchParams.get("sessionId");
    if (fromUrl) {
      setSessionId(fromUrl);
      return;
    }
    const loadActive = async () => {
      const res = await fetch("/api/sessions/active", { cache: "no-store" });
      const payload = await readJsonSafe<{ session?: { id: string } | null }>(res);
      if (res.ok && payload.session?.id) setSessionId(payload.session.id);
    };
    void loadActive();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      const res = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
      const payload = await readJsonSafe<{ message?: string; leaderboard?: LeaderboardRow[]; session?: SessionSnapshot }>(res);
      if (!res.ok) {
        setMsg(payload.message ?? "Session not found");
        return;
      }
      setRows(payload.leaderboard ?? []);
      setSession(payload.session ?? null);
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!socket) return;
    const onLeaderboard = (payload: LeaderboardRow[]) => setRows(payload);
    const onSessionUpdated = (payload: SessionSnapshot) => setSession(payload);
    socket.on("leaderboard_updated", onLeaderboard);
    socket.on("session_updated", onSessionUpdated);
    return () => {
      socket.off("leaderboard_updated", onLeaderboard);
      socket.off("session_updated", onSessionUpdated);
    };
  }, [socket]);

  const metricLabel = session?.scoringMode === "BUDGET" ? "Budget" : "Points";

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h1 className="text-6xl font-black">Live {metricLabel} Board</h1>
        <p className="text-2xl text-slate-300">
          Session: {session?.name ?? sessionId ?? "-"}
        </p>
      </header>
      {msg && <p className="text-amber-300">{msg}</p>}
      <QuizLeaderboardTable rows={rows} large metricLabel={metricLabel} />
    </div>
  );
}
