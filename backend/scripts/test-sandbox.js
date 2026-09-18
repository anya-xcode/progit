// Quick check that the configured sandbox works and enforces its limits.
//   npm run test:sandbox
import { executeCode, getExecutionInfo } from "../src/services/execution/index.js";
import { judge } from "../src/services/judge/judge.js";

const checks = [
  { name: "correct answer", code: "a, b = map(int, input().split())\nprint(a + b)", input: "2 3\n", expected: "5", verdict: "Accepted" },
  { name: "wrong answer", code: "print(0)", input: "", expected: "1", verdict: "Wrong Answer" },
  { name: "syntax error", code: "def broken(:\n    pass", input: "", expected: "", verdict: "Compilation Error" },
  { name: "runtime error", code: "print(1 // 0)", input: "", expected: "", verdict: "Runtime Error" },
  { name: "infinite loop", code: "while True:\n    pass", input: "", expected: "", verdict: "Time Limit Exceeded" },
  { name: "memory hog", code: "data = [0] * (10 ** 9)", input: "", expected: "", verdict: "Memory Limit Exceeded" },
  {
    name: "no network",
    code: "import socket\ntry:\n    socket.create_connection(('1.1.1.1', 80), timeout=2)\n    print('open')\nexcept OSError:\n    print('blocked')",
    input: "",
    expected: "blocked",
    verdict: "Accepted",
  },
  {
    name: "host files hidden",
    code: "import os\nprint('hidden' if not os.path.exists('/mnt/c') and not os.listdir('/home') else 'visible')",
    input: "",
    expected: "hidden",
    verdict: "Accepted",
  },
];

const info = getExecutionInfo();
console.log(`Sandbox: ${info.description}\n`);

let failures = 0;
for (const check of checks) {
  const started = Date.now();
  try {
    const raw = await executeCode({ language: "python", code: check.code, inputs: [check.input] });
    const { verdict } = judge(raw, [{ label: check.name, input: check.input, expectedOutput: check.expected, isHidden: false }]);
    const ok = verdict === check.verdict;
    if (!ok) failures++;
    console.log(`${ok ? "✓" : "✗"} ${check.name}: ${verdict} (${Date.now() - started} ms)`);
  } catch (error) {
    failures++;
    console.log(`✗ ${check.name}: ${error.message}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll sandbox checks passed.");
process.exit(failures ? 1 : 0);
