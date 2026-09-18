const COLORS = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export default function ProgressBar({ value, total, tone = "accent", className = "" }) {
  const width = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${COLORS[tone]}`} style={{ width: `${width}%` }} />
    </div>
  );
}
