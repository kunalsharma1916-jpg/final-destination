"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readJsonSafe } from "@/lib/client-response";
import { clearClientAuth, setAdminToken } from "@/lib/client-auth";
import { withAuthHeaders } from "@/lib/client-api";

export default function AdminHomePage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const verify = async () => {
      const res = await fetch("/api/auth/admin-me", withAuthHeaders({ cache: "no-store" }, "admin"));
      setAuthenticated(res.ok);
    };
    void verify();
  }, []);

  const login = async () => {
    if (!password.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(
      "/api/auth/admin-login",
      withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        },
        "none",
      ),
    );
    const payload = await readJsonSafe<{ ok?: boolean; token?: string; message?: string }>(res);
    setBusy(false);
    if (!res.ok || !payload.ok) {
      if (!payload.message) {
        setMsg("Admin login failed. Backend may be offline. Run `npm.cmd run backend:dev` (or `npm.cmd run dev:all`).");
      } else {
        setMsg(payload.message);
      }
      return;
    }
    if (payload.token) setAdminToken(payload.token);
    setAuthenticated(true);
    setPassword("");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    clearClientAuth();
    setAuthenticated(false);
  };

  if (!authenticated) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="w-full max-w-md rounded-lg border border-slate-700 bg-panel/70 p-6">
          <h1 className="text-3xl font-bold">Admin Login</h1>
          <p className="mt-2 text-slate-300">Enter admin password.</p>
          <input
            className="mt-4 w-full"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void login();
            }}
            placeholder="Password"
          />
          {msg && <p className="mt-2 text-sm text-amber-300">{msg}</p>}
          <button className="mt-4 w-full bg-accent/20 font-semibold text-accent" onClick={() => void login()} disabled={busy}>
            {busy ? "Signing in..." : "Login"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quiz Admin</h1>
          <p className="text-slate-300">Create questions, build quizzes, manage participants, and run live sessions.</p>
        </div>
        <button type="button" onClick={() => void logout()}>
          Logout
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Link className="rounded-lg border border-slate-700 bg-panel/70 p-4 text-xl font-semibold" href="/admin/questions">
          Question Bank
        </Link>
        <Link className="rounded-lg border border-slate-700 bg-panel/70 p-4 text-xl font-semibold" href="/admin/quizzes">
          Quiz Builder
        </Link>
        <Link className="rounded-lg border border-slate-700 bg-panel/70 p-4 text-xl font-semibold" href="/admin/session">
          Live Session
        </Link>
        <Link className="rounded-lg border border-slate-700 bg-panel/70 p-4 text-xl font-semibold" href="/admin/participants">
          Participants
        </Link>
      </div>
    </div>
  );
}
