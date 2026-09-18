export default function StatCard({ icon: Icon, label, value, detail, tone = "text-accent", className = "", children }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">{label}</p>
        {Icon && <Icon className={`size-4 ${tone}`} />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
      {children}
    </div>
  );
}
