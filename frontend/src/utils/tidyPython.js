// Lightweight Python formatter: tabs in indentation become 4 spaces, trailing
// whitespace is removed, runs of blank lines are capped at two, and the file
// ends with exactly one newline. It never changes code structure.
export function tidyPython(code) {
  const lines = String(code)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const indent = /^[\t ]*/.exec(line)[0];
      return (indent.replace(/\t/g, "    ") + line.slice(indent.length)).replace(/\s+$/, "");
    });

  const result = [];
  let blankRun = 0;
  for (const line of lines) {
    blankRun = line === "" ? blankRun + 1 : 0;
    if (blankRun <= 2) result.push(line);
  }
  while (result.length && result[0] === "") result.shift();
  while (result.length && result[result.length - 1] === "") result.pop();

  return `${result.join("\n")}\n`;
}
