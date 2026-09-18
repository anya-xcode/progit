import { AlertTriangle, CheckCircle2, CloudUpload, FolderGit2, Loader2, RefreshCw } from "lucide-react";
import { VERDICTS } from "../../utils/constants.js";

export function githubFileUrl(github, path) {
  if (!github?.repository?.htmlUrl || !path) return null;
  return `${github.repository.htmlUrl}/blob/${encodeURIComponent(github.branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const base = "inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap";

// Shows where an approach stands on GitHub and offers Sync / Retry.
// `github`: status from /api/github/status (null while loading).
export default function GitHubSyncBadge({ solution, github, onSync, compact = false }) {
  const ready = Boolean(github?.ready);
  const accepted = solution.verdict === VERDICTS.ACCEPTED;
  const canSync = ready && accepted;
  const status = solution.githubStatus ?? "not-synced";
  const label = (text) => (compact ? <span className="hidden xl:inline">{text}</span> : text);

  if (status === "pending" || status === "syncing") {
    return (
      <span className={`${base} bg-info/12 text-info`} title="Committing to GitHub…">
        <Loader2 className="size-3 animate-spin" />
        {label("Syncing")}
      </span>
    );
  }

  if (status === "synced") {
    const fileUrl = githubFileUrl(github, solution.githubPath);
    return (
      <span className="inline-flex items-center gap-1">
        <a
          href={solution.githubCommitUrl || fileUrl}
          target="_blank"
          rel="noreferrer"
          className={`${base} bg-success/12 text-success hover:underline`}
          title={`Synced: ${solution.githubPath}\nOpen the commit on GitHub`}
        >
          <CheckCircle2 className="size-3" />
          {label("On GitHub")}
        </a>
        {!compact && fileUrl && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-fg" title="Open file on GitHub">
            <FolderGit2 className="size-3.5" />
          </a>
        )}
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1">
        <span className={`${base} bg-danger/12 text-danger`} title={solution.githubSyncError || "Sync failed"}>
          <AlertTriangle className="size-3" />
          {label("Sync failed")}
        </span>
        {canSync && onSync && (
          <button onClick={() => onSync(solution._id)} className={`${base} border border-border hover:bg-surface-2`} title={solution.githubSyncError}>
            <RefreshCw className="size-3" /> Retry
          </button>
        )}
      </span>
    );
  }

  if (status === "outdated") {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className={`${base} bg-warning/12 text-warning`}
          title={accepted ? "Changed since the last sync" : "Changed since the last sync. Submit and get Accepted to sync again."}
        >
          <RefreshCw className="size-3" />
          {label("Out of date")}
        </span>
        {canSync && onSync && !compact && (
          <button onClick={() => onSync(solution._id)} className={`${base} border border-border hover:bg-surface-2`}>
            Sync
          </button>
        )}
      </span>
    );
  }

  // not-synced
  if (canSync && onSync) {
    return (
      <button onClick={() => onSync(solution._id)} className={`${base} border border-border text-muted hover:bg-surface-2 hover:text-fg`} title="Commit this approach to GitHub">
        <CloudUpload className="size-3" />
        {label("Sync to GitHub")}
      </button>
    );
  }
  if (compact) return null;
  return (
    <span
      className={`${base} bg-surface-2 text-muted`}
      title={!ready ? "Connect GitHub and pick a repository on the GitHub page" : "Only accepted approaches are synced"}
    >
      <FolderGit2 className="size-3" />
      Not on GitHub
    </span>
  );
}
