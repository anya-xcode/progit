import client from "./client.js";

export const problemsApi = {
  list: (params) => client.get("/problems", { params }),
  meta: () => client.get("/problems/meta"),
  get: (slug, params) => client.get(`/problems/${encodeURIComponent(slug)}`, { params }),
  create: (data) => client.post("/problems", data),
  update: (id, data) => client.put(`/problems/${id}`, data),
  setDone: (id, done) => client.put(`/problems/${id}/done`, { done }),
  remove: (id) => client.delete(`/problems/${id}`),
};

export const solutionsApi = {
  listAll: (params) => client.get("/solutions", { params }),
  listForProblem: (problemId) => client.get(`/solutions/${problemId}`),
  create: (data) => client.post("/solutions", data),
  update: (id, data) => client.put(`/solutions/${id}`, data),
  remove: (id) => client.delete(`/solutions/${id}`),
};

export const codeApi = {
  run: (data) => client.post("/code/run", data),
  submit: (data) => client.post("/code/submit", data),
  info: () => client.get("/code/info"),
  health: () => client.post("/code/health"),
};

export const submissionsApi = {
  list: (params) => client.get("/submissions", { params }),
  get: (id) => client.get(`/submissions/${id}`),
};

export const dashboardApi = {
  stats: () => client.get("/dashboard/stats"),
  progress: () => client.get("/dashboard/progress"),
  recent: () => client.get("/dashboard/recent"),
};

export const githubApi = {
  status: (params) => client.get("/github/status", { params }),
  repositories: () => client.get("/github/repositories"),
  createRepository: (data) => client.post("/github/repositories", data),
  selectRepository: (data) => client.post("/github/select-repository", data),
  updateSettings: (data) => client.put("/github/settings", data),
  sync: (solutionId) => client.post(`/github/sync/${solutionId}`),
  syncAll: () => client.post("/github/sync-all"),
  history: (params) => client.get("/github/syncs", { params }),
  disconnect: () => client.post("/github/disconnect"),
  // Full-page navigation (not XHR): the server redirects to GitHub.
  oauthStartUrl: "/api/github/oauth/start",
};
