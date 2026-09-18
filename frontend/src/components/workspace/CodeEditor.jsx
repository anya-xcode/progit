import Editor, { DiffEditor } from "@monaco-editor/react";
import { useRef } from "react";
import { useSettings } from "../../context/SettingsContext.jsx";
import { monaco } from "../../lib/monaco.js";
import { LoadingState } from "../ui/States.jsx";

function useEditorOptions(extra = {}) {
  const { settings } = useSettings();
  return {
    theme: settings.theme === "dark" ? "dsaforge-dark" : "dsaforge-light",
    options: {
      fontSize: settings.editorFontSize,
      fontFamily: '"JetBrains Mono Variable", ui-monospace, Consolas, monospace',
      fontLigatures: true,
      minimap: { enabled: settings.editorMinimap },
      wordWrap: settings.editorWordWrap ? "on" : "off",
      tabSize: 4,
      insertSpaces: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      fixedOverflowWidgets: true,
      renderLineHighlight: "all",
      ...extra,
    },
  };
}

// `shortcuts`: { run, submit, save } — the latest handlers are always used.
export default function CodeEditor({ value, onChange, language = "python", readOnly = false, shortcuts, height = "100%" }) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const { theme, options } = useEditorOptions({ readOnly, domReadOnly: readOnly });

  const handleMount = (editor) => {
    const { KeyMod, KeyCode } = monaco;
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => shortcutsRef.current?.run?.());
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter, () => shortcutsRef.current?.submit?.());
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => shortcutsRef.current?.save?.());
  };

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      onChange={(next) => onChange?.(next ?? "")}
      onMount={handleMount}
      theme={theme}
      options={options}
      loading={<LoadingState label="Loading editor…" />}
    />
  );
}

export function CodeDiff({ original, modified, height = 420 }) {
  const { theme, options } = useEditorOptions({ readOnly: true, renderSideBySide: true, originalEditable: false });
  return (
    <DiffEditor
      height={height}
      language="python"
      original={original}
      modified={modified}
      // Avoids "TextModel got disposed before DiffEditorWidget model got reset" on unmount.
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      theme={theme}
      options={options}
      loading={<LoadingState label="Loading diff…" />}
    />
  );
}
