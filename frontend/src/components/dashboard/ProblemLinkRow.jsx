import { Link } from "react-router";
import { DifficultyBadge } from "../ui/Badge.jsx";

// Compact row used in dashboard lists.
export default function ProblemLinkRow({ problem, to, meta, right }) {
  return (
    <li>
      <Link
        to={to ?? `/problems/${problem.slug}`}
        className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{problem.title}</p>
          <p className="truncate text-xs text-muted">{meta ?? problem.section}</p>
        </div>
        {right ?? <DifficultyBadge difficulty={problem.difficulty} />}
      </Link>
    </li>
  );
}
