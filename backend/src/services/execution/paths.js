import path from "node:path";
import { fileURLToPath } from "node:url";

// <repo>/sandbox, resolved from backend/src/services/execution
export const SANDBOX_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../sandbox");
