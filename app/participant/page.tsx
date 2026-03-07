"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { withAuthHeaders } from "@/lib/client-api";
import { getParticipantTeamCode, setParticipantAuth } from "@/lib/client-auth";
import { readJsonSafe } from "@/lib/client-response";

export default function ParticipantJoinPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [participantTeamCode, setParticipantTeamCode] = useState<string | null>(null);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setBusy(true);
    setMsg(null);

    const loginRes = await fetch(
      "/api/auth/participant-login",
      withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
        "none",
      ),
    );
    const loginPayload = await readJsonSafe<{
      ok?: boolean;
      token?: string;
      participant?: { teamCode?: string; username?: string };
      message?: string;
    }>(loginRes);
    if (!loginRes.ok || !loginPayload.ok || !loginPayload.participant?.teamCode) {
      setBusy(false);
      if (!loginPayload.message) {
        setMsg("Login failed. Backend may be offline. Run `npm.cmd run backend:dev` (or `npm.cmd run dev:all`).");
      } else {
        setMsg(loginPayload.message);
      }
      return;
    }
    setParticipantAuth({
      token: loginPayload.token ?? null,
      teamCode: loginPayload.participant.teamCode,
      username: loginPayload.participant.username ?? username,
    });
    setParticipantTeamCode(loginPayload.participant.teamCode);

    const activeRes = await fetch("/api/sessions/active", { cache: "no-store" });
    const activePayload = await readJsonSafe<{ session?: { id: string } | null; message?: string }>(activeRes);
    if (!activeRes.ok || !activePayload.session) {
      setBusy(false);
      setMsg(activePayload.message ?? "No active session found. Wait for host.");
      return;
    }
    const sessionId = activePayload.session.id as string;

    const res = await fetch(
      `/api/sessions/${sessionId}/join`,
      withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        "participant",
      ),
    );
    const payload = await readJsonSafe<{ message?: string }>(res);
    setBusy(false);
    if (!res.ok) {
      setMsg(payload.message ?? "Unable to join");
      return;
    }
    const teamCode = loginPayload.participant.teamCode.toUpperCase();
    router.push(`/participant/${sessionId}/${teamCode}/lobby`);
  };

  useEffect(() => {
    const knownTeamCode = getParticipantTeamCode();
    if (knownTeamCode) setParticipantTeamCode(knownTeamCode);
  }, []);

  return (
    <div className="grid min-h-[80vh] place-items-center">
      <form onSubmit={join} className="w-full max-w-md rounded-xl border border-slate-700 bg-panel/80 p-6">
        <h1 className="text-3xl font-bold">Participant Login</h1>
        <p className="mt-2 text-slate-300">Sign in with your participant credentials.</p>
        <input
          className="mt-4 w-full"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          autoComplete="username"
          required
        />
        <input
          className="mt-3 w-full"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          required
        />
        {participantTeamCode && <p className="mt-2 text-xs text-slate-400">Linked Team: {participantTeamCode}</p>}
        {msg && <p className="mt-2 text-sm text-amber-300">{msg}</p>}
        <button className="mt-4 w-full bg-accent/20 font-semibold text-accent" type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Login & Join Session"}
        </button>
      </form>
    </div>
  );
}
