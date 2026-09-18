import { formatMemory, formatRuntime } from "../../utils/format.js";
import { VerdictBadge } from "../ui/Badge.jsx";

export default function ComplexityTable({ solutions, activeId, onOpen }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Approach</th>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Space</th>
            <th className="px-3 py-2 font-medium">Verdict</th>
            <th className="px-3 py-2 font-medium">Runtime</th>
            <th className="px-3 py-2 font-medium">Memory</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {solutions.map((solution) => (
            <tr key={solution._id} className={solution._id === activeId ? "bg-accent/5" : ""}>
              <td className="px-3 py-2">
                {onOpen ? (
                  <button onClick={() => onOpen(solution._id)} className="font-medium hover:text-accent">
                    {solution.title}
                  </button>
                ) : (
                  <span className="font-medium">{solution.title}</span>
                )}
                <span className="block text-xs text-muted">{solution.approach}</span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{solution.timeComplexity || "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{solution.spaceComplexity || "—"}</td>
              <td className="px-3 py-2">
                <VerdictBadge verdict={solution.verdict} />
              </td>
              <td className="px-3 py-2 text-xs text-muted tabular-nums">{formatRuntime(solution.runtime)}</td>
              <td className="px-3 py-2 text-xs text-muted tabular-nums">{formatMemory(solution.memory)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
