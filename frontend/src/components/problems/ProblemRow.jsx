import { BookOpen, Code2, ExternalLink, FileQuestion } from "lucide-react";
import { Link } from "react-router";
import { DifficultyBadge, StatusIcon } from "../ui/Badge.jsx";

// One problem line inside a sub-step.
export default function ProblemRow({ problem }) {
  const placeholder = problem.contentStatus === "placeholder";
  const practice = problem.practiceLinks ?? {};
  const practiceUrl = practice.leetcode || practice.gfg || practice.code360 || practice.article || "";

  return (
    <li>
      <Link
        to={`/problems/${problem.slug}`}
        className={`grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60 sm:grid-cols-[1.25rem_3rem_1fr_8rem_4rem_4.5rem] ${
          placeholder ? "opacity-60" : ""
        }`}
      >
        <StatusIcon status={problem.status} />
        <span className="hidden text-xs text-muted tabular-nums sm:block">#{problem.problemNumber}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{problem.title}</span>
          <span className="block truncate text-xs text-muted sm:hidden">{problem.topic}</span>
        </span>
        <span className="hidden truncate text-xs text-muted sm:block">
          {placeholder ? (
            <span className="inline-flex items-center gap-1" title="Statement and tests not written yet">
              <FileQuestion className="size-3.5" /> Not written yet
            </span>
          ) : problem.contentStatus === "reference" ? (
            <span className="inline-flex items-center gap-1" title="Theory item — read it and tick it off">
              <BookOpen className="size-3.5" /> Reference
            </span>
          ) : (
            problem.topic
          )}
        </span>
        <span className="hidden items-center gap-2 sm:flex">
          {problem.solutionCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted" title="Saved approaches">
              <Code2 className="size-3.5" /> {problem.solutionCount}
            </span>
          )}
          {placeholder && practiceUrl && (
            <button
              onClick={(event) => {
                event.preventDefault();
                window.open(practiceUrl, "_blank", "noreferrer");
              }}
              className="text-muted hover:text-accent"
              title="Practise this problem elsewhere for now"
            >
              <ExternalLink className="size-3.5" />
            </button>
          )}
        </span>
        <span className="justify-self-end">
          <DifficultyBadge difficulty={problem.difficulty} />
        </span>
      </Link>
    </li>
  );
}
