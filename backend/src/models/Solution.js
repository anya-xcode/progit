import mongoose from "mongoose";
import { NOT_SUBMITTED, SUBMISSION_VERDICTS } from "../services/judge/verdicts.js";

export const APPROACH_TYPES = ["Brute Force", "Better", "Optimal", "Other"];

// not-synced → pending → syncing → synced | failed; synced → outdated after edits
export const GITHUB_STATUSES = ["not-synced", "pending", "syncing", "synced", "outdated", "failed"];

// Fields that appear in the GitHub solution file. Changing them after a sync
// makes the GitHub copy out of date.
const SYNCED_FIELDS = ["title", "approach", "code", "timeComplexity", "spaceComplexity", "explanation"];

// One saved approach to a problem. A problem can have many solutions;
// `slug` (derived from `title`) is unique per problem so approaches never
// overwrite each other. It is also the GitHub file name (e.g. hash-map.py).
const solutionSchema = new mongoose.Schema(
  {
    problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem", required: true, index: true },
    title: { type: String, required: [true, "Approach name is required"], trim: true, maxlength: 80 },
    slug: { type: String, required: true },
    approach: { type: String, enum: APPROACH_TYPES, default: "Other" },
    code: { type: String, required: [true, "Code is required"], maxlength: 64_000 },
    language: { type: String, default: "python" },
    timeComplexity: { type: String, default: "", trim: true, maxlength: 60 },
    spaceComplexity: { type: String, default: "", trim: true, maxlength: 60 },
    explanation: { type: String, default: "", maxlength: 10_000 },
    verdict: { type: String, enum: [NOT_SUBMITTED, ...SUBMISSION_VERDICTS], default: NOT_SUBMITTED },
    runtime: { type: Number, default: null },
    memory: { type: Number, default: null },
    githubPath: { type: String, default: "" },
    githubCommitUrl: { type: String, default: "" },
    githubStatus: { type: String, enum: GITHUB_STATUSES, default: "not-synced" },
    githubSyncError: { type: String, default: "" },
    githubSyncedAt: { type: Date, default: null },
    isDraft: { type: Boolean, default: true },
    lastSubmittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

solutionSchema.index({ problemId: 1, slug: 1 }, { unique: true });

solutionSchema.pre("save", function markOutdated() {
  const wasSynced = ["synced", "failed"].includes(this.githubStatus) && this.githubSyncedAt;
  if (!this.isNew && wasSynced && SYNCED_FIELDS.some((field) => this.isModified(field))) {
    this.githubStatus = "outdated";
  }
});

export default mongoose.model("Solution", solutionSchema);
