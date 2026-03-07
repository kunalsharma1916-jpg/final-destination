import type { Server as SocketServer } from "socket.io";
import { getRouteLocations } from "../../lib/route-locations";
import {
  buildDestinationSnapshot,
  computeAnswerStats,
  computeLeaderboard,
  getSessionFull,
  toPublicQuestion,
  toSessionSnapshot,
} from "../../lib/quiz-service";

let ioRef: SocketServer | null = null;

export function registerIo(io: SocketServer) {
  ioRef = io;
}

function room(sessionId: string) {
  return `session:${sessionId}`;
}

function io() {
  return ioRef;
}

export async function emitSessionUpdated(sessionId: string) {
  const server = io();
  if (!server) return;
  const session = await getSessionFull(sessionId);
  if (!session) return;
  server.to(room(sessionId)).emit("session_updated", toSessionSnapshot(session));
}

export async function emitQuestionStarted(sessionId: string) {
  const server = io();
  if (!server) return;
  const session = await getSessionFull(sessionId);
  if (!session) return;
  server.to(room(sessionId)).emit("question_started", {
    session: toSessionSnapshot(session),
    question: toPublicQuestion(session),
  });
}

export async function emitAnswerStats(sessionId: string, questionId: string) {
  const server = io();
  if (!server) return;
  const [stats, leaderboard] = await Promise.all([
    computeAnswerStats(sessionId, questionId),
    computeLeaderboard(sessionId),
  ]);
  server.to(room(sessionId)).emit("answer_stats_updated", stats);
  server.to(room(sessionId)).emit("leaderboard_updated", leaderboard);
}

export async function emitQuestionRevealed(sessionId: string, payload: { correctOptionId: string | null; explanation: string | null }) {
  const server = io();
  if (!server) return;
  server.to(room(sessionId)).emit("question_revealed", payload);
}

export async function emitLeaderboard(sessionId: string) {
  const server = io();
  if (!server) return;
  const leaderboard = await computeLeaderboard(sessionId);
  server.to(room(sessionId)).emit("leaderboard_updated", leaderboard);
}

export async function emitDestinationUpdated(sessionId: string) {
  const server = io();
  if (!server) return;
  const [session, locations] = await Promise.all([getSessionFull(sessionId), getRouteLocations()]);
  if (!session) return;
  server.to(room(sessionId)).emit("destination_updated", {
    session: toSessionSnapshot(session),
    destination: buildDestinationSnapshot(session, locations),
  });
}
