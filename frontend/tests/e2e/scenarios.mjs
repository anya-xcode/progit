// The end-to-end scenarios, in the order they run. Each one gets the shared
// context ({ page, api, state, … }) and asserts real outcomes; `state` carries
// the little that must survive between scenarios (ids, slugs, counts).
import {
  assert,
  assertEqual,
  assertExcludes,
  assertIncludes,
  assertMatches,
  editorText,
  pasteIntoEditor,
  problemRowHrefs,
  skip,
  statCard,
  stepHeaders,
  waitForEditorText,
  waitForRowCount,
  withProblemsResponse,
} from "./lib.mjs";

const RUN_TIMEOUT = 180_000; // the sandbox starts a fresh WSL jail per request

export const SOLUTIONS = {
  hashMap: `# approach: hash map
import sys


def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = [int(x) for x in data[2:2 + n]]
    seen = {}
    for j, value in enumerate(nums):
        if target - value in seen:
            print(seen[target - value], j)
            return
        seen[value] = j


main()
`,
  bruteForce: `# approach: brute force
import sys


def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = [int(x) for x in data[2:2 + n]]
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] + nums[j] == target:
                print(i, j)
                return


main()
`,
  wrong: `# approach: wrong on purpose
import sys

sys.stdin.read()
print(0, 0)
`,
  customSum: `# approach: e2e custom sum
import sys

a, b = [int(x) for x in sys.stdin.read().split()]
print(a + b)
`,
};

// ------------------------------------------------------------ small helpers

const heading = (page, name) => page.getByRole("heading", { level: 1, name });

async function openWorkspace(page, baseUrl, slug) {
  await page.goto(new URL(`/problems/${slug}`, baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.locator(".monaco-editor .view-lines").first().waitFor({ state: "visible", timeout: 60_000 });
}

// Waiting for the "busy" state first makes sure a stale verdict from a previous
// run is never mistaken for this one's.
async function runCode(page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByText("Running your code in the sandbox").waitFor({ timeout: 30_000 });
  await page.locator("h3.text-lg").first().waitFor({ timeout: RUN_TIMEOUT });
}

async function submitCode(page) {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByText("Judging against all test cases").waitFor({ timeout: 30_000 });
  await page.locator("h3.text-lg").first().waitFor({ timeout: RUN_TIMEOUT });
}

function resultSummary(page) {
  return page.evaluate(() => {
    const verdict = document.querySelector("h3.text-lg");
    const box = verdict?.parentElement;
    return {
      verdict: verdict?.textContent.trim() ?? null,
      summary: (box?.textContent ?? "").replace(/\s+/g, " ").trim(),
      cases: [...document.querySelectorAll("div.flex.flex-wrap.gap-1\\.5 > button")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
    };
  });
}

// The labelled <pre> blocks of the selected test case in the Result panel.
function resultBlocks(page) {
  return page.evaluate(() => {
    const blocks = {};
    for (const wrapper of document.querySelectorAll("div > p.text-xs.font-medium + pre, div > p.mb-1 + pre")) {
      const label = wrapper.previousElementSibling?.textContent.trim();
      if (label) blocks[label] = wrapper.textContent;
    }
    return blocks;
  });
}

async function fillApproachModal(page, { title, type, time, space, explanation }) {
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15_000 });
  await page.locator("#approach-title").fill(title);
  if (type) await page.locator("#approach-type").selectOption(type);
  if (time) await page.locator("#approach-time").fill(time);
  if (space) await page.locator("#approach-space").fill(space);
  if (explanation) await page.locator("#approach-explanation").fill(explanation);
}

const leftTab = (page, name) => page.locator(`[role="tab"]:has-text("${name}")`).first();

async function solutionsOf(api, problemId) {
  return api(`/solutions/${problemId}`);
}

// ------------------------------------------------------------------ scenarios

export const scenarios = [
  // 1 --------------------------------------------------------------- Dashboard
  {
    name: "Dashboard: fresh database shows 474 problems, 0 solved",
    async fn({ page, baseUrl, api }) {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await heading(page, "Dashboard").waitFor({ timeout: 30_000 });

      const stats = await api("/dashboard/stats");
      assertEqual(stats.totalProblems, 474, "API: total problems in a fresh database");
      assertEqual(stats.solvedProblems, 0, "API: solved problems in a fresh database");

      const solved = await statCard(page, "Solved");
      assertEqual(solved.value, "0 / 474", 'Dashboard "Solved" stat card');
      assertEqual(solved.detail, "0% of your library", 'Dashboard "Solved" detail line');

      const submissions = await statCard(page, "Accepted submissions");
      assertEqual(submissions.value, "0", 'Dashboard "Accepted submissions" value');
      const approaches = await statCard(page, "Total solutions");
      assertEqual(approaches.value, "0", 'Dashboard "Total solutions" value');
    },
  },
  {
    name: 'Dashboard: "Continue solving" lists problems that can actually be solved',
    async fn({ page, api }) {
      const card = page.locator("section", { hasText: "Continue solving" }).last();
      const links = await card.locator("ul li a").evaluateAll((els) =>
        els.map((el) => ({ href: el.getAttribute("href"), title: el.querySelector("p")?.textContent.trim() }))
      );
      assert(links.length > 0, '"Continue solving" listed no problems');

      for (const link of links) {
        const slug = link.href.replace("/problems/", "");
        const problem = await api(`/problems/${slug}`);
        assertEqual(problem.contentStatus, "ready", `"Continue solving" suggested "${link.title}" (${slug}), which is not solvable here`);
        assert(problem.testCases.length > 0, `"${link.title}" has no visible test cases`);
      }
    },
  },
  {
    name: "Dashboard: the sidebar navigates to every page",
    async fn({ page, baseUrl }) {
      const targets = [
        ["Problem Library", "/problems", "Problem Library"],
        ["My Solutions", "/solutions", "My Solutions"],
        ["Progress", "/progress", "Progress"],
        ["GitHub", "/github", "GitHub"],
        ["Settings", "/settings", "Settings"],
        ["Dashboard", "/", "Dashboard"],
      ];
      for (const [link, expectedPath, title] of targets) {
        await page.getByRole("link", { name: link, exact: true }).click();
        await heading(page, title).waitFor({ timeout: 30_000 });
        assertEqual(new URL(page.url()).pathname, expectedPath, `clicking "${link}" in the sidebar`);
      }
    },
  },

  // 2 --------------------------------------------------------- Problem Library
  {
    name: "Problem Library: 18 steps render with the sheet's counts",
    async fn({ page, baseUrl, api, state }) {
      await withProblemsResponse(page, (params) => [...params.keys()].every((k) => !params.get(k)), async () => {
        await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
      });
      await heading(page, "Problem Library").waitFor({ timeout: 30_000 });
      await page.locator("section > button[aria-expanded]").first().waitFor({ timeout: 30_000 });

      const meta = await api("/problems/meta");
      const all = await api("/problems");
      state.totalProblems = all.total;
      state.solvableProblems = all.problems.filter((p) => p.contentStatus === "ready").length;
      state.placeholders = all.problems.filter((p) => p.contentStatus === "placeholder");

      const headers = await stepHeaders(page);
      assertEqual(headers.length, 18, "number of steps rendered in the library");

      const expected = meta.steps.filter((step) => step.stepNo <= 18);
      for (const [index, step] of expected.entries()) {
        assertEqual(headers[index].title, `Step ${step.stepNo}: ${step.name}`, `step ${step.stepNo} header`);
        assertEqual(headers[index].counts, `0 / ${step.total}`, `step ${step.stepNo} ("${step.name}") counter`);
      }

      const overall = await page.locator("p.tabular-nums", { hasText: "solved" }).first().textContent();
      assertIncludes(overall.replace(/\s+/g, " "), "0 / 474 solved", "library overall progress line");
    },
  },
  {
    name: "Problem Library: expanding a step shows its sub-steps and problems",
    async fn({ page }) {
      const arrays = page.locator("section > button[aria-expanded]").nth(2);
      assertIncludes(await arrays.textContent(), "Step 3:", "third step header");
      await arrays.click();

      const subSteps = page.locator("li > button[aria-expanded]");
      await subSteps.first().waitFor({ timeout: 15_000 });
      const titles = await subSteps.evaluateAll((els) => els.map((el) => el.querySelector("span.flex-1")?.textContent.trim()));
      assertEqual(titles.join(" | "), "Easy | Medium | Hard", "sub-steps of step 3 (Arrays)");

      const medium = subSteps.filter({ hasText: "Medium" }).first();
      await medium.click();
      const twoSum = page.locator('a[href="/problems/two-sum"]');
      await twoSum.first().waitFor({ timeout: 15_000 });
      assertIncludes(await twoSum.first().textContent(), "Two Sum", '"Two Sum" row inside the sub-step');
    },
  },
  {
    name: 'Problem Library: search finds "Two Sum"',
    async fn({ page }) {
      await withProblemsResponse(page, (params) => params.get("search") === "Two Sum", async () => {
        await page.locator('input[aria-label="Search problems"]').fill("Two Sum");
      });
      await page.locator('a[href="/problems/two-sum"]').first().waitFor({ timeout: 15_000 });
      assertIncludes(page.url(), "search=Two+Sum", "search term is kept in the URL");

      const hrefs = await problemRowHrefs(page);
      assert(hrefs.includes("/problems/two-sum"), `search results should contain two-sum, got ${hrefs.join(", ")}`);
      assert(hrefs.length <= 15, `search for "Two Sum" returned ${hrefs.length} rows, expected a narrow result`);
    },
  },
  {
    name: "Problem Library: a nonsense search shows the empty state",
    async fn({ page }) {
      await withProblemsResponse(page, (params) => params.get("search") === "zzqqxx nothing", async () => {
        await page.locator('input[aria-label="Search problems"]').fill("zzqqxx nothing");
      });
      await page.getByText("Question not found in your library.").waitFor({ timeout: 15_000 });
      assertEqual((await problemRowHrefs(page)).length, 0, "rows shown for a nonsense search");
      await page.getByRole("button", { name: "Clear" }).click();
      await page.locator("section > button[aria-expanded]").first().waitFor({ timeout: 15_000 });
    },
  },
  {
    name: 'Problem Library: the "Solvable here" filter narrows the list',
    async fn({ page, state }) {
      // React Router applies the URL change inside a transition, so the
      // controlled checkbox only flips on the next render.
      const checkbox = page.locator('label:has-text("Solvable here") input[type="checkbox"]');
      await withProblemsResponse(page, (params) => params.get("ready") === "true", async () => {
        await checkbox.click();
      });
      await page.waitForFunction(
        () => document.querySelector('input[type="checkbox"].size-4')?.checked === true,
        null,
        { timeout: 10_000 }
      );
      assertIncludes(page.url(), "ready=true", '"Solvable here" is kept in the URL');

      // 454 of the 474 sheet entries can be run and submitted here; the other 20
      // are theory ("reference") entries that are only ticked off.
      await waitForRowCount(
        page,
        state.solvableProblems,
        '"Solvable here" should list only the entries that can be run/submitted (the 20 theory entries are not solvable)'
      );
    },
  },
  {
    name: "Problem Library: step, difficulty and status filters change the list",
    async fn({ page, api }) {
      await page.getByRole("button", { name: "Clear" }).click();

      await withProblemsResponse(page, (params) => params.get("section") === "Arrays", async () => {
        await page.locator('select[aria-label="Step"]').selectOption("Arrays");
      });
      const arraysOnly = await api("/problems?section=Arrays");
      await waitForRowCount(page, arraysOnly.total, "filtering by Step 3: Arrays");
      const headers = await stepHeaders(page);
      assertEqual(headers.length, 1, "step groups shown when filtering by Arrays");
      assertIncludes(headers[0].title, "Step 3: Arrays", "the only step group shown");

      await withProblemsResponse(page, (params) => params.get("difficulty") === "Easy", async () => {
        await page.locator('select[aria-label="Difficulty"]').selectOption("Easy");
      });
      const easyArrays = await api("/problems?section=Arrays&difficulty=Easy");
      await waitForRowCount(page, easyArrays.total, "filtering by Arrays + Easy");
      assert(easyArrays.total < arraysOnly.total, "the difficulty filter did not narrow the list");
      const difficulties = await page.locator("span.justify-self-end > span").allTextContents();
      assert(
        difficulties.length > 0 && difficulties.every((text) => text.trim() === "Easy"),
        `every row should be Easy, got: ${[...new Set(difficulties)].join(", ")}`
      );

      await withProblemsResponse(page, (params) => params.get("status") === "solved", async () => {
        await page.locator('select[aria-label="Status"]').selectOption("solved");
      });
      await page.getByText("Question not found in your library.").waitFor({ timeout: 15_000 });
      assertEqual((await problemRowHrefs(page)).length, 0, "solved problems on a fresh database");
    },
  },
  {
    name: "Problem Library: filters survive a page reload (they live in the URL)",
    async fn({ page, baseUrl, api }) {
      const url = new URL("/problems?section=Arrays&difficulty=Easy&ready=true", baseUrl).href;
      await withProblemsResponse(page, (params) => params.get("section") === "Arrays", async () => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
      });
      const easyArrays = await api("/problems?section=Arrays&difficulty=Easy&ready=true");
      await waitForRowCount(page, easyArrays.total, "rows before the reload");

      await withProblemsResponse(page, (params) => params.get("section") === "Arrays", async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
      });
      assertEqual(page.url(), url, "URL after the reload");
      assertEqual(await page.locator('select[aria-label="Step"]').inputValue(), "Arrays", "step filter after the reload");
      assertEqual(await page.locator('select[aria-label="Difficulty"]').inputValue(), "Easy", "difficulty filter after the reload");
      assertEqual(
        await page.locator('label:has-text("Solvable here") input[type="checkbox"]').isChecked(),
        true,
        '"Solvable here" after the reload'
      );
      await waitForRowCount(page, easyArrays.total, "rows after the reload");
    },
  },

  // 3 ----------------------------------------------------------------- Solving
  {
    name: "Solving: a correct solution pasted into Monaco runs and is Accepted",
    async fn({ page, baseUrl, api, state }) {
      await openWorkspace(page, baseUrl, "two-sum");
      const problem = await api("/problems/two-sum");
      state.twoSumId = problem._id;
      assertEqual(problem.testCases.length, 2, "visible test cases of Two Sum");
      assertEqual(problem.hiddenTestCount, 4, "hidden test cases of Two Sum");

      await pasteIntoEditor(page, SOLUTIONS.hashMap, { marker: "# approach: hash map" });
      await runCode(page);

      const result = await resultSummary(page);
      assertEqual(result.verdict, "Accepted", "verdict after Run");
      assertIncludes(result.summary, "2 / 2 test cases passed", "Run summary line");
      assertEqual(result.cases.join(" | "), "Case 1 | Case 2", "cases shown after Run");
    },
  },
  {
    name: "Solving: custom input is judged alongside the visible cases",
    async fn({ page }) {
      await page.locator('[role="tab"]:has-text("Test cases")').click();
      await page.locator('label:has-text("Also run with custom input") input[type="checkbox"]').check();
      await page.locator('textarea[placeholder^="Type stdin"]').fill("4 9\n2 7 11 15\n");
      await runCode(page);

      const result = await resultSummary(page);
      assertEqual(result.cases.join(" | "), "Case 1 | Case 2 | Custom input", "cases shown after Run with custom input");
      assertEqual(result.verdict, "Accepted", "verdict with custom input");

      await page.getByRole("button", { name: "Custom input" }).click();
      const blocks = await resultBlocks(page);
      assertIncludes(blocks.Input ?? "", "2 7 11 15", "custom case input");
      assertIncludes(blocks["Your output"] ?? "", "0 1", "custom case output");
      await page.locator('label:has-text("Also run with custom input")').scrollIntoViewIfNeeded().catch(() => {});
    },
  },

  // 4 -------------------------------------------------------- Saving approaches
  {
    name: "Approaches: Save opens the details modal and stores the approach",
    async fn({ page, api, state }) {
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await fillApproachModal(page, {
        title: "Hash Map",
        type: "Optimal",
        time: "O(n)",
        space: "O(n)",
        explanation: "One pass, remembering every value seen so far.",
      });
      await page.getByRole("button", { name: "Save approach" }).click();
      await page.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 20_000 });

      await leftTab(page, "Approaches").click();
      const panel = page.locator('button:has-text("Add another approach")').first();
      await panel.waitFor({ timeout: 15_000 });

      const saved = await solutionsOf(api, state.twoSumId);
      assertEqual(saved.length, 1, "approaches stored for Two Sum");
      assertEqual(saved[0].title, "Hash Map", "stored approach name");
      assertEqual(saved[0].approach, "Optimal", "stored approach type");
      assertEqual(saved[0].timeComplexity, "O(n)", "stored time complexity");
      assertEqual(saved[0].spaceComplexity, "O(n)", "stored space complexity");
      state.hashMapId = saved[0]._id;

      const listed = await page.locator('ul li:has(input[aria-label^="Select "])').first().innerText();
      assertIncludes(listed.replace(/\s+/g, " "), "Hash Map", "approach shown in the Approaches tab");
      assertIncludes(listed.replace(/\s+/g, " "), "O(n)", "complexities shown in the Approaches tab");
      assertIncludes(listed.replace(/\s+/g, " "), "In editor", "the saved approach is the one open in the editor");
    },
  },
  {
    name: "Approaches: a second approach with the same name is rejected",
    async fn({ page }) {
      await page.getByRole("button", { name: "Add another approach" }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await fillApproachModal(page, { title: "Hash Map", time: "O(n)", space: "O(n)" });
      await page.getByRole("button", { name: "Save approach" }).click();

      const error = page.locator('[role="dialog"] p.text-danger');
      await error.waitFor({ timeout: 20_000 });
      assertIncludes(
        await error.textContent(),
        'An approach named "Hash Map" already exists for this problem.',
        "duplicate-name error shown in the modal"
      );
      assert(await page.locator('[role="dialog"]').isVisible(), "the modal should stay open after a rejected save");
      await page.getByRole("button", { name: "Cancel" }).click();
      await page.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 15_000 });
    },
  },
  {
    name: "Approaches: a differently-named second approach is saved",
    async fn({ page, api, state }) {
      await pasteIntoEditor(page, SOLUTIONS.bruteForce, { marker: "# approach: brute force" });
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await fillApproachModal(page, {
        title: "Brute Force",
        type: "Brute Force",
        time: "O(n^2)",
        space: "O(1)",
        explanation: "Check every pair.",
      });
      await page.getByRole("button", { name: "Save approach" }).click();
      await page.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 20_000 });

      const saved = await solutionsOf(api, state.twoSumId);
      assertEqual(saved.length, 2, "approaches stored for Two Sum");
      const names = saved.map((s) => s.title).sort();
      assertEqual(names.join(", "), "Brute Force, Hash Map", "stored approach names");
      state.bruteForceId = saved.find((s) => s.title === "Brute Force")._id;

      await leftTab(page, "Approaches").click();
      const rows = await page.locator('ul li:has(input[aria-label^="Select "])').allInnerTexts();
      assertEqual(rows.length, 2, "approaches listed in the Approaches tab");
      assertIncludes(rows.join(" || ").replace(/\s+/g, " "), "O(n^2)", "brute force complexity in the list");
    },
  },
  {
    name: "Approaches: the switcher swaps the editor contents",
    async fn({ page, state }) {
      const switcher = page.locator('select[aria-label="Approach"]');

      await switcher.selectOption(state.hashMapId);
      await waitForEditorText(page, "# approach: hash map", { label: "the editor did not switch to Hash Map" });
      let code = await editorText(page);
      assertIncludes(code, "# approach: hash map", "editor after switching to Hash Map");
      assertExcludes(code, "# approach: brute force", "editor after switching to Hash Map");

      await switcher.selectOption(state.bruteForceId);
      await waitForEditorText(page, "# approach: brute force", { label: "the editor did not switch to Brute Force" });
      code = await editorText(page);
      assertIncludes(code, "# approach: brute force", "editor after switching to Brute Force");
      assertExcludes(code, "# approach: hash map", "editor after switching to Brute Force");
    },
  },

  // 5 -------------------------------------------------------------- Submitting
  {
    name: "Submitting: a correct solution is Accepted on all 6 tests",
    async fn({ page, api, state }) {
      await page.locator('select[aria-label="Approach"]').selectOption(state.hashMapId);
      await waitForEditorText(page, "# approach: hash map", { label: "the Hash Map approach was not loaded before Submit" });
      await submitCode(page);

      const result = await resultSummary(page);
      assertEqual(result.verdict, "Accepted", "verdict after Submit");
      assertIncludes(result.summary, "6 / 6 test cases passed", "Submit summary line");
      assertEqual(
        result.cases.join(" | "),
        "Case 1 | Case 2 | Hidden case 3 | Hidden case 4 | Hidden case 5 | Hidden case 6",
        "cases shown after Submit"
      );

      const saved = await solutionsOf(api, state.twoSumId);
      assertEqual(saved.find((s) => s._id === state.hashMapId).verdict, "Accepted", "stored verdict of the Hash Map approach");
    },
  },
  {
    name: "Submitting: the problem is marked solved in the library",
    async fn({ page, baseUrl, api }) {
      await withProblemsResponse(page, (params) => params.get("status") === "solved", async () => {
        await page.goto(new URL("/problems?status=solved", baseUrl).href, { waitUntil: "domcontentloaded" });
      });
      const solved = await api("/problems?status=solved");
      assertEqual(solved.total, 1, "problems with an accepted submission");
      assertEqual(solved.problems[0].slug, "two-sum", "the solved problem");

      await waitForRowCount(page, 1, "rows under the Solved filter");
      const row = page.locator('a[href="/problems/two-sum"]').first();
      await row.waitFor({ timeout: 15_000 });
      assertEqual(await row.locator('svg[aria-label="Solved"]').count(), 1, 'the row should carry the "Solved" icon');
    },
  },
  {
    name: "Submitting: a wrong solution is a Wrong Answer with the failing case shown",
    async fn({ page, baseUrl }) {
      await openWorkspace(page, baseUrl, "two-sum");
      await page.locator('select[aria-label="Approach"]').selectOption("");
      await pasteIntoEditor(page, SOLUTIONS.wrong, { marker: "# approach: wrong on purpose" });
      await submitCode(page);

      const result = await resultSummary(page);
      assertEqual(result.verdict, "Wrong Answer", "verdict after submitting a wrong solution");
      assertIncludes(result.summary, "0 / 6 test cases passed", "Submit summary line for the wrong solution");

      const blocks = await resultBlocks(page);
      assertIncludes(blocks.Input ?? "", "2 7 11 15", "failing case input");
      assertIncludes(blocks["Your output"] ?? "", "0 0", "failing case actual output");
      assertIncludes(blocks["Expected output"] ?? "", "0 1", "failing case expected output");
    },
  },
  {
    name: "Submitting: the Submissions tab lists both attempts, newest first",
    async fn({ page, api, state }) {
      await leftTab(page, "Submissions").click();
      const entries = page.locator('ul.divide-y > li > button');
      await entries.first().waitFor({ timeout: 20_000 });
      const rows = (await entries.allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim());
      assertEqual(rows.length, 2, "submissions listed for Two Sum");
      assertMatches(rows[0], /^Wrong Answer Unsaved code/, "newest submission (wrong answer on unsaved code)");
      assertMatches(rows[1], /^Accepted Hash Map/, "older submission (accepted Hash Map)");
      assertIncludes(rows[0], "0/6", "wrong submission passed count");
      assertIncludes(rows[1], "6/6", "accepted submission passed count");

      const api_rows = await api(`/submissions?problemId=${state.twoSumId}`);
      assertEqual(api_rows.length, 2, "submissions stored for Two Sum");
      assertEqual(api_rows[0].verdict, "Wrong Answer", "API: newest submission first");
    },
  },

  // 6 ----------------------------------------------------------------- Compare
  {
    name: "Compare: the diff modal shows both approaches and the complexity table",
    async fn({ page, consoleErrors }) {
      const before = consoleErrors.length;
      await leftTab(page, "Approaches").click();
      await page.locator('input[aria-label="Select Hash Map for comparison"]').check();
      await page.locator('input[aria-label="Select Brute Force for comparison"]').check();

      const compare = page.getByRole("button", { name: "Compare" });
      assertEqual(await compare.isDisabled(), false, "the Compare button should enable once two approaches are selected");
      await compare.click();

      const dialog = page.locator('[role="dialog"][aria-label="Compare approaches"]');
      await dialog.waitFor({ timeout: 20_000 });
      await dialog.locator(".monaco-diff-editor").waitFor({ timeout: 30_000 });

      const table = (await dialog.locator("table").first().innerText()).replace(/\s+/g, " ");
      assertIncludes(table, "Hash Map", "complexity table: Hash Map row");
      assertIncludes(table, "Brute Force", "complexity table: Brute Force row");
      assertIncludes(table, "O(n)", "complexity table: Hash Map time");
      assertIncludes(table, "O(n^2)", "complexity table: Brute Force time");
      assertIncludes(table, "Accepted", "complexity table: Hash Map verdict");

      const sides = await page.evaluate(() => {
        const read = (root) =>
          root
            ? [...root.querySelectorAll(".view-line")].map((l) => l.textContent).join("\n").replace(/ /g, " ")
            : "";
        const diff = document.querySelector(".monaco-diff-editor");
        return { original: read(diff?.querySelector(".editor.original")), modified: read(diff?.querySelector(".editor.modified")) };
      });
      assertIncludes(sides.original, "# approach: hash map", "left side of the diff");
      assertIncludes(sides.modified, "# approach: brute force", "right side of the diff");

      await dialog.getByRole("button", { name: "Close" }).click();
      await dialog.waitFor({ state: "detached", timeout: 15_000 });
      await page.waitForTimeout(500); // let any teardown error surface
      const newErrors = consoleErrors.slice(before);
      assertEqual(
        newErrors.length,
        0,
        `closing the compare modal logged console errors:\n      ${newErrors.map((e) => e.text).join("\n      ")}`
      );
    },
  },

  // 7 ------------------------------------------------------------ My Solutions
  {
    name: "My Solutions: both approaches are listed with complexities and verdicts",
    async fn({ page, baseUrl }) {
      await page.goto(new URL("/solutions", baseUrl).href, { waitUntil: "domcontentloaded" });
      await heading(page, "My Solutions").waitFor({ timeout: 30_000 });

      const group = page.locator("section", { hasText: "Two Sum" }).first();
      await group.waitFor({ timeout: 15_000 });
      const rows = (await group.locator("ul > li").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
      assertEqual(rows.length, 2, "approaches listed under Two Sum");

      const hashMap = rows.find((r) => r.startsWith("Hash Map"));
      const brute = rows.find((r) => r.startsWith("Brute Force"));
      assert(hashMap && brute, `expected a Hash Map and a Brute Force row, got:\n      ${rows.join("\n      ")}`);
      assertIncludes(hashMap, "T: O(n)", "Hash Map time complexity");
      assertIncludes(hashMap, "S: O(n)", "Hash Map space complexity");
      assertIncludes(hashMap, "Accepted", "Hash Map verdict");
      assertIncludes(brute, "T: O(n^2)", "Brute Force time complexity");
      assertIncludes(brute, "Not Submitted", "Brute Force verdict");
      assertIncludes(await page.locator("h1 + p").first().textContent(), "2 approaches", "My Solutions subtitle");
    },
  },
  {
    name: "My Solutions: the verdict filter works",
    async fn({ page }) {
      const verdict = page.locator('select[aria-label="Verdict"]');

      await verdict.selectOption("Accepted");
      await page.waitForFunction(() => document.querySelectorAll("section ul > li").length === 1, null, { timeout: 15_000 });
      let rows = await page.locator("section ul > li").allInnerTexts();
      assertEqual(rows.length, 1, "approaches shown when filtering by Accepted");
      assertMatches(rows[0].replace(/\s+/g, " "), /^Hash Map/, "the only Accepted approach");

      await verdict.selectOption("Not Submitted");
      await page.waitForFunction(
        () => [...document.querySelectorAll("section ul > li")].some((li) => li.textContent.includes("Brute Force")),
        null,
        { timeout: 15_000 }
      );
      rows = await page.locator("section ul > li").allInnerTexts();
      assertEqual(rows.length, 1, "approaches shown when filtering by Not Submitted");
      assertMatches(rows[0].replace(/\s+/g, " "), /^Brute Force/, "the only unsubmitted approach");

      await verdict.selectOption("");
      await page.waitForFunction(() => document.querySelectorAll("section ul > li").length === 2, null, { timeout: 15_000 });
    },
  },
  {
    name: "My Solutions: clicking an approach opens it in the editor",
    async fn({ page, state }) {
      await page.locator('select[aria-label="Verdict"]').selectOption("");
      await page.getByRole("link", { name: /Hash Map/ }).first().click();
      await page.locator(".monaco-editor .view-lines").first().waitFor({ state: "visible", timeout: 60_000 });
      assertIncludes(page.url(), `/problems/two-sum?solution=${state.hashMapId}`, "URL after opening an approach");
      await waitForEditorText(page, "# approach: hash map", { label: "the editor did not open the Hash Map approach" });
      assertIncludes(await editorText(page), "# approach: hash map", "editor contents after opening Hash Map");
      assertEqual(await page.locator('select[aria-label="Approach"]').inputValue(), state.hashMapId, "selected approach in the switcher");
    },
  },

  // 8 ---------------------------------------------------------------- Progress
  {
    name: "Progress: solved count, step and difficulty bars reflect the work done",
    async fn({ page, baseUrl, api }) {
      await page.goto(new URL("/progress", baseUrl).href, { waitUntil: "domcontentloaded" });
      await heading(page, "Progress").waitFor({ timeout: 30_000 });

      const progress = await api("/dashboard/progress");
      const stats = await api("/dashboard/stats");
      assertEqual(stats.solvedProblems, 1, "API: solved problems after solving Two Sum");

      const ring = (await page.locator("div.size-36").first().innerText()).replace(/\s+/g, " ").trim();
      assertEqual(ring, "1 of 474 solved", "solved ring on the Progress page");

      const sections = await page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/problems?section="]')].map((a) => a.innerText.replace(/\s+/g, " ").trim())
      );
      const arrays = sections.find((row) => row.startsWith("Arrays"));
      assertEqual(arrays, "Arrays 1 / 40", "Arrays section bar");
      const expectedArrays = progress.bySection.find((s) => s.section === "Arrays");
      assertEqual(expectedArrays.solved, 1, "API: solved problems in Arrays");

      const easy = progress.byDifficulty.find((d) => d.difficulty === "Easy");
      const difficultyRows = await page.evaluate(() =>
        [...document.querySelectorAll("div.mb-1\\.5")].map((row) => row.innerText.replace(/\s+/g, " ").trim())
      );
      assert(
        difficultyRows.includes(`Easy ${easy.solved} / ${easy.total}`),
        `Easy bar should read "Easy ${easy.solved} / ${easy.total}", got: ${difficultyRows.join(" | ")}`
      );
      assertEqual(easy.solved, 1, "API: solved Easy problems");
    },
  },
  {
    name: "Progress: the activity heatmap shows today",
    async fn({ page }) {
      const today = new Intl.DateTimeFormat("en-CA").format(new Date());
      const cell = page.locator(`div[title^="${today}:"]`);
      await cell.first().waitFor({ timeout: 15_000 });
      const title = await cell.first().getAttribute("title");
      assertMatches(title, new RegExp(`^${today}: [1-9]\\d* submissions?, [1-9]\\d* accepted$`), "today's heatmap cell");
      const shade = await cell.first().getAttribute("class");
      assert(!shade.includes("bg-surface-2"), `today's cell should be shaded as active, class was "${shade}"`);
    },
  },

  // 9 -------------------------------------------------------- Custom problems
  {
    name: "Custom problem: the form creates a solvable problem",
    async fn({ page, baseUrl, api, state }) {
      await page.goto(new URL("/problems/new", baseUrl).href, { waitUntil: "domcontentloaded" });
      await heading(page, "Add custom problem").waitFor({ timeout: 30_000 });

      state.customTitle = "E2E Add Two Numbers";
      await page.locator("#title").fill(state.customTitle);
      await page.locator("#difficulty").selectOption("Easy");
      await page.locator("#topic").fill("E2E Testing");
      await page.locator("#subtopic").fill("Smoke");
      await page.locator("#tags").fill("e2e, math");
      await page.locator("#statement").fill("Read two integers `a` and `b` from stdin and print their sum.");
      await page.locator("#inputFormat").fill("One line with two integers a and b.");
      await page.locator("#outputFormat").fill("Print a single integer.");
      await page.locator("#constraints").fill("-1000 <= a, b <= 1000");

      await page.locator('textarea[aria-label="Example input"]').fill("2 3");
      await page.locator('textarea[aria-label="Example output"]').fill("5");
      await page.locator('input[aria-label="Example explanation"]').fill("2 + 3 = 5.");

      const inputs = page.locator('textarea[aria-label="Test input"]');
      const outputs = page.locator('textarea[aria-label="Expected output"]');
      assertEqual(await inputs.count(), 2, "test case rows on a fresh form");
      await inputs.nth(0).fill("2 3");
      await outputs.nth(0).fill("5");
      await inputs.nth(1).fill("-10 4");
      await outputs.nth(1).fill("-6");
      const hiddenFlags = await page.locator('label:has-text("Hidden (only used on Submit)") input').evaluateAll((els) => els.map((e) => e.checked));
      assertEqual(hiddenFlags.join(","), "false,true", "visible / hidden flags of the two test cases");

      await page.getByRole("button", { name: "Add problem" }).click();
      await page.locator(".monaco-editor .view-lines").first().waitFor({ state: "visible", timeout: 60_000 });

      const slug = new URL(page.url()).pathname.replace("/problems/", "");
      state.customSlug = slug;
      const problem = await api(`/problems/${slug}`);
      state.customId = problem._id;
      assertEqual(problem.title, state.customTitle, "created problem title");
      assertEqual(problem.isCustom, true, "created problem is custom");
      assertEqual(problem.contentStatus, "ready", "created problem is solvable");
      assertEqual(problem.testCases.length, 1, "visible test cases of the custom problem");
      assertEqual(problem.hiddenTestCount, 1, "hidden test cases of the custom problem");
      assertIncludes(await page.locator("article header").innerText(), "Custom", 'the workspace shows the "Custom" badge');
    },
  },
  {
    name: "Custom problem: it can be solved and submitted",
    async fn({ page }) {
      await pasteIntoEditor(page, SOLUTIONS.customSum, { marker: "# approach: e2e custom sum" });
      await submitCode(page);
      const result = await resultSummary(page);
      assertEqual(result.verdict, "Accepted", "verdict for the custom problem");
      assertIncludes(result.summary, "2 / 2 test cases passed", "custom problem summary line");
      assertEqual(result.cases.join(" | "), "Case 1 | Hidden case 2", "cases of the custom problem");
    },
  },
  {
    name: "Custom problem: it appears in the library, then deleting removes it",
    async fn({ page, baseUrl, api, state }) {
      await withProblemsResponse(page, (params) => params.get("search") === state.customTitle, async () => {
        await page.goto(new URL(`/problems?search=${encodeURIComponent(state.customTitle)}`, baseUrl).href, { waitUntil: "domcontentloaded" });
      });
      await waitForRowCount(page, 1, "library rows for the custom problem");
      const row = page.locator(`a[href="/problems/${state.customSlug}"]`).first();
      assertEqual(await row.locator('svg[aria-label="Solved"]').count(), 1, "the custom problem should show as solved");

      await page.goto(new URL(`/problems/${state.customSlug}/edit`, baseUrl).href, { waitUntil: "domcontentloaded" });
      await heading(page, "Edit custom problem").waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      const dialog = page.locator('[role="dialog"][aria-label="Delete custom problem?"]');
      await dialog.waitFor({ timeout: 15_000 });
      await dialog.getByRole("button", { name: "Delete", exact: true }).click();

      await page.waitForFunction(() => location.pathname === "/problems", null, { timeout: 30_000 });
      const gone = await api(`/problems/${state.customSlug}`, { allowError: true });
      assertEqual(gone.status, 404, "GET the deleted problem");
      assertEqual(gone.body.message, "Question not found in your library.", "message for the deleted problem");

      await withProblemsResponse(page, (params) => params.get("search") === state.customTitle, async () => {
        await page.goto(new URL(`/problems?search=${encodeURIComponent(state.customTitle)}`, baseUrl).href, { waitUntil: "domcontentloaded" });
      });
      await page.getByText("Question not found in your library.").waitFor({ timeout: 15_000 });
      const total = await api("/problems");
      assertEqual(total.total, 474, "problems left in the library after the delete");
    },
  },

  // 10 -------------------------------------------------------- Reference items
  {
    name: 'Reference entry: "Mark as done" solves it and raises the step progress',
    async fn({ page, baseUrl, api }) {
      await page.goto(new URL("/problems/stl", baseUrl).href, { waitUntil: "domcontentloaded" });
      await heading(page, /STL/).waitFor({ timeout: 30_000 });
      const header = page.locator("div.mb-6").first();
      assertIncludes(await header.innerText(), "Reference", 'the "Reference" badge');

      await page.getByRole("button", { name: "Mark as done" }).click();
      await page.getByRole("button", { name: "Mark as not done" }).waitFor({ timeout: 20_000 });
      assertIncludes(await header.innerText(), "Done", 'the "Done" badge after ticking it off');
      assertEqual((await api("/problems/stl")).status, "solved", "API status of the reference entry");

      await withProblemsResponse(page, () => true, async () => {
        await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
      });
      await page.locator("section > button[aria-expanded]").first().waitFor({ timeout: 30_000 });
      await page.waitForFunction(
        () => document.querySelector("section > button[aria-expanded] span.w-16")?.textContent.replace(/\s+/g, " ").trim() === "1 / 54",
        null,
        { timeout: 15_000 }
      );
      const headers = await stepHeaders(page);
      assertEqual(headers[0].counts, "1 / 54", "Step 1 counter after marking STL as done");
    },
  },
  {
    name: "Reference entry: unticking it restores the progress",
    async fn({ page, baseUrl, api }) {
      await page.goto(new URL("/problems/stl", baseUrl).href, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Mark as not done" }).click();
      await page.getByRole("button", { name: "Mark as done" }).waitFor({ timeout: 20_000 });
      assertEqual((await api("/problems/stl")).status, "unsolved", "API status after unticking");

      await withProblemsResponse(page, () => true, async () => {
        await page.goto(new URL("/problems", baseUrl).href, { waitUntil: "domcontentloaded" });
      });
      await page.waitForFunction(
        () => document.querySelector("section > button[aria-expanded] span.w-16")?.textContent.replace(/\s+/g, " ").trim() === "0 / 54",
        null,
        { timeout: 15_000 }
      );
      const headers = await stepHeaders(page);
      assertEqual(headers[0].counts, "0 / 54", "Step 1 counter after unticking STL");
    },
  },

  // 11 ---------------------------------------------------------------- Settings
  {
    name: "Settings: the theme toggle switches to light and back",
    async fn({ page, baseUrl }) {
      await page.goto(new URL("/settings", baseUrl).href, { waitUntil: "domcontentloaded" });
      await heading(page, "Settings").waitFor({ timeout: 30_000 });
      const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
      assertEqual(await isDark(), true, "the app starts in dark mode");

      // "Light"/"Dark" exactly — the sidebar's toggle is "Light mode"/"Dark mode".
      await page.getByRole("button", { name: "Light", exact: true }).click();
      await page.waitForFunction(() => !document.documentElement.classList.contains("dark"), null, { timeout: 10_000 });
      assertEqual(await isDark(), false, "after choosing Light");

      await page.getByRole("button", { name: "Dark", exact: true }).click();
      await page.waitForFunction(() => document.documentElement.classList.contains("dark"), null, { timeout: 10_000 });
      assertEqual(await isDark(), true, "after choosing Dark again");
    },
  },
  {
    name: "Settings: the editor font size persists across a reload",
    async fn({ page }) {
      const select = page.locator("select").first();
      await select.selectOption("18");
      await page.waitForFunction(
        () => JSON.parse(localStorage.getItem("dsaforge:settings") || "{}").editorFontSize === 18,
        null,
        { timeout: 10_000 }
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      await heading(page, "Settings").waitFor({ timeout: 30_000 });
      assertEqual(await page.locator("select").first().inputValue(), "18", "font size after the reload");

      await page.locator("select").first().selectOption("14");
      await page.waitForFunction(
        () => JSON.parse(localStorage.getItem("dsaforge:settings") || "{}").editorFontSize === 14,
        null,
        { timeout: 10_000 }
      );
    },
  },
  {
    name: 'Settings: "Test sandbox" reports a working sandbox',
    async fn({ page }) {
      await page.getByRole("button", { name: "Test sandbox" }).click();
      const message = page.locator("p.text-success, p.text-danger").first();
      await message.waitFor({ timeout: RUN_TIMEOUT });
      const text = await message.textContent();
      assertMatches(text, /^Sandbox is working \(.+, \d+ ms\)\.$/, "sandbox health check message");
    },
  },

  // 12 ------------------------------------------------------ Errors and empties
  {
    name: "Errors: an unknown problem slug shows the empty state",
    async fn({ page, baseUrl, api }) {
      await page.goto(new URL("/problems/this-problem-does-not-exist", baseUrl).href, { waitUntil: "domcontentloaded" });
      await page.getByText("Question not found in your library.").waitFor({ timeout: 30_000 });
      assertIncludes(
        await page.locator("main").innerText(),
        'There is no problem with the slug "this-problem-does-not-exist"',
        "the empty state explains which slug is missing"
      );
      const response = await api("/problems/this-problem-does-not-exist", { allowError: true });
      assertEqual(response.status, 404, "API status for an unknown slug");
    },
  },
  {
    name: 'Errors: a placeholder problem shows the "Not written yet" page',
    async fn({ page, baseUrl, api, state }) {
      const placeholders = state.placeholders ?? (await api("/problems")).problems.filter((p) => p.contentStatus === "placeholder");
      if (placeholders.length === 0) {
        skip("every sheet entry has content — /api/problems returns 0 problems with contentStatus \"placeholder\"");
      }
      await page.goto(new URL(`/problems/${placeholders[0].slug}`, baseUrl).href, { waitUntil: "domcontentloaded" });
      await page.getByText("Not written yet").waitFor({ timeout: 30_000 });
      assertIncludes(
        await page.locator("main").innerText(),
        "have not been written in DSAForge yet",
        "the placeholder page explains why the problem cannot be run"
      );
    },
  },

  // 13 -------------------------------------------------------- Console hygiene
  {
    name: "No uncaught console errors or page errors during the whole run",
    async fn({ consoleErrors }) {
      if (consoleErrors.length === 0) return;
      const details = consoleErrors
        .map((entry) => `[${entry.kind}] during "${entry.step}" at ${entry.url}\n        ${entry.text.split("\n")[0]}`)
        .join("\n      ");
      throw new Error(`${consoleErrors.length} uncaught browser error(s):\n      ${details}`);
    },
  },
];
