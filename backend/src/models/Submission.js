import mongoose from "mongoose";
import { SUBMISSION_VERDICTS, VERDICTS } from "../services/judge/verdicts.js";

const testResultSchema = new mongoose.Schema(
  {
    index: Number,
    verdict: { type: String, enum: [...SUBMISSION_VERDICTS, VERDICTS.SKIPPED] },
    passed: Boolean,
    isHidden: Boolean,
    timeMs: Number,
    memoryKb: Number,
    // Details are only stored for visible tests and the first failing test.
    input: String,
    expectedOutput: String,
    actualOutput: String,
    error: String,
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema({
  problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true, index: true },
  solutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Solution", default: null },
  code: { type: String, required: true },
  language: { type: String, default: "python" },
  verdict: { type: String, enum: SUBMISSION_VERDICTS, required: true },
  runtime: { type: Number, default: null },
  memory: { type: Number, default: null },
  passedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  compileError: { type: String, default: "" },
  testResults: { type: [testResultSchema], default: [] },
  submittedAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("Submission", submissionSchema);
