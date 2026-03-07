"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

const EventGlobe = dynamic(() => import("@/components/event-globe").then((m) => m.EventGlobe), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-md bg-slate-800/60" />,
});

type DisplayPayload = {
  eventState: {
    is_live: boolean;
    freeze_leaderboard: boolean;
    global_stage_unlock: number;
    hint_unlocked_stage: number;
  } | null;
  featuredStage: {
    stage_no: number;
    location_name: string | null;
    country: string | null;
    lat: number;
    lng: number;
  } | null;
  stageMarkers: Array<{
    stage_no: number;
    lat: number;
    lng: number;
    location_name: string | null;
  }>;
  leaderboard: Array<{
    team_name: string;
    budget: number;
    current_stage: number;
    wrong_count: number;
    last_correct_at: string | null;
  }>;
  recent: Array<{
    created_at: string;
    team_name: string;
    stage_no: number;
    delta: number;
    is_correct: boolean;
  }>;
};

export default function DisplayPage() {
  const [data, setData] = useState<DisplayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kmlWarning, setKmlWarning] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetchWithRetry("/api/public/display", { cache: "no-store" });
      const payload = await res.json();
      if (res.ok) {
        setData(payload);
        setError(null);
      } else {
        setError(payload.message ?? "Display data unavailable");
      }
    } catch {
      setError("Display data unavailable (network/server).");
    }
  };

  useEffect(() => {
    void load();
    const i = setInterval(load, 3000);
    return () => clearInterval(i);
  }, []);

  const status = data?.eventState?.freeze_leaderboard
    ? "FROZEN"
    : data?.eventState?.is_live
      ? "LIVE"
      : "PAUSED";

  return (
    <div className="space-y-4">
      <header className="grid gap-3 rounded-lg border border-slate-700 bg-panel/80 p-5 md:grid-cols-4">
        <Metric title="Status" value={status} />
        <Metric title="Stage Unlock" value={String(data?.eventState?.global_stage_unlock ?? "-")} />
        <Metric title="Hint Unlock" value={String(data?.eventState?.hint_unlocked_stage ?? "-")} />
        <Metric title="Featured" value={data?.featuredStage ? `S${data.featuredStage.stage_no}` : "-"} />
      </header>
      {error && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-amber-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-lg border border-slate-700 bg-panel/70 p-4">
          <h2 className="text-2xl font-extrabold">Earth Globe (Live)</h2>
          <p className="mb-3 text-slate-300">
            {data?.featuredStage?.stage_no ? `Location: Location ${data.featuredStage.stage_no}` : "Location: -"}
          </p>
          <div className="mb-3 flex gap-2">
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">Route</span>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">Featured Stage</span>
          </div>
          {kmlWarning && (
            <div className="mb-3 rounded border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {kmlWarning}
            </div>
          )}
          <EventGlobe
            stages={data?.stageMarkers ?? []}
            focus={
              data?.featuredStage
                ? {
                    lat: data.featuredStage.lat,
                    lng: data.featuredStage.lng,
                    location_name: data.featuredStage.location_name,
                    country: data.featuredStage.country,
                  }
                : null
            }
            featuredStageNo={data?.eventState?.global_stage_unlock}
            autoRotateDefault
            showControls={false}
            showLabels
            kmlUrl="/route.kml"
            onWarning={setKmlWarning}
          />
        </article>

        <article className="space-y-4">
          <div className="rounded-lg border border-slate-700 bg-panel/70 p-4">
            <h3 className="mb-2 text-xl font-bold">Top 10 Leaderboard</h3>
            <LeaderboardTable rows={data?.leaderboard ?? []} compact />
          </div>
          <div className="rounded-lg border border-slate-700 bg-panel/70 p-4">
            <h3 className="text-xl font-bold">Recent Activity</h3>
            <div className="mt-3 space-y-2 text-sm">
              {(data?.recent ?? []).map((item, idx) => (
                <div key={`${item.created_at}-${idx}`} className="rounded border border-slate-700 p-2">
                  <p>
                    {new Date(item.created_at).toLocaleTimeString()} | {item.team_name} | S{item.stage_no}
                  </p>
                  <p className={item.is_correct ? "text-success" : "text-danger"}>
                    {item.is_correct ? "Correct" : "Wrong"} ({item.delta > 0 ? "+" : ""}{item.delta})
                  </p>
                </div>
              ))}
              {!data?.recent?.length && <p className="text-slate-400">No activity yet.</p>}
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="text-sm uppercase tracking-wide text-slate-400">{title}</p>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}
