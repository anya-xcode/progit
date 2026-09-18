import mongoose from "mongoose";

export const SYNC_STATUSES = ["pending", "syncing", "synced", "failed"];

// History of sync attempts: one record per approach per attempt.
const gitHubSyncSchema = new mongoose.Schema(
  {
    solutionId: { type: mongoose.Schema.Types.ObjectId, ref: "Solution", index: true },
    problemId: { type: mongoose.Schema.Types.ObjectId, ref: "Problem" },
    problemTitle: { type: String, default: "" },
    solutionTitle: { type: String, default: "" },
    action: { type: String, enum: ["upsert", "delete"], default: "upsert" },
    repository: { type: String, default: "" },
    branch: { type: String, default: "" },
    filePath: { type: String, default: "" },
    commitSha: { type: String, default: "" },
    commitUrl: { type: String, default: "" },
    commitMessage: { type: String, default: "" },
    changed: { type: Boolean, default: true },
    syncStatus: { type: String, enum: SYNC_STATUSES, default: "pending" },
    error: { type: String, default: "" },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

gitHubSyncSchema.index({ createdAt: -1 });

export default mongoose.model("GitHubSync", gitHubSyncSchema);
