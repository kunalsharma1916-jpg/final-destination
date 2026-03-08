"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { OptionButtons } from "@/components/option-buttons";
import { QuestionCard } from "@/components/question-card";
import { QuizLeaderboardTable } from "@/components/quiz-leaderboard-table";
import { Timer } from "@/components/timer";
import { readJsonSafe } from "@/lib/client-response";
import { useSessionSocket } from "@/lib/use-session-socket";
import type { DestinationState, LeaderboardRow, PublicQuestion, SessionSnapshot } from "@/types/quiz";

const Globe = dynamic(() => import("@/components/event-globe").then((m) => m.EventGlobe), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-md bg-slate-800/60" />,
});

export default function ScreenDisplayPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [destination, setDestination] = useState<DestinationState | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [reveal, setReveal] = useState<{ correctOptionId: string | null; explanation: string | null } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [kmlWarning, setKmlWarning] = useState<string | null>(null);
  const { socket } = useSessionSocket(sessionId || "none");

  const resolveBestSessionId = async () => {
    const activeRes = await fetch("/api/sessions/active", { cache: "no-store" });
    const activePayload = await readJsonSafe<{ session?: { id: string } | null }>(activeRes);
    if (activeRes.ok && activePayload.session?.id) return activePayload.session.id;

    const sessionsRes = await fetch("/api/sessions", { cache: "no-store" });
    const sessionsPayload = await readJsonSafe<{ sessions?: Array<{ id: string }> }>(sessionsRes);
    return sessionsPayload.sessions?.[0]?.id ?? null;
  };

  useEffect(() => {
    const fromUrl = new URL(window.location.href).searchParams.get("sessionId");
    if (fromUrl) {
      setSessionId(fromUrl);
      return;
    }
    const loadActive = async () => {
      const id = await resolveBestSessionId();
      if (id) setSessionId(id);
    };
    void loadActive();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      const res = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
      const payload = await readJsonSafe<{
        message?: string;
        session?: SessionSnapshot;
        destination?: DestinationState;
        question?: PublicQuestion | null;
        leaderboard?: LeaderboardRow[];
      }>(res);
      if (!res.ok) {
        if (res.status === 404) {
          const recovered = await resolveBestSessionId();
          if (recovered && recovered !== sessionId) {
            setSessionId(recovered);
            setMsg(`Session ${sessionId} not found. Switched to ${recovered}.`);
            return;
          }
        }
        setMsg(payload.message ?? "Session not found");
        return;
      }
      setSession(payload.session ?? null);
      setDestination(payload.destination ?? null);
      setQuestion(payload.question ?? null);
      setLeaderboard(payload.leaderboard ?? []);
      setMsg(null);
    };
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!socket || !sessionId) return;
    const onSessionUpdated = (payload: SessionSnapshot) => setSession(payload);
    const onQuestionStarted = (payload: { question: PublicQuestion | null; session: SessionSnapshot }) => {
      setQuestion(payload.question);
      setSession(payload.session);
      setReveal(null);
    };
    const onReveal = (payload: { correctOptionId: string | null; explanation: string | null }) => setReveal(payload);
    const onLeaderboard = (payload: LeaderboardRow[]) => setLeaderboard(payload);
    const onDestination = (payload: { session: SessionSnapshot; destination: DestinationState }) => {
      setSession(payload.session);
      setDestination(payload.destination);
    };

    socket.on("session_updated", onSessionUpdated);
    socket.on("question_started", onQuestionStarted);
    socket.on("question_revealed", onReveal);
    socket.on("leaderboard_updated", onLeaderboard);
    socket.on("destination_updated", onDestination);

    return () => {
      socket.off("session_updated", onSessionUpdated);
      socket.off("question_started", onQuestionStarted);
      socket.off("question_revealed", onReveal);
      socket.off("leaderboard_updated", onLeaderboard);
      socket.off("destination_updated", onDestination);
    };
  }, [socket, sessionId]);

  const phase = useMemo(() => {
    if (!session) return "WAITING";
    if (session.phase === "ENDED") return "FINISHED";
    if (session.phase === "PAUSED") return "PAUSED";
    if (session.phase === "DRAFT") return "DRAFT";
    if (session.phase === "LOBBY") return "LOBBY";
    if (session.phase === "QUESTION_LIVE") return "QUESTION LIVE";
    if (session.phase === "QUESTION_CLOSED") return "QUESTION CLOSED";
    if (session.phase === "REVEALED") return "ANSWER REVEALED";
    return session.phase;
  }, [session]);

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-700 bg-panel/70 p-5">
        <h1 className="text-5xl font-black">Live Question Display</h1>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Metric title="Status" value={session?.status ?? "-"} />
          <Metric title="Session" value={session?.name ?? sessionId ?? "-"} />
          <Metric
            title="Progress"
            value={question ? `${question.index}/${question.total}` : `${(session?.currentQuestionIndex ?? 0) + 1}/-`}
          />
          <Metric title="Phase" value={phase} />
        </div>
      </header>

      {msg && <p className="text-amber-300">{msg}</p>}
      {kmlWarning && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-amber-200">
          {kmlWarning}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-700 bg-panel/60 p-3">
          <Globe
            stages={(destination?.locations ?? []).map((loc) => ({
              stage_no: loc.number,
              lat: loc.lat,
              lng: loc.lng,
              location_name: loc.label,
            }))}
            autoRotateDefault={false}
            showControls={false}
            showLabels
            kmlUrl="/route.kml"
            featuredStageNo={destination?.currentNumber ?? 1}
            focus={
              destination?.currentLocation
                ? {
                    lat: destination.currentLocation.lat,
                    lng: destination.currentLocation.lng,
                    location_name: destination.currentLocation.label,
                  }
                : null
            }
            onWarning={setKmlWarning}
          />
          <p className="mt-2 text-sm text-slate-300">
            Destination: {destination ? `${destination.currentNumber}/${destination.total}` : "-"}
          </p>
        </div>

        <div className="space-y-4">
          {(session?.phase === "LOBBY" || session?.phase === "DRAFT") && (
            <div className="rounded-lg border border-slate-700 bg-panel/70 p-4 text-xl text-slate-200">
              Waiting for host to launch the next question...
            </div>
          )}
          {question && (
            <>
              <QuestionCard question={question} />
              {session?.questionEndAt && session.phase === "QUESTION_LIVE" && <Timer endAt={session.questionEndAt} />}
              {question.answerFormat === "MCQ" ? (
                <div className="pointer-events-none">
                  <OptionButtons
                    options={question.options}
                    selectedOptionId={null}
                    disabled
                    correctOptionId={reveal?.correctOptionId ?? null}
                    onSelect={() => undefined}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-slate-300">
                  Teams are submitting a text response for this hint.
                </div>
              )}
            </>
          )}
          {session?.phase === "ENDED" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-lg text-emerald-200">
              Session completed. Showing final leaderboard.
            </div>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="mb-2 text-2xl font-bold">
          {session?.scoringMode === "BUDGET" ? "Budget Leaderboard" : "Leaderboard"}
        </h2>
        <QuizLeaderboardTable
          rows={leaderboard.slice(0, 10)}
          metricLabel={session?.scoringMode === "BUDGET" ? "Budget" : "Points"}
        />
      </section>

      {reveal?.explanation && (
        <div className="rounded-lg border border-emerald-600/50 bg-emerald-500/10 p-4 text-xl">
          {reveal.explanation}
        </div>
      )}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded border border-slate-700 bg-slate-900/30 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
