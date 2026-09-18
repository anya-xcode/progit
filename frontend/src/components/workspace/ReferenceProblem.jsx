import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { problemsApi } from "../../api/index.js";
import { useToast } from "../../context/ToastContext.jsx";
import Badge from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";
import Markdown from "../ui/Markdown.jsx";
import { Page } from "../ui/PageHeader.jsx";

const LINK_LABELS = {
  leetcode: "LeetCode",
  gfg: "GeeksforGeeks",
  code360: "Coding Ninjas (code360)",
  article: "takeUforward article",
  youtube: "Video explanation",
};

// Theory items from the sheet: read them, then tick them off.
export default function ReferenceProblem({ problem, onChanged }) {
  const toast = useToast();
  const [done, setDone] = useState(Boolean(problem.manualDoneAt));
  const [saving, setSaving] = useState(false);
  const links = Object.entries(problem.practiceLinks ?? {}).filter(([, url]) => url);

  const toggle = async () => {
    setSaving(true);
    try {
      const result = await problemsApi.setDone(problem._id, !done);
      setDone(Boolean(result.manualDoneAt));
      toast.success(result.manualDoneAt ? `Marked "${problem.title}" as done` : "Marked as not done");
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page className="max-w-3xl">
      <Link to={`/problems?section=${encodeURIComponent(problem.section)}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-accent">
        <ArrowLeft className="size-3.5" /> Step {problem.sectionOrder}: {problem.section}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="text-muted">{problem.problemNumber}.</span> {problem.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="info">
              <BookOpen className="size-3" /> Reference
            </Badge>
            <Badge>{problem.subtopic}</Badge>
            {done && <Badge tone="success">Done</Badge>}
          </div>
        </div>
        <Button variant={done ? "secondary" : "primary"} icon={CheckCircle2} loading={saving} onClick={toggle}>
          {done ? "Mark as not done" : "Mark as done"}
        </Button>
      </div>

      <Card>
        <Markdown>{problem.statement}</Markdown>
        {problem.explanation && (
          <div className="mt-4 border-t border-border pt-4">
            <Markdown>{problem.explanation}</Markdown>
          </div>
        )}
        {links.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 text-[13px] font-medium">Learn more</p>
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
      </Card>
    </Page>
  );
}
