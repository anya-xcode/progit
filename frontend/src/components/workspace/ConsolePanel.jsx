import { ChevronDown, ChevronUp, FlaskConical, TerminalSquare } from "lucide-react";
import { Textarea } from "../ui/Field.jsx";
import Tabs from "../ui/Tabs.jsx";
import CodeBlock from "./CodeBlock.jsx";
import ResultView from "./ResultView.jsx";

export default function ConsolePanel({
  problem,
  tab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  customInput,
  onCustomInputChange,
  useCustomInput,
  onUseCustomInputChange,
  busy,
  result,
  error,
  onSaveAsApproach,
}) {
  const tabs = [
    { id: "testcases", label: "Test cases", icon: FlaskConical },
    { id: "result", label: "Result", icon: TerminalSquare },
  ];

  return (
    <div className={`flex flex-col border-t border-border bg-surface ${collapsed ? "h-11" : "h-[42%] min-h-56"}`}>
      <div className="flex h-11 shrink-0 items-center justify-between px-2">
        <Tabs
          tabs={tabs}
          active={collapsed ? null : tab}
          onChange={(id) => {
            onTabChange(id);
            if (collapsed) onToggleCollapsed();
          }}
        />
        <button onClick={onToggleCollapsed} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={collapsed ? "Expand console" : "Collapse console"}>
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {tab === "testcases" ? (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                {problem.testCases.map((test, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold text-muted">Case {index + 1}</p>
                    <CodeBlock label="Input">{test.input}</CodeBlock>
                    <CodeBlock label="Expected output">{test.expectedOutput}</CodeBlock>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[13px] font-medium">
                  <input
                    type="checkbox"
                    checked={useCustomInput}
                    onChange={(event) => onUseCustomInputChange(event.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  Also run with custom input
                </label>
                <Textarea
                  mono
                  rows={4}
                  value={customInput}
                  onChange={(event) => {
                    onCustomInputChange(event.target.value);
                    if (!useCustomInput) onUseCustomInputChange(true);
                  }}
                  placeholder="Type stdin for your program, in the same format as the examples"
                  spellCheck={false}
                />
              </div>
            </div>
          ) : (
            <ResultView
              busy={busy}
              result={result}
              error={error}
              hiddenCount={problem.hiddenTestCount}
              onSaveAsApproach={onSaveAsApproach}
            />
          )}
        </div>
      )}
    </div>
  );
}
