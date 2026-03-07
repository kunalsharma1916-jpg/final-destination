"use client";

import { useEffect, useState } from "react";
import { LeaderboardTable } from "@/components/leaderboard-table";

type Payload = {
  freeze_leaderboard: boolean;
  leaderboard: Array<{
    team_name: string;
    budget: number;
    current_stage: number;
    wrong_count: number;
    last_correct_at: string | null;
  }>;
};

export default function LeaderboardPage() {
  const [data, setData] = useState<Payload | null>(null);

  const load = async () => {
    const res = await fetch("/api/public/leaderboard", { cache: "no-store" });
    const payload = await res.json();
    if (res.ok) setData(payload);
  };

  useEffect(() => {
    void load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h1 className="text-3xl font-bold">Leaderboard</h1>
        {data?.freeze_leaderboard && <p className="mt-2 text-lg font-semibold text-amber-300">OFFICIAL RESULTS</p>}
      </header>
      <LeaderboardTable rows={data?.leaderboard ?? []} />
    </div>
  );
}
