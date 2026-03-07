type Row = {
  team_name: string;
  budget: number;
  current_stage: number;
  wrong_count: number;
  last_correct_at: string | null;
};

export function LeaderboardTable({ rows, compact = false }: { rows: Row[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full divide-y divide-slate-700 text-left">
        <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-300">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2">Budget</th>
            <th className="px-3 py-2">Stage</th>
            {!compact && <th className="px-3 py-2">Wrong</th>}
            {!compact && <th className="px-3 py-2">Last Correct</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-900/40 text-sm">
          {rows.map((row, index) => (
            <tr key={row.team_name}>
              <td className="px-3 py-2">{index + 1}</td>
              <td className="px-3 py-2 font-semibold">{row.team_name}</td>
              <td className="px-3 py-2">{row.budget}</td>
              <td className="px-3 py-2">{row.current_stage}</td>
              {!compact && <td className="px-3 py-2">{row.wrong_count ?? 0}</td>}
              {!compact && <td className="px-3 py-2">{row.last_correct_at ? new Date(row.last_correct_at).toLocaleTimeString() : "-"}</td>}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className="px-3 py-3 text-slate-400" colSpan={compact ? 4 : 6}>
                No rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
