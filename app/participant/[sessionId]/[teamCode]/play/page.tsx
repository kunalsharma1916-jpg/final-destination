"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { OptionButtons } from "@/components/option-buttons";
import { QuestionCard } from "@/components/question-card";
import { QuizLeaderboardTable } from "@/components/quiz-leaderboard-table";
import { Timer } from "@/components/timer";
import { withAuthHeaders } from "@/lib/client-api";
import { readJsonSafe } from "@/lib/client-response";
import { useSessionSocket } from "@/lib/use-session-socket";
import type { DestinationState, LeaderboardRow, PublicQuestion, SessionSnapshot } from "@/types/quiz";

const Globe = dynamic(() => import("@/components/event-globe").then((m) => m.EventGlobe), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full animate-pulse rounded-md bg-slate-800/60" />,
});

type Resolved = { sessionId: string; teamCode: string };

type PlayStatePayload = {
  message?: string;
  session?: SessionSnapshot;
  destination?: DestinationState;
  question?: PublicQuestion | null;
  leaderboard?: LeaderboardRow[];
  myAnswer?: {
    optionId: string | null;
    answerText: string | null;
    isCorrect: boolean;
    pointsAwarded: number;
  } | null;
};

export default function ParticipantPlayPage({
  params,
}: {
  params: Promise<{ sessionId: string; teamCode: string }>;
}) {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [destination, setDestination] = useState<DestinationState | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [reveal, setReveal] = useState<{ correctOptionId: string | null; explanation: string | null } | null>(null);
  const [pointsGained, setPointsGained] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);
  const { socket } = useSessionSocket(resolved?.sessionId ?? "none");

  useEffect(() => {
    void params.then(setResolved);
  }, [params]);

  const load = async (info: Resolved) => {
    const res = await fetch(
      `/api/sessions/${info.sessionId}?teamCode=${info.teamCode}`,
      withAuthHeaders({ cache: "no-store" }, "participant"),
    );
    const payload = await readJsonSafe<PlayStatePayload>(res);
    if (!res.ok) {
      setMsg(payload.message ?? "Failed to load state");
      return;
    }
    setSession(payload.session ?? null);
    setDestination(payload.destination ?? null);
    setQuestion(payload.question ?? null);
    setLeaderboard(payload.leaderboard ?? []);
    setSubmitted(Boolean(payload.myAnswer));
    setSelected(payload.myAnswer?.optionId ?? null);
    setTextAnswer(payload.myAnswer?.answerText ?? "");
    setPointsGained(payload.myAnswer?.pointsAwarded ?? 0);
  };

  useEffect(() => {
    if (!resolved) return;
    void load(resolved);
    const timer = setInterval(() => void load(resolved), 3000);
    return () => clearInterval(timer);
  }, [resolved]);

  useEffect(() => {
    if (!socket || !resolved) return;

    const onSessionUpdated = (payload: SessionSnapshot) => setSession(payload);
    const onQuestionStarted = (payload: { session: SessionSnapshot; question: PublicQuestion | null }) => {
      setSession(payload.session);
      setQuestion(payload.question);
      setSelected(null);
      setTextAnswer("");
      setSubmitted(false);
      setReveal(null);
      setPointsGained(0);
      setMsg(null);
    };
    const onQuestionRevealed = (payload: { correctOptionId: string | null; explanation: string | null }) => setReveal(payload);
    const onLeaderboard = (payload: LeaderboardRow[]) => setLeaderboard(payload);
    const onDestination = (payload: { session: SessionSnapshot; destination: DestinationState }) => {
      setSession(payload.session);
      setDestination(payload.destination);
    };

    socket.on("session_updated", onSessionUpdated);
    socket.on("question_started", onQuestionStarted);
    socket.on("question_revealed", onQuestionRevealed);
    socket.on("leaderboard_updated", onLeaderboard);
    socket.on("destination_updated", onDestination);

    return () => {
      socket.off("session_updated", onSessionUpdated);
      socket.off("question_started", onQuestionStarted);
      socket.off("question_revealed", onQuestionRevealed);
      socket.off("leaderboard_updated", onLeaderboard);
      socket.off("destination_updated", onDestination);
    };
  }, [socket, resolved]);

  const onSelect = async (optionId: string) => {
    if (!resolved || !question || submitted || session?.phase !== "QUESTION_LIVE") return;
    setSelected(optionId);
    const res = await fetch(
      `/api/sessions/${resolved.sessionId}/answer`,
      withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        },
        "participant",
      ),
    );
    const payload = await readJsonSafe<{ message?: string; answer?: { pointsAwarded: number } }>(res);
    if (!res.ok) {
      setMsg(payload.message ?? "Submit failed");
      return;
    }
    setSubmitted(true);
    setPointsGained(payload.answer?.pointsAwarded ?? 0);
    setMsg("Submitted");
  };

  const onSubmitText = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolved || !question || submitted || session?.phase !== "QUESTION_LIVE") return;
    const responseText = textAnswer.trim();
    if (!responseText) {
      setMsg("Enter your answer first");
      return;
    }

    const res = await fetch(
      `/api/sessions/${resolved.sessionId}/answer`,
      withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textAnswer: responseText }),
        },
        "participant",
      ),
    );
    const payload = await readJsonSafe<{ message?: string; answer?: { pointsAwarded: number } }>(res);
    if (!res.ok) {
      setMsg(payload.message ?? "Submit failed");
      return;
    }

    setSubmitted(true);
    setPointsGained(payload.answer?.pointsAwarded ?? 0);
    setMsg("Submitted");
  };

  const statusText = useMemo(() => {
    if (!session) return "Loading";
    if (session.phase === "ENDED") return "Session Ended";
    if (session.phase === "PAUSED") return "Paused";
    if (session.phase === "QUESTION_LIVE") return "Question Live";
    if (session.phase === "QUESTION_CLOSED") return "Time Up - Waiting for reveal";
    if (session.phase === "REVEALED") return "Answer Revealed";
    if (session.phase === "DRAFT") return "Waiting for host";
    return "Waiting for host";
  }, [session]);

  const metricLabel = session?.scoringMode === "BUDGET" ? "Budget" : "Points";

  if (!resolved) return <div className="py-12 text-center">Loading...</div>;

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h1 className="text-3xl font-bold sm:text-4xl">{resolved.teamCode}</h1>
        <p className="text-slate-300">{statusText}</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <section className="rounded-lg border border-slate-700 bg-panel/60 p-3">
          <Globe
            stages={(destination?.locations ?? []).map((loc) => ({
              stage_no: loc.number,
              lat: loc.lat,
              lng: loc.lng,
              location_name: loc.label,
            }))}
            focus={
              destination?.currentLocation
                ? {
                    lat: destination.currentLocation.lat,
                    lng: destination.currentLocation.lng,
                    location_name: destination.currentLocation.label,
                  }
                : null
            }
            featuredStageNo={destination?.currentNumber}
            autoRotateDefault={false}
            showControls={false}
            showLabels
            kmlUrl="/route.kml"
            minHeightPx={260}
          />
          <p className="mt-2 text-sm text-slate-300">
            Destination: {destination ? `${destination.currentNumber}/${destination.total}` : "-"}
          </p>
        </section>

        <section className="space-y-3">
          <QuestionCard question={question} />
          {session?.questionEndAt && session.phase === "QUESTION_LIVE" && <Timer endAt={session.questionEndAt} />}

          {question?.answerFormat === "MCQ" && (
            <OptionButtons
              options={question.options}
              selectedOptionId={selected}
              disabled={submitted || session?.phase !== "QUESTION_LIVE"}
              correctOptionId={reveal?.correctOptionId ?? null}
              onSelect={onSelect}
            />
          )}

          {question?.answerFormat === "TEXT" && (
            <form onSubmit={onSubmitText} className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-4">
              <label className="block text-sm text-slate-300">Enter your destination answer</label>
              <input
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                placeholder="Type your answer"
                disabled={submitted || session?.phase !== "QUESTION_LIVE"}
                autoComplete="off"
              />
              <button type="submit" disabled={submitted || session?.phase !== "QUESTION_LIVE"}>
                Submit Answer
              </button>
            </form>
          )}

          {msg && <p className="text-sm text-amber-300">{msg}</p>}
          {submitted && (
            <p className="text-sm text-cyan-300">
              Submitted. {metricLabel} change: {pointsGained >= 0 ? "+" : ""}
              {pointsGained}
            </p>
          )}
          {reveal && (
            <div className="rounded-lg border border-emerald-600/50 bg-emerald-500/10 p-4">
              <p className="font-semibold">Answer revealed.</p>
              {reveal.explanation && <p className="mt-2 text-sm text-slate-200">{reveal.explanation}</p>}
            </div>
          )}
          {session?.phase === "ENDED" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
              Session completed. Showing final leaderboard.
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="mb-2 text-xl font-bold">{metricLabel} Preview</h2>
        <QuizLeaderboardTable rows={leaderboard.slice(0, 10)} metricLabel={metricLabel} />
      </section>
    </div>
  );
}
