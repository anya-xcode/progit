export const VERDICTS = {
  ACCEPTED: "Accepted",
  WRONG_ANSWER: "Wrong Answer",
  TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
  MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded",
  OUTPUT_LIMIT_EXCEEDED: "Output Limit Exceeded",
  RUNTIME_ERROR: "Runtime Error",
  COMPILATION_ERROR: "Compilation Error",
  SKIPPED: "Skipped",
  // Used for Run with custom input, where there is no expected output.
  FINISHED: "Finished",
};

export const NOT_SUBMITTED = "Not Submitted";

export const SUBMISSION_VERDICTS = [
  VERDICTS.ACCEPTED,
  VERDICTS.WRONG_ANSWER,
  VERDICTS.TIME_LIMIT_EXCEEDED,
  VERDICTS.MEMORY_LIMIT_EXCEEDED,
  VERDICTS.OUTPUT_LIMIT_EXCEEDED,
  VERDICTS.RUNTIME_ERROR,
  VERDICTS.COMPILATION_ERROR,
];
