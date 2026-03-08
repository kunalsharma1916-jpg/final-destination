"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminSessionControls } from "@/components/admin-session-controls";
import { QuestionCard } from "@/components/question-card";
import { QuizLeaderboardTable } from "@/components/quiz-leaderboard-table";
import { Timer } from "@/components/timer";
import { withAuthHeaders } from "@/lib/client-api";
import { readJsonSafe } from "@/lib/client-response";
import { useSessionSocket } from "@/lib/use-session-socket";
import type { AnswerStats, DestinationState, LeaderboardRow, PublicQuestion, SessionSnapshot } from "@/types/quiz";

type Quiz = { id: string; title: string };

type SessionStatePayload = {
  message?: string;
  session?: SessionSnapshot;
  destination?: DestinationState;
  question?: PublicQuestion | null;
  leaderboard?: LeaderboardRow[];
  stats?: AnswerStats | null;
};

export default function AdminSessionPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionIdInput, setSessionIdInput] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [sessionName, setSessionName] = useState("DRY RUN");
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [destination, setDestination] = useState<DestinationState | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [stats, setStats] = useState<AnswerStats | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [destinationBusy, setDestinationBusy] = useState(false);
  const [jumpTo, setJumpTo] = useState("1");

  const { socket } = useSessionSocket(sessionId || "none");

  const resolveBestSessionId = async () => {
    const activeRes = await fetch("/api/sessions/active", { cache: "no-store" });
    const activePayload = await readJsonSafe<{ session?: { id: string } | null }>(activeRes);
    if (activeRes.ok && activePayload.session?.id) {
      setActiveSessionId(activePayload.session.id);
      return activePayload.session.id;
    }
    const sessionsRes = await fetch("/api/sessions", withAuthHeaders({ cache: "no-store" }, "admin"));
    const sessionsPayload = await readJsonSafe<{ sessions?: Array<{ id: string }> }>(sessionsRes);
    const latest = sessionsPayload.sessions?.[0]?.id ?? "";
    if (latest) setActiveSessionId(latest);
    return latest || null;
  };

  const refreshState = async (id: string, allowRecover = true) => {
    if (!id.trim()) return;
    const res = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
    const payload = await readJsonSafe<SessionStatePayload>(res);
    if (!res.ok) {
      if (res.status === 404 && allowRecover) {
        const recovered = await resolveBestSessionId();
        if (recovered && recovered !== id) {
          setSessionId(recovered);
          setSessionIdInput(recovered);
          setMsg(`Session ${id} not found. Switched to active session ${recovered}.`);
          await refreshState(recovered, false);
          return;
        }
      }
      setMsg(payload.message ?? "Failed to load session");
      return;
    }
    setSession(payload.session ?? null);
    setDestination(payload.destination ?? null);
    setQuestion(payload.question ?? null);
    setLeaderboard(payload.leaderboard ?? []);
    setStats(payload.stats ?? null);
    setMsg(null);
  };

  useEffect(() => {
    const loadQuizzes = async () => {
      const res = await fetch("/api/quizzes", withAuthHeaders({ cache: "no-store" }, "admin"));
      const payload = await readJsonSafe<{ quizzes?: Array<{ id: string; title: string }>; message?: string }>(res);
      if (res.ok) {
        setQuizzes((payload.quizzes ?? []).map((q: { id: string; title: string }) => ({ id: q.id, title: q.title })));
      } else {
        setMsg(payload.message ?? "Failed to load quizzes");
      }
    };
    void loadQuizzes();
    void (async () => {
      if (sessionId) return;
      const initial = await resolveBestSessionId();
      if (initial) {
        setSessionId(initial);
        setSessionIdInput(initial);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void refreshState(sessionId);
    const timer = setInterval(() => void refreshState(sessionId), 1500);
    return () => clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (destination?.currentNumber) {
      setJumpTo(String(destination.currentNumber));
    }
  }, [destination?.currentNumber]);

  useEffect(() => {
    if (!socket || !sessionId) return;
    socket.emit("join_admin", sessionId);

    const onSessionUpdated = (payload: SessionSnapshot) => setSession(payload);
    const onQuestionStarted = (payload: { question: PublicQuestion | null; session: SessionSnapshot }) => {
      setQuestion(payload.question);
      setSession(payload.session);
      setStats(null);
    };
    const onStats = (payload: AnswerStats) => setStats(payload);
    const onLeaderboard = (payload: LeaderboardRow[]) => setLeaderboard(payload);
    const onDestination = (payload: { session: SessionSnapshot; destination: DestinationState }) => {
      setSession(payload.session);
      setDestination(payload.destination);
    };

    socket.on("session_updated", onSessionUpdated);
    socket.on("question_started", onQuestionStarted);
    socket.on("answer_stats_updated", onStats);
    socket.on("leaderboard_updated", onLeaderboard);
    socket.on("destination_updated", onDestination);

    return () => {
      socket.off("session_updated", onSessionUpdated);
      socket.off("question_started", onQuestionStarted);
      socket.off("answer_stats_updated", onStats);
      socket.off("leaderboard_updated", onLeaderboard);
      socket.off("destination_updated", onDestination);
    };
  }, [socket, sessionId]);

  const createSession = async (quizId: string) => {
    if (!quizId) return;
    const res = await fetch("/api/sessions", {
      ...withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quizId, name: sessionName.trim() || undefined }),
        },
        "admin",
      ),
    });
    const payload = await readJsonSafe<{ message?: string; session?: SessionSnapshot }>(res);
    if (!res.ok) {
      setMsg(payload.message ?? "Could not create session");
      return;
    }
    if (!payload.session) {
      setMsg("Session creation response was invalid");
      return;
    }
    setSessionId(payload.session.id);
    setSession(payload.session);
    setMsg(`Session created: ${payload.session.id}`);
    await refreshState(payload.session.id);
  };

  const triggerSession = async (action: "start" | "launch" | "reveal" | "next" | "pause" | "resume" | "end") => {
    if (!sessionId) return;
    setSessionBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}/${action}`, withAuthHeaders({ method: "POST" }, "admin"));
    const payload = await readJsonSafe<{ message?: string; session?: SessionSnapshot; question?: PublicQuestion | null }>(res);
    setSessionBusy(false);
    if (!res.ok) {
      setMsg(payload.message ?? `Failed: ${action}`);
      return;
    }
    setMsg(`${action.toUpperCase()} done`);
    if (payload.session) setSession(payload.session);
    if (payload.question !== undefined) setQuestion(payload.question);
    await refreshState(sessionId, true);
  };

  const moveDestination = async (action: "previous" | "next" | "jump") => {
    if (!sessionId || !destination) return;
    const locationNumber = Number(jumpTo);
    setDestinationBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}/destination`, {
      ...withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            locationNumber: action === "jump" ? locationNumber : undefined,
          }),
        },
        "admin",
      ),
    });
    const payload = await readJsonSafe<{ message?: string; session?: SessionSnapshot; destination?: DestinationState }>(res);
    setDestinationBusy(false);
    if (!res.ok) {
      setMsg(payload.message ?? "Destination update failed");
      return;
    }
    if (payload.session) setSession(payload.session);
    if (payload.destination) setDestination(payload.destination);
    setMsg(
      action === "jump"
        ? `Jumped to location ${payload.destination?.currentNumber ?? locationNumber}`
        : `Moved ${action}`,
    );
    await refreshState(sessionId, true);
  };

  const topRows = useMemo(() => leaderboard.slice(0, 10), [leaderboard]);
  const metricLabel = session?.scoringMode === "BUDGET" ? "Budget" : "Points";
  const canPrev = destination ? destination.currentNumber > 1 : false;
  const canNext = destination ? destination.currentNumber < destination.total : false;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Admin Live Session</h1>
      <div className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label>
            <span className="mb-1 block text-sm text-slate-300">Create from Quiz</span>
            <select onChange={(e) => void createSession(e.target.value)} defaultValue="">
              <option value="" disabled>
                Select quiz
              </option>
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-sm text-slate-300">Session Name</span>
            <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="DRY RUN" />
          </label>
          <label className="md:col-span-2">
            <span className="mb-1 block text-sm text-slate-300">Or Enter Session ID</span>
            <div className="flex gap-2">
              <input value={sessionIdInput} onChange={(e) => setSessionIdInput(e.target.value)} placeholder="session id" />
              <button
                type="button"
                onClick={() => {
                  const next = sessionIdInput.trim();
                  if (!next) return;
                  setSessionId(next);
                  setMsg(null);
                }}
              >
                Load Session
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Active: {activeSessionId || "-"} | Viewing: {sessionId || "-"}
            </p>
          </label>
          <div className="rounded border border-slate-700 p-3 md:col-span-3">
            <p className="text-sm text-slate-300">Status</p>
            <p className="text-2xl font-bold">{session?.status ?? "-"}</p>
            <p className="text-xs text-slate-400">
              Session: {session?.name ?? "-"} | Phase: {session?.phase ?? "-"} | Mode: {session?.scoringMode ?? "-"}
            </p>
          </div>
        </div>

        {session && (
          <div className="mt-4">
            <AdminSessionControls
              phase={session.phase}
              onAction={triggerSession}
              busy={sessionBusy}
            />
          </div>
        )}

        {destination && (
          <div className="mt-4 rounded border border-slate-700 bg-slate-900/30 p-3">
            <h2 className="text-lg font-semibold">Destination Control</h2>
            <p className="mt-1 text-sm text-slate-300">
              Current Location: {destination.currentNumber} / {destination.total}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void moveDestination("previous")}
                disabled={destinationBusy || !canPrev}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => void moveDestination("next")}
                disabled={destinationBusy || !canNext}
              >
                Next
              </button>
              <input
                type="number"
                min={1}
                max={destination.total}
                value={jumpTo}
                onChange={(e) => setJumpTo(e.target.value)}
                className="w-28"
              />
              <button
                type="button"
                onClick={() => void moveDestination("jump")}
                disabled={destinationBusy}
              >
                Apply Jump
              </button>
            </div>
          </div>
        )}
        {msg && <p className="mt-3 text-sm text-amber-300">{msg}</p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <QuestionCard question={question} />
          {session?.questionEndAt && <Timer endAt={session.questionEndAt} />}
          {stats && (
            <div className="rounded-lg border border-slate-700 bg-panel/70 p-4">
              <h3 className="text-lg font-semibold">Live Response Stats</h3>
              <div className="mt-2 space-y-2">
                {stats.counts.map((item) => (
                  <div key={item.optionId} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2">
                    <span className="text-sm">{item.text}</span>
                    <span className="font-bold">{item.count}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sm text-slate-300">Teams answered: {stats.teamsAnswered.join(", ") || "-"}</p>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-slate-700 bg-panel/70 p-4">
          <h3 className="mb-2 text-xl font-bold">{metricLabel} Leaderboard</h3>
          <QuizLeaderboardTable rows={topRows} metricLabel={metricLabel} />
        </div>
      </div>
    </div>
  );
}
