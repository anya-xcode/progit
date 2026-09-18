import { Code2, Layers, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { githubApi, solutionsApi } from "../api/index.js";
import GitHubSyncBadge from "../components/github/GitHubSyncBadge.jsx";
import { useToast } from "../context/ToastContext.jsx";
import Badge, { DifficultyBadge, VerdictBadge } from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import { Input, Select } from "../components/ui/Field.jsx";
import PageHeader, { Page } from "../components/ui/PageHeader.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { useApi } from "../hooks/useApi.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { SUBMISSION_VERDICTS } from "../utils/constants.js";
import { formatRuntime, pluralize, timeAgo } from "../utils/format.js";

export default function MySolutionsPage() {
  const [search, setSearch] = useState("");
  const [verdict, setVerdict] = useState("");
  const [multiOnly, setMultiOnly] = useState(false);
  const toast = useToast();
  const debouncedSearch = useDebounce(search);

  const { data, loading, error, reload } = useApi(
    () => solutionsApi.listAll({ search: debouncedSearch || undefined, verdict: verdict || undefined }),
    [debouncedSearch, verdict]
  );

  // Group approaches under their problem.
  const groups = useMemo(() => {
    const byProblem = new Map();
    for (const solution of data ?? []) {
      const key = solution.problemId._id;
      if (!byProblem.has(key)) byProblem.set(key, { problem: solution.problemId, solutions: [] });
      byProblem.get(key).solutions.push(solution);
    }
    const list = [...byProblem.values()];
    return multiOnly ? list.filter((group) => group.solutions.length >= 2) : list;
  }, [data, multiOnly]);

  const filtering = Boolean(search || verdict || multiOnly);

  const { data: github } = useApi(() => githubApi.status().catch(() => null), []);
  const handleSync = async (id) => {
    try {
      await githubApi.sync(id);
      toast.info("Syncing to GitHub…");
      reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Refresh badges while commits are running.
  const syncing = (data ?? []).some((s) => ["pending", "syncing"].includes(s.githubStatus));
  useEffect(() => {
    if (!syncing) return undefined;
    const timer = setInterval(() => reload({ silent: true }), 2000);
    return () => clearInterval(timer);
  }, [syncing, reload]);

  return (
    <Page>
      <PageHeader
        title="My Solutions"
        description={data ? `${pluralize(data.length, "approach")} across ${pluralize(groups.length, "problem")}` : "Every approach you have saved"}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by problem, approach or section" className="pl-9" />
        </div>
        <Select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="w-auto" aria-label="Verdict">
          <option value="">Any verdict</option>
          {SUBMISSION_VERDICTS.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
        <Button variant={multiOnly ? "primary" : "secondary"} icon={Layers} onClick={() => setMultiOnly(!multiOnly)}>
          Multiple approaches
        </Button>
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={Code2}
            title={filtering ? "No solutions match" : "No saved solutions yet"}
            description={filtering ? "Try different filters." : "Open a problem, write a solution and click Save."}
            action={
              !filtering && (
                <Link to="/problems">
                  <Button variant="primary">Browse problems</Button>
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ problem, solutions }) => (
            <section key={problem._id} className="rounded-xl border border-border bg-surface">
              <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <Link to={`/problems/${problem.slug}`} className="font-semibold hover:text-accent">
                  <span className="text-muted">{problem.problemNumber}.</span> {problem.title}
                </Link>
                <DifficultyBadge difficulty={problem.difficulty} />
                <span className="text-xs text-muted">{problem.section}</span>
                <span className="flex-1" />
                {solutions.length >= 2 && <Badge tone="accent">{pluralize(solutions.length, "approach")}</Badge>}
              </header>
              <ul className="divide-y divide-border">
                {solutions.map((solution) => (
                  <li key={solution._id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-surface-2/60">
                    <Link
                      to={`/problems/${problem.slug}?solution=${solution._id}`}
                      className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-3 md:grid-cols-[1fr_8rem_8rem_5rem_8rem]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{solution.title}</span>
                        <span className="block text-xs text-muted">
                          {solution.approach} · updated {timeAgo(solution.updatedAt)}
                        </span>
                      </span>
                      <span className="hidden font-mono text-xs md:block">T: {solution.timeComplexity || "—"}</span>
                      <span className="hidden font-mono text-xs md:block">S: {solution.spaceComplexity || "—"}</span>
                      <span className="hidden text-xs text-muted tabular-nums md:block">{formatRuntime(solution.runtime)}</span>
                      <span className="justify-self-end">
                        <VerdictBadge verdict={solution.verdict} />
                      </span>
                    </Link>
                    <span className="flex w-36 justify-end">
                      <GitHubSyncBadge solution={solution} github={github} onSync={handleSync} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
