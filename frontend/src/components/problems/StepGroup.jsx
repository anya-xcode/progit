import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import ProgressBar from "../ui/ProgressBar.jsx";
import ProblemRow from "./ProblemRow.jsx";

function SubStep({ title, problems, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  const solved = problems.filter((problem) => problem.status === "solved").length;

  return (
    <li className="border-t border-border">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 py-2.5 pr-4 pl-10 text-left hover:bg-surface-2/40"
        aria-expanded={open}
      >
        <ChevronDown className={`size-3.5 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex-1 truncate text-[13px]">{title}</span>
        <ProgressBar value={solved} total={problems.length} className="hidden w-28 sm:block" tone={solved === problems.length ? "success" : "accent"} />
        <span className="w-14 text-right text-xs text-muted tabular-nums">
          {solved} / {problems.length}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border bg-bg/40">
          {problems.map((problem) => (
            <ProblemRow key={problem._id} problem={problem} />
          ))}
        </ul>
      )}
    </li>
  );
}

// One A2Z step: header with progress, then its sub-steps.
export default function StepGroup({ step, subSteps, defaultOpen = false, expandSubSteps = false }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);

  const problems = subSteps.flatMap((sub) => sub.problems);
  const solved = problems.filter((problem) => problem.status === "solved").length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60" aria-expanded={open}>
        <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            <span className="text-muted">Step {step.stepNo}:</span> {step.name}
          </span>
          {step.fullTitle && step.fullTitle !== step.name && <span className="block truncate text-xs text-muted">{step.fullTitle}</span>}
        </span>
        <ProgressBar value={solved} total={problems.length} className="hidden w-32 sm:block" tone={solved === problems.length && problems.length > 0 ? "success" : "accent"} />
        <span className="w-16 text-right text-xs text-muted tabular-nums">
          {solved} / {problems.length}
        </span>
      </button>

      {open && (
        <ul>
          {subSteps.map((sub) => (
            <SubStep key={sub.title} title={sub.title} problems={sub.problems} defaultOpen={expandSubSteps} />
          ))}
        </ul>
      )}
    </section>
  );
}
