import { Search, X } from "lucide-react";
import { Input, Select } from "../ui/Field.jsx";

export default function ProblemFilters({ filters, meta, onChange, onClear }) {
  const hasFilters = Object.values(filters).some(Boolean);
  const set = (key) => (event) => onChange({ [key]: event.target.value });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={filters.search}
          onChange={set("search")}
          placeholder="Search by name, keyword, topic or #number"
          className="pl-9"
          aria-label="Search problems"
          autoFocus
        />
      </div>
      <Select value={filters.section} onChange={set("section")} className="w-auto max-w-56" aria-label="Step">
        <option value="">All steps</option>
        {meta?.steps?.map((step) => (
          <option key={step.stepNo} value={step.name}>
            {step.stepNo <= 18 ? `Step ${step.stepNo}: ` : ""}
            {step.name}
          </option>
        ))}
      </Select>
      <Select value={filters.topic} onChange={set("topic")} className="w-auto max-w-48" aria-label="Topic">
        <option value="">All topics</option>
        {meta?.topics.map((topic) => (
          <option key={topic}>{topic}</option>
        ))}
      </Select>
      <Select value={filters.difficulty} onChange={set("difficulty")} className="w-auto" aria-label="Difficulty">
        <option value="">Any difficulty</option>
        {meta?.difficulties.map((difficulty) => (
          <option key={difficulty}>{difficulty}</option>
        ))}
      </Select>
      <Select value={filters.status} onChange={set("status")} className="w-auto" aria-label="Status">
        <option value="">Any status</option>
        <option value="solved">Solved</option>
        <option value="attempted">Attempted</option>
        <option value="unsolved">Unsolved</option>
      </Select>
      <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-[13px] whitespace-nowrap">
        <input
          type="checkbox"
          checked={filters.ready === "true"}
          onChange={(event) => onChange({ ready: event.target.checked ? "true" : "" })}
          className="size-4 accent-[var(--accent)]"
        />
        Solvable here
      </label>
      {hasFilters && (
        <button onClick={onClear} className="flex h-9 items-center gap-1 px-2 text-[13px] text-muted hover:text-fg">
          <X className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}
