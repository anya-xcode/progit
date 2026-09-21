import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import client, { accessKey } from "../../api/client.js";
import Button from "../ui/Button.jsx";
import { Field, Input } from "../ui/Field.jsx";
import { LoadingState } from "../ui/States.jsx";

// Deployed instances set APP_ACCESS_KEY, so the app asks for it once and keeps
// it in this browser. With no key configured (local use) this renders nothing
// of its own.
export default function AccessGate({ children }) {
  const [state, setState] = useState("checking"); // checking | open | locked
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    try {
      const health = await client.get("/health");
      if (!health.accessKeyRequired) {
        setState("open");
        return;
      }
      if (!accessKey.get()) {
        setState("locked");
        return;
      }
      // A stored key still has to be accepted.
      await client.get("/problems/meta");
      setState("open");
    } catch (err) {
      if (err.status === 401) setState("locked");
      else setState("open"); // a broken server is the pages' problem to report
    }
  }, []);

  useEffect(() => {
    check();
    const onRequired = () => setState("locked");
    window.addEventListener("dsaforge:access-key-required", onRequired);
    return () => window.removeEventListener("dsaforge:access-key-required", onRequired);
  }, [check]);

  const unlock = async (event) => {
    event.preventDefault();
    setChecking(true);
    setError("");
    accessKey.set(value.trim());
    try {
      await client.get("/problems/meta");
      setValue("");
      setState("open");
    } catch (err) {
      accessKey.clear();
      setError(err.status === 401 ? "That key was not accepted." : err.message);
    } finally {
      setChecking(false);
    }
  };

  if (state === "checking") return <LoadingState label="Connecting…" className="h-dvh" />;
  if (state === "open") return children;

  return (
    <main className="flex h-dvh items-center justify-center p-4">
      <form onSubmit={unlock} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-9" />
          <div>
            <h1 className="font-semibold">DSAForge</h1>
            <p className="text-xs text-muted">Practice DSA. Build Your GitHub.</p>
          </div>
        </div>
        <Field label="Access key" id="access-key" hint="asked once per browser">
          <Input
            id="access-key"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </Field>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" icon={KeyRound} loading={checking} className="w-full" disabled={!value.trim()}>
          Unlock
        </Button>
      </form>
    </main>
  );
}
