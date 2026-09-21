// Mirrors frontend/dist to ./dist after a build.
//
// Vercel looks for the output directory relative to the project's Root
// Directory, which differs depending on how the project was imported. Having
// the build present in both places means the deployment works whether Vercel
// expects "dist" or "frontend/dist", with no dashboard settings to remember.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(ROOT, "frontend", "dist");
const target = path.join(ROOT, "dist");

if (!fs.existsSync(source)) {
  console.error(`No build found at ${source} — run the frontend build first.`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

const files = fs.readdirSync(target).length;
console.log(`Copied the build to ./dist (${files} top-level entries)`);
