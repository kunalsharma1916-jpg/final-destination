"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="space-y-6 py-4">
      <header className="rounded-xl border border-slate-700 bg-panel/70 p-5">
        <h1 className="text-3xl font-bold">Final Destination Control Hub</h1>
        <p className="mt-2 text-slate-300">Choose a panel below.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-slate-700 bg-panel/70 p-5">
          <h2 className="text-2xl font-bold">Admin Panel</h2>
          <p className="mt-2 text-sm text-slate-300">Start/pause event, unlock stages/hints, disputes, freeze results.</p>
          <Link
            href="/admin"
            className="mt-4 inline-block rounded-md border border-slate-600 bg-slate-900 px-4 py-2 font-semibold hover:border-slate-400"
          >
            Open Admin
          </Link>
          <div className="mt-3 flex gap-2 text-sm">
            <Link href="/admin/questions">Questions</Link>
            <Link href="/admin/quizzes">Quizzes</Link>
            <Link href="/admin/session">Session</Link>
          </div>
        </article>

        <article className="rounded-xl border border-slate-700 bg-panel/70 p-5">
          <h2 className="text-2xl font-bold">Screen Panel</h2>
          <p className="mt-2 text-sm text-slate-300">Projector mode for judges and live leaderboard screen.</p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/screen/display"
              className="inline-block rounded-md border border-slate-600 bg-slate-900 px-4 py-2 font-semibold hover:border-slate-400"
            >
              Open Display
            </Link>
            <Link
              href="/screen/leaderboard"
              className="inline-block rounded-md border border-slate-600 bg-slate-900 px-4 py-2 font-semibold hover:border-slate-400"
            >
              Leaderboard
            </Link>
          </div>
        </article>

        <article className="rounded-xl border border-slate-700 bg-panel/70 p-5">
          <h2 className="text-2xl font-bold">Participant Panel</h2>
          <p className="mt-2 text-sm text-slate-300">Secure participant login and gameplay access.</p>
          <button
            className="mt-4 w-full bg-accent/20 font-semibold text-accent"
            type="button"
            onClick={() => router.push("/participant")}
          >
            Open Participant
          </button>
        </article>
      </section>
    </div>
  );
}
