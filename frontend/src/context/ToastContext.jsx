import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const STYLES = {
  success: { icon: CheckCircle2, className: "text-success" },
  error: { icon: XCircle, className: "text-danger" },
  info: { icon: Info, className: "text-info" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  // options.action: { label, href } renders a link inside the toast.
  const show = useCallback(
    (type, message, { duration = 4000, action } = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, type, message, action }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (message, options) => show("success", message, options),
      error: (message, options) => show("error", message, { duration: 6000, ...options }),
      info: (message, options) => show("info", message, options),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map(({ id, type, message, action }) => {
          const { icon: Icon, className } = STYLES[type];
          return (
            <div
              key={id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-lg shadow-black/10"
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
              <div className="flex-1 text-sm">
                <p>{message}</p>
                {action?.href && (
                  <a href={action.href} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[13px] font-medium text-accent hover:underline">
                    {action.label}
                  </a>
                )}
              </div>
              <button onClick={() => dismiss(id)} className="text-muted hover:text-fg" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
