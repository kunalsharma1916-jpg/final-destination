"use client";

import { getAdminToken, getParticipantToken } from "@/lib/client-auth";

type AuthMode = "admin" | "participant" | "any" | "none";

export function withAuthHeaders(init: RequestInit = {}, mode: AuthMode = "none"): RequestInit {
  if (mode === "none") return init;
  const headers = new Headers(init.headers ?? {});
  const token =
    mode === "admin" ? getAdminToken() : mode === "participant" ? getParticipantToken() : getAdminToken() || getParticipantToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return {
    ...init,
    headers,
  };
}
