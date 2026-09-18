// Boots the real Express app against a throwaway MongoDB database.
// Each test file gets its own database so files can run in parallel.
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { syncProblemLibrary } from "../../src/services/librarySync.js";

const BASE_URI = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017";

export async function startTestServer({ seed = true, dbName } = {}) {
  const database = dbName || `dsaforge_test_${randomBytes(4).toString("hex")}`;
  const connection = await mongoose.createConnection(`${BASE_URI}/${database}`).asPromise();

  // Models are bound to the default connection, so point it at the test db.
  await mongoose.connect(`${BASE_URI}/${database}`);
  await mongoose.connection.db.dropDatabase();
  if (seed) await syncProblemLibrary();

  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function request(method, path, body, options = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // keep the raw text (redirects, empty bodies)
    }
    return { status: response.status, data, headers: response.headers };
  }

  return {
    base,
    request,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    put: (path, body) => request("PUT", path, body),
    del: (path, body) => request("DELETE", path, body),
    async close() {
      await mongoose.connection.db.dropDatabase();
      await connection.close();
      await mongoose.disconnect();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// A correct Python solution for the seeded "Two Sum" problem, and variations
// used to exercise every verdict.
export const PYTHON = {
  twoSumAccepted: `import sys


def two_sum(nums, target):
    seen = {}
    for j, value in enumerate(nums):
        if target - value in seen:
            return [seen[target - value], j]
        seen[value] = j
    return [-1, -1]


def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = [int(x) for x in data[2:2 + n]]
    i, j = two_sum(nums, target)
    print(i, j)


if __name__ == "__main__":
    main()
`,
  wrongAnswer: "print(0, 0)\n",
  compilationError: "def broken(:\n    pass\n",
  runtimeError: "print(1 // 0)\n",
  timeLimit: "while True:\n    pass\n",
  echoStdin: "import sys\nprint(sys.stdin.read().strip())\n",
};
