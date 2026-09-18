import { ChevronRight, ExternalLink, EyeOff, Lightbulb, Lock, Pencil } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import Badge, { DifficultyBadge } from "../ui/Badge.jsx";
import Markdown from "../ui/Markdown.jsx";
import CodeBlock from "./CodeBlock.jsx";

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Reveal({ label, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-2/60" aria-expanded={open}>
        <ChevronRight className={`size-4 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
        <Icon className="size-4 text-muted" />
        {label}
      </button>
      {open && <div className="border-t border-border px-3 py-3">{children}</div>}
    </div>
  );
}

export default function ProblemDescription({ problem }) {
  const statusLabel = { solved: "Solved", attempted: "Attempted" }[problem.status];

  return (
    <article className="space-y-6 p-5">
      <header className="space-y-3">
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
          <Link to={`/problems?section=${encodeURIComponent(problem.section)}`} className="hover:text-accent">
            {problem.section}
          </Link>
          {problem.subtopic && (
            <>
              <ChevronRight className="size-3" /> {problem.subtopic}
            </>
          )}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          <span className="text-muted">{problem.problemNumber}.</span> {problem.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={problem.difficulty} />
          <Badge>{problem.topic}</Badge>
          {statusLabel && <Badge tone={problem.status === "solved" ? "success" : "warning"}>{statusLabel}</Badge>}
          {problem.isCustom && <Badge tone="accent">Custom</Badge>}
          {problem.tags?.map((tag) => (
            <Badge key={tag} className="font-normal">
              #{tag}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          {problem.sourceUrl && (
            <a href={problem.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-muted hover:text-accent">
              <ExternalLink className="size-3.5" /> Source
            </a>
          )}
          {problem.isCustom && (
            <Link to={`/problems/${problem.slug}/edit`} className="flex items-center gap-1 text-muted hover:text-accent">
              <Pencil className="size-3.5" /> Edit problem
            </Link>
          )}
        </div>
      </header>

      <Markdown>{problem.statement}</Markdown>

      {problem.inputFormat && (
        <Section title="Input format">
          <Markdown>{problem.inputFormat}</Markdown>
        </Section>
      )}
      {problem.outputFormat && (
        <Section title="Output format">
          <Markdown>{problem.outputFormat}</Markdown>
        </Section>
      )}

      {problem.examples?.length > 0 && (
        <Section title="Examples">
          <div className="space-y-3">
            {problem.examples.map((example, index) => (
              <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted">Example {index + 1}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CodeBlock label="Input">{example.input}</CodeBlock>
                  <CodeBlock label="Output">{example.output}</CodeBlock>
                </div>
                {example.explanation && <Markdown className="text-[13px] text-muted">{example.explanation}</Markdown>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {problem.constraints?.length > 0 && (
        <Section title="Constraints">
          <ul className="space-y-1.5">
            {problem.constraints.map((constraint) => (
              <li key={constraint}>
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px]">{constraint}</code>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Test cases">
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <EyeOff className="size-3.5" />
          {problem.testCases.length} visible (used by Run) · {problem.hiddenTestCount} hidden (used by Submit)
        </p>
      </Section>

      {(problem.hints?.length > 0 || problem.explanation) && (
        <div className="space-y-2">
          {problem.hints?.map((hint, index) => (
            <Reveal key={index} label={`Hint ${index + 1}`} icon={Lightbulb}>
              <Markdown className="text-[13px]">{hint}</Markdown>
            </Reveal>
          ))}
          {problem.explanation && (
            <Reveal label="Approach explanation (spoiler)" icon={Lock}>
              <Markdown className="text-[13px]">{problem.explanation}</Markdown>
            </Reveal>
          )}
        </div>
      )}
    </article>
  );
}
