import { CheckCircle2, CircleSlash, History, XCircle } from "lucide-react";
import { useState } from "react";
import { submissionsApi } from "../../api/index.js";
import { useApi } from "../../hooks/useApi.js";
import { VERDICTS } from "../../utils/constants.js";
import { formatMemory, formatRuntime, timeAgo } from "../../utils/format.js";
import { VerdictBadge } from "../ui/Badge.jsx";
import Modal from "../ui/Modal.jsx";
import { EmptyState, ErrorState, LoadingState } from "../ui/States.jsx";
import CodeBlock from "./CodeBlock.jsx";
import CodeEditor from "./CodeEditor.jsx";

function SubmissionDetails({ id }) {
  const { data, loading, error, reload } = useApi(() => submissionsApi.get(id), [id]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <VerdictBadge verdict={data.verdict} />
        <span>
          {data.passedCount} / {data.totalCount} passed
        </span>
        <span>{formatRuntime(data.runtime)}</span>
        <span>{formatMemory(data.memory)}</span>
        <span>{new Date(data.submittedAt).toLocaleString()}</span>
      </div>
      {data.compileError && <CodeBlock tone="danger" label="Compilation error">{data.compileError}</CodeBlock>}
      <div className="flex flex-wrap gap-1.5">
        {data.testResults.map((test) => (
          <span key={test.index} className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs" title={test.verdict}>
            {test.verdict === VERDICTS.SKIPPED ? (
              <CircleSlash className="size-3 text-muted" />
            ) : test.passed ? (
              <CheckCircle2 className="size-3 text-success" />
            ) : (
              <XCircle className="size-3 text-danger" />
            )}
            {test.isHidden ? "Hidden" : "Case"} {test.index + 1}
          </span>
        ))}
      </div>
      <div className="h-80 overflow-hidden rounded-lg border border-border">
        <CodeEditor value={data.code} readOnly />
      </div>
    </div>
  );
}

export default function SubmissionsPanel({ problemId, version }) {
  const { data, loading, error, reload } = useApi(() => submissionsApi.list({ problemId, limit: 50 }), [problemId, version]);
  const [openId, setOpenId] = useState(null);

  if (loading && !data) return <LoadingState label="Loading submissions…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (data.length === 0) {
    return <EmptyState icon={History} title="No submissions yet" description="Submit your code to judge it against every test case." />;
  }

  return (
    <div className="p-3">
      <ul className="divide-y divide-border">
        {data.map((submission) => (
          <li key={submission._id}>
            <button onClick={() => setOpenId(submission._id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <VerdictBadge verdict={submission.verdict} />
                <p className="mt-1 truncate text-xs text-muted">
                  {submission.solutionId?.title ?? "Unsaved code"} · {timeAgo(submission.submittedAt)}
                </p>
              </div>
              <div className="text-right text-xs text-muted tabular-nums">
                <p>
                  {submission.passedCount}/{submission.totalCount}
                </p>
                <p>
                  {formatRuntime(submission.runtime)} · {formatMemory(submission.memory)}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <Modal open={Boolean(openId)} onClose={() => setOpenId(null)} title="Submission" size="lg">
        {openId && <SubmissionDetails id={openId} />}
      </Modal>
    </div>
  );
}
