"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { StatusPill } from "@/components/status-pill";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

const EventGlobe = dynamic(() => import("@/components/event-globe").then((m) => m.EventGlobe), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-md bg-slate-800/60" />,
});

type MePayload = {
  ok: boolean;
  team: {
    id: string;
    team_name: string;
    budget: number;
    current_stage: number;
    is_active: boolean;
  };
  stage: {
    stage_no: number;
    country: string | null;
    location_name: string | null;
    lat: number;
    lng: number;
    clue_text: string;
    hint_question: string | null;
    main_question: string;
  } | null;
  stages: Array<{
    stage_no: number;
    lat: number;
    lng: number;
    location_name: string | null;
  }>;
  event_state: {
    is_live: boolean;
    global_stage_unlock: number;
    hint_unlocked_stage: number;
    freeze_leaderboard: boolean;
  };
};

export default function PlayPage() {
  const router = useRouter();
  const [data, setData] = useState<MePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answerType, setAnswerType] = useState<"HINT" | "MAIN">("MAIN");
  const [answerRaw, setAnswerRaw] = useState("");
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const load = async () => {
    try {
      const res = await fetchWithRetry("/api/me", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.message ?? "Failed to load data");
        return;
      }
      setData(payload);
      setError(null);
    } catch {
      setError("Unable to load player data. Check network/server.");
    }
  };

  useEffect(() => {
    void load();
    const i = setInterval(() => void load(), 5000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const status = useMemo(() => {
    if (!data) return { label: "Loading", tone: "paused" as const };
    if (data.event_state.freeze_leaderboard) return { label: "FROZEN", tone: "frozen" as const };
    if (!data.event_state.is_live) return { label: "PAUSED", tone: "paused" as const };
    if (data.team.current_stage > data.event_state.global_stage_unlock) return { label: "LOCKED", tone: "locked" as const };
    return { label: "LIVE", tone: "live" as const };
  }, [data]);

  const hintAvailable = Boolean(
    data?.stage?.hint_question &&
      data.event_state.hint_unlocked_stage >= data.team.current_stage,
  );

  useEffect(() => {
    if (!hintAvailable && answerType === "HINT") {
      setAnswerType("MAIN");
    }
  }, [hintAvailable, answerType]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitMsg(null);

    if (!answerRaw.trim() || cooldown > 0) return;

    setLoading(true);
    const res = await fetchWithRetry("/api/submit-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer_type: answerType, answer_raw: answerRaw }),
    }).catch((err) => {
      setLoading(false);
      setSubmitMsg(err instanceof Error ? err.message : "Network error");
      return null;
    });

    if (!res) return;

    const payload = await res.json();
    setLoading(false);

    if (!res.ok) {
      if (res.status === 429) {
        setCooldown(Number(payload.retry_after_seconds ?? 8));
      }
      setSubmitMsg(payload.message ?? "Submission failed");
      return;
    }

    setSubmitMsg(`${payload.message} (${payload.delta > 0 ? "+" : ""}${payload.delta})`);
    setAnswerRaw("");
    await load();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  if (!data) {
    return <div className="py-12 text-center text-slate-300">Loading player console...</div>;
  }

  if (!data.stage) {
    return <div className="py-12 text-center text-danger">Current stage is not configured.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-panel/70 p-4">
        <div>
          <h1 className="text-2xl font-bold">{data.team.team_name}</h1>
          <p className="text-sm text-slate-300">Budget: {data.team.budget} | Stage: {data.team.current_stage}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill label={status.label} tone={status.tone} />
          <button type="button" onClick={logout}>Logout</button>
        </div>
      </header>

      <EventGlobe
        stages={data.stages}
        focus={{
          lat: data.stage.lat,
          lng: data.stage.lng,
          location_name: data.stage.location_name,
          country: data.stage.country,
        }}
        featuredStageNo={data.event_state.global_stage_unlock}
        autoRotateDefault={false}
        showControls
        showLabels={false}
        kmlUrl="/route.kml"
      />

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-slate-700 bg-panel/60 p-4">
          <h2 className="text-lg font-semibold">Clue</h2>
          <p className="mt-2 text-slate-200">{data.stage.clue_text}</p>
          {hintAvailable && (
            <>
              <h3 className="mt-4 text-base font-semibold">Hint Question</h3>
              <p className="text-slate-200">{data.stage.hint_question}</p>
            </>
          )}
          <h3 className="mt-4 text-base font-semibold">Main Question</h3>
          <p className="text-slate-200">{data.stage.main_question}</p>
        </article>

        <article className="rounded-lg border border-slate-700 bg-panel/60 p-4">
          <h2 className="text-lg font-semibold">Submit Answer</h2>
          <form className="mt-3 space-y-3" onSubmit={submit}>
            <div>
              <label className="block text-sm text-slate-300">Answer Type</label>
              <select
                className="mt-1 w-full"
                value={answerType}
                onChange={(e) => setAnswerType(e.target.value as "HINT" | "MAIN")}
              >
                {hintAvailable && <option value="HINT">HINT</option>}
                <option value="MAIN">MAIN</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300">Answer</label>
              <input
                className="mt-1 w-full"
                value={answerRaw}
                onChange={(e) => setAnswerRaw(e.target.value)}
                required
                maxLength={300}
              />
            </div>
            {cooldown > 0 && <p className="text-sm text-amber-300">Rate limit active. Try again in {cooldown}s.</p>}
            {submitMsg && <p className="text-sm text-slate-200">{submitMsg}</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            <button disabled={loading || cooldown > 0} type="submit" className="w-full bg-accent/20 font-semibold text-accent">
              {loading ? "Submitting..." : "Submit"}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
