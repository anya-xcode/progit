import { Code2, GitCompare, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { timeAgo } from "../../utils/format.js";
import GitHubSyncBadge from "../github/GitHubSyncBadge.jsx";
import Badge, { VerdictBadge } from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Markdown from "../ui/Markdown.jsx";
import { EmptyState, LoadingState } from "../ui/States.jsx";
import ComplexityTable from "./ComplexityTable.jsx";

export default function ApproachesPanel({ solutions, loading, activeId, github, onOpen, onEdit, onDelete, onNew, onCompare, onSync }) {
  const [selected, setSelected] = useState([]);

  if (loading) return <LoadingState label="Loading approaches…" />;

  if (solutions.length === 0) {
    return (
      <EmptyState
        icon={Code2}
        title="No saved approaches yet"
        description="Write a solution and click Save. You can keep brute force, better and optimal versions side by side."
        action={
          <Button size="sm" icon={Plus} onClick={onNew}>
            Start a new approach
          </Button>
        }
      />
    );
  }

  const toggle = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current.slice(-1), id]));

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {solutions.length} approach{solutions.length === 1 ? "" : "es"} · select two to compare
        </p>
        <div className="flex gap-2">
          <Button size="sm" icon={GitCompare} disabled={selected.length !== 2} onClick={() => onCompare(selected[0], selected[1])}>
            Compare
          </Button>
          <Button size="sm" variant="primary" icon={Plus} onClick={onNew}>
            Add another approach
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {solutions.map((solution) => (
          <li
            key={solution._id}
            className={`rounded-lg border p-3 ${solution._id === activeId ? "border-accent/60 bg-accent/5" : "border-border"}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.includes(solution._id)}
                onChange={() => toggle(solution._id)}
                className="mt-1 size-4 accent-[var(--accent)]"
                aria-label={`Select ${solution.title} for comparison`}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => onOpen(solution._id)} className="font-medium hover:text-accent">
                    {solution.title}
                  </button>
                  <Badge>{solution.approach}</Badge>
                  <VerdictBadge verdict={solution.verdict} />
                  {solution._id === activeId && <Badge tone="accent">In editor</Badge>}
                </div>
                <p className="text-xs text-muted">
                  Time <span className="font-mono text-fg">{solution.timeComplexity || "—"}</span> · Space{" "}
                  <span className="font-mono text-fg">{solution.spaceComplexity || "—"}</span> · updated {timeAgo(solution.updatedAt)}
                </p>
                <GitHubSyncBadge solution={solution} github={github} onSync={onSync} />
                {solution.explanation && <Markdown className="text-[13px] text-muted">{solution.explanation}</Markdown>}
              </div>
              <div className="flex shrink-0">
                <Button size="icon" variant="ghost" icon={Pencil} onClick={() => onEdit(solution._id)} aria-label="Edit details" title="Edit details" />
                <Button size="icon" variant="danger-ghost" icon={Trash2} onClick={() => onDelete(solution._id)} aria-label="Delete approach" title="Delete" />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {solutions.length >= 2 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Complexity comparison</h3>
          <ComplexityTable solutions={solutions} activeId={activeId} onOpen={onOpen} />
        </div>
      )}
    </div>
  );
}
