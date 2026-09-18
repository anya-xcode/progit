import { ArrowLeft, ExternalLink, FileQuestion } from "lucide-react";
import { Link } from "react-router";
import Badge, { DifficultyBadge } from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import { Page } from "../ui/PageHeader.jsx";

const LINK_LABELS = {
  leetcode: "LeetCode",
  gfg: "GeeksforGeeks",
  code360: "Coding Ninjas (code360)",
  article: "takeUforward article",
  youtube: "Video explanation",
};

// Shown for sheet problems whose statement and tests are not written yet.
export default function PlaceholderProblem({ problem }) {
  const links = Object.entries(problem.practiceLinks ?? {}).filter(([, url]) => url);

  return (
    <Page className="max-w-3xl">
      <Link to={`/problems?section=${encodeURIComponent(problem.section)}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-accent">
        <ArrowLeft className="size-3.5" /> Step {problem.sectionOrder}: {problem.section}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="text-muted">{problem.problemNumber}.</span> {problem.title}
      </h1>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-2">
        <DifficultyBadge difficulty={problem.difficulty} />
        <Badge>{problem.subtopic}</Badge>
        <Badge tone="warning">Not written yet</Badge>
      </div>

      <Card>
        <div className="flex gap-4">
          <div className="rounded-lg bg-surface-2 p-3">
            <FileQuestion className="size-5 text-muted" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm">
              This problem is on the A2Z sheet, but its statement, test cases and starter code have not been written in DSAForge yet, so it cannot
              be run or submitted here.
            </p>
            {links.length > 0 && (
              <div>
                <p className="mb-1.5 text-[13px] font-medium">Practise it elsewhere for now:</p>
                <ul className="flex flex-wrap gap-2">
                  {links.map(([key, url]) => (
                    <li key={key}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[13px] hover:border-accent/60 hover:text-accent"
                      >
                        {LINK_LABELS[key] ?? key} <ExternalLink className="size-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to="/problems?ready=true">
                <Button variant="primary">Show problems I can solve here</Button>
              </Link>
              <Link to={`/problems/new?title=${encodeURIComponent(problem.title)}`}>
                <Button>Add it myself</Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </Page>
  );
}
