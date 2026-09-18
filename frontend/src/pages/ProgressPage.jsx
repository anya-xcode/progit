import { CalendarDays, Flame, Layers, Target, Trophy } from "lucide-react";
import { dashboardApi } from "../api/index.js";
import DifficultyProgress from "../components/dashboard/DifficultyProgress.jsx";
import SectionProgressList from "../components/dashboard/SectionProgressList.jsx";
import StatCard from "../components/dashboard/StatCard.jsx";
import ActivityHeatmap from "../components/progress/ActivityHeatmap.jsx";
import Card from "../components/ui/Card.jsx";
import PageHeader, { Page } from "../components/ui/PageHeader.jsx";
import { ErrorState, LoadingState } from "../components/ui/States.jsx";
import { useApi } from "../hooks/useApi.js";
import { percent, pluralize } from "../utils/format.js";

function SolvedRing({ solved, total }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? solved / total : 0;
  return (
    <div className="relative mx-auto size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-surface-2" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-accent transition-[stroke-dashoffset] duration-700"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums">{solved}</span>
        <span className="text-xs text-muted">of {total} solved</span>
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const { data, loading, error, reload } = useApi(async () => {
    const [stats, progress] = await Promise.all([dashboardApi.stats(), dashboardApi.progress()]);
    return { stats, progress };
  }, []);

  if (loading) return <LoadingState label="Loading progress…" className="h-full" />;
  if (error) return <ErrorState error={error} onRetry={reload} className="h-full" />;

  const { stats, progress } = data;
  const activeDays = progress.activity.filter((day) => day.submissions > 0).length;

  return (
    <Page>
      <PageHeader title="Progress" description="How far you are through the sheet." />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card title="Overall" icon={Target}>
          <SolvedRing solved={stats.solvedProblems} total={stats.totalProblems} />
          <p className="mt-3 text-center text-[13px] text-muted">{percent(stats.solvedProblems, stats.totalProblems)}% complete</p>
          <div className="mt-5">
            <DifficultyProgress difficulties={progress.byDifficulty} />
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard icon={Flame} tone="text-warning" label="Current streak" value={pluralize(stats.currentStreak, "day")} />
            <StatCard icon={Trophy} tone="text-warning" label="Longest streak" value={pluralize(stats.longestStreak, "day")} />
            <StatCard icon={CalendarDays} label="Active days" value={activeDays} detail="in the last 26 weeks" />
            <StatCard icon={Layers} label="Multiple approaches" value={stats.multiApproachProblems} detail="problems" />
          </div>
          <Card title="Activity" icon={CalendarDays}>
            <ActivityHeatmap activity={progress.activity} />
            <p className="mt-2 text-xs text-muted">A day counts toward your streak when it has at least one accepted submission.</p>
          </Card>
        </div>
      </div>

      <Card title="Sections" icon={Layers} className="mt-4">
        <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
          <SectionProgressList sections={progress.bySection.slice(0, Math.ceil(progress.bySection.length / 2))} />
          <SectionProgressList sections={progress.bySection.slice(Math.ceil(progress.bySection.length / 2))} />
        </div>
      </Card>
    </Page>
  );
}
