import {
  AnswerFormat,
  Prisma,
  QuestionKind,
  QuestionState,
  ScoringMode,
  SessionPhase,
  SessionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RouteLocation } from "@/lib/route-locations";
import type { AnswerStats, LeaderboardRow, PublicQuestion, SessionSnapshot } from "@/types/quiz";

export type SessionWithQuiz = Prisma.SessionGetPayload<{
  include: {
    quiz: {
      include: {
        questions: {
          include: {
            question: {
              include: { options: true };
            };
          };
          orderBy: { order: "asc" };
        };
      };
    };
  };
}>;

export type DestinationSnapshot = {
  currentIndex: number;
  currentNumber: number;
  total: number;
  currentLocation: RouteLocation | null;
  locations: RouteLocation[];
};

function shuffleArray<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "for",
  "from",
  "with",
  "port",
  "city",
  "tower",
  "towers",
  "national",
  "reserve",
  "museum",
  "park",
  "island",
]);

function collectSensitiveTerms(country: string | null, location: string | null) {
  const out = new Set<string>();
  const push = (value: string | null | undefined) => {
    const term = (value ?? "").trim();
    if (!term || STOP_WORDS.has(term.toLowerCase())) return;
    out.add(term);
  };

  push(country);
  push(location);

  const segments = (location ?? "")
    .split(/[\/|(),-]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const segment of segments) {
    push(segment);
    const words = segment.split(/\\s+/).filter(Boolean);
    if (words[0]) push(words[0]);
    if (words.length >= 2) push(`${words[0]} ${words[1]}`);
  }

  return [...out].sort((a, b) => b.length - a.length);
}

function sanitizePrompt(prompt: string, country: string | null, location: string | null) {
  let sanitized = prompt;
  const tokens = collectSensitiveTerms(country, location);

  for (const token of tokens) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
    sanitized = sanitized.replace(pattern, "this destination");
  }

  return sanitized;
}

function legacyForPhase(phase: SessionPhase, pausedFromPhase: SessionPhase | null) {
  switch (phase) {
    case SessionPhase.DRAFT:
    case SessionPhase.LOBBY:
      return { status: SessionStatus.LOBBY, questionState: QuestionState.IDLE };
    case SessionPhase.QUESTION_LIVE:
      return { status: SessionStatus.LIVE, questionState: QuestionState.OPEN };
    case SessionPhase.QUESTION_CLOSED:
      return { status: SessionStatus.LIVE, questionState: QuestionState.IDLE };
    case SessionPhase.REVEALED:
      return { status: SessionStatus.LIVE, questionState: QuestionState.REVEALED };
    case SessionPhase.PAUSED:
      if (pausedFromPhase === SessionPhase.QUESTION_LIVE) {
        return { status: SessionStatus.PAUSED, questionState: QuestionState.OPEN };
      }
      if (pausedFromPhase === SessionPhase.REVEALED) {
        return { status: SessionStatus.PAUSED, questionState: QuestionState.REVEALED };
      }
      return { status: SessionStatus.PAUSED, questionState: QuestionState.IDLE };
    case SessionPhase.ENDED:
      return { status: SessionStatus.ENDED, questionState: QuestionState.REVEALED };
    default:
      return { status: SessionStatus.LOBBY, questionState: QuestionState.IDLE };
  }
}

export function phasePatch(phase: SessionPhase, pausedFromPhase: SessionPhase | null = null) {
  const legacy = legacyForPhase(phase, pausedFromPhase);
  return {
    phase,
    pausedFromPhase,
    status: legacy.status,
    questionState: legacy.questionState,
  } as const;
}

async function fetchSession(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            include: {
              question: { include: { options: true } },
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
}

export async function getSessionFull(sessionId: string, options?: { applyTimeoutClose?: boolean }) {
  let session = await fetchSession(sessionId);
  if (!session) return null;

  const shouldApplyTimeoutClose = options?.applyTimeoutClose !== false;
  if (
    shouldApplyTimeoutClose &&
    session.phase === SessionPhase.QUESTION_LIVE &&
    session.questionEndAt &&
    session.questionEndAt.getTime() <= Date.now()
  ) {
    const patch = phasePatch(SessionPhase.QUESTION_CLOSED);
    await prisma.session.updateMany({
      where: {
        id: session.id,
        phase: SessionPhase.QUESTION_LIVE,
      },
      data: {
        ...patch,
        questionEndAt: new Date(),
        pauseRemainingSec: null,
      },
    });
    session = await fetchSession(sessionId);
  }

  return session;
}

export function getCurrentQuizQuestion(session: SessionWithQuiz) {
  const ordered = session.quiz.questions;
  return ordered[session.currentQuestionIndex] ?? null;
}

export function toSessionSnapshot(session: SessionWithQuiz): SessionSnapshot {
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    phase: session.phase,
    scoringMode: session.scoringMode,
    initialBudget: session.initialBudget,
    questionState: session.questionState,
    currentQuestionIndex: session.currentQuestionIndex,
    questionStartAt: session.questionStartAt?.toISOString() ?? null,
    questionEndAt: session.questionEndAt?.toISOString() ?? null,
    pauseRemainingSec: session.pauseRemainingSec,
    destinationIndex: session.destinationIndex,
    destinationCount: session.destinationCount,
    quizTitle: session.quiz.title,
  };
}

export function toPublicQuestion(session: SessionWithQuiz): PublicQuestion | null {
  const quizQuestion = getCurrentQuizQuestion(session);
  if (!quizQuestion) return null;
  const q = quizQuestion.question;
  const options =
    q.answerFormat === AnswerFormat.MCQ
      ? session.quiz.shuffleOptions
        ? shuffleArray(q.options)
        : q.options
      : [];
  const prompt = sanitizePrompt(q.prompt, q.internalCountry ?? null, q.internalLocation ?? null);

  return {
    id: q.id,
    prompt,
    options: options.map((opt) => ({ id: opt.id, text: opt.text })),
    kind: q.kind,
    answerFormat: q.answerFormat,
    timeLimitSec: q.timeLimitSec,
    points: q.points,
    index: session.currentQuestionIndex + 1,
    total: session.quiz.questions.length,
    endAt: session.questionEndAt?.toISOString() ?? null,
  };
}

export function buildDestinationSnapshot(session: SessionWithQuiz, locations: RouteLocation[]): DestinationSnapshot {
  const total = locations.length > 0 ? locations.length : Math.max(session.destinationCount, 1);
  const clampedIndex = Math.max(0, Math.min(session.destinationIndex, total - 1));
  return {
    currentIndex: clampedIndex,
    currentNumber: clampedIndex + 1,
    total,
    currentLocation: locations[clampedIndex] ?? null,
    locations,
  };
}

export async function computeLeaderboard(sessionId: string): Promise<LeaderboardRow[]> {
  const [scores, teams, session] = await Promise.all([
    prisma.answer.groupBy({
      by: ["teamId"],
      where: { sessionId },
      _sum: { pointsAwarded: true },
    }),
    prisma.team.findMany({
      where: { sessionId },
      select: { id: true, code: true },
    }),
    prisma.session.findUnique({
      where: { id: sessionId },
      select: { scoringMode: true, initialBudget: true },
    }),
  ]);

  const baseTotal = session?.scoringMode === ScoringMode.BUDGET ? session.initialBudget : 0;

  const rows = teams.map((team) => {
    const found = scores.find((s) => s.teamId === team.id);
    return {
      teamCode: team.code,
      totalPoints: baseTotal + (found?._sum.pointsAwarded ?? 0),
    };
  });

  rows.sort((a, b) => b.totalPoints - a.totalPoints || a.teamCode.localeCompare(b.teamCode));
  return rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export async function computeAnswerStats(sessionId: string, questionId: string): Promise<AnswerStats> {
  const [question, options, answers] = await Promise.all([
    prisma.question.findUnique({
      where: { id: questionId },
      select: { answerFormat: true },
    }),
    prisma.option.findMany({
      where: { questionId },
      select: { id: true, text: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.answer.findMany({
      where: { sessionId, questionId },
      include: { team: { select: { code: true } } },
    }),
  ]);

  if (question?.answerFormat === AnswerFormat.TEXT) {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const wrongCount = answers.length - correctCount;
    return {
      questionId,
      counts: [
        { optionId: "__correct", text: "Correct", count: correctCount },
        { optionId: "__incorrect", text: "Incorrect", count: wrongCount },
      ],
      teamsAnswered: answers.map((a) => a.team.code),
      totalResponses: answers.length,
    };
  }

  const counts = options.map((opt) => ({
    optionId: opt.id,
    text: opt.text,
    count: answers.filter((a) => a.optionId === opt.id).length,
  }));

  return {
    questionId,
    counts,
    teamsAnswered: answers.map((a) => a.team.code),
    totalResponses: answers.length,
  };
}

export function getQuestionTimerState(session: SessionWithQuiz) {
  if (!session.questionEndAt) return { expired: false, remainingSec: 0 };
  const remainingMs = session.questionEndAt.getTime() - Date.now();
  return {
    expired: remainingMs <= 0,
    remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
  };
}

export function getClassicPointsAwarded(base: number, timeLimitSec: number, endAt: Date, answeredAt: Date) {
  const timeRemaining = Math.max(0, (endAt.getTime() - answeredAt.getTime()) / 1000);
  const mult = Math.max(0, Math.min(1, timeRemaining / timeLimitSec));
  return Math.round(base * (0.3 + 0.7 * mult));
}

export function getBudgetPointsAwarded(kind: QuestionKind, isCorrect: boolean) {
  if (kind === QuestionKind.HINT) return isCorrect ? 200 : 0;
  if (kind === QuestionKind.MAIN) return isCorrect ? 1000 : -250;
  return isCorrect ? 1000 : 0;
}

export function getPointsAwarded(params: {
  scoringMode: ScoringMode;
  questionKind: QuestionKind;
  isCorrect: boolean;
  base: number;
  timeLimitSec: number;
  endAt: Date;
  answeredAt: Date;
}) {
  if (params.scoringMode === ScoringMode.BUDGET) {
    return getBudgetPointsAwarded(params.questionKind, params.isCorrect);
  }
  return params.isCorrect
    ? getClassicPointsAwarded(params.base, params.timeLimitSec, params.endAt, params.answeredAt)
    : 0;
}

export function assertLaunchable(session: SessionWithQuiz) {
  if (session.phase !== SessionPhase.LOBBY) throw new Error("Session must be in lobby to launch");
  if (session.currentQuestionIndex >= session.quiz.questions.length) throw new Error("No more questions");
}

export function assertRevealable(session: SessionWithQuiz) {
  if (session.phase !== SessionPhase.QUESTION_LIVE && session.phase !== SessionPhase.QUESTION_CLOSED) {
    throw new Error("Question is not in revealable state");
  }
}

export function assertNextable(session: SessionWithQuiz) {
  if (session.phase !== SessionPhase.REVEALED) {
    throw new Error("Reveal answer before moving to next question");
  }
}

export function assertPauseable(session: SessionWithQuiz) {
  if (
    session.phase !== SessionPhase.LOBBY &&
    session.phase !== SessionPhase.QUESTION_LIVE &&
    session.phase !== SessionPhase.QUESTION_CLOSED &&
    session.phase !== SessionPhase.REVEALED
  ) {
    throw new Error("Session cannot be paused in current phase");
  }
}

export function assertResumable(session: SessionWithQuiz) {
  if (session.phase !== SessionPhase.PAUSED) {
    throw new Error("Session is not paused");
  }
}

export function assertAnswerable(session: SessionWithQuiz) {
  if (session.phase !== SessionPhase.QUESTION_LIVE) throw new Error("Question is not open for answers");
  const current = getCurrentQuizQuestion(session);
  if (!current) throw new Error("Question not found");
  const timer = getQuestionTimerState(session);
  if (timer.expired) throw new Error("Time is up");
}
