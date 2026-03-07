import type { LeaderboardRow } from "@/types/quiz";

export function QuizLeaderboardTable({
  rows,
  large = false,
  metricLabel = "Points",
}: {
  rows: LeaderboardRow[];
  large?: boolean;
  metricLabel?: string;
}) {
  const isBudget = metricLabel.toLowerCase().includes("budget") || metricLabel.toLowerCase().includes("fund");
  const formatValue = (value: number) => (isBudget ? `$${value.toLocaleString()}` : value.toLocaleString());

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700">
      <table className="min-w-full divide-y divide-slate-700">
        <thead className="bg-slate-900/80">
          <tr className="text-left text-slate-300">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2 text-right">{metricLabel}</th>
          </tr>
        </thead>
        <tbody className={large ? "text-xl" : "text-sm"}>
          {rows.map((row) => (
            <tr key={row.teamCode} className="border-t border-slate-800">
              <td className="px-3 py-2 font-bold">{row.rank}</td>
              <td className="px-3 py-2">{row.teamCode}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatValue(row.totalPoints)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-slate-400" colSpan={3}>
                No teams yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
