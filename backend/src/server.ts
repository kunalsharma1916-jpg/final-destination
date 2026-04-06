import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { AnswerFormat, Prisma, ScoringMode, SessionPhase } from "@prisma/client";
import { z } from "zod";
import { logRealtimeDebug } from "../../lib/debug-log";
import { resolveDatabaseUrl } from "../../lib/database-url";
import { prisma } from "../../lib/prisma";
import { getRouteLocations } from "../../lib/route-locations";
import { isQuestionVisiblePhase } from "../../lib/session-phase";
import {
  QUESTION_SYNC_LEAD_SEC,
  assertAnswerable,
  assertLaunchable,
  assertNextable,
  assertPauseable,
  assertResumable,
  assertRevealable,
  buildDestinationSnapshot,
  computeAnswerStats,
  computeLeaderboard,
  getQuestionRemainingWindowSec,
  getQuestionRoundId,
  getQuestionScoringEndAt,
  getCurrentQuizQuestion,
  getPointsAwarded,
  getScoreAuditReason,
  getSessionFull,
  isQuestionPendingStart,
  phasePatch,
  toPublicQuestion,
  toSessionSnapshot,
} from "../../lib/quiz-service";
import { attachAuth, issueToken, requireAdmin, requireParticipant, setAuthCookies } from "./auth";
import {
  emitAnswerLocked,
  emitAnswerStats,
  emitDestinationUpdated,
  emitLeaderboard,
  emitRoundCompleted,
  emitRoundStarted,
  emitQuestionRevealed,
  emitQuestionStarted,
  emitSessionCompleted,
  emitSessionUpdated,
} from "./realtime";
import { initSocketServer } from "./socket";

resolveDatabaseUrl();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.BACKEND_CORS_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(attachAuth);

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json(data);
}

function bad(res: Response, message: string, status = 400, extra?: Record<string, unknown>) {
  res.status(status).json({ ok: false, message, ...(extra ?? {}) });
}

function isWarmupRequest(req: Request) {
  return req.headers["x-fd-warmup"] === "1";
}

function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeTeamCode(teamCode: string) {
  return teamCode.trim().toUpperCase();
}

app.get("/", (_req, res) => {
  ok(res, {
    ok: true,
    service: "final-destination-api",
    status: "online",
    health: "/health",
    apiHealth: "/api/health",
  });
});

const participantCreateSchema = z.object({
  username: z.string().trim().min(3).max(40),
  displayName: z.string().trim().max(80).optional().nullable(),
  teamCode: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(8).max(100),
  isActive: z.boolean().optional().default(true),
});

const participantUpdateSchema = z.object({
  displayName: z.string().trim().max(80).optional().nullable(),
  teamCode: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/).optional(),
  password: z.string().min(8).max(100).optional(),
  isActive: z.boolean().optional(),
});

const adminLoginSchema = z.object({
  password: z.string().min(1),
});

const participantLoginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const createQuestionSchema = z.object({
  prompt: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  timeLimitSec: z.number().int().min(5).max(180).default(22),
  points: z.number().int().min(100).max(5000).default(1000),
  explanation: z.string().optional().nullable(),
});

const updateQuestionSchema = z.object({
  prompt: z.string().min(3),
  options: z.array(z.object({ id: z.string().optional(), text: z.string().min(1) })).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  timeLimitSec: z.number().int().min(5).max(180).default(22),
  points: z.number().int().min(100).max(5000).default(1000),
  explanation: z.string().optional().nullable(),
});

const createQuizSchema = z.object({
  title: z.string().min(3),
  questionIds: z.array(z.string()).min(1),
  shuffleQuestions: z.boolean().optional().default(false),
  shuffleOptions: z.boolean().optional().default(false),
  scoringMode: z.nativeEnum(ScoringMode).optional().default(ScoringMode.CLASSIC),
  initialBudget: z.number().int().min(0).max(1000000).optional().default(0),
});

const createSessionSchema = z.object({
  quizId: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
});

const destinationSchema = z
  .object({
    action: z.enum(["next", "previous", "jump"]),
    locationNumber: z.coerce.number().int().positive().optional(),
  })
  .strict();

const answerSchema = z.object({
  optionId: z.string().nullable().optional(),
  textAnswer: z.string().max(200).nullable().optional(),
});

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`select 1`;
    ok(res, { ok: true, status: "healthy" });
  } catch {
    bad(res, "Database unavailable", 503);
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`select 1`;
    ok(res, { ok: true, db: "up" });
  } catch {
    bad(res, "Database unavailable", 503);
  }
});

app.post("/api/auth/admin-login", async (req, res) => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid payload");

  const adminPassword = (process.env.ADMIN_PASSWORD || "").trim() || "kunal";
  if (parsed.data.password !== adminPassword) {
    return bad(res, "Invalid admin password", 401);
  }

  const token = issueToken({ sub: "admin", role: "admin" });
  setAuthCookies(res, { adminToken: token });
  return ok(res, { ok: true, token });
});

app.get("/api/auth/admin-me", requireAdmin, (_req, res) => {
  ok(res, {
    ok: true,
    admin: {
      role: "admin",
    },
  });
});

app.post("/api/auth/participant-login", async (req, res) => {
  const parsed = participantLoginSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid payload");

  const username = normalizeUsername(parsed.data.username);
  const participant = await prisma.participantAccount.findUnique({
    where: { username },
  });

  if (!participant || !participant.isActive) {
    return bad(res, "Invalid credentials", 401);
  }

  const valid = await bcrypt.compare(parsed.data.password, participant.passwordHash);
  if (!valid) return bad(res, "Invalid credentials", 401);

  await prisma.participantAccount.update({
    where: { id: participant.id },
    data: { lastLoginAt: new Date() },
  });

  const token = issueToken({
    sub: participant.id,
    role: "participant",
    username: participant.username,
    teamCode: participant.teamCode,
  });

  setAuthCookies(res, { participantToken: token });
  return ok(res, {
    ok: true,
    token,
    participant: {
      id: participant.id,
      username: participant.username,
      displayName: participant.displayName,
      teamCode: participant.teamCode,
      isActive: participant.isActive,
    },
  });
});

app.get("/api/auth/participant-me", requireParticipant, async (req, res) => {
  const participant = await prisma.participantAccount.findUnique({
    where: { id: req.auth!.sub },
    select: {
      id: true,
      username: true,
      displayName: true,
      teamCode: true,
      isActive: true,
    },
  });

  if (!participant || !participant.isActive) {
    setAuthCookies(res, { participantToken: null });
    return bad(res, "Participant not active", 401);
  }

  return ok(res, { ok: true, participant });
});

app.post("/api/auth/logout", (_req, res) => {
  setAuthCookies(res, { adminToken: null, participantToken: null });
  ok(res, { ok: true });
});

app.get("/api/admin/participants", requireAdmin, async (_req, res) => {
  const participants = await prisma.participantAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      teamCode: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  ok(res, { ok: true, participants });
});

app.post("/api/admin/participants", requireAdmin, async (req, res) => {
  const parsed = participantCreateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid participant payload");

  const payload = parsed.data;
  try {
    const participant = await prisma.participantAccount.create({
      data: {
        username: normalizeUsername(payload.username),
        displayName: payload.displayName?.trim() || null,
        teamCode: normalizeTeamCode(payload.teamCode),
        passwordHash: await bcrypt.hash(payload.password, 10),
        isActive: payload.isActive,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        teamCode: true,
        isActive: true,
        createdAt: true,
      },
    });

    ok(res, { ok: true, participant }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return bad(res, "Username or team code already exists", 409);
    }
    return bad(res, "Could not create participant", 500);
  }
});

app.put("/api/admin/participants/:id", requireAdmin, async (req, res) => {
  const parsed = participantUpdateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid participant payload");

  const id = req.params.id;
  const updateData: Prisma.ParticipantAccountUpdateInput = {};
  if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName?.trim() || null;
  if (parsed.data.teamCode !== undefined) updateData.teamCode = normalizeTeamCode(parsed.data.teamCode);
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.password) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  try {
    const participant = await prisma.participantAccount.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        teamCode: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    ok(res, { ok: true, participant });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return bad(res, "Participant not found", 404);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return bad(res, "Username or team code already exists", 409);
    }
    return bad(res, "Could not update participant", 500);
  }
});
app.get("/api/questions", requireAdmin, async (_req, res) => {
  const questions = await prisma.question.findMany({
    include: { options: true },
    orderBy: { createdAt: "desc" },
  });
  ok(res, { ok: true, questions });
});

app.post("/api/questions", requireAdmin, async (req, res) => {
  const parsed = createQuestionSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid question payload");
  if (parsed.data.correctOptionIndex >= parsed.data.options.length) {
    return bad(res, "correctOptionIndex out of range");
  }

  const question = await prisma.question.create({
    data: {
      prompt: parsed.data.prompt,
      timeLimitSec: parsed.data.timeLimitSec,
      points: parsed.data.points,
      explanation: parsed.data.explanation ?? null,
      answerFormat: "MCQ",
      options: {
        create: parsed.data.options.map((text, idx) => ({
          text,
          isCorrect: idx === parsed.data.correctOptionIndex,
        })),
      },
    },
    include: { options: true },
  });

  ok(res, { ok: true, question }, 201);
});

app.put("/api/questions/:id", requireAdmin, async (req, res) => {
  const parsed = updateQuestionSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid question payload");
  if (parsed.data.correctOptionIndex >= parsed.data.options.length) {
    return bad(res, "correctOptionIndex out of range");
  }

  const id = req.params.id;
  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return bad(res, "Question not found", 404);

  await prisma.option.deleteMany({ where: { questionId: id } });
  const question = await prisma.question.update({
    where: { id },
    data: {
      prompt: parsed.data.prompt,
      timeLimitSec: parsed.data.timeLimitSec,
      points: parsed.data.points,
      explanation: parsed.data.explanation ?? null,
      options: {
        create: parsed.data.options.map((option, idx) => ({
          text: option.text,
          isCorrect: idx === parsed.data.correctOptionIndex,
        })),
      },
    },
    include: { options: true },
  });

  ok(res, { ok: true, question });
});

app.get("/api/quizzes", requireAdmin, async (_req, res) => {
  const quizzes = await prisma.quiz.findMany({
    include: {
      questions: {
        include: {
          question: {
            include: { options: true },
          },
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  ok(res, { ok: true, quizzes });
});

app.post("/api/quizzes", requireAdmin, async (req, res) => {
  const parsed = createQuizSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid quiz payload");

  const uniqueIds = [...new Set(parsed.data.questionIds)];
  const questionsFound = await prisma.question.count({ where: { id: { in: uniqueIds } } });
  if (questionsFound !== uniqueIds.length) return bad(res, "Some question IDs are invalid");

  const quiz = await prisma.quiz.create({
    data: {
      title: parsed.data.title,
      scoringMode: parsed.data.scoringMode,
      initialBudget: parsed.data.scoringMode === ScoringMode.BUDGET ? parsed.data.initialBudget : 0,
      shuffleQuestions: parsed.data.shuffleQuestions,
      shuffleOptions: parsed.data.shuffleOptions,
      questions: {
        create: uniqueIds.map((questionId, idx) => ({
          questionId,
          order: idx,
        })),
      },
    },
    include: {
      questions: {
        include: { question: { include: { options: true } } },
        orderBy: { order: "asc" },
      },
    },
  });

  ok(res, { ok: true, quiz }, 201);
});

app.put("/api/quizzes/:id", requireAdmin, async (req, res) => {
  const parsed = createQuizSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid quiz payload");

  const id = req.params.id;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) return bad(res, "Quiz not found", 404);

  const uniqueIds = [...new Set(parsed.data.questionIds)];
  await prisma.$transaction([
    prisma.quizQuestion.deleteMany({ where: { quizId: id } }),
    prisma.quiz.update({
      where: { id },
      data: {
        title: parsed.data.title,
        scoringMode: parsed.data.scoringMode,
        initialBudget: parsed.data.scoringMode === ScoringMode.BUDGET ? parsed.data.initialBudget : 0,
        shuffleQuestions: parsed.data.shuffleQuestions,
        shuffleOptions: parsed.data.shuffleOptions,
      },
    }),
    prisma.quizQuestion.createMany({
      data: uniqueIds.map((questionId, idx) => ({ quizId: id, questionId, order: idx })),
    }),
  ]);

  const updated = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { include: { question: true }, orderBy: { order: "asc" } } },
  });

  ok(res, { ok: true, quiz: updated });
});

app.delete("/api/quizzes/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  await prisma.quiz.delete({ where: { id } }).catch(() => null);
  ok(res, { ok: true });
});

app.get("/api/sessions", async (_req, res) => {
  const sessions = await prisma.session.findMany({
    include: { quiz: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  ok(res, {
    ok: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      phase: s.phase,
      questionState: s.questionState,
      currentQuestionIndex: s.currentQuestionIndex,
      scoringMode: s.scoringMode,
      initialBudget: s.initialBudget,
      createdAt: s.createdAt.toISOString(),
      quizTitle: s.quiz.title,
    })),
  });
});

app.post("/api/sessions", requireAdmin, async (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid payload");

  const quiz = await prisma.quiz.findUnique({
    where: { id: parsed.data.quizId },
    select: {
      id: true,
      scoringMode: true,
      initialBudget: true,
      _count: {
        select: {
          questions: true,
        },
      },
    },
  });
  if (!quiz) return bad(res, "Quiz not found", 404);
  if (quiz._count.questions === 0) return bad(res, "Quiz has no questions");

  const locations = await getRouteLocations();
  const destinationCount = locations.length > 0 ? locations.length : quiz._count.questions;

  const session = await prisma.session.create({
    data: {
      quizId: quiz.id,
      name: parsed.data.name?.trim() || null,
      scoringMode: quiz.scoringMode,
      initialBudget: quiz.initialBudget,
      ...phasePatch(SessionPhase.DRAFT),
      destinationIndex: 0,
      destinationCount,
    },
    select: {
      id: true,
    },
  });

  const fullSession = await getSessionFull(session.id, { applyTimeoutClose: false });
  if (!fullSession) return bad(res, "Session not found", 404);

  ok(res, { ok: true, session: toSessionSnapshot(fullSession) }, 201);
});

app.get("/api/sessions/active", async (_req, res) => {
  const active = await prisma.session.findFirst({
    where: {
      phase: {
        in: [SessionPhase.LOBBY, SessionPhase.QUESTION_LIVE, SessionPhase.QUESTION_CLOSED, SessionPhase.REVEALED, SessionPhase.PAUSED],
      },
    },
    orderBy: { createdAt: "desc" },
    include: { quiz: true },
  });

  ok(res, {
    ok: true,
    session: active
      ? {
          id: active.id,
          name: active.name,
          status: active.status,
          phase: active.phase,
          quizTitle: active.quiz.title,
        }
      : null,
  });
});

app.get("/api/sessions/:id", async (req, res) => {
  const id = req.params.id;
  let session = await getSessionFull(id);
  if (!session) return bad(res, "Session not found", 404);

  const routeLocations = await getRouteLocations();
  const total = routeLocations.length > 0 ? routeLocations.length : Math.max(session.destinationCount, 1);
  const clampedIndex = Math.max(0, Math.min(session.destinationIndex, total - 1));
  if (session.destinationCount !== total || session.destinationIndex !== clampedIndex) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        destinationCount: total,
        destinationIndex: clampedIndex,
      },
    });
    const refreshed = await getSessionFull(id, { applyTimeoutClose: false });
    if (refreshed) session = refreshed;
  }

  const isAdminViewer = req.auth?.role === "admin";
  const includeStats = isAdminViewer && (req.query.includeStats === "1" || req.query.includeStats === "true");
  const publicQuestion =
    isAdminViewer || isQuestionVisiblePhase(session.phase, session.pausedFromPhase) ? toPublicQuestion(session) : null;
  const currentQuestionId = session.currentQuestion?.questionId ?? null;

  const teamCode = req.auth?.role === "participant" ? req.auth.teamCode ?? null : null;

  const [leaderboard, team, stats] = await Promise.all([
    computeLeaderboard(session.id),
    teamCode
      ? prisma.team.findUnique({
          where: { code_sessionId: { code: teamCode, sessionId: session.id } },
        })
      : null,
    includeStats && currentQuestionId ? computeAnswerStats(session.id, currentQuestionId) : null,
  ]);

  let myAnswer = null;
  if (team && currentQuestionId) {
    myAnswer = await prisma.answer.findFirst({
      where: {
        sessionId: session.id,
        teamId: team.id,
        questionId: currentQuestionId,
      },
      select: {
        optionId: true,
        answerText: true,
        isCorrect: true,
        pointsAwarded: true,
      },
      orderBy: { answeredAt: "desc" },
    });
  }

  ok(res, {
    ok: true,
    session: toSessionSnapshot(session),
    destination: buildDestinationSnapshot(session, routeLocations),
    question: publicQuestion,
    leaderboard,
    stats,
    myAnswer,
  });
});
app.post("/api/sessions/:id/join", requireParticipant, async (req, res) => {
  const id = req.params.id;
  const participantAccount = await prisma.participantAccount.findUnique({
    where: { id: req.auth!.sub },
    select: { isActive: true, teamCode: true },
  });
  if (!participantAccount || !participantAccount.isActive) {
    return bad(res, "Participant account is inactive", 401);
  }

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return bad(res, "Session not found", 404);
  if (session.phase === "ENDED") return bad(res, "Session has ended");
  if (session.phase === "DRAFT") return bad(res, "Session has not started yet");

  const code = normalizeTeamCode(participantAccount.teamCode || "");
  if (!code) return bad(res, "Participant is missing team mapping", 400);

  const team = await prisma.team.upsert({
    where: {
      code_sessionId: {
        code,
        sessionId: id,
      },
    },
    update: {},
    create: {
      code,
      sessionId: id,
    },
  });

  ok(res, {
    ok: true,
    team: {
      id: team.id,
      code: team.code,
      sessionId: team.sessionId,
    },
  });
});

app.post("/api/sessions/:id/answer", requireParticipant, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const participantAccount = await prisma.participantAccount.findUnique({
    where: { id: req.auth!.sub },
    select: { isActive: true, teamCode: true },
  });
  if (!participantAccount || !participantAccount.isActive) {
    return bad(res, "Participant account is inactive", 401);
  }

  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid payload");

  const session = await getSessionFull(id);
  if (!session) return bad(res, "Session not found", 404);

  try {
    assertAnswerable(session);
  } catch (error) {
    return bad(res, error instanceof Error ? error.message : "Question is not answerable");
  }

  const current = getCurrentQuizQuestion(session);
  if (!current) return bad(res, "Question not found", 404);

  const teamCode = normalizeTeamCode(participantAccount.teamCode || "");
  const team = await prisma.team.findUnique({
    where: {
      code_sessionId: {
        code: teamCode,
        sessionId: id,
      },
    },
  });
  if (!team) return bad(res, "Team not joined in this session", 404);

  let selectedOption = null as (typeof current.question.options)[number] | null;
  let isCorrect = false;
  let answerText: string | null = null;

  if (current.question.answerFormat === AnswerFormat.MCQ) {
    if (!parsed.data.optionId) return bad(res, "optionId is required for MCQ questions");
    selectedOption = current.question.options.find((o) => o.id === parsed.data.optionId) ?? null;
    if (!selectedOption) return bad(res, "Invalid option selected");
    const correctOption = current.question.options.find((o) => o.isCorrect) ?? null;
    if (!correctOption) return bad(res, "Question missing correct option");
    isCorrect = selectedOption.id === correctOption.id;
  } else {
    answerText = (parsed.data.textAnswer ?? "").trim();
    if (!current.question.acceptedAnswers?.trim()) {
      return bad(res, "Hint question is missing accepted answers", 500);
    }
    const accepted = current.question.acceptedAnswers
      .split("|")
      .map((v) => normalizeAnswer(v))
      .filter((v) => v.length > 0);
    const normalizedInput = normalizeAnswer(answerText);
    isCorrect = normalizedInput.length > 0 && accepted.includes(normalizedInput);
  }

  try {
    const answer = await prisma.$transaction(async (tx) => {
      const liveSession = await tx.session.findUnique({
        where: { id: session.id },
        select: {
          phase: true,
          questionStartAt: true,
          questionEndAt: true,
          currentQuestionIndex: true,
        },
      });
      if (!liveSession) throw new Error("Session not found");
      if (liveSession.phase !== SessionPhase.QUESTION_LIVE) {
        throw new Error("Question is not open for answers");
      }
      if (isQuestionPendingStart(liveSession.questionStartAt, new Date())) {
        throw new Error("Question is starting");
      }
      if (!liveSession.questionEndAt || liveSession.questionEndAt.getTime() <= Date.now()) {
        throw new Error("Time is up");
      }
      if (liveSession.currentQuestionIndex !== session.currentQuestionIndex) {
        throw new Error("Question changed. Refresh and retry.");
      }

      const answeredAt = new Date();
      const pointsAwarded = getPointsAwarded({
        scoringMode: session.scoringMode,
        questionKind: current.question.kind,
        isCorrect,
        base: current.question.points,
        timeLimitSec: current.question.timeLimitSec,
        endAt: getQuestionScoringEndAt(liveSession.questionEndAt),
        answeredAt,
      });

      const createdAnswer = await tx.answer.create({
        data: {
          sessionId: session.id,
          teamId: team.id,
          questionId: current.question.id,
          optionId: selectedOption?.id ?? null,
          answerText,
          answeredAt,
          isCorrect,
          pointsAwarded,
        },
      });

      await tx.scoreAuditLog.create({
        data: {
          sessionId: session.id,
          teamId: team.id,
          questionId: current.question.id,
          roundId: getQuestionRoundId(current.question.roundLabel, session.activeRoundOrdinal ?? 1),
          delta: pointsAwarded,
          reason: getScoreAuditReason(current.question.kind, isCorrect),
          createdAt: answeredAt,
        },
      });

      return createdAnswer;
    });

    logRealtimeDebug("answer_submission", {
      sessionId: session.id,
      teamCode,
      roundId: getQuestionRoundId(current.question.roundLabel, session.activeRoundOrdinal ?? 1),
      questionId: current.question.id,
      isCorrect,
    });
    logRealtimeDebug("score_change", {
      sessionId: session.id,
      teamCode,
      questionId: current.question.id,
      delta: answer.pointsAwarded,
    });

    void Promise.all([
      emitAnswerLocked(session.id, {
        teamCode,
        roundId: getQuestionRoundId(current.question.roundLabel, session.activeRoundOrdinal ?? 1),
        questionId: current.question.id,
        delta: answer.pointsAwarded,
        serverNowMs: Date.now(),
      }),
      emitAnswerStats(session.id, current.question.id),
    ]).catch(() => null);

    return ok(res, {
      ok: true,
      answer: {
        id: answer.id,
        isCorrect: answer.isCorrect,
        pointsAwarded: answer.pointsAwarded,
        answerText: answer.answerText,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return bad(res, "Answer already submitted for this question", 409);
    }
    if (error instanceof Error) {
      return bad(res, error.message, 409);
    }
    return bad(res, "Answer submission failed", 409);
  }
});

app.post("/api/sessions/:id/start", requireAdmin, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const session = await getSessionFull(id);
  if (!session) return bad(res, "Session not found", 404);
  if (session.phase === SessionPhase.ENDED) return bad(res, "Session ended");
  if (session.phase !== SessionPhase.DRAFT) {
    return bad(res, "Session can only be started once from draft");
  }

  const patch = phasePatch(SessionPhase.LOBBY);
  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: SessionPhase.DRAFT,
    },
    data: {
      ...patch,
      questionStartAt: null,
      questionEndAt: null,
      pauseRemainingSec: null,
      currentQuestionIndex: 0,
      destinationIndex: 0,
    },
  });

  if (updatedCount.count === 0) {
    return bad(res, "Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  logRealtimeDebug("session_start", {
    sessionId: id,
    activeRoundId: updated.activeRound?.id ?? null,
  });

  void Promise.all([emitSessionUpdated(id), emitLeaderboard(id), emitDestinationUpdated(id)]).catch(() => null);
  ok(res, { ok: true, session: toSessionSnapshot(updated) });
});

app.post("/api/sessions/:id/launch", requireAdmin, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const session = await getSessionFull(id);
  if (!session) return bad(res, "Session not found", 404);

  try {
    assertLaunchable(session);
  } catch (error) {
    return bad(res, error instanceof Error ? error.message : "Cannot launch question");
  }

  const current = getCurrentQuizQuestion(session);
  if (!current) return bad(res, "Question unavailable", 404);
  const now = new Date();
  const startAt = new Date(now.getTime() + QUESTION_SYNC_LEAD_SEC * 1000);
  const endAt = new Date(startAt.getTime() + current.question.timeLimitSec * 1000);
  const patch = phasePatch(SessionPhase.QUESTION_LIVE);

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: SessionPhase.LOBBY,
    },
    data: {
      ...patch,
      questionStartAt: startAt,
      questionEndAt: endAt,
      pauseRemainingSec: null,
    },
  });
  if (updatedCount.count === 0) {
    return bad(res, "Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  logRealtimeDebug("question_start", {
    sessionId: id,
    roundId: updated.activeRound?.id ?? null,
    questionId: updated.currentQuestion?.question.id ?? null,
  });

  const realtimeTasks = [emitSessionUpdated(id), emitQuestionStarted(id)];
  if ((updated.activeRoundQuestionIndex ?? 0) === 1 && updated.activeRound) {
    realtimeTasks.push(
      emitRoundStarted(id, {
        roundId: updated.activeRound.id,
        roundKey: updated.activeRound.key,
        roundTitle: updated.activeRound.title,
        ordinal: updated.activeRound.ordinal,
      }),
    );
  }

  void Promise.all(realtimeTasks).catch(() => null);
  ok(res, {
    ok: true,
    session: toSessionSnapshot(updated),
    question: toPublicQuestion(updated),
  });
});

app.post("/api/sessions/:id/reveal", requireAdmin, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const session = await getSessionFull(id);
  if (!session) return bad(res, "Session not found", 404);

  try {
    assertRevealable(session);
  } catch (error) {
    return bad(res, error instanceof Error ? error.message : "Cannot reveal answer");
  }

  const current = getCurrentQuizQuestion(session);
  if (!current) return bad(res, "No active question");

  let correctOptionId: string | null = null;
  if (current.question.answerFormat === AnswerFormat.MCQ) {
    const correctOption = current.question.options.find((opt) => opt.isCorrect);
    if (!correctOption) return bad(res, "Correct option missing");
    correctOptionId = correctOption.id;
  }

  const patch = phasePatch(SessionPhase.REVEALED);
  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: { in: [SessionPhase.QUESTION_LIVE, SessionPhase.QUESTION_CLOSED] },
    },
    data: {
      ...patch,
      questionEndAt: new Date(),
      pauseRemainingSec: null,
    },
  });

  if (updatedCount.count === 0) {
    return bad(res, "Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  void Promise.all([
    emitSessionUpdated(id),
    emitQuestionRevealed(id, {
      correctOptionId,
      explanation: current.question.explanation ?? null,
    }),
    emitAnswerStats(id, current.questionId),
  ]).catch(() => null);

  ok(res, {
    ok: true,
    session: toSessionSnapshot(updated),
    reveal: {
      correctOptionId,
      explanation: current.question.explanation ?? null,
    },
  });
});
app.post("/api/sessions/:id/next", requireAdmin, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const session = await getSessionFull(id);
  if (!session) return bad(res, "Session not found", 404);

  try {
    assertNextable(session);
  } catch (error) {
    return bad(res, error instanceof Error ? error.message : "Cannot move to next question");
  }

  const nextIndex = session.currentQuestionIndex + 1;
  const hasMore = nextIndex < session.questionCount;
  const patch = hasMore ? phasePatch(SessionPhase.LOBBY) : phasePatch(SessionPhase.ENDED);

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: SessionPhase.REVEALED,
      currentQuestionIndex: session.currentQuestionIndex,
    },
    data: {
      ...patch,
      currentQuestionIndex: hasMore ? nextIndex : session.currentQuestionIndex,
      questionStartAt: null,
      questionEndAt: null,
      pauseRemainingSec: null,
    },
  });

  if (updatedCount.count === 0) {
    return bad(res, "Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  const crossedRoundBoundary =
    hasMore && session.activeRound && updated.activeRound && session.activeRound.id !== updated.activeRound.id;

  if (crossedRoundBoundary && session.activeRound) {
    logRealtimeDebug("round_complete", {
      sessionId: id,
      roundId: session.activeRound.id,
      roundTitle: session.activeRound.title,
    });
  }

  const realtimeTasks = [emitSessionUpdated(id), emitLeaderboard(id)];
  if (crossedRoundBoundary && session.activeRound) {
    realtimeTasks.push(
      emitRoundCompleted(id, {
        roundId: session.activeRound.id,
        roundKey: session.activeRound.key,
        roundTitle: session.activeRound.title,
        ordinal: session.activeRound.ordinal,
      }),
    );
  }
  if (!hasMore) {
    realtimeTasks.push(emitSessionCompleted(id, toSessionSnapshot(updated)));
  }

  void Promise.all(realtimeTasks).catch(() => null);
  ok(res, { ok: true, session: toSessionSnapshot(updated) });
});

app.post("/api/sessions/:id/pause", requireAdmin, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const session = await getSessionFull(id);
  if (!session) return bad(res, "Session not found", 404);

  try {
    assertPauseable(session);
  } catch (error) {
    return bad(res, error instanceof Error ? error.message : "Cannot pause session");
  }

  const remainingSec =
    session.phase === SessionPhase.QUESTION_LIVE && session.questionEndAt
      ? getQuestionRemainingWindowSec({
          startAt: session.questionStartAt,
          endAt: session.questionEndAt,
        })
      : null;

  const patch = phasePatch(SessionPhase.PAUSED, session.phase);
  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: {
        in: [SessionPhase.LOBBY, SessionPhase.QUESTION_LIVE, SessionPhase.QUESTION_CLOSED, SessionPhase.REVEALED],
      },
    },
    data: {
      ...patch,
      pauseRemainingSec: remainingSec,
      questionStartAt: null,
      questionEndAt: null,
    },
  });

  if (updatedCount.count === 0) {
    return bad(res, "Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  void emitSessionUpdated(id).catch(() => null);
  ok(res, { ok: true, session: toSessionSnapshot(updated) });
});

app.post("/api/sessions/:id/resume", requireAdmin, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const session = await getSessionFull(id, { applyTimeoutClose: false });
  if (!session) return bad(res, "Session not found", 404);

  try {
    assertResumable(session);
  } catch (error) {
    return bad(res, error instanceof Error ? error.message : "Cannot resume session");
  }

  const restorePhase = session.pausedFromPhase ?? SessionPhase.LOBBY;
  const safeRestorePhase =
    restorePhase === SessionPhase.PAUSED || restorePhase === SessionPhase.ENDED || restorePhase === SessionPhase.DRAFT
      ? SessionPhase.LOBBY
      : restorePhase;
  const shouldResumeQuestion = safeRestorePhase === SessionPhase.QUESTION_LIVE;
  const hasRemaining = (session.pauseRemainingSec ?? 0) > 0;

  const resumedPhase = shouldResumeQuestion
    ? hasRemaining
      ? SessionPhase.QUESTION_LIVE
      : SessionPhase.QUESTION_CLOSED
    : safeRestorePhase;

  const startAt =
    resumedPhase === SessionPhase.QUESTION_LIVE ? new Date(Date.now() + QUESTION_SYNC_LEAD_SEC * 1000) : null;
  const endAt =
    resumedPhase === SessionPhase.QUESTION_LIVE && startAt
      ? new Date(startAt.getTime() + (session.pauseRemainingSec ?? 0) * 1000)
      : null;
  const patch = phasePatch(resumedPhase);

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: SessionPhase.PAUSED,
    },
    data: {
      ...patch,
      questionStartAt: startAt,
      questionEndAt: endAt,
      pauseRemainingSec: null,
    },
  });

  if (updatedCount.count === 0) {
    return bad(res, "Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  void emitSessionUpdated(id).catch(() => null);
  ok(res, { ok: true, session: toSessionSnapshot(updated) });
});

app.post("/api/sessions/:id/end", requireAdmin, async (req, res) => {
  if (isWarmupRequest(req)) return ok(res, { ok: true, warm: true });
  const id = req.params.id;
  const session = await getSessionFull(id, { applyTimeoutClose: false });
  if (!session) return bad(res, "Session not found", 404);
  if (session.phase === SessionPhase.ENDED) return bad(res, "Session already ended");

  const patch = phasePatch(SessionPhase.ENDED);
  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      phase: { not: SessionPhase.ENDED },
    },
    data: {
      ...patch,
      questionEndAt: null,
      pauseRemainingSec: null,
    },
  });

  if (updatedCount.count === 0) {
    return bad(res, "Session state changed. Refresh and try again.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  logRealtimeDebug("session_complete", {
    sessionId: id,
  });

  const snapshot = toSessionSnapshot(updated);
  void Promise.all([emitSessionUpdated(id, snapshot), emitLeaderboard(id), emitSessionCompleted(id, snapshot)]).catch(() => null);
  ok(res, { ok: true, session: snapshot });
});

app.post("/api/sessions/:id/destination", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const parsed = destinationSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, "Invalid destination payload");

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      phase: true,
      destinationIndex: true,
      destinationCount: true,
    },
  });
  if (!session) return bad(res, "Session not found", 404);
  if (session.phase === SessionPhase.ENDED) return bad(res, "Session has ended");

  const locations = await getRouteLocations();
  const total = locations.length > 0 ? locations.length : Math.max(session.destinationCount, 1);
  const currentIndex = Math.max(0, Math.min(session.destinationIndex, total - 1));
  let targetIndex = currentIndex;

  if (parsed.data.action === "next") {
    if (currentIndex >= total - 1) return bad(res, "Already at last location");
    targetIndex = currentIndex + 1;
  } else if (parsed.data.action === "previous") {
    if (currentIndex <= 0) return bad(res, "Already at first location");
    targetIndex = currentIndex - 1;
  } else {
    const number = parsed.data.locationNumber;
    if (!number) return bad(res, "locationNumber is required for jump");
    if (number < 1 || number > total) return bad(res, `locationNumber must be between 1 and ${total}`);
    targetIndex = number - 1;
  }

  const updatedCount = await prisma.session.updateMany({
    where: {
      id,
      destinationIndex: session.destinationIndex,
      phase: { not: SessionPhase.ENDED },
    },
    data: {
      destinationIndex: targetIndex,
      destinationCount: total,
    },
  });

  if (updatedCount.count === 0) {
    return bad(res, "Destination changed concurrently. Refresh and retry.", 409);
  }

  const updated = await getSessionFull(id, { applyTimeoutClose: false });
  if (!updated) return bad(res, "Session not found", 404);

  void Promise.all([emitSessionUpdated(id), emitDestinationUpdated(id)]).catch(() => null);
  ok(res, {
    ok: true,
    session: toSessionSnapshot(updated),
    destination: buildDestinationSnapshot(updated, locations),
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: (error?: unknown) => void) => {
  if (err instanceof Error && err.message === "Origin not allowed") {
    return bad(res, "Origin not allowed", 403);
  }
  console.error(err);
  return bad(res, "Internal server error", 500);
});

const port = Number(process.env.BACKEND_PORT || process.env.PORT || 4000);
const server = createServer(app);
initSocketServer(server);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Final Destination backend listening on :${port}`);
});
