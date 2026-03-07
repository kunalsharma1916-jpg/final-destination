import type { AnswerFormat, QuestionKind, QuestionState, ScoringMode, SessionPhase, SessionStatus } from "@prisma/client";

export type PublicQuestion = {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  kind: QuestionKind;
  answerFormat: AnswerFormat;
  timeLimitSec: number;
  points: number;
  index: number;
  total: number;
  endAt: string | null;
};

export type DestinationLocation = {
  index: number;
  number: number;
  lat: number;
  lng: number;
  label: string;
};

export type DestinationState = {
  currentIndex: number;
  currentNumber: number;
  total: number;
  currentLocation: DestinationLocation | null;
  locations: DestinationLocation[];
};

export type SessionSnapshot = {
  id: string;
  name: string | null;
  status: SessionStatus;
  phase: SessionPhase;
  scoringMode: ScoringMode;
  initialBudget: number;
  questionState: QuestionState;
  currentQuestionIndex: number;
  questionStartAt: string | null;
  questionEndAt: string | null;
  pauseRemainingSec: number | null;
  destinationIndex: number;
  destinationCount: number;
  quizTitle: string;
};

export type LeaderboardRow = {
  rank: number;
  teamCode: string;
  totalPoints: number;
};

export type AnswerStats = {
  questionId: string;
  counts: Array<{ optionId: string; text: string; count: number }>;
  teamsAnswered: string[];
  totalResponses: number;
};
