"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withAuthHeaders } from "@/lib/client-api";
import { readJsonSafe } from "@/lib/client-response";
import { useSessionSocket } from "@/lib/use-session-socket";
import type { SessionSnapshot } from "@/types/quiz";

export default function ParticipantLobbyPage({
  params,
}: {
  params: Promise<{ sessionId: string; teamCode: string }>;
}) {
  const router = useRouter();
  const [resolved, setResolved] = useState<{ sessionId: string; teamCode: string } | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const { socket } = useSessionSocket(resolved?.sessionId ?? "none");

  useEffect(() => {
    void params.then(setResolved);
  }, [params]);

  useEffect(() => {
    if (!resolved) return;
    const load = async () => {
      const res = await fetch(
        `/api/sessions/${resolved.sessionId}?teamCode=${resolved.teamCode}`,
        withAuthHeaders({ cache: "no-store" }, "participant"),
      );
      const payload = await readJsonSafe<{ session?: SessionSnapshot; message?: string }>(res);
      if (res.ok) {
        setSession(payload.session ?? null);
        return;
      }

      if (res.status === 404) {
        const activeRes = await fetch("/api/sessions/active", { cache: "no-store" });
        const activePayload = await readJsonSafe<{ session?: { id: string } | null }>(activeRes);
        const activeId = activePayload.session?.id;
        if (activeRes.ok && activeId && activeId !== resolved.sessionId) {
          await fetch(
            `/api/sessions/${activeId}/join`,
            withAuthHeaders(
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              },
              "participant",
            ),
          ).catch(() => null);
          router.replace(`/participant/${activeId}/${resolved.teamCode}/lobby`);
        }
      }
    };
    void load();
  }, [resolved, router]);

  useEffect(() => {
    if (!socket) return;
    const onSessionUpdated = (payload: SessionSnapshot) => setSession(payload);
    socket.on("session_updated", onSessionUpdated);
    return () => {
      socket.off("session_updated", onSessionUpdated);
    };
  }, [socket]);

  if (!resolved) return <div className="py-12 text-center">Loading...</div>;

  return (
    <div className="grid min-h-[80vh] place-items-center">
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-panel/80 p-6 text-center">
        <h1 className="text-4xl font-bold">{resolved.teamCode}</h1>
        <p className="mt-4 text-2xl">Waiting for host...</p>
        <p className="mt-2 text-slate-300">Session: {resolved.sessionId}</p>
        <p className="mt-2 text-slate-300">Status: {session?.status ?? "LOBBY"}</p>
        <p className="mt-1 text-sm text-slate-400">Phase: {session?.phase ?? "DRAFT"}</p>
        <Link
          className="mt-6 inline-block rounded-md border border-slate-600 bg-slate-900 px-4 py-2 font-semibold hover:border-slate-400"
          href={`/participant/${resolved.sessionId}/${resolved.teamCode}/play`}
        >
          Enter Play Screen
        </Link>
      </div>
    </div>
  );
}
