import { CheckCircle2, Code2, Flame, FolderGit2, History, Layers, PlayCircle, Target, Trophy } from "lucide-react";
import { Link } from "react-router";
import { dashboardApi, githubApi } from "../api/index.js";
import DifficultyProgress from "../components/dashboard/DifficultyProgress.jsx";
import ProblemLinkRow from "../components/dashboard/ProblemLinkRow.jsx";
import SectionProgressList from "../components/dashboard/SectionProgressList.jsx";
import StatCard from "../components/dashboard/StatCard.jsx";
import Badge, { VerdictBadge } from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import PageHeader, { Page } from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { useApi } from "../hooks/useApi.js";
import { formatRuntime, percent, pluralize, timeAgo } from "../utils/format.js";

async function loadDashboard() {
  const [stats, recent, progress, github] = await Promise.all([
    dashboardApi.stats(),
    dashboardApi.recent(),
    dashboardApi.progress(),
    githubApi.status().catch(() => null),
  ]);
  return { stats, recent, progress, github };
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi(loadDashboard, []);

  if (loading) return <LoadingState label="Loading dashboard…" className="h-full" />;
  if (error) return <ErrorState error={error} onRetry={reload} className="h-full" />;

  const { stats, recent, progress, github } = data;

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description="Practice DSA. Build Your GitHub."
        actions={
          <Link to="/problems">
            <Button variant="primary" icon={PlayCircle}>
              Solve a problem
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={Target}
          label="Solved"
          value={`${stats.solvedProblems} / ${stats.totalProblems}`}
          detail={`${percent(stats.solvedProblems, stats.totalProblems)}% of your library`}
        >
          <ProgressBar value={stats.solvedProblems} total={stats.totalProblems} className="mt-3" />
        </StatCard>
        <StatCard icon={Code2} label="Total solutions" value={stats.totalSolutions} detail={`${stats.acceptedSolutions} accepted`} />
        <StatCard
          icon={CheckCircle2}
          tone="text-success"
          label="Accepted submissions"
          value={stats.acceptedSubmissions}
          detail={`of ${pluralize(stats.totalSubmissions, "submission")}`}
        />
        <StatCard
          icon={Flame}
          tone="text-warning"
          label="Current streak"
          value={pluralize(stats.currentStreak, "day")}
          detail={`Longest: ${pluralize(stats.longestStreak, "day")}`}
        />
        <StatCard
          icon={Layers}
          label="Multiple approaches"
          value={stats.multiApproachProblems}
          detail="problems with 2+ approaches"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Continue solving" icon={PlayCircle} bodyClassName="p-2">
          {recent.continueSolving.length === 0 ? (
            <EmptyState icon={Trophy} title="Everything solved" description="Add a custom problem to keep going." />
          ) : (
            <ul>
              {recent.continueSolving.map((problem) => (
                <ProblemLinkRow
                  key={problem._id}
                  problem={problem}
                  meta={problem.status === "attempted" ? `In progress · ${problem.section}` : problem.section}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent submissions"
          icon={History}
          bodyClassName="p-2"
          className="lg:col-span-2"
          action={
            <Link to="/solutions" className="text-xs text-muted hover:text-accent">
              My solutions
            </Link>
          }
        >
          {recent.recentSubmissions.length === 0 ? (
            <EmptyState icon={History} title="No submissions yet" description="Submit a solution and it will show up here." />
          ) : (
            <ul>
              {recent.recentSubmissions.map((submission) => (
                <ProblemLinkRow
                  key={submission._id}
                  problem={submission.problemId}
                  to={`/problems/${submission.problemId.slug}${submission.solutionId ? `?solution=${submission.solutionId._id}` : ""}`}
                  meta={`${submission.solutionId?.title ?? "Unsaved code"} · ${timeAgo(submission.submittedAt)} · ${formatRuntime(submission.runtime)}`}
                  right={<VerdictBadge verdict={submission.verdict} />}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Topic progress"
          icon={Target}
          className="lg:col-span-2"
          action={
            <Link to="/progress" className="text-xs text-muted hover:text-accent">
              View all
            </Link>
          }
        >
          <div className="grid gap-x-8 sm:grid-cols-2">
            <SectionProgressList sections={progress.bySection.slice(0, Math.ceil(progress.bySection.length / 2))} />
            <SectionProgressList sections={progress.bySection.slice(Math.ceil(progress.bySection.length / 2))} />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Difficulty" icon={Layers}>
            <DifficultyProgress difficulties={progress.byDifficulty} />
          </Card>

          <Card
            title="GitHub sync"
            icon={FolderGit2}
            action={
              <Link to="/github" className="text-xs text-muted hover:text-accent">
                Manage
              </Link>
            }
          >
            {!github ? (
              <p className="text-[13px] text-muted">GitHub status is unavailable.</p>
            ) : !github.connected ? (
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] text-muted">Connect GitHub to commit accepted solutions automatically.</p>
                <Badge>Not connected</Badge>
              </div>
            ) : !github.ready ? (
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] text-muted">Connected as @{github.user?.login}. Pick a repository to start syncing.</p>
                <Badge tone="warning">No repository</Badge>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <a href={github.repository.htmlUrl} target="_blank" rel="noreferrer" className="truncate text-[13px] font-medium hover:text-accent">
                    {github.repository.fullName}
                  </a>
                  <Badge tone={github.autoSync ? "success" : "neutral"}>{github.autoSync ? "Auto-sync on" : "Auto-sync off"}</Badge>
                </div>
                <p className="text-xs text-muted">
                  {github.counts.synced ?? 0} synced
                  {github.counts.outdated ? ` · ${github.counts.outdated} out of date` : ""}
                  {github.counts.failed ? ` · ${github.counts.failed} failed` : ""}
                  {github.counts.readyToSync ? ` · ${github.counts.readyToSync} ready to sync` : ""}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {recent.multiApproach.length > 0 && (
        <Card title="Problems with multiple approaches" icon={Code2} className="mt-4" bodyClassName="p-2">
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {recent.multiApproach.map(({ problem, count, approaches }) => (
              <ProblemLinkRow
                key={problem._id}
                problem={problem}
                meta={approaches.join(" · ")}
                right={<Badge tone="accent">{pluralize(count, "approach")}</Badge>}
              />
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
