// Monaco is bundled locally (no CDN), so the editor also works offline.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { tidyPython } from "../utils/tidyPython.js";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

monaco.editor.defineTheme("dsaforge-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#12151c",
    "editor.lineHighlightBackground": "#1a1e27",
    "editorLineNumber.foreground": "#4b5263",
    "editorGutter.background": "#12151c",
    "diffEditor.insertedTextBackground": "#22c55e22",
    "diffEditor.removedTextBackground": "#f0525222",
  },
});

monaco.editor.defineTheme("dsaforge-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff",
    "editor.lineHighlightBackground": "#f6f7f9",
    "editorLineNumber.foreground": "#a0a7b4",
  },
});

const PYTHON_KEYWORDS = [
  "and", "as", "assert", "break", "class", "continue", "def", "del", "elif", "else", "except", "False",
  "finally", "for", "from", "global", "if", "import", "in", "is", "lambda", "None", "nonlocal", "not",
  "or", "pass", "raise", "return", "True", "try", "while", "with", "yield",
];

const PYTHON_BUILTINS = [
  "abs", "all", "any", "bin", "bool", "chr", "dict", "divmod", "enumerate", "filter", "float", "frozenset",
  "hash", "int", "input", "isinstance", "iter", "len", "list", "map", "max", "min", "next", "ord", "pow",
  "print", "range", "reversed", "round", "set", "sorted", "str", "sum", "tuple", "zip",
  "float('inf')", "sys.stdin.readline", "sys.setrecursionlimit",
];

const PYTHON_MODULE_HELPERS = [
  { label: "deque", detail: "collections.deque", insert: "deque(${1})" },
  { label: "defaultdict", detail: "collections.defaultdict", insert: "defaultdict(${1:int})" },
  { label: "Counter", detail: "collections.Counter", insert: "Counter(${1})" },
  { label: "heappush", detail: "heapq.heappush", insert: "heapq.heappush(${1:heap}, ${2:item})" },
  { label: "heappop", detail: "heapq.heappop", insert: "heapq.heappop(${1:heap})" },
  { label: "heapify", detail: "heapq.heapify", insert: "heapq.heapify(${1:items})" },
  { label: "bisect_left", detail: "bisect.bisect_left", insert: "bisect.bisect_left(${1:items}, ${2:x})" },
  { label: "bisect_right", detail: "bisect.bisect_right", insert: "bisect.bisect_right(${1:items}, ${2:x})" },
  { label: "lru_cache", detail: "functools.lru_cache", insert: "@lru_cache(maxsize=None)" },
];

const PYTHON_SNIPPETS = [
  { label: "def", detail: "function", insert: "def ${1:name}(${2:args}):\n    ${3:pass}" },
  { label: "for range", detail: "for i in range(n)", insert: "for ${1:i} in range(${2:n}):\n    ${3:pass}" },
  { label: "for enumerate", detail: "for i, x in enumerate(items)", insert: "for ${1:i}, ${2:x} in enumerate(${3:items}):\n    ${4:pass}" },
  { label: "while", detail: "while loop", insert: "while ${1:condition}:\n    ${2:pass}" },
  { label: "if", detail: "if statement", insert: "if ${1:condition}:\n    ${2:pass}" },
  { label: "class", detail: "class", insert: "class ${1:Name}:\n    def __init__(self${2}):\n        ${3:pass}" },
  { label: "ifmain", detail: "if __name__ == \"__main__\"", insert: "if __name__ == \"__main__\":\n    ${1:main()}" },
  { label: "binary search", detail: "lo/hi template", insert: "lo, hi = ${1:0}, ${2:n - 1}\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    ${3:pass}" },
];

if (!self.__dsaforgePythonRegistered) {
  self.__dsaforgePythonRegistered = true;
  const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages;

  monaco.languages.registerCompletionItemProvider("python", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const snippet = CompletionItemInsertTextRule.InsertAsSnippet;
      return {
        suggestions: [
          ...PYTHON_KEYWORDS.map((label) => ({ label, kind: CompletionItemKind.Keyword, insertText: label, range })),
          ...PYTHON_BUILTINS.map((label) => ({ label, kind: CompletionItemKind.Function, insertText: label, range })),
          ...PYTHON_MODULE_HELPERS.map(({ label, detail, insert }) => ({
            label, detail, kind: CompletionItemKind.Module, insertText: insert, insertTextRules: snippet, range,
          })),
          ...PYTHON_SNIPPETS.map(({ label, detail, insert }) => ({
            label, detail, kind: CompletionItemKind.Snippet, insertText: insert, insertTextRules: snippet, range,
          })),
        ],
      };
    },
  });

  // Shift+Alt+F / "Format Document"
  monaco.languages.registerDocumentFormattingEditProvider("python", {
    provideDocumentFormattingEdits(model) {
      return [{ range: model.getFullModelRange(), text: tidyPython(model.getValue()) }];
    },
  });
}

export { monaco };
