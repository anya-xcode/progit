import { Link } from "react-router";
import ProgressBar from "../ui/ProgressBar.jsx";

export default function SectionProgressList({ sections, limit }) {
  const rows = limit ? sections.slice(0, limit) : sections;
  return (
    <ul className="space-y-3">
      {rows.map(({ section, solved, total }) => (
        <li key={section}>
          <Link to={`/problems?section=${encodeURIComponent(section)}`} className="group block">
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="group-hover:text-accent">{section}</span>
              <span className="text-muted tabular-nums">
                {solved} / {total}
              </span>
            </div>
            <ProgressBar value={solved} total={total} tone={solved === total && total > 0 ? "success" : "accent"} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
