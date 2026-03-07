import type { PublicQuestion } from "@/types/quiz";

export function QuestionCard({ question }: { question: PublicQuestion | null }) {
  if (!question) {
    return (
      <div className="rounded-lg border border-slate-700 bg-panel/60 p-4">
        <p className="text-slate-300">No active question.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-panel/70 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <p>
          Question {question.index} / {question.total}
        </p>
        {question.kind === "HINT" && (
          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">Hint</span>
        )}
        {question.kind === "MAIN" && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">Main</span>
        )}
      </div>
      <h2 className="mt-2 text-2xl font-extrabold leading-tight">{question.prompt}</h2>
    </div>
  );
}
