import { HttpError } from "../utils/httpError.js";
import { ExecutionUnavailableError } from "../services/execution/index.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Express 5 forwards errors thrown in async handlers here automatically.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }
  if (err instanceof ExecutionUnavailableError) {
    console.error(`[sandbox] ${err.message}`);
    res.status(503).json({ message: err.message, code: "SANDBOX_UNAVAILABLE" });
    return;
  }
  if (err.name === "ValidationError") {
    res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(", ") });
    return;
  }
  if (err.name === "CastError") {
    res.status(400).json({ message: `Invalid value for ${err.path}` });
    return;
  }
  if (err.code === 11000) {
    res.status(409).json({ message: "A record with the same name already exists" });
    return;
  }
  if (err.type === "entity.too.large") {
    res.status(413).json({ message: "Request body is too large" });
    return;
  }
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ message: "Request body must be valid JSON" });
    return;
  }

  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server" });
}
