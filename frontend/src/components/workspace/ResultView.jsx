import { CheckCircle2, CircleSlash, Loader2, Save, ServerCrash, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { VERDICTS, verdictTone } from "../../utils/constants.js";
import { formatMemory, formatRuntime } from "../../utils/format.js";
import Button from "../ui/Button.jsx";
import CodeBlock from "./CodeBlock.jsx";

const TONE_TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-info", neutral: "text-muted" };

function CaseIcon({ result }) {
  if (result.verdict === VERDICTS.SKIPPED) return <CircleSlash className="size-3.5 text-muted" />;
  if (result.verdict === VERDICTS.FINISHED) return <CheckCircle2 className="size-3.5 text-info" />;
  return result.passed ? <CheckCircle2 className="size-3.5 text-success" /> : <XCircle className="size-3.5 text-danger" />;
}

export default function ResultView({ busy, result, error, hiddenCount, onSaveAsApproach }) {
  const firstFailure = result?.results?.findIndex((r) => !r.passed && r.verdict !== VERDICTS.FINISHED) ?? -1;
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(firstFailure >= 0 ? firstFailure : 0);
  }, [result, firstFailure]);

  if (busy === "run" || busy === "submit") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" />
        {busy === "run" ? "Running your code in the sandbox…" : `Judging against all test cases (${hiddenCount} hidden)…`}
      </div>
    );
  }

  if (error) {
    const sandbox = error.status === 503;
    return (
      <div className="space-y-2 p-4">
        <p className="flex items-center gap-2 font-semibold text-danger">
          <ServerCrash className="size-4" /> {sandbox ? "Code execution unavailable" : "Request failed"}
        </p>
        <CodeBlock tone="danger">{error.message}</CodeBlock>
        {sandbox && <p className="text-xs text-muted">Check the sandbox in Settings → Code execution.</p>}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center text-sm text-muted">
        <p>Run your code to see the output here.</p>
        <p className="text-xs">
          <kbd className="rounded border border-border px-1">Ctrl</kbd> + <kbd className="rounded border border-border px-1">Enter</kbd> run ·{" "}
          <kbd className="rounded border border-border px-1">Ctrl</kbd> + <kbd className="rounded border border-border px-1">Shift</kbd> +{" "}
          <kbd className="rounded border border-border px-1">Enter</kbd> submit · <kbd className="rounded border border-border px-1">Ctrl</kbd> +{" "}
          <kbd className="rounded border border-border px-1">S</kbd> save
        </p>
      </div>
    );
  }

  const tone = verdictTone(result.verdict);
  const current = result.results?.[selected];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className={`text-lg font-semibold ${TONE_TEXT[tone]}`}>{result.verdict}</h3>
        {result.totalCount > 0 && (
          <span className="text-[13px] text-muted">
            {result.passedCount} / {result.totalCount} test cases passed
          </span>
        )}
        <span className="text-[13px] text-muted">Runtime {formatRuntime(result.runtime)}</span>
        <span className="text-[13px] text-muted">Memory {formatMemory(result.memory)}</span>
        {result.runtimeVersion && <span className="text-xs text-muted">{result.runtimeVersion}</span>}
        <span className="flex-1" />
        {result.mode === "submit" && onSaveAsApproach && (
          <Button size="sm" variant={result.verdict === VERDICTS.ACCEPTED ? "primary" : "secondary"} icon={Save} onClick={onSaveAsApproach}>
            {result.verdict === VERDICTS.ACCEPTED ? "Save as approach" : "Save as draft approach"}
          </Button>
        )}
      </div>

      {result.compileError && <CodeBlock tone="danger" label="Compilation error">{result.compileError}</CodeBlock>}

      {result.results?.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {result.results.map((test, index) => (
              <button
                key={index}
                onClick={() => setSelected(index)}
                className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${
                  selected === index ? "border-accent/60 bg-accent/10" : "border-border hover:bg-surface-2"
                }`}
              >
                <CaseIcon result={test} />
                {test.label}
              </button>
            ))}
          </div>

          {current && (
            <div className="space-y-3">
              <p className={`text-[13px] font-medium ${TONE_TEXT[verdictTone(current.verdict)]}`}>
                {current.verdict}
                {current.timeMs !== null && current.timeMs !== undefined && (
                  <span className="ml-2 font-normal text-muted">
                    {formatRuntime(current.timeMs)} · {formatMemory(current.memoryKb)}
                  </span>
                )}
              </p>
              {current.input === undefined ? (
                <p className="text-[13px] text-muted">Details of hidden test cases are only shown for the first failing case.</p>
              ) : (
                <>
                  <CodeBlock label="Input">{current.input}</CodeBlock>
                  <div className="grid gap-3 md:grid-cols-2">
                    <CodeBlock label="Your output" tone={current.passed ? "success" : current.expectedOutput === null ? "default" : "danger"}>
                      {current.actualOutput}
                    </CodeBlock>
                    {current.expectedOutput !== null && <CodeBlock label="Expected output">{current.expectedOutput}</CodeBlock>}
                  </div>
                  {current.error && <CodeBlock label="Error" tone="danger">{current.error}</CodeBlock>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
