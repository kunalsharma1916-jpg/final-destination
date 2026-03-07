"use client";

import { useEffect, useMemo, useState } from "react";
import { withAuthHeaders } from "@/lib/client-api";
import { readJsonSafe } from "@/lib/client-response";

type Question = { id: string; prompt: string };
type Quiz = {
  id: string;
  title: string;
  scoringMode: "CLASSIC" | "BUDGET";
  initialBudget: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  questions: Array<{ questionId: string; order: number; question: Question }>;
};

export default function AdminQuizzesPage() {
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [scoringMode, setScoringMode] = useState<"CLASSIC" | "BUDGET">("CLASSIC");
  const [initialBudget, setInitialBudget] = useState(10000);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const [qRes, quizRes] = await Promise.all([
      fetch("/api/questions", withAuthHeaders({}, "admin")),
      fetch("/api/quizzes", withAuthHeaders({}, "admin")),
    ]);
    const qData = await readJsonSafe<{ questions?: Question[]; message?: string }>(qRes);
    const quizData = await readJsonSafe<{ quizzes?: Quiz[]; message?: string }>(quizRes);
    if (qRes.ok) setQuestionBank(qData.questions ?? []);
    else setMsg(qData.message ?? "Failed to load questions");
    if (quizRes.ok) setQuizzes(quizData.quizzes ?? []);
    else setMsg(quizData.message ?? "Failed to load quizzes");
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedQuestionDetails = useMemo(
    () =>
      selectedIds
        .map((id) => questionBank.find((q) => q.id === id))
        .filter((q): q is Question => Boolean(q)),
    [selectedIds, questionBank],
  );

  const save = async () => {
    if (selectedIds.length === 0 || !title.trim()) {
      setMsg("Title and at least one question are required");
      return;
    }

    const payload = { title, questionIds: selectedIds, shuffleQuestions, shuffleOptions, scoringMode, initialBudget };
    const url = editingId ? `/api/quizzes/${editingId}` : "/api/quizzes";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      ...withAuthHeaders(
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        "admin",
      ),
    });
    const data = await readJsonSafe<{ message?: string }>(res);
    if (!res.ok) {
      setMsg(data.message ?? "Save failed");
      return;
    }
    setMsg(editingId ? "Quiz updated" : "Quiz created");
    setEditingId(null);
    setTitle("");
    setSelectedIds([]);
    setShuffleQuestions(false);
    setShuffleOptions(false);
    setScoringMode("CLASSIC");
    setInitialBudget(10000);
    await load();
  };

  const edit = (quiz: Quiz) => {
    setEditingId(quiz.id);
    setTitle(quiz.title);
    setShuffleQuestions(quiz.shuffleQuestions);
    setShuffleOptions(quiz.shuffleOptions);
    setScoringMode(quiz.scoringMode);
    setInitialBudget(quiz.initialBudget);
    setSelectedIds(quiz.questions.sort((a, b) => a.order - b.order).map((q) => q.questionId));
  };

  const move = (idx: number, delta: -1 | 1) => {
    setSelectedIds((current) => {
      const next = [...current];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return current;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Admin Quizzes</h1>
      <section className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="text-xl font-semibold">{editingId ? "Edit Quiz" : "Create Quiz"}</h2>
        <div className="mt-3 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz Title" />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
              />
              <span>Shuffle Questions</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
              />
              <span>Shuffle Options</span>
            </label>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm text-slate-300">Scoring Mode</span>
              <select value={scoringMode} onChange={(e) => setScoringMode(e.target.value as "CLASSIC" | "BUDGET")}>
                <option value="CLASSIC">Classic (time-weighted points)</option>
                <option value="BUDGET">Budget Mode</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-sm text-slate-300">Initial Budget</span>
              <input
                type="number"
                min={0}
                value={initialBudget}
                onChange={(e) => setInitialBudget(Number(e.target.value))}
                disabled={scoringMode !== "BUDGET"}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border border-slate-700 p-3">
              <h3 className="mb-2 font-semibold">Question Bank</h3>
              <div className="max-h-72 space-y-2 overflow-auto">
                {questionBank.map((q) => (
                  <label key={q.id} className="flex items-start gap-2 rounded border border-slate-800 p-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(q.id)}
                      onChange={(e) =>
                        setSelectedIds((current) =>
                          e.target.checked ? [...current, q.id] : current.filter((id) => id !== q.id),
                        )
                      }
                    />
                    <span className="text-sm">{q.prompt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded border border-slate-700 p-3">
              <h3 className="mb-2 font-semibold">Quiz Order</h3>
              <div className="max-h-72 space-y-2 overflow-auto">
                {selectedQuestionDetails.map((q, idx) => (
                  <div key={q.id} className="rounded border border-slate-800 p-2">
                    <p className="text-sm">{idx + 1}. {q.prompt}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => move(idx, -1)}>
                        Up
                      </button>
                      <button type="button" onClick={() => move(idx, 1)}>
                        Down
                      </button>
                    </div>
                  </div>
                ))}
                {selectedQuestionDetails.length === 0 && <p className="text-slate-400">Select questions to add.</p>}
              </div>
            </div>
          </div>

          <button type="button" onClick={save}>
            {editingId ? "Update Quiz" : "Create Quiz"}
          </button>
          {msg && <p className="text-sm text-amber-300">{msg}</p>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="text-xl font-semibold">Existing Quizzes</h2>
        <div className="mt-3 space-y-2">
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="rounded border border-slate-800 p-3">
              <p className="font-semibold">{quiz.title}</p>
              <p className="text-sm text-slate-400">
                {quiz.questions.length} questions | {quiz.scoringMode === "BUDGET" ? `Budget (${quiz.initialBudget})` : "Classic"}
              </p>
              <button type="button" onClick={() => edit(quiz)} className="mt-2">
                Edit
              </button>
            </div>
          ))}
          {!quizzes.length && <p className="text-slate-400">No quizzes yet.</p>}
        </div>
      </section>
    </div>
  );
}
