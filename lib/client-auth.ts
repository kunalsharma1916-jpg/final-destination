"use client";

const ADMIN_KEY = "fd_admin_token";
const PARTICIPANT_KEY = "fd_participant_token";
const PARTICIPANT_TEAM_KEY = "fd_participant_team";
const PARTICIPANT_USER_KEY = "fd_participant_username";

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // no-op in blocked storage mode
  }
}

export function getAdminToken() {
  return safeGet(ADMIN_KEY);
}

export function setAdminToken(token: string | null) {
  safeSet(ADMIN_KEY, token);
}

export function getParticipantToken() {
  return safeGet(PARTICIPANT_KEY);
}

export function setParticipantAuth(input: { token: string | null; teamCode?: string | null; username?: string | null }) {
  safeSet(PARTICIPANT_KEY, input.token);
  if (input.teamCode !== undefined) safeSet(PARTICIPANT_TEAM_KEY, input.teamCode ?? null);
  if (input.username !== undefined) safeSet(PARTICIPANT_USER_KEY, input.username ?? null);
}

export function getParticipantTeamCode() {
  return safeGet(PARTICIPANT_TEAM_KEY);
}

export function getParticipantUsername() {
  return safeGet(PARTICIPANT_USER_KEY);
}

export function clearClientAuth() {
  safeSet(ADMIN_KEY, null);
  safeSet(PARTICIPANT_KEY, null);
  safeSet(PARTICIPANT_TEAM_KEY, null);
  safeSet(PARTICIPANT_USER_KEY, null);
}
