import { CheckCircle2, CircleDashed } from "lucide-react";
import { DIFFICULTY_TONE, verdictTone } from "../../utils/constants.js";

const TONES = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
  accent: "bg-accent/12 text-accent",
  neutral: "bg-surface-2 text-muted",
};

export default function Badge({ tone = "neutral", className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function DifficultyBadge({ difficulty }) {
  return <Badge tone={DIFFICULTY_TONE[difficulty] ?? "neutral"}>{difficulty}</Badge>;
}

export function VerdictBadge({ verdict }) {
  return <Badge tone={verdictTone(verdict)}>{verdict || "Not Submitted"}</Badge>;
}

export function StatusIcon({ status }) {
  if (status === "solved") return <CheckCircle2 className="size-4 text-success" aria-label="Solved" />;
  if (status === "attempted") return <CircleDashed className="size-4 text-warning" aria-label="Attempted" />;
  return <span className="block size-4" aria-label="Unsolved" />;
}
