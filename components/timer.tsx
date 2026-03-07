"use client";

import { useEffect, useMemo, useState } from "react";

export function Timer({ endAt }: { endAt: string | null }) {
  const [remainingSec, setRemainingSec] = useState(0);
  const [initialSec, setInitialSec] = useState(0);

  useEffect(() => {
    if (!endAt) {
      setRemainingSec(0);
      setInitialSec(0);
      return;
    }
    const end = new Date(endAt).getTime();
    const initial = Math.max(1, Math.ceil((end - Date.now()) / 1000));
    setInitialSec(initial);
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemainingSec(left);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [endAt]);

  const pct = useMemo(() => {
    if (!endAt || initialSec <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingSec * 100) / initialSec));
  }, [endAt, remainingSec, initialSec]);

  return (
    <div className="rounded-lg border border-slate-700 bg-panel/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-slate-300">Time left</span>
        <span className="text-2xl font-black">{remainingSec}s</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
        <div className="h-full bg-cyan-400 transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
