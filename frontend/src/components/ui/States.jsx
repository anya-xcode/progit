import { AlertTriangle, Loader2 } from "lucide-react";
import Button from "./Button.jsx";

export function LoadingState({ label = "Loading…", className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-12 text-sm text-muted ${className}`}>
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = "" }) {
  return (
    <div className={`flex flex-col items-center gap-3 px-4 py-12 text-center ${className}`}>
      <AlertTriangle className="size-6 text-danger" />
      <p className="max-w-md text-sm text-muted">{error?.message || "Something went wrong."}</p>
      {onRetry && (
        <Button size="sm" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center gap-2 px-4 py-10 text-center ${className}`}>
      {Icon && (
        <div className="mb-1 rounded-full bg-surface-2 p-3">
          <Icon className="size-5 text-muted" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
