export function Page({ children, className = "" }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8 ${className}`}>{children}</div>;
}

export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
