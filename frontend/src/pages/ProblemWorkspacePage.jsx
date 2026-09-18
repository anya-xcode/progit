import { BookOpen, Code2, History, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { githubApi, problemsApi } from "../api/index.js";
import GitHubSyncBadge from "../components/github/GitHubSyncBadge.jsx";
import Button from "../components/ui/Button.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";
import Tabs from "../components/ui/Tabs.jsx";
import ApproachesPanel from "../components/workspace/ApproachesPanel.jsx";
import ApproachModal from "../components/workspace/ApproachModal.jsx";
import CodeEditor from "../components/workspace/CodeEditor.jsx";
import CompareModal from "../components/workspace/CompareModal.jsx";
import ConsolePanel from "../components/workspace/ConsolePanel.jsx";
import EditorToolbar from "../components/workspace/EditorToolbar.jsx";
import PlaceholderProblem from "../components/workspace/PlaceholderProblem.jsx";
import ProblemDescription from "../components/workspace/ProblemDescription.jsx";
import ReferenceProblem from "../components/workspace/ReferenceProblem.jsx";
import SubmissionsPanel from "../components/workspace/SubmissionsPanel.jsx";
import { useApi } from "../hooks/useApi.js";
import { useWorkspace } from "../hooks/useWorkspace.js";

export default function ProblemWorkspacePage() {
  const { slug } = useParams();
  const { data: problem, loading, error, reload } = useApi(() => problemsApi.get(slug), [slug]);

  if (loading && !problem) return <LoadingState label="Loading problem…" className="h-full" />;
  if (error) {
    if (error.status === 404) {
      return (
        <EmptyState
          icon={SearchX}
          title="Question not found in your library."
          description={`There is no problem with the slug "${slug}".`}
          className="h-full justify-center"
          action={
            <Link to="/problems/new">
              <Button variant="primary">Add custom problem</Button>
            </Link>
          }
        />
      );
    }
    return <ErrorState error={error} onRetry={reload} className="h-full" />;
  }

  if (problem.contentStatus === "placeholder") return <PlaceholderProblem problem={problem} />;
  if (problem.contentStatus === "reference") return <ReferenceProblem problem={problem} onChanged={() => reload({ silent: true })} />;

  // Keyed by problem so all workspace state resets when switching problems.
  return <Workspace key={problem._id} problem={problem} onActivity={() => reload({ silent: true })} />;
}

function Workspace({ problem, onActivity }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useWorkspace(problem, { initialSolutionId: searchParams.get("solution"), onActivity });

  const [leftTab, setLeftTab] = useState("description");
  const [consoleTab, setConsoleTab] = useState("testcases");
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [approachModal, setApproachModal] = useState(null); // { mode, solution? }
  const [compareIds, setCompareIds] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { activeId } = workspace;
  const { data: github } = useApi(() => githubApi.status().catch(() => null), []);

  // Keep ?solution= in sync with the open approach so refreshes restore it.
  useEffect(() => {
    if (workspace.solutionsLoading) return;
    const current = searchParams.get("solution");
    if ((activeId ?? null) !== current) {
      const next = new URLSearchParams(searchParams);
      if (activeId) next.set("solution", activeId);
      else next.delete("solution");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, workspace.solutionsLoading]);

  const showResult = () => {
    setConsoleTab("result");
    setConsoleCollapsed(false);
  };

  const handleRun = () => {
    showResult();
    workspace.run({ customInput: useCustomInput ? customInput : undefined });
  };

  const handleSubmit = () => {
    showResult();
    workspace.submit();
  };

  const handleSave = async () => {
    const saved = await workspace.saveCode();
    if (!saved) setApproachModal({ mode: "create" });
  };

  const handleApproachSubmit = async (details) => {
    if (approachModal.mode === "edit") await workspace.updateDetails(approachModal.solution._id, details);
    else await workspace.createApproach(details);
    setApproachModal(null);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await workspace.deleteApproach(deleteId);
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (id) => setApproachModal({ mode: "edit", solution: workspace.solutions.find((s) => s._id === id) });
  const deleteTarget = workspace.solutions.find((s) => s._id === deleteId);

  const leftTabs = [
    { id: "description", label: "Description", icon: BookOpen },
    { id: "approaches", label: "Approaches", icon: Code2, count: workspace.solutions.length },
    { id: "submissions", label: "Submissions", icon: History },
  ];

  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      <section className="flex min-h-0 flex-col border-border bg-surface lg:w-[42%] lg:border-r xl:w-[40%]">
        <div className="flex h-11 shrink-0 items-center border-b border-border px-2">
          <Tabs tabs={leftTabs} active={leftTab} onChange={setLeftTab} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {leftTab === "description" && <ProblemDescription problem={problem} />}
          {leftTab === "approaches" && (
            <ApproachesPanel
              solutions={workspace.solutions}
              loading={workspace.solutionsLoading}
              activeId={activeId}
              onOpen={workspace.selectApproach}
              onEdit={openEdit}
              onDelete={setDeleteId}
              onNew={workspace.newApproach}
              onCompare={(a, b) => setCompareIds([a, b])}
              github={github}
              onSync={workspace.syncToGitHub}
            />
          )}
          {leftTab === "submissions" && <SubmissionsPanel problemId={problem._id} version={workspace.submissionsVersion} />}
        </div>
      </section>

      <section className="flex h-[85dvh] min-w-0 flex-1 flex-col lg:h-full">
        <EditorToolbar
          solutions={workspace.solutions}
          activeId={activeId}
          isDirty={workspace.isDirty}
          busy={workspace.busy}
          onSelectApproach={workspace.selectApproach}
          onNewApproach={workspace.newApproach}
          onEditDetails={() => openEdit(activeId)}
          onFormat={workspace.formatCode}
          onReset={workspace.resetCode}
          onSave={handleSave}
          onRun={handleRun}
          onSubmit={handleSubmit}
          githubBadge={workspace.active && <GitHubSyncBadge solution={workspace.active} github={github} onSync={workspace.syncToGitHub} compact />}
        />
        <div className="min-h-0 flex-1">
          {workspace.solutionsLoading ? (
            <LoadingState label="Loading your code…" />
          ) : (
            <CodeEditor
              value={workspace.code}
              onChange={workspace.setCode}
              shortcuts={{ run: handleRun, submit: handleSubmit, save: handleSave }}
            />
          )}
        </div>
        <ConsolePanel
          problem={problem}
          tab={consoleTab}
          onTabChange={setConsoleTab}
          collapsed={consoleCollapsed}
          onToggleCollapsed={() => setConsoleCollapsed((value) => !value)}
          customInput={customInput}
          onCustomInputChange={setCustomInput}
          useCustomInput={useCustomInput}
          onUseCustomInputChange={setUseCustomInput}
          busy={workspace.busy}
          result={workspace.result}
          error={workspace.resultError}
          onSaveAsApproach={activeId ? null : () => setApproachModal({ mode: "create" })}
        />
      </section>

      <ApproachModal
        open={Boolean(approachModal)}
        mode={approachModal?.mode}
        initial={approachModal?.solution}
        existingTitles={workspace.solutions.map((s) => s.title)}
        onClose={() => setApproachModal(null)}
        onSubmit={handleApproachSubmit}
      />
      <CompareModal open={Boolean(compareIds)} solutions={workspace.solutions} initialIds={compareIds} onClose={() => setCompareIds(null)} />
      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete approach?"
        message={`"${deleteTarget?.title}" and its code will be removed. Past submissions stay in your history.`}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
