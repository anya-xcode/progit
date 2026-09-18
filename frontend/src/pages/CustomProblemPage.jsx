import { Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { problemsApi } from "../api/index.js";
import RepeatableList from "../components/problems/RepeatableList.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import { Field, Input, Select, Textarea } from "../components/ui/Field.jsx";
import PageHeader, { Page } from "../components/ui/PageHeader.jsx";
import { ErrorState, LoadingState } from "../components/ui/States.jsx";
import CodeEditor from "../components/workspace/CodeEditor.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useApi } from "../hooks/useApi.js";
import { DIFFICULTIES } from "../utils/constants.js";

const newExample = () => ({ input: "", output: "", explanation: "" });
const newTestCase = (isHidden = false) => ({ input: "", expectedOutput: "", isHidden });

function emptyForm(title = "") {
  return {
    title,
    difficulty: "Medium",
    section: "Custom",
    topic: "",
    subtopic: "",
    tags: "",
    statement: "",
    inputFormat: "",
    outputFormat: "",
    constraints: "",
    hints: "",
    explanation: "",
    sourceUrl: "",
    examples: [newExample()],
    testCases: [newTestCase(false), newTestCase(true)],
    starterCode: "",
  };
}

function formFromProblem(problem) {
  return {
    title: problem.title,
    difficulty: problem.difficulty,
    section: problem.section,
    topic: problem.topic,
    subtopic: problem.subtopic ?? "",
    tags: (problem.tags ?? []).join(", "),
    statement: problem.statement,
    inputFormat: problem.inputFormat ?? "",
    outputFormat: problem.outputFormat ?? "",
    constraints: (problem.constraints ?? []).join("\n"),
    hints: (problem.hints ?? []).join("\n"),
    explanation: problem.explanation ?? "",
    sourceUrl: problem.sourceUrl ?? "",
    examples: problem.examples?.length ? problem.examples : [newExample()],
    testCases: problem.testCases?.length ? problem.testCases : [newTestCase(false)],
    starterCode: problem.starterCode?.python ?? "",
  };
}

export default function CustomProblemPage() {
  const { slug } = useParams();
  const isEdit = Boolean(slug);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: meta } = useApi(() => problemsApi.meta(), []);
  const existing = useApi(() => (isEdit ? problemsApi.get(slug, { includeHidden: true }) : Promise.resolve(null)), [slug]);

  const [form, setForm] = useState(() => emptyForm(searchParams.get("title") ?? ""));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (existing.data) setForm(formFromProblem(existing.data));
  }, [existing.data]);

  if (isEdit && existing.loading) return <LoadingState className="h-full" />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} className="h-full" />;
  if (isEdit && existing.data && !existing.data.isCustom) {
    return <ErrorState error={new Error("Library problems are read-only. Only custom problems can be edited.")} className="h-full" />;
  }

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      constraints: lines(form.constraints),
      hints: lines(form.hints),
      starterCode: { python: form.starterCode },
    };
    try {
      const saved = isEdit ? await problemsApi.update(existing.data._id, payload) : await problemsApi.create(payload);
      toast.success(isEdit ? "Problem updated" : "Custom problem added");
      navigate(`/problems/${saved.slug}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await problemsApi.remove(existing.data._id);
      toast.success("Problem deleted");
      navigate("/problems");
    } catch (error) {
      toast.error(error.message);
      setDeleting(false);
    }
  };

  return (
    <Page className="max-w-4xl">
      <PageHeader
        title={isEdit ? "Edit custom problem" : "Add custom problem"}
        description="Custom problems work exactly like library problems: run, submit and save approaches."
        actions={
          isEdit && (
            <Button variant="danger-ghost" icon={Trash2} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" id="title" className="sm:col-span-2">
              <Input id="title" required value={form.title} onChange={set("title")} placeholder="e.g. Count Pairs With Given Sum" maxLength={150} />
            </Field>
            <Field label="Difficulty" id="difficulty">
              <Select id="difficulty" value={form.difficulty} onChange={set("difficulty")}>
                {DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </Select>
            </Field>
            <Field label="Section" id="section">
              <Select id="section" value={form.section} onChange={set("section")}>
                <option>Custom</option>
                {meta?.sections.filter((s) => s !== "Custom").map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label="Topic" id="topic">
              <Input id="topic" required value={form.topic} onChange={set("topic")} placeholder="e.g. Hashing" list="topic-options" />
              <datalist id="topic-options">
                {meta?.topics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Subtopic" hint="optional" id="subtopic">
              <Input id="subtopic" value={form.subtopic} onChange={set("subtopic")} placeholder="e.g. Medium Problems" />
            </Field>
            <Field label="Tags" hint="comma separated" id="tags">
              <Input id="tags" value={form.tags} onChange={set("tags")} placeholder="array, hashing" />
            </Field>
            <Field label="Source URL" hint="optional" id="sourceUrl">
              <Input id="sourceUrl" type="url" value={form.sourceUrl} onChange={set("sourceUrl")} placeholder="https://…" />
            </Field>
          </div>
        </Card>

        <Card title="Problem">
          <div className="space-y-4">
            <Field label="Problem statement" hint="Markdown supported" id="statement">
              <Textarea id="statement" required rows={7} value={form.statement} onChange={set("statement")} placeholder="Describe the problem in your own words." />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Input format" id="inputFormat">
                <Textarea id="inputFormat" rows={3} value={form.inputFormat} onChange={set("inputFormat")} placeholder="Line 1: n. Line 2: n integers." />
              </Field>
              <Field label="Output format" id="outputFormat">
                <Textarea id="outputFormat" rows={3} value={form.outputFormat} onChange={set("outputFormat")} placeholder="Print a single integer." />
              </Field>
            </div>
            <Field label="Constraints" hint="one per line" id="constraints">
              <Textarea id="constraints" mono rows={3} value={form.constraints} onChange={set("constraints")} placeholder={"1 <= n <= 10^5"} />
            </Field>
          </div>
        </Card>

        <Card title="Examples">
          <RepeatableList
            items={form.examples}
            onChange={(examples) => setForm((current) => ({ ...current, examples }))}
            createItem={newExample}
            addLabel="Add example"
            itemLabel="Example"
            renderItem={(example, update) => (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Textarea mono rows={3} value={example.input} onChange={(e) => update({ input: e.target.value })} placeholder="Input" aria-label="Example input" />
                  <Textarea mono rows={3} value={example.output} onChange={(e) => update({ output: e.target.value })} placeholder="Output" aria-label="Example output" />
                </div>
                <Input value={example.explanation} onChange={(e) => update({ explanation: e.target.value })} placeholder="Explanation (optional)" aria-label="Example explanation" />
              </>
            )}
          />
        </Card>

        <Card title="Test cases">
          <p className="mb-3 text-[13px] text-muted">Visible cases are used by Run. Submit uses all cases. Output is compared line by line, ignoring extra spaces.</p>
          <RepeatableList
            items={form.testCases}
            onChange={(testCases) => setForm((current) => ({ ...current, testCases }))}
            createItem={() => newTestCase(true)}
            addLabel="Add test case"
            itemLabel="Test case"
            minItems={1}
            renderItem={(test, update) => (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Textarea mono rows={3} value={test.input} onChange={(e) => update({ input: e.target.value })} placeholder="Input (stdin)" aria-label="Test input" />
                  <Textarea mono rows={3} required value={test.expectedOutput} onChange={(e) => update({ expectedOutput: e.target.value })} placeholder="Expected output" aria-label="Expected output" />
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={test.isHidden} onChange={(e) => update({ isHidden: e.target.checked })} className="size-4 accent-[var(--accent)]" />
                  Hidden (only used on Submit)
                </label>
              </>
            )}
          />
        </Card>

        <Card title="Help & starter code">
          <div className="space-y-4">
            <Field label="Hints" hint="one per line" id="hints">
              <Textarea id="hints" rows={3} value={form.hints} onChange={set("hints")} />
            </Field>
            <Field label="Explanation" hint="Markdown supported" id="explanation">
              <Textarea id="explanation" rows={4} value={form.explanation} onChange={set("explanation")} placeholder="Approaches and complexities" />
            </Field>
            <Field label="Python starter code" hint="leave empty for a default template">
              <div className="h-64 overflow-hidden rounded-md border border-border">
                <CodeEditor value={form.starterCode} onChange={(starterCode) => setForm((current) => ({ ...current, starterCode }))} />
              </div>
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2 pb-6">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Save} loading={saving}>
            {isEdit ? "Save changes" : "Add problem"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete custom problem?"
        message="The problem, its saved approaches and its submissions will be deleted."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Page>
  );
}
