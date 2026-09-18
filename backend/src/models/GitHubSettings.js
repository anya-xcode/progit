import mongoose from "mongoose";

// Single document (key: "default") holding the GitHub connection for the one
// user of this app. The OAuth token is never selected by default and never
// returned by the API.
const gitHubSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    oauthToken: { type: String, default: "", select: false },
    user: {
      login: { type: String, default: "" },
      name: { type: String, default: "" },
      avatarUrl: { type: String, default: "" },
      htmlUrl: { type: String, default: "" },
    },
    repository: {
      fullName: { type: String, default: "" },
      owner: { type: String, default: "" },
      name: { type: String, default: "" },
      htmlUrl: { type: String, default: "" },
      isPrivate: { type: Boolean, default: false },
      defaultBranch: { type: String, default: "" },
    },
    branch: { type: String, default: "" },
    // Optional folder inside the repository, e.g. "dsa-solutions". Empty = repo root.
    basePath: { type: String, default: "" },
    autoSync: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("GitHubSettings", gitHubSettingsSchema);
