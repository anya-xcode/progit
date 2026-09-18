# Problem Library Data Format

The library mirrors **Striver's A2Z sheet**: 18 steps, each with sub-steps, 474 problems.
The sheet index (titles, difficulty, practice links) lives in
`backend/src/data/a2z/sheet.json`; DSAForge writes its own statements, tests and
starter code for each entry.

Problems live in `backend/src/data/problems/<stepNo>-<step-key>.yaml`, one file per step.
They are loaded by `loadProblems.js`, checked by `npm run verify:problems`, and upserted
into MongoDB by `npm run seed`.

## Every problem belongs to a sheet entry

Each problem needs a **`sheetId`** from `sheet.json` (older problems are mapped by slug in
`a2z/mapping.json`). A problem without one is skipped with a warning, so it never appears
in the app.

The sheet is the source of truth for **title placement, difficulty, step, sub-step, order
and practice links** — you do not set those in YAML (a `difficulty` field is still required
and should match). Sheet entries with no YAML problem show up in the app as
"Not written yet" placeholders.

To see what still needs writing:

```bash
npm run missing                 # counts per step
node scripts/list-missing.js --step 5        # every missing entry of step 5, with sheetIds
node scripts/list-missing.js --step 5 --json
```

## Two kinds of entry

Most entries are **coding problems** (everything below applies to them).

A few sheet entries are **theory**, not something you can submit code for —
"Cpp Basics", "STL", "Java Collections", "Theory with examples", the
"Build-up Logical Thinking" collections, and similar. Write those as reference
entries: they get a short original explainer and are ticked off with
"Mark as done" in the app, counting toward the step's progress.

```yaml
  - sheetId: prob-1-4-1-stl
    type: reference            # <- makes it a reference entry
    slug: stl
    title: STL
    difficulty: Easy
    topic: Language Tools
    statement: |
      Markdown explainer in your own words: what it is, why it matters for DSA,
      and the handful of things worth remembering.
    explanation: |
      Optional second section, e.g. the containers and methods you will use most.
```

Only `sheetId`, `slug`, `title`, `difficulty`, `topic` and `statement` are required for
those; no examples, tests or starter code. Prefer a real coding problem whenever the
entry can reasonably be one (e.g. "Input Output", "For loops", every "Pattern N").

## Content rules

- **Write everything in your own words.** Do not copy problem statements,
  examples or editorials from LeetCode, GeeksforGeeks, takeUforward or any other
  site. Problem *names* and the underlying classic algorithms are fine.
- `sourceUrl` is optional. Only set it when you are confident the URL points to
  a public page for the same classic problem (e.g. a LeetCode problem URL).
  Otherwise leave it as `""`. Not every problem has an official equivalent.
- The expected output for every test must be **uniquely defined**. If a problem
  naturally has several valid answers, change the output requirement (e.g.
  "print the indices in increasing order", "print the count", "print all
  answers sorted lexicographically", "print true/false").
- Avoid floating-point outputs. If unavoidable, specify the exact rounding
  (e.g. "print with exactly 2 digits after the decimal point").

## Execution model

Code is judged by **stdin → stdout**, so it is language-agnostic:

- The program reads the whole test input from standard input and prints the
  answer to standard output.
- The judge compares outputs line by line. Whitespace inside a line is
  normalized and trailing blank lines are ignored.
- Python version: code must work on **Python 3.10** (no 3.11+ features).
- Time limit is 2 seconds per test; keep test inputs small enough that a
  correct optimal Python solution runs in well under 1 second. Keep each test
  input under ~10 KB.

## I/O conventions (use these unless the problem genuinely needs another shape)

| Data | Input format |
| --- | --- |
| Integer array | line 1: `n`; line 2: `n` space-separated integers (empty line if `n = 0`) |
| Array + extra scalar(s) | line 1: `n k`; line 2: the array |
| String | a single line (read with `sys.stdin.readline().rstrip("\n")` if it may contain spaces) |
| Matrix | line 1: `rows cols`; then `rows` lines of `cols` values |
| Linked list | same as integer array; the driver builds the list |
| Binary tree | one line of level-order values, `N` for a missing child, e.g. `1 2 3 N 4` (empty tree: `N`) |
| Graph | line 1: `n m`; next `m` lines: `u v` (or `u v w`), 0-indexed nodes |
| Design / operations (Min Stack, LRU, Trie...) | line 1: `q`; next `q` lines: one operation each, e.g. `push 5` |

| Output | Format |
| --- | --- |
| Boolean | `true` / `false` |
| List | one line, space-separated (print an empty line for an empty list) |
| List of lists | one list per line, in an order the statement defines |
| Operations | one line per operation that returns a value |

## Starter code and reference solution

Both are complete Python programs that share an identical **driver** section:
everything from the line `# --- Input/output handling ---` to the end of the
file must be byte-for-byte identical in `starterCode.python` and
`referenceSolution.python` (the checker enforces this).

- Above the marker: `import`s, helper classes (`ListNode`, `TreeNode`) and the
  function the user implements. In the starter the function body is a short
  comment plus `pass`; in the reference it is a correct, clean, optimal
  solution.
- Below the marker: `main()` parses stdin, calls the function, prints the result.
- Use `snake_case` function names and type hints.
- Recursion-heavy sections may call `sys.setrecursionlimit(10**6)` in `main()`.
- `referenceSolution` is never stored in the database or shown in the app. It
  exists only to verify the test data.

## Test cases

- 6–10 test cases per problem.
- The first 2–3 are visible (`hidden: false`) and should match the examples.
- The rest are `hidden: true` and must cover edge cases (minimum sizes, all
  equal values, negatives, no answer, maximum-ish sizes within the size budget).
- Always use `|` block scalars for `input`, `output` and `expectedOutput` so
  YAML keeps them as strings (plain `true`, `5`, `N` would be converted).

## Full example

```yaml
section: arrays
problems:
  - sheetId: prob-3-2-1-two-sum      # from sheet.json — required
    slug: two-sum
    title: Two Sum
    difficulty: Easy
    topic: Hashing
    subtopic: Medium Problems
    tags: [array, hashing]
    sourceUrl: https://leetcode.com/problems/two-sum/
    statement: |
      You are given an integer array `nums` and an integer `target`.

      Exactly one pair of **different positions** `i < j` has
      `nums[i] + nums[j] == target`. Find that pair.
    inputFormat: |
      - Line 1: two integers `n` and `target`.
      - Line 2: `n` space-separated integers, the array `nums`.
    outputFormat: |
      Print the two indices `i` and `j` (0-indexed, `i < j`) separated by a space.
    constraints:
      - "2 <= n <= 10^4"
      - "-10^9 <= nums[i], target <= 10^9"
      - "Exactly one valid pair exists."
    examples:
      - input: |
          4 9
          2 7 11 15
        output: |
          0 1
        explanation: nums[0] + nums[1] = 2 + 7 = 9.
      - input: |
          3 6
          3 2 4
        output: |
          1 2
        explanation: nums[1] + nums[2] = 2 + 4 = 6. Index 0 cannot be used twice.
    hints:
      - For each number x, which other value would complete the pair?
      - Can you look up previously seen values in O(1)?
    explanation: |
      **Brute force — O(n²) time, O(1) space.** Try every pair `(i, j)`.

      **Hash map — O(n) time, O(n) space.** Scan left to right and remember the
      index of every value seen so far. For `nums[j]`, check whether
      `target - nums[j]` was already seen; if so, that index is `i`.

      **Sorting + two pointers — O(n log n) time, O(n) space.** Sort
      `(value, index)` pairs and move two pointers inward based on the sum.
    starterCode:
      python: |
        import sys
        from typing import List


        def two_sum(nums: List[int], target: int) -> List[int]:
            # Return [i, j] with i < j and nums[i] + nums[j] == target.
            pass


        # --- Input/output handling ---
        def main():
            data = sys.stdin.read().split()
            n, target = int(data[0]), int(data[1])
            nums = [int(x) for x in data[2:2 + n]]
            i, j = two_sum(nums, target)
            print(i, j)


        if __name__ == "__main__":
            main()
    referenceSolution:
      python: |
        import sys
        from typing import List


        def two_sum(nums: List[int], target: int) -> List[int]:
            seen = {}
            for j, value in enumerate(nums):
                if target - value in seen:
                    return [seen[target - value], j]
                seen[value] = j
            return [-1, -1]


        # --- Input/output handling ---
        def main():
            data = sys.stdin.read().split()
            n, target = int(data[0]), int(data[1])
            nums = [int(x) for x in data[2:2 + n]]
            i, j = two_sum(nums, target)
            print(i, j)


        if __name__ == "__main__":
            main()
    testCases:
      - input: |
          4 9
          2 7 11 15
        expectedOutput: |
          0 1
        hidden: false
      - input: |
          3 6
          3 2 4
        expectedOutput: |
          1 2
        hidden: false
      - input: |
          2 6
          3 3
        expectedOutput: |
          0 1
        hidden: true
      - input: |
          5 -8
          -1 -2 -3 -4 -5
        expectedOutput: |
          2 4
        hidden: true
```
