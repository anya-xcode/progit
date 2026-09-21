# DSAForge

**Practice DSA. Build Your GitHub.**

A personal DSA practice workspace inspired by the Striver A2Z sheet: a problem library,
a LeetCode-style editor, free sandboxed Python execution, multiple saved approaches per
problem, a progress dashboard, and automatic GitHub sync of accepted solutions.

Single user, runs locally, no login.

## Features

- **The whole A2Z sheet, in your app:** all 18 steps with their sub-steps and 474 entries, in sheet order, with per-step and per-sub-step progress — **454 solvable problems** (original statements, examples, hints, explanations and hidden tests) plus **20 theory entries** (STL, Cpp Basics, DP intro…) that you read and tick off with **Mark as done**. Every solution is checked against a reference solution in the same sandbox that judges your code.
- **Search and filters:** by name, keyword, topic, difficulty, step, `#number`, solved status, and "solvable here".
- **Editor workspace:** Monaco with syntax highlighting, autocompletion, snippets and formatting, plus Run (visible tests and custom input) and Submit (all tests).
- **Verdicts:** Accepted, Wrong Answer, TLE, MLE, Runtime Error and Compilation Error, with runtime and memory.
- **Multiple approaches per problem:** brute force, better and optimal versions stored side by side. You can compare them with a code diff and a complexity table. Approaches never overwrite each other.
- **Tracking:** a dashboard, a progress page (sections, difficulty, streaks, activity heatmap) and a submission history.
- **GitHub sync:** accepted approaches are committed to a repository you choose, organized as `03-Arrays/Two-Sum/hash-map.py` with generated `problem.md`, `test_cases.txt` and README files. Auto-sync on/off, manual sync, retry, and a sync history.
- **Custom problems** that behave exactly like library problems.
- Dark and light mode, responsive layout, toasts, and loading, empty and error states.

## Requirements

- Node.js 22+
- MongoDB running locally
- A sandbox for code execution, either:
  - **WSL 2** with a Linux distro (default on Windows, no admin rights needed), or
  - **Docker**

## Setup

```bash
# Backend
cd backend
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
npm run test:sandbox          # checks the sandbox works and enforces limits
npm run dev                   # http://localhost:5050 (syncs the problem library on start)

# Frontend (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5174
```

Open http://localhost:5174.

## Tests

```bash
node scripts/run-all-tests.mjs            # every suite, one summary
node scripts/run-all-tests.mjs --fast     # skips the slow full-sandbox sweep
```

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit | `cd backend && npm run test:unit` | Verdicts and output comparison, library/sheet integrity, generated GitHub files, git blob hashing |
| API | `cd backend && npm run test:api` | Every endpoint: filters, search, custom problems, approaches, run/submit verdicts, dashboard, error handling |
| Problem data | `cd backend && npm run verify:problems` | Each problem's reference solution reproduces every example and test (add `-- --sandbox` for the real judge) |
| Sandbox | `cd backend && npm run test:sandbox` | Isolation (no network, host files hidden) and the time/memory/output limits |
| GitHub sync | `cd backend && npm run test:github` | Add, update, rename, delete, retries, auth errors, OAuth — against an in-memory GitHub API |
| Browser | `cd frontend && npm run test:e2e` | The real UI in Chrome: solving, saving approaches, submitting, comparing, progress, settings |

Every suite uses its own throwaway MongoDB database and its own ports, so none of them
touch your `dsaforge` data or the servers you have running.

### Backend scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the API with auto-restart |
| `npm run seed` | Sync the YAML problem library into MongoDB (also runs on server start) |
| `npm run test:sandbox` | Run correctness and isolation checks against the configured sandbox |
| `npm run verify:problems` | Validate problem data and run every reference solution with local Python |
| `npm run verify:problems -- --sandbox` | Same, but through the real sandbox and judge |
| `npm run test:github` | End-to-end GitHub sync tests against a local mock of the GitHub API (never touches github.com) |

## Code execution

User code **never runs inside the Node.js process**. The backend sends code and test inputs
to a sandbox. A small harness there ([sandbox/python/runner.py](sandbox/python/runner.py)) runs each test
in a fresh process with resource limits. The backend then compares outputs with the
expected answers, which never enter the sandbox.

Choose a provider with `EXECUTION_PROVIDER` in `backend/.env`:

- **`namespace`** (default): Linux namespaces through WSL ([sandbox/wsl/](sandbox/wsl/)). No network, a private `/tmp`,
  Windows drives, `/home` and the WSL interop socket hidden, runs as an unprivileged user, locked mounts.
- **`docker`**: one container per run with `--network none`, a read-only filesystem, all capabilities dropped,
  memory/CPU/PID limits and a non-root user. Build the image first:
  ```bash
  docker build -t dsaforge-python-runner sandbox/python
  ```
  If Docker lives inside WSL, set `DOCKER_COMMAND=wsl -d Ubuntu docker`.

Per-test limits (all configurable): 2 s CPU, 256 MB memory, 256 KB output, 32 processes.

## GitHub sync

1. **Connect GitHub.** Pick one option. The token stays on the backend and is never sent to the browser.
   - **Personal access token (simplest):** create a [fine-grained token](https://github.com/settings/personal-access-tokens/new)
     with **Contents: Read and write** on your solutions repository. Add **Administration: Read and write** only if
     you want to create the repository from DSAForge. Put it in `backend/.env` as `GITHUB_TOKEN=...` and restart the backend.
   - **OAuth App:** create an [OAuth App](https://github.com/settings/applications/new) with the callback URL
     `http://localhost:5174/api/github/oauth/callback`, set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, restart,
     then click **Connect with GitHub**. The token is stored in your local MongoDB and never returned by the API.
2. **Pick a repository** on the **GitHub** page, or create one there. Optionally set a branch and a folder.
   DSAForge manages `README.md` and the section folders in that location, so use a dedicated repo or folder.
3. **Solve.** When a saved approach is **Accepted**, it is committed automatically:

```
<repo or folder>/
├── README.md                       # every synced problem, grouped by section
└── 03-Arrays/
    └── Two-Sum/
        ├── problem.md              # statement, formats, constraints, examples, tests, source
        ├── test_cases.txt          # all test cases
        ├── README.md               # approaches, complexity comparison, status, links
        ├── brute-force.py          # one file per approach, never overwritten by another
        └── hash-map.py
```

- Commits read like `Add Two Sum - Hash Map solution` or `Update Two Sum - Hash Map solution`. Each sync is a single commit, and nothing is committed if nothing changed.
- Editing an accepted approach's details updates its file. Changing its code marks GitHub **out of date** until it is accepted again. Renaming an approach moves its file, and deleting an approach removes its file.
- **Auto-sync** can be turned off. Use **Sync** or **Retry** on an approach, or **Sync all** on the GitHub page.
- Failed syncs keep the error message, for example an expired token or a missing permission, and can be retried.

## Adding problems

The sheet's structure lives in `backend/src/data/a2z/sheet.json` (regenerate with
`node scripts/refresh-a2z-index.js`); the content of each problem lives in
`backend/src/data/problems/*.yaml`, tied to a sheet entry by `sheetId`.

```bash
npm run missing                           # what still needs writing, per step
node scripts/list-missing.js --step 5     # the exact entries, with their sheetIds
# write them following docs/PROBLEM_FORMAT.md, then:
npm run verify:problems                   # data + reference solutions
npm run seed                              # or just restart the backend
```

You can also add your own problems from the UI (**Problem Library → Add custom problem**);
they behave exactly like sheet problems, including GitHub sync.

## Deploying

DSAForge runs fine on Vercel (frontend + API) with MongoDB Atlas, but Vercel cannot run
the code sandbox, so code execution moves to a Judge0 server you point at — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full walkthrough, including the option
of keeping the real sandbox by hosting the API on a Docker-capable host instead.

Set `APP_ACCESS_KEY` on any internet-facing deployment: the app has no accounts, and the
server holds your GitHub token.

## Docs

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): deploying to Vercel (Atlas, Judge0, env vars, checks)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): architecture, folder structure, schemas, API and execution design
- [docs/PROBLEM_FORMAT.md](docs/PROBLEM_FORMAT.md): problem data format and conventions
