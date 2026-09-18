const BASE =
  "rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:opacity-60";

// Default width/height unless the caller passes its own w-* / h-* class.
function controlClass(className, defaultHeight = "") {
  const width = /(^|\s)(w-|min-w-)/.test(className) ? "" : "w-full";
  const height = /(^|\s)h-/.test(className) ? "" : defaultHeight;
  return `${BASE} ${width} ${height} ${className}`;
}

export function Label({ htmlFor, children, hint }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium">
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Field({ label, hint, id, className = "", children }) {
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
        </Label>
      )}
      {children}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={controlClass(className, "h-9")} {...props} />;
}

export function Textarea({ className = "", mono = false, ...props }) {
  return <textarea className={controlClass(`py-2 ${mono ? "font-mono text-[13px]" : ""} ${className}`)} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={controlClass(`pr-8 ${className}`, "h-9")} {...props}>
      {children}
    </select>
  );
}
