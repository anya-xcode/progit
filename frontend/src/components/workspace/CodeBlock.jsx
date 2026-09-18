// Monospace block for inputs, outputs and errors.
export default function CodeBlock({ label, children, tone = "default", className = "" }) {
  const tones = {
    default: "border-border bg-surface-2",
    danger: "border-danger/30 bg-danger/8 text-danger",
    success: "border-success/30 bg-success/8",
  };
  const text = children === "" || children === null || children === undefined ? null : String(children);

  return (
    <div className={className}>
      {label && <p className="mb-1 text-xs font-medium text-muted">{label}</p>}
      <pre className={`max-h-56 overflow-auto rounded-md border px-3 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ${tones[tone]}`}>
        {text ?? <span className="text-muted italic">(empty)</span>}
      </pre>
    </div>
  );
}
