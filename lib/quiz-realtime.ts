import { getSocketServer } from "@/lib/socket-server";
import { getRouteLocations } from "@/lib/route-locations";
import {
  buildDestinationSnapshot,
  computeAnswerStats,
  computeLeaderboard,
  getSessionFull,
  toPublicQuestion,
  toSessionSnapshot,
} from "@/lib/quiz-service";

export async function emitSessionUpdated(sessionId: string) {
  const io = getSocketServer();
  if (!io) return;
  const session = await getSessionFull(sessionId);
  if (!session) return;
  io.to(`session:${sessionId}`).emit("session_updated", toSessionSnapshot(session));
}

export async function emitQuestionStarted(sessionId: string) {
  const io = getSocketServer();
  if (!io) return;
  const session = await getSessionFull(sessionId);
  if (!session) return;
  io.to(`session:${sessionId}`).emit("question_started", {
    session: toSessionSnapshot(session),
    question: toPublicQuestion(session),
  });
}

export async function emitAnswerStats(sessionId: string, questionId: string) {
  const io = getSocketServer();
  if (!io) return;
  const [stats, leaderboard] = await Promise.all([
    computeAnswerStats(sessionId, questionId),
    computeLeaderboard(sessionId),
  ]);
  io.to(`session:${sessionId}`).emit("answer_stats_updated", stats);
  io.to(`session:${sessionId}`).emit("leaderboard_updated", leaderboard);
}

export async function emitQuestionRevealed(sessionId: string, payload: { correctOptionId: string | null; explanation: string | null }) {
  const io = getSocketServer();
  if (!io) return;
  io.to(`session:${sessionId}`).emit("question_revealed", payload);
}

export async function emitLeaderboard(sessionId: string) {
  const io = getSocketServer();
  if (!io) return;
  const leaderboard = await computeLeaderboard(sessionId);
  io.to(`session:${sessionId}`).emit("leaderboard_updated", leaderboard);
}

export async function emitDestinationUpdated(sessionId: string) {
  const io = getSocketServer();
  if (!io) return;
  const [session, locations] = await Promise.all([getSessionFull(sessionId), getRouteLocations()]);
  if (!session) return;
  io.to(`session:${sessionId}`).emit("destination_updated", {
    session: toSessionSnapshot(session),
    destination: buildDestinationSnapshot(session, locations),
  });
}
