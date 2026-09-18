export const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export const APPROACH_TYPES = ["Brute Force", "Better", "Optimal", "Other"];

export const VERDICTS = {
  ACCEPTED: "Accepted",
  WRONG_ANSWER: "Wrong Answer",
  TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
  MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded",
  OUTPUT_LIMIT_EXCEEDED: "Output Limit Exceeded",
  RUNTIME_ERROR: "Runtime Error",
  COMPILATION_ERROR: "Compilation Error",
  SKIPPED: "Skipped",
  FINISHED: "Finished",
  NOT_SUBMITTED: "Not Submitted",
};

export const SUBMISSION_VERDICTS = [
  VERDICTS.ACCEPTED,
  VERDICTS.WRONG_ANSWER,
  VERDICTS.TIME_LIMIT_EXCEEDED,
  VERDICTS.MEMORY_LIMIT_EXCEEDED,
  VERDICTS.RUNTIME_ERROR,
  VERDICTS.COMPILATION_ERROR,
  VERDICTS.NOT_SUBMITTED,
];

// Tailwind classes per verdict tone
export function verdictTone(verdict) {
  switch (verdict) {
    case VERDICTS.ACCEPTED:
      return "success";
    case VERDICTS.FINISHED:
      return "info";
    case VERDICTS.NOT_SUBMITTED:
    case VERDICTS.SKIPPED:
    case undefined:
    case null:
      return "neutral";
    case VERDICTS.TIME_LIMIT_EXCEEDED:
    case VERDICTS.MEMORY_LIMIT_EXCEEDED:
    case VERDICTS.OUTPUT_LIMIT_EXCEEDED:
      return "warning";
    default:
      return "danger";
  }
}

export const DIFFICULTY_TONE = { Easy: "success", Medium: "warning", Hard: "danger" };
