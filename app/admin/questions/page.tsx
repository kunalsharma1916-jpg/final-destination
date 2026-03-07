"use client";

import { useEffect, useMemo, useState } from "react";
import { withAuthHeaders } from "@/lib/client-api";
import { readJsonSafe } from "@/lib/client-response";

type Question = {
  id: string;
  prompt: string;
  timeLimitSec: number;
  points: number;
  explanation: string | null;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
};

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    prompt: "",
    options: ["", "", "", ""],
    correctOptionIndex: 0,
    timeLimitSec: 20,
    points: 1000,
    explanation: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/questions", withAuthHeaders({ cache: "no-store" }, "admin"));
    const payload = await readJsonSafe<{ questions?: Question[]; message?: string }>(res);
    if (res.ok) setQuestions(payload.questions ?? []);
    else setMessage(payload.message ?? "Failed to load questions");
  };

  useEffect(() => {
    void load();
  }, []);

  const sanitizedOptions = useMemo(
    () => draft.options.map((o) => o.trim()).filter(Boolean),
    [draft.options],
  );

  const save = async () => {
    if (sanitizedOptions.length < 2) {
      setMessage("At least 2 options required");
      return;
    }
    if (draft.correctOptionIndex >= sanitizedOptions.length) {
      setMessage("Correct option index out of range");
      return;
    }

    const payload = {
      prompt: draft.prompt,
      options: sanitizedOptions,
      correctOptionIndex: draft.correctOptionIndex,
      timeLimitSec: draft.timeLimitSec,
      points: draft.points,
      explanation: draft.explanation || null,
    };
    const url = editingId ? `/api/questions/${editingId}` : "/api/questions";
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
      setMessage(data.message ?? "Save failed");
      return;
    }
    setMessage(editingId ? "Question updated" : "Question created");
    setEditingId(null);
    setDraft({
      prompt: "",
      options: ["", "", "", ""],
      correctOptionIndex: 0,
      timeLimitSec: 20,
      points: 1000,
      explanation: "",
    });
    await load();
  };

  const edit = (question: Question) => {
    const options = question.options.map((o) => o.text);
    while (options.length < 4) options.push("");
    setDraft({
      prompt: question.prompt,
      options,
      correctOptionIndex: question.options.findIndex((o) => o.isCorrect),
      timeLimitSec: question.timeLimitSec,
      points: question.points,
      explanation: question.explanation ?? "",
    });
    setEditingId(question.id);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Admin Questions</h1>
      <div className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="text-xl font-semibold">{editingId ? "Edit Question" : "Create Question"}</h2>
        <div className="mt-3 space-y-2">
          <textarea
            className="w-full"
            rows={3}
            value={draft.prompt}
            onChange={(e) => setDraft((v) => ({ ...v, prompt: e.target.value }))}
            placeholder="Question prompt"
          />
          <div className="grid gap-2 md:grid-cols-2">
            {draft.options.map((opt, idx) => (
              <input
                key={idx}
                value={opt}
                onChange={(e) =>
                  setDraft((v) => ({
                    ...v,
                    options: v.options.map((item, i) => (i === idx ? e.target.value : item)),
                  }))
                }
                placeholder={`Option ${idx + 1}`}
              />
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <label>
              <span className="mb-1 block text-sm text-slate-300">Correct Option Index</span>
              <input
                type="number"
                min={0}
                value={draft.correctOptionIndex}
                onChange={(e) => setDraft((v) => ({ ...v, correctOptionIndex: Number(e.target.value) }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-sm text-slate-300">Time Limit (s)</span>
              <input
                type="number"
                min={5}
                value={draft.timeLimitSec}
                onChange={(e) => setDraft((v) => ({ ...v, timeLimitSec: Number(e.target.value) }))}
              />
            </label>
            <label>
              <span className="mb-1 block text-sm text-slate-300">Points</span>
              <input
                type="number"
                min={100}
                value={draft.points}
                onChange={(e) => setDraft((v) => ({ ...v, points: Number(e.target.value) }))}
              />
            </label>
          </div>
          <input
            value={draft.explanation}
            onChange={(e) => setDraft((v) => ({ ...v, explanation: e.target.value }))}
            placeholder="Explanation (optional)"
          />
          <div className="flex gap-2">
            <button type="button" onClick={save}>
              {editingId ? "Update Question" : "Create Question"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft({
                    prompt: "",
                    options: ["", "", "", ""],
                    correctOptionIndex: 0,
                    timeLimitSec: 20,
                    points: 1000,
                    explanation: "",
                  });
                }}
              >
                Cancel
              </button>
            )}
          </div>
          {message && <p className="text-sm text-amber-300">{message}</p>}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="text-xl font-semibold">Question Bank</h2>
        <div className="mt-3 space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="rounded border border-slate-700 p-3">
              <p className="font-semibold">{q.prompt}</p>
              <p className="text-sm text-slate-400">
                {q.timeLimitSec}s | {q.points} pts
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {q.options.map((o) => (
                  <li key={o.id} className={o.isCorrect ? "text-emerald-300" : "text-slate-300"}>
                    {o.text}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => edit(q)} className="mt-3">
                Edit
              </button>
            </div>
          ))}
          {!questions.length && <p className="text-slate-400">No questions yet.</p>}
        </div>
      </div>
    </div>
  );
}
