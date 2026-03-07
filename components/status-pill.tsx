export function StatusPill({ label, tone }: { label: string; tone: "live" | "paused" | "locked" | "frozen" }) {
  const cls =
    tone === "live"
      ? "bg-success/20 text-success border-success/40"
      : tone === "frozen"
        ? "bg-danger/20 text-danger border-danger/40"
        : tone === "locked"
          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
          : "bg-slate-700/40 text-slate-200 border-slate-500/50";

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${cls}`}>{label}</span>;
}
