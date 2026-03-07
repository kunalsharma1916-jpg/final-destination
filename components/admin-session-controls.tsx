type ControlsProps = {
  phase: "DRAFT" | "LOBBY" | "QUESTION_LIVE" | "QUESTION_CLOSED" | "REVEALED" | "PAUSED" | "ENDED";
  onAction: (action: "start" | "launch" | "reveal" | "next" | "pause" | "resume" | "end") => void;
  busy: boolean;
};

export function AdminSessionControls({ phase, onAction, busy }: ControlsProps) {
  const canStart = phase === "DRAFT" || phase === "LOBBY";
  const canLaunch = phase === "LOBBY";
  const canReveal = phase === "QUESTION_LIVE" || phase === "QUESTION_CLOSED";
  const canNext = phase === "REVEALED";
  const canPause = ["LOBBY", "QUESTION_LIVE", "QUESTION_CLOSED", "REVEALED"].includes(phase);
  const canResume = phase === "PAUSED";
  const canEnd = phase !== "ENDED";

  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || !canStart} onClick={() => onAction("start")} type="button">
        Start Session
      </button>
      <button disabled={busy || !canLaunch} onClick={() => onAction("launch")} type="button">
        Launch Question
      </button>
      <button disabled={busy || !canReveal} onClick={() => onAction("reveal")} type="button">
        Reveal Answer
      </button>
      <button disabled={busy || !canNext} onClick={() => onAction("next")} type="button">
        Next Question
      </button>
      <button disabled={busy || !canPause} onClick={() => onAction("pause")} type="button">
        Pause
      </button>
      <button disabled={busy || !canResume} onClick={() => onAction("resume")} type="button">
        Resume
      </button>
      <button disabled={busy || !canEnd} onClick={() => onAction("end")} type="button">
        End Session
      </button>
    </div>
  );
}
