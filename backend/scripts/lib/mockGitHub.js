// A tiny in-memory stand-in for the parts of the GitHub REST API that
// DSAForge uses (Git Data API, repos, user, contents, OAuth). Lets the sync
// logic be tested end to end without touching a real GitHub account.
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";

const sha1 = (text) => createHash("sha1").update(text).digest("hex");
const blobSha = (content) => {
  const body = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
};

export function createMockGitHub({ token = "test-token", login = "ananya" } = {}) {
  const state = {
    token,
    user: { login, name: "Ananya", avatar_url: "https://avatars.example/ananya.png", html_url: `https://github.com/${login}` },
    repos: new Map(), // fullName -> { meta, refs: Map(branch -> commitSha) }
    commits: new Map(), // sha -> { tree, parents, message }
    trees: new Map(), // sha -> Map(path -> { sha, content })
    oauthCodes: new Map(), // code -> access token
    failures: [], // [{ match: RegExp, status, message }]
    requests: [],
  };

  let baseUrl = "";

  function saveTree(files) {
    const sha = sha1(JSON.stringify([...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, f]) => [p, f.sha])));
    state.trees.set(sha, files);
    return sha;
  }

  function addRepo(owner, name, { isPrivate = true, autoInit = false, defaultBranch = "main" } = {}) {
    const fullName = `${owner}/${name}`;
    const repo = {
      meta: {
        name,
        full_name: fullName,
        owner: { login: owner },
        private: isPrivate,
        html_url: `https://github.com/${fullName}`,
        default_branch: defaultBranch,
        description: "",
        pushed_at: new Date().toISOString(),
        permissions: { admin: true, push: true, pull: true },
      },
      refs: new Map(),
    };
    state.repos.set(fullName, repo);
    if (autoInit) {
      const tree = saveTree(new Map([["README.md", { sha: blobSha(`# ${name}\n`), content: `# ${name}\n` }]]));
      const commit = sha1(`init-${fullName}-${Math.random()}`);
      state.commits.set(commit, { tree, parents: [], message: "Initial commit" });
      repo.refs.set(defaultBranch, commit);
    }
    return repo;
  }

  // Helpers for assertions in tests.
  const api = {
    state,
    addRepo,
    get url() {
      return baseUrl;
    },
    failNext(match, status, message = "Injected failure") {
      state.failures.push({ match, status, message });
    },
    head(fullName, branch = "main") {
      return state.repos.get(fullName)?.refs.get(branch);
    },
    files(fullName, branch = "main") {
      const head = api.head(fullName, branch);
      if (!head) return new Map();
      const tree = state.trees.get(state.commits.get(head).tree);
      return new Map([...tree.entries()].map(([p, f]) => [p, f.content]));
    },
    log(fullName, branch = "main") {
      const out = [];
      let sha = api.head(fullName, branch);
      while (sha) {
        const commit = state.commits.get(sha);
        out.push({ sha, message: commit.message });
        sha = commit.parents[0];
      }
      return out;
    },
  };

  function send(res, status, body, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) return {};
    if ((req.headers["content-type"] ?? "").includes("json")) return JSON.parse(text);
    return Object.fromEntries(new URLSearchParams(text));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://mock");
    const pathname = decodeURIComponent(url.pathname);
    const method = req.method;
    state.requests.push(`${method} ${pathname}`);

    try {
      // OAuth (web endpoints, no API token)
      if (method === "GET" && pathname === "/login/oauth/authorize") {
        const code = randomBytes(8).toString("hex");
        state.oauthCodes.set(code, state.token);
        const redirect = new URL(url.searchParams.get("redirect_uri"));
        redirect.searchParams.set("code", code);
        redirect.searchParams.set("state", url.searchParams.get("state"));
        res.writeHead(302, { Location: redirect.toString() });
        res.end();
        return;
      }
      if (method === "POST" && pathname === "/login/oauth/access_token") {
        const body = await readBody(req);
        const accessToken = state.oauthCodes.get(body.code);
        state.oauthCodes.delete(body.code);
        return accessToken
          ? send(res, 200, { access_token: accessToken, token_type: "bearer", scope: "repo" })
          : send(res, 200, { error: "bad_verification_code", error_description: "The code passed is incorrect or expired." });
      }

      const failure = state.failures.find((f) => f.match.test(`${method} ${pathname}`));
      if (failure) {
        state.failures.splice(state.failures.indexOf(failure), 1);
        return send(res, failure.status, { message: failure.message });
      }

      const auth = req.headers.authorization ?? "";
      if (auth.replace(/^(token|bearer)\s+/i, "") !== state.token) return send(res, 401, { message: "Bad credentials" });

      if (method === "GET" && pathname === "/user") return send(res, 200, state.user);
      if (method === "GET" && pathname === "/user/repos") return send(res, 200, [...state.repos.values()].map((r) => r.meta));
      if (method === "POST" && pathname === "/user/repos") {
        const body = await readBody(req);
        if (state.repos.has(`${state.user.login}/${body.name}`)) {
          return send(res, 422, { message: "Repository creation failed.", errors: [{ message: "name already exists on this account" }] });
        }
        return send(res, 201, addRepo(state.user.login, body.name, { isPrivate: body.private, autoInit: body.auto_init }).meta);
      }

      const match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(pathname);
      if (!match) return send(res, 404, { message: "Not Found" });
      const repo = state.repos.get(`${match[1]}/${match[2]}`);
      if (!repo) return send(res, 404, { message: "Not Found" });
      const rest = match[3] ?? "";

      if (method === "GET" && rest === "") return send(res, 200, repo.meta);

      let m;
      if (method === "GET" && (m = /^\/git\/ref\/heads\/(.+)$/.exec(rest))) {
        if (repo.refs.size === 0) return send(res, 409, { message: "Git Repository is empty." });
        const sha = repo.refs.get(m[1]);
        return sha ? send(res, 200, { ref: `refs/heads/${m[1]}`, object: { sha, type: "commit" } }) : send(res, 404, { message: "Not Found" });
      }
      if (method === "POST" && rest === "/git/refs") {
        const body = await readBody(req);
        const branch = body.ref.replace(/^refs\/heads\//, "");
        if (repo.refs.has(branch)) return send(res, 422, { message: "Reference already exists" });
        repo.refs.set(branch, body.sha);
        return send(res, 201, { ref: body.ref, object: { sha: body.sha } });
      }
      if (method === "PATCH" && (m = /^\/git\/refs\/heads\/(.+)$/.exec(rest))) {
        const body = await readBody(req);
        const current = repo.refs.get(m[1]);
        const commit = state.commits.get(body.sha);
        if (!commit) return send(res, 422, { message: "Object does not exist" });
        if (!body.force && current && !commit.parents.includes(current)) return send(res, 422, { message: "Update is not a fast forward" });
        repo.refs.set(m[1], body.sha);
        return send(res, 200, { ref: `refs/heads/${m[1]}`, object: { sha: body.sha } });
      }
      if (method === "GET" && (m = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest))) {
        const commit = state.commits.get(m[1]);
        return commit ? send(res, 200, { sha: m[1], tree: { sha: commit.tree }, message: commit.message }) : send(res, 404, { message: "Not Found" });
      }
      if (method === "GET" && (m = /^\/git\/trees\/([0-9a-f]+)$/.exec(rest))) {
        const tree = state.trees.get(m[1]);
        if (!tree) return send(res, 404, { message: "Not Found" });
        return send(res, 200, {
          sha: m[1],
          truncated: false,
          tree: [...tree.entries()].map(([path, file]) => ({ path, mode: "100644", type: "blob", sha: file.sha })),
        });
      }
      if (method === "POST" && rest === "/git/trees") {
        const body = await readBody(req);
        const files = new Map(body.base_tree ? state.trees.get(body.base_tree) : []);
        for (const entry of body.tree) {
          if (entry.sha === null) {
            if (!files.has(entry.path)) return send(res, 422, { message: `GitRPC::BadObjectState: ${entry.path} does not exist` });
            files.delete(entry.path);
          } else {
            files.set(entry.path, { sha: blobSha(entry.content), content: entry.content });
          }
        }
        return send(res, 201, { sha: saveTree(files) });
      }
      if (method === "POST" && rest === "/git/commits") {
        const body = await readBody(req);
        const sha = sha1(`${body.tree}-${body.parents.join(",")}-${body.message}-${Math.random()}`);
        state.commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
        return send(res, 201, { sha, html_url: `https://github.com/${repo.meta.full_name}/commit/${sha}` });
      }
      if (method === "PUT" && (m = /^\/contents\/(.+)$/.exec(rest))) {
        const body = await readBody(req);
        const branch = body.branch || repo.meta.default_branch;
        const content = Buffer.from(body.content, "base64").toString("utf8");
        const parent = repo.refs.get(branch);
        const files = new Map(parent ? state.trees.get(state.commits.get(parent).tree) : []);
        files.set(m[1], { sha: blobSha(content), content });
        const commit = sha1(`contents-${m[1]}-${Math.random()}`);
        state.commits.set(commit, { tree: saveTree(files), parents: parent ? [parent] : [], message: body.message });
        repo.refs.set(branch, commit);
        return send(res, 201, { commit: { sha: commit } });
      }

      return send(res, 404, { message: `Mock has no route for ${method} ${pathname}` });
    } catch (error) {
      return send(res, 500, { message: error.message });
    }
  });

  api.listen = (port = 0) =>
    new Promise((resolve) => {
      server.listen(port, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve(api);
      });
    });
  api.close = () => new Promise((resolve) => server.close(resolve));
  return api;
}
