import { Lock, Plus, Search, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { githubApi } from "../../api/index.js";
import { useToast } from "../../context/ToastContext.jsx";
import { useApi } from "../../hooks/useApi.js";
import { timeAgo } from "../../utils/format.js";
import Button from "../ui/Button.jsx";
import { Field, Input } from "../ui/Field.jsx";
import { ErrorState, LoadingState } from "../ui/States.jsx";

export default function RepositoryPicker({ status, onSaved, onCancel }) {
  const toast = useToast();
  const repos = useApi(() => githubApi.repositories(), []);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(status.repository?.fullName ?? "");
  const [branch, setBranch] = useState(status.repository ? status.branch : "");
  const [basePath, setBasePath] = useState(status.basePath ?? "");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("dsa-solutions");
  const [newPrivate, setNewPrivate] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (repos.data ?? []).filter((repo) => !term || repo.fullName.toLowerCase().includes(term));
  }, [repos.data, search]);
  const selectedRepo = repos.data?.find((repo) => repo.fullName === selected);

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateBusy(true);
    try {
      const repo = await githubApi.createRepository({ name: newName.trim(), isPrivate: newPrivate });
      repos.setData((current) => [repo, ...(current ?? [])]);
      setSelected(repo.fullName);
      setBranch("");
      setCreating(false);
      toast.success(`Created ${repo.fullName}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await githubApi.selectRepository({ fullName: selected, branch: branch.trim(), basePath: basePath.trim() });
      toast.success(`Solutions will be synced to ${next.repository.fullName}`);
      onSaved(next);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your repositories" className="pl-9" aria-label="Search repositories" />
        </div>
        <Button icon={Plus} onClick={() => setCreating(!creating)}>
          New repository
        </Button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
          <Field label="Repository name" id="new-repo-name" className="min-w-48 flex-1">
            <Input id="new-repo-name" value={newName} onChange={(e) => setNewName(e.target.value)} required pattern="[A-Za-z0-9._\-]+" title="Letters, numbers, '.', '_' and '-'" />
          </Field>
          <label className="flex h-9 items-center gap-2 text-[13px]">
            <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Private
          </label>
          <Button type="submit" variant="primary" loading={createBusy}>
            Create
          </Button>
        </form>
      )}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        {repos.loading ? (
          <LoadingState label="Loading repositories…" />
        ) : repos.error ? (
          <ErrorState error={repos.error} onRetry={repos.reload} />
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-[13px] text-muted">No repositories found. Create one above.</p>
        ) : (
          <ul className="divide-y divide-border" role="radiogroup" aria-label="Repositories">
            {filtered.map((repo) => (
              <li key={repo.fullName}>
                <label
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${selected === repo.fullName ? "bg-accent/8" : "hover:bg-surface-2/60"} ${
                    repo.canPush ? "" : "cursor-not-allowed opacity-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="repository"
                    value={repo.fullName}
                    checked={selected === repo.fullName}
                    disabled={!repo.canPush}
                    onChange={() => {
                      setSelected(repo.fullName);
                      setBranch("");
                    }}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{repo.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {repo.canPush ? `Updated ${timeAgo(repo.pushedAt)}` : "No write access"}
                      {repo.description ? ` · ${repo.description}` : ""}
                    </span>
                  </span>
                  {repo.isPrivate ? <Lock className="size-3.5 text-muted" aria-label="Private" /> : <Unlock className="size-3.5 text-muted" aria-label="Public" />}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Branch" hint="optional" id="sync-branch">
          <Input id="sync-branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={selectedRepo?.defaultBranch || "default branch"} />
        </Field>
        <Field label="Folder in repository" hint="optional" id="sync-folder">
          <Input id="sync-folder" value={basePath} onChange={(e) => setBasePath(e.target.value)} placeholder="repository root" />
        </Field>
      </div>
      <p className="text-xs text-muted">
        DSAForge manages <code className="font-mono">README.md</code> and the section folders inside the chosen folder. Use a dedicated repository or folder.
        A missing branch is created from the default branch.
      </p>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!selected}>
          Use this repository
        </Button>
      </div>
    </div>
  );
}
