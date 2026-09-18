import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FolderGit2,
  FolderTree,
  History,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { githubApi } from "../api/index.js";
import RepositoryPicker from "../components/github/RepositoryPicker.jsx";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import PageHeader, { Page } from "../components/ui/PageHeader.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import Toggle from "../components/ui/Toggle.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useApi } from "../hooks/useApi.js";
import { timeAgo } from "../utils/format.js";

const TREE = `dsa-solutions/
├── README.md
├── 03-Arrays/
│   └── Two-Sum/
│       ├── problem.md
│       ├── brute-force.py
│       ├── hash-map.py
│       ├── test_cases.txt
│       └── README.md
└── 16-Dynamic-Programming/
    └── Climbing-Stairs/ …`;

function Step({ n, children }) {
  return (
    <li className="flex gap-2.5 text-[13px]">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold">{n}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function ConnectOptions({ status, onRecheck, checking }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="flex items-center gap-2 font-medium">
          <KeyRound className="size-4 text-accent" /> Personal access token <Badge tone="accent">Simplest</Badge>
        </p>
        <ol className="space-y-2">
          <Step n={1}>
            Create a{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="text-accent hover:underline">
              fine-grained token
            </a>{" "}
            with <b>Contents: Read and write</b> on your solutions repository (add <b>Administration: Read and write</b> to create repos from here).
          </Step>
          <Step n={2}>
            Add it to <code className="font-mono">backend/.env</code>: <code className="font-mono">GITHUB_TOKEN=github_pat_…</code>
          </Step>
          <Step n={3}>Restart the backend, then check again.</Step>
        </ol>
        <Button size="sm" icon={RefreshCw} loading={checking} onClick={onRecheck}>
          Check again
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="flex items-center gap-2 font-medium">
          <FolderGit2 className="size-4 text-accent" /> Sign in with GitHub (OAuth)
        </p>
        {status.configured.oauth ? (
          <>
            <p className="text-[13px] text-muted">Your OAuth App is configured. The access token is stored only on your local server.</p>
            <a href={githubApi.oauthStartUrl}>
              <Button variant="primary" icon={FolderGit2}>
                Connect with GitHub
              </Button>
            </a>
          </>
        ) : (
          <ol className="space-y-2">
            <Step n={1}>
              Create an{" "}
              <a href="https://github.com/settings/applications/new" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                OAuth App
              </a>{" "}
              with callback URL <code className="font-mono break-all">http://localhost:5174/api/github/oauth/callback</code>
            </Step>
            <Step n={2}>
              Add <code className="font-mono">GITHUB_CLIENT_ID</code> and <code className="font-mono">GITHUB_CLIENT_SECRET</code> to{" "}
              <code className="font-mono">backend/.env</code> and restart.
            </Step>
          </ol>
        )}
      </div>
    </div>
  );
}

function HistoryList({ records, onRetry }) {
  if (records.length === 0) {
    return <EmptyState icon={History} title="No syncs yet" description="Accepted approaches appear here when they are committed." />;
  }
  return (
    <ul className="divide-y divide-border">
      {records.map((record) => {
        const icon =
          record.syncStatus === "synced" ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : record.syncStatus === "failed" ? (
            <AlertTriangle className="size-4 text-danger" />
          ) : (
            <Loader2 className="size-4 animate-spin text-info" />
          );
        return (
          <li key={record._id} className="flex items-start gap-3 px-1 py-2.5">
            <span className="mt-0.5">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {record.action === "delete" ? <Trash2 className="mr-1 inline size-3.5 text-muted" /> : null}
                <span className="font-medium">{record.problemTitle}</span>
                <span className="text-muted"> — {record.solutionTitle}</span>
              </p>
              <p className="truncate text-xs text-muted">
                {record.syncStatus === "synced"
                  ? `${record.changed ? record.commitMessage.split("\n")[0] : "Already up to date"} · ${timeAgo(record.syncedAt)}`
                  : record.syncStatus === "failed"
                    ? record.error
                    : "In progress…"}
              </p>
            </div>
            {record.commitUrl && record.syncStatus === "synced" && (
              <a href={record.commitUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted hover:text-accent">
                Commit <ExternalLink className="size-3" />
              </a>
            )}
            {record.syncStatus === "failed" && record.action === "upsert" && (
              <Button size="xs" icon={RefreshCw} onClick={() => onRetry(record.solutionId)}>
                Retry
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function GitHubPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusApi = useApi(() => githubApi.status(), []);
  const historyApi = useApi(() => githubApi.history({ limit: 25 }), []);
  const [picking, setPicking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(null);

  const status = statusApi.data;
  const counts = status?.counts ?? {};
  const inProgress = (counts.pending ?? 0) + (counts.syncing ?? 0) > 0 || historyApi.data?.some((r) => ["pending", "syncing"].includes(r.syncStatus));

  // Result of the OAuth redirect.
  useEffect(() => {
    if (searchParams.get("connected")) toast.success("GitHub connected");
    if (searchParams.get("error")) toast.error(searchParams.get("error"));
    if (searchParams.has("connected") || searchParams.has("error")) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh while commits are running.
  useEffect(() => {
    if (!inProgress) return undefined;
    const timer = setInterval(() => {
      statusApi.reload({ silent: true });
      historyApi.reload({ silent: true });
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgress]);

  const refreshAll = () => {
    statusApi.reload({ silent: true });
    historyApi.reload({ silent: true });
  };

  const recheck = async () => {
    setChecking(true);
    try {
      statusApi.setData(await githubApi.status({ refresh: true }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setChecking(false);
    }
  };

  const run = async (key, action, success) => {
    setBusy(key);
    try {
      const result = await action();
      if (success) toast.success(typeof success === "function" ? success(result) : success);
      return result;
    } catch (error) {
      toast.error(error.message);
      return null;
    } finally {
      setBusy(null);
      refreshAll();
    }
  };

  if (statusApi.loading && !status) return <LoadingState label="Checking GitHub…" className="h-full" />;
  if (statusApi.error) return <ErrorState error={statusApi.error} onRetry={statusApi.reload} className="h-full" />;

  const showPicker = status.connected && (picking || !status.repository);

  return (
    <Page className="max-w-5xl">
      <PageHeader title="GitHub" description="Accepted approaches are committed to your repository, organized by section and problem." />

      <div className="space-y-4">
        <Card title="Connection" icon={KeyRound}>
          {status.connected ? (
            <div className="flex flex-wrap items-center gap-4">
              {status.user?.avatarUrl && <img src={status.user.avatarUrl} alt="" className="size-10 rounded-full border border-border" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {status.user?.name || status.user?.login}{" "}
                  <a href={status.user?.htmlUrl} target="_blank" rel="noreferrer" className="text-sm font-normal text-muted hover:text-accent">
                    @{status.user?.login}
                  </a>
                </p>
                <p className="text-xs text-muted">
                  Connected with {status.authMethod === "oauth" ? "GitHub sign-in (token stored on your local server)" : "GITHUB_TOKEN from backend/.env"}
                </p>
              </div>
              <Badge tone="success">Connected</Badge>
              <Button size="sm" variant="ghost" icon={RefreshCw} loading={checking} onClick={recheck}>
                Recheck
              </Button>
              {status.authMethod === "oauth" && (
                <Button size="sm" variant="danger-ghost" icon={LogOut} onClick={() => run("disconnect", githubApi.disconnect, "Disconnected from GitHub")}>
                  Disconnect
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {status.error && (
                <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-[13px] text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {status.error}
                </p>
              )}
              <ConnectOptions status={status} onRecheck={recheck} checking={checking} />
            </div>
          )}
        </Card>

        {status.connected && (
          <Card
            title="Repository"
            icon={FolderGit2}
            action={
              status.repository &&
              !picking && (
                <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setPicking(true)}>
                  Change
                </Button>
              )
            }
          >
            {showPicker ? (
              <RepositoryPicker
                status={status}
                onSaved={(next) => {
                  statusApi.setData(next);
                  setPicking(false);
                  historyApi.reload({ silent: true });
                }}
                onCancel={status.repository ? () => setPicking(false) : null}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <a href={status.repository.htmlUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium hover:text-accent">
                  {status.repository.fullName} <ExternalLink className="size-3.5" />
                </a>
                <span className="text-muted">
                  Branch <code className="font-mono text-fg">{status.branch}</code>
                </span>
                <span className="text-muted">
                  Folder <code className="font-mono text-fg">{status.basePath || "/"}</code>
                </span>
                <Badge>{status.repository.isPrivate ? "Private" : "Public"}</Badge>
              </div>
            )}
          </Card>
        )}

        {status.ready && (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <Card title="Sync" icon={CloudUpload}>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Auto-sync</p>
                    <p className="text-xs text-muted">Commit an approach when it is accepted, and after you edit an accepted approach. Deleting an approach removes its file.</p>
                  </div>
                  <Toggle
                    label="Auto-sync"
                    checked={status.autoSync}
                    disabled={busy === "autosync"}
                    onChange={(value) =>
                      run("autosync", async () => statusApi.setData(await githubApi.updateSettings({ autoSync: value })), value ? "Auto-sync on" : "Auto-sync off")
                    }
                  />
                </div>

                <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Synced", counts.synced ?? 0, "text-success"],
                    ["Out of date", counts.outdated ?? 0, "text-warning"],
                    ["Failed", counts.failed ?? 0, "text-danger"],
                    ["In progress", (counts.pending ?? 0) + (counts.syncing ?? 0), "text-info"],
                  ].map(([label, value, tone]) => (
                    <div key={label} className="rounded-lg bg-surface-2 px-2 py-2.5">
                      <dd className={`text-xl font-semibold tabular-nums ${value ? tone : ""}`}>{value}</dd>
                      <dt className="text-[11px] text-muted">{label}</dt>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted">
                    {counts.readyToSync ? `${counts.readyToSync} accepted approach${counts.readyToSync === 1 ? "" : "es"} not on GitHub yet.` : "Everything accepted is on GitHub."}
                  </p>
                  <Button
                    variant="primary"
                    icon={CloudUpload}
                    disabled={!counts.readyToSync}
                    loading={busy === "sync-all"}
                    onClick={() => run("sync-all", githubApi.syncAll, (result) => `Syncing ${result.queued} approach${result.queued === 1 ? "" : "es"}…`)}
                  >
                    Sync all
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  Individual approaches can be synced or retried from the problem page or{" "}
                  <Link to="/solutions" className="text-accent hover:underline">
                    My Solutions
                  </Link>
                  .
                </p>
              </div>
            </Card>

            <Card
              title="Recent syncs"
              icon={History}
              bodyClassName="px-3 py-1"
              action={
                <Button size="xs" variant="ghost" icon={RefreshCw} onClick={refreshAll}>
                  Refresh
                </Button>
              }
            >
              {historyApi.loading && !historyApi.data ? (
                <LoadingState />
              ) : historyApi.error ? (
                <ErrorState error={historyApi.error} onRetry={historyApi.reload} />
              ) : (
                <HistoryList records={historyApi.data} onRetry={(id) => run(`retry-${id}`, () => githubApi.sync(id), "Retrying sync…")} />
              )}
            </Card>
          </div>
        )}

        <Card title="Repository layout" icon={FolderTree}>
          <div className="grid gap-4 md:grid-cols-2">
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-muted">{TREE}</pre>
            <ul className="space-y-2 text-[13px] text-muted">
              <li>
                <b className="text-fg">problem.md</b>: statement, formats, constraints, examples, test cases, section, topic, difficulty, source.
              </li>
              <li>
                <b className="text-fg">&lt;approach&gt;.py</b>: one file per approach with the approach name, complexities and explanation as a header.
                Approaches never overwrite each other.
              </li>
              <li>
                <b className="text-fg">README.md</b> (per problem): summary, all approaches, complexity comparison, links and status.
              </li>
              <li>
                <b className="text-fg">README.md</b> (root): every synced problem grouped by section.
              </li>
              <li>Commits look like “Add Two Sum - Hash Map solution” or “Update Two Sum - Hash Map solution”.</li>
            </ul>
          </div>
        </Card>
      </div>
    </Page>
  );
}
