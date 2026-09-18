import { CloudUpload, Pencil, Play, Plus, RotateCcw, Save, WandSparkles } from "lucide-react";
import { VERDICTS } from "../../utils/constants.js";
import Button from "../ui/Button.jsx";
import { Select } from "../ui/Field.jsx";

export default function EditorToolbar({
  solutions,
  activeId,
  isDirty,
  busy,
  onSelectApproach,
  onNewApproach,
  onEditDetails,
  onFormat,
  onReset,
  onSave,
  onRun,
  onSubmit,
  githubBadge,
}) {
  const disabled = Boolean(busy);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Select
          value={activeId ?? ""}
          onChange={(event) => onSelectApproach(event.target.value || null)}
          className="h-8 w-auto max-w-56 min-w-36 text-[13px]"
          aria-label="Approach"
          disabled={disabled}
        >
          <option value="">New approach (unsaved)</option>
          {solutions.map((solution) => (
            <option key={solution._id} value={solution._id}>
              {solution.verdict === VERDICTS.ACCEPTED ? "✓ " : ""}
              {solution.title}
            </option>
          ))}
        </Select>
        {isDirty && <span className="size-2 shrink-0 rounded-full bg-warning" title="Unsaved changes (kept as a local draft)" />}
        <span className="hidden rounded border border-border px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted sm:inline">Python 3</span>
        {githubBadge}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button size="icon" variant="ghost" icon={WandSparkles} onClick={onFormat} title="Format (tabs → spaces, trailing whitespace)" aria-label="Format code" />
        <Button size="icon" variant="ghost" icon={RotateCcw} onClick={onReset} title={activeId ? "Reset to saved code" : "Reset to starter code"} aria-label="Reset code" disabled={disabled} />
        {activeId && <Button size="icon" variant="ghost" icon={Pencil} onClick={onEditDetails} title="Edit approach details" aria-label="Edit approach details" />}
        <Button size="sm" variant="ghost" icon={Plus} onClick={onNewApproach} disabled={disabled} title="Add another approach">
          <span className="hidden 2xl:inline">Add approach</span>
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" icon={Save} onClick={onSave} loading={busy === "save"} disabled={disabled}>
          Save
        </Button>
        <Button size="sm" icon={Play} onClick={onRun} loading={busy === "run"} disabled={disabled}>
          Run
        </Button>
        <Button size="sm" variant="success" icon={CloudUpload} onClick={onSubmit} loading={busy === "submit"} disabled={disabled}>
          Submit
        </Button>
      </div>
    </div>
  );
}
