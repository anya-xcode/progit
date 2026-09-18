// Output comparison used by the judge and by the problem data checker.
//
// Rules: line structure matters, but whitespace inside a line is normalized
// (runs of spaces/tabs become one space, leading/trailing spaces ignored),
// Windows line endings are accepted and trailing blank lines are ignored.

export function normalizeOutput(text) {
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().split(/\s+/).filter(Boolean).join(" "));

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

export function outputsMatch(actual, expected) {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
