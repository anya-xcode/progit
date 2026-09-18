import { useEffect, useState } from "react";
import { APPROACH_TYPES } from "../../utils/constants.js";
import Button from "../ui/Button.jsx";
import { Field, Input, Select, Textarea } from "../ui/Field.jsx";
import Modal from "../ui/Modal.jsx";

const EMPTY = { title: "", approach: "Optimal", timeComplexity: "", spaceComplexity: "", explanation: "" };
const SUGGESTIONS = ["Brute Force", "Hash Map", "Two Pointers", "Sorting", "Binary Search", "Recursion", "Memoization", "Tabulation", "Stack", "Greedy"];

export default function ApproachModal({ open, mode, initial, existingTitles = [], onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, ...(initial ?? {}) });
      setError("");
    }
  }, [open, initial]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const taken = new Set(existingTitles.map((title) => title.trim().toLowerCase()));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError("Give this approach a name.");
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        title: form.title.trim(),
        approach: form.approach,
        timeComplexity: form.timeComplexity.trim(),
        spaceComplexity: form.spaceComplexity.trim(),
        explanation: form.explanation,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit approach details" : "Save as a new approach"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="approach-form" loading={saving}>
            {mode === "edit" ? "Save changes" : "Save approach"}
          </Button>
        </>
      }
    >
      <form id="approach-form" onSubmit={handleSubmit} className="space-y-4">
        {mode !== "edit" && (
          <p className="text-[13px] text-muted">Each approach is stored separately, so saving never overwrites your other solutions.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="Approach name" id="approach-title">
            <Input id="approach-title" value={form.title} onChange={set("title")} placeholder="e.g. Hash Map" autoFocus maxLength={80} />
          </Field>
          <Field label="Type" id="approach-type">
            <Select id="approach-type" value={form.approach} onChange={set("approach")}>
              {APPROACH_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter((name) => !taken.has(name.toLowerCase())).map((name) => (
            <button
              type="button"
              key={name}
              onClick={() => setForm((current) => ({ ...current, title: name }))}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:border-accent/60 hover:text-fg"
            >
              {name}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time complexity" id="approach-time">
            <Input id="approach-time" value={form.timeComplexity} onChange={set("timeComplexity")} placeholder="O(n)" className="font-mono" maxLength={60} />
          </Field>
          <Field label="Space complexity" id="approach-space">
            <Input id="approach-space" value={form.spaceComplexity} onChange={set("spaceComplexity")} placeholder="O(1)" className="font-mono" maxLength={60} />
          </Field>
        </div>
        <Field label="Explanation" hint="Markdown supported" id="approach-explanation">
          <Textarea id="approach-explanation" rows={5} value={form.explanation} onChange={set("explanation")} placeholder="Key idea, why it works, edge cases…" />
        </Field>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
