import { FilePlus2, SearchX } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { problemsApi } from "../api/index.js";
import ProblemFilters from "../components/problems/ProblemFilters.jsx";
import StepGroup from "../components/problems/StepGroup.jsx";
import Button from "../components/ui/Button.jsx";
import PageHeader, { Page } from "../components/ui/PageHeader.jsx";
import ProgressBar from "../components/ui/ProgressBar.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import { useApi } from "../hooks/useApi.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { percent } from "../utils/format.js";

const FILTER_KEYS = ["search", "section", "topic", "difficulty", "status", "ready"];

export default function ProblemLibraryPage() {
  // Filters live in the URL so links like /problems?section=Arrays work.
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? ""]));
  const debouncedSearch = useDebounce(filters.search, 250);

  const query = { ...filters, search: debouncedSearch };
  const queryKey = JSON.stringify(query);
  const { data, loading, error, reload } = useApi(() => problemsApi.list(JSON.parse(queryKey)), [queryKey]);
  const { data: meta } = useApi(() => problemsApi.meta(), []);

  // Group problems into steps → sub-steps, keeping the sheet's order.
  const steps = useMemo(() => {
    const byStep = new Map();
    for (const problem of data?.problems ?? []) {
      const key = problem.sectionOrder;
      if (!byStep.has(key)) {
        byStep.set(key, {
          step: { stepNo: problem.sectionOrder, name: problem.section, fullTitle: problem.sectionFullTitle },
          subSteps: new Map(),
        });
      }
      const group = byStep.get(key);
      const subKey = problem.subtopic || problem.section;
      if (!group.subSteps.has(subKey)) group.subSteps.set(subKey, { title: subKey, problems: [] });
      group.subSteps.get(subKey).problems.push(problem);
    }
    return [...byStep.values()]
      .sort((a, b) => a.step.stepNo - b.step.stepNo)
      .map((group) => ({ ...group, subSteps: [...group.subSteps.values()] }));
  }, [data]);

  const updateFilters = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    setSearchParams(next, { replace: true });
  };

  const isFiltering = FILTER_KEYS.some((key) => filters[key]);
  const solved = (data?.problems ?? []).filter((problem) => problem.status === "solved").length;
  const ready = (data?.problems ?? []).filter((problem) => problem.contentStatus === "ready").length;

  return (
    <Page>
      <PageHeader
        title="Problem Library"
        description="Striver's A2Z sheet — 18 steps, solved in DSAForge and synced to GitHub."
        actions={
          <Link to="/problems/new">
            <Button icon={FilePlus2}>Add custom problem</Button>
          </Link>
        }
      />

      {data && !isFiltering && (
        <div className="mb-5 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              Overall progress <span className="text-muted">— {percent(solved, data.total)}%</span>
            </p>
            <p className="text-sm text-muted tabular-nums">
              {solved} / {data.total} solved
              {ready < data.total && <span className="ml-2 text-xs">({ready} ready to solve in DSAForge)</span>}
            </p>
          </div>
          <ProgressBar value={solved} total={data.total} className="mt-3" />
        </div>
      )}

      <ProblemFilters filters={filters} meta={meta} onChange={updateFilters} onClear={() => setSearchParams({}, { replace: true })} />

      <div className="mt-5 space-y-3">
        {loading && !data ? (
          <LoadingState label="Loading problems…" />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : steps.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              icon={SearchX}
              title="Question not found in your library."
              description={
                filters.search ? `Nothing matches "${filters.search}". You can add it as a custom problem.` : "No problems match these filters."
              }
              action={
                <Link to={`/problems/new${filters.search ? `?title=${encodeURIComponent(filters.search)}` : ""}`}>
                  <Button variant="primary" icon={FilePlus2}>
                    Add custom problem
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          steps.map((group) => (
            <StepGroup
              key={group.step.stepNo}
              step={group.step}
              subSteps={group.subSteps}
              defaultOpen={isFiltering || steps.length <= 2}
              expandSubSteps={isFiltering || steps.length <= 2}
            />
          ))
        )}
      </div>
    </Page>
  );
}
