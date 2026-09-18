export default function Tabs({ tabs, active, onChange, className = "" }) {
  return (
    <div role="tablist" className={`flex items-center gap-1 overflow-x-auto ${className}`}>
      {tabs.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
            active === id ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {Icon && <Icon className="size-3.5" />}
          {label}
          {count > 0 && <span className="rounded bg-border px-1.5 text-[11px] text-fg">{count}</span>}
        </button>
      ))}
    </div>
  );
}
