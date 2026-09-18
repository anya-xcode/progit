import { Code2, Cpu, Moon, Palette, ShieldCheck, Sun } from "lucide-react";
import { useState } from "react";
import { codeApi } from "../api/index.js";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import { Select } from "../components/ui/Field.jsx";
import PageHeader, { Page } from "../components/ui/PageHeader.jsx";
import Toggle from "../components/ui/Toggle.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { useApi } from "../hooks/useApi.js";

function Row({ label, description, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { data: info } = useApi(() => codeApi.info(), []);
  const [check, setCheck] = useState({ running: false, result: null, error: null });

  const testSandbox = async () => {
    setCheck({ running: true, result: null, error: null });
    try {
      setCheck({ running: false, result: await codeApi.health(), error: null });
    } catch (error) {
      setCheck({ running: false, result: null, error });
    }
  };

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Settings" description="Preferences are stored in this browser." />

      <div className="space-y-4">
        <Card title="Appearance" icon={Palette}>
          <Row label="Theme">
            <div className="flex rounded-md border border-border p-0.5">
              {[
                { id: "dark", label: "Dark", icon: Moon },
                { id: "light", label: "Light", icon: Sun },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => updateSettings({ theme: id })}
                  className={`flex h-7 items-center gap-1.5 rounded px-3 text-[13px] ${settings.theme === id ? "bg-surface-2 text-fg" : "text-muted"}`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          </Row>
        </Card>

        <Card title="Editor" icon={Code2}>
          <div className="divide-y divide-border">
            <Row label="Font size">
              <Select value={settings.editorFontSize} onChange={(e) => updateSettings({ editorFontSize: Number(e.target.value) })} className="w-24">
                {[12, 13, 14, 15, 16, 18, 20].map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </Select>
            </Row>
            <Row label="Word wrap">
              <Toggle label="Word wrap" checked={settings.editorWordWrap} onChange={(value) => updateSettings({ editorWordWrap: value })} />
            </Row>
            <Row label="Minimap">
              <Toggle label="Minimap" checked={settings.editorMinimap} onChange={(value) => updateSettings({ editorMinimap: value })} />
            </Row>
          </div>
        </Card>

        <Card title="Code execution" icon={Cpu}>
          <div className="divide-y divide-border">
            <Row label="Sandbox" description={info?.description ?? "…"}>
              <Badge>{info?.provider ?? "…"}</Badge>
            </Row>
            <Row label="Limits per test case">
              <span className="text-[13px] text-muted">
                {info ? `${info.timeLimitMs} ms · ${info.memoryLimitMb} MB · ${info.outputLimitKb} KB output` : "…"}
              </span>
            </Row>
            <Row label="Health check" description="Runs a tiny Python program in the sandbox.">
              <Button size="sm" icon={ShieldCheck} loading={check.running} onClick={testSandbox}>
                Test sandbox
              </Button>
            </Row>
          </div>
          {check.result && (
            <p className={`mt-3 text-[13px] ${check.result.ok ? "text-success" : "text-danger"}`}>
              {check.result.ok ? `Sandbox is working (${check.result.runtime}, ${check.result.durationMs} ms).` : "The sandbox ran but returned an unexpected result."}
            </p>
          )}
          {check.error && <p className="mt-3 text-[13px] whitespace-pre-wrap text-danger">{check.error.message}</p>}
        </Card>
      </div>
    </Page>
  );
}
