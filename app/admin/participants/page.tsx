"use client";

import { useEffect, useState } from "react";
import { readJsonSafe } from "@/lib/client-response";
import { withAuthHeaders } from "@/lib/client-api";

type Participant = {
  id: string;
  username: string;
  displayName: string | null;
  teamCode: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export default function AdminParticipantsPage() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    teamCode: "",
    password: "",
    isActive: true,
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/admin/participants", withAuthHeaders({ cache: "no-store" }, "admin"));
    const payload = await readJsonSafe<{ participants?: Participant[]; message?: string }>(res);
    if (!res.ok) {
      setMsg(payload.message ?? "Unable to load participants");
      return;
    }
    setParticipants(payload.participants ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    const res = await fetch(
      "/api/admin/participants",
      withAuthHeaders(
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
        "admin",
      ),
    );
    const payload = await readJsonSafe<{ message?: string }>(res);
    setBusy(false);
    if (!res.ok) {
      setMsg(payload.message ?? "Create failed");
      return;
    }
    setMsg("Participant created");
    setForm({
      username: "",
      displayName: "",
      teamCode: "",
      password: "",
      isActive: true,
    });
    await load();
  };

  const toggleActive = async (participant: Participant) => {
    const res = await fetch(
      `/api/admin/participants/${participant.id}`,
      withAuthHeaders(
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !participant.isActive }),
        },
        "admin",
      ),
    );
    const payload = await readJsonSafe<{ message?: string }>(res);
    if (!res.ok) {
      setMsg(payload.message ?? "Update failed");
      return;
    }
    await load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Participant Accounts</h1>
      <section className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="text-xl font-semibold">Create Participant Login</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input
            placeholder="username"
            value={form.username}
            onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))}
          />
          <input
            placeholder="display name (optional)"
            value={form.displayName}
            onChange={(e) => setForm((v) => ({ ...v, displayName: e.target.value }))}
          />
          <input
            placeholder="team code (e.g. TEAM01)"
            value={form.teamCode}
            onChange={(e) => setForm((v) => ({ ...v, teamCode: e.target.value.toUpperCase() }))}
          />
          <input
            placeholder="password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
          />
        </div>
        <label className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))}
          />
          <span>Active</span>
        </label>
        <button className="mt-3" onClick={() => void create()} disabled={busy}>
          {busy ? "Creating..." : "Create Login"}
        </button>
        {msg && <p className="mt-2 text-sm text-amber-300">{msg}</p>}
      </section>

      <section className="rounded-lg border border-slate-700 bg-panel/70 p-4">
        <h2 className="text-xl font-semibold">Existing Logins</h2>
        <div className="mt-3 space-y-2">
          {participants.map((p) => (
            <div key={p.id} className="rounded border border-slate-700 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {p.username} <span className="text-slate-400">({p.teamCode})</span>
                  </p>
                  <p className="text-sm text-slate-400">
                    {p.displayName || "No display name"} | Last login: {p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleString() : "Never"}
                  </p>
                </div>
                <button onClick={() => void toggleActive(p)}>{p.isActive ? "Deactivate" : "Activate"}</button>
              </div>
            </div>
          ))}
          {participants.length === 0 && <p className="text-slate-400">No participant accounts yet.</p>}
        </div>
      </section>
    </div>
  );
}
