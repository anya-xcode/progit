import mongoose from "mongoose";
import Submission from "../models/Submission.js";
import { badRequest, notFound } from "../utils/httpError.js";

// GET /api/submissions?problemId=&limit=
export async function listSubmissions(req, res) {
  const filter = {};
  if (req.query.problemId) {
    if (!mongoose.isValidObjectId(req.query.problemId)) throw badRequest("Invalid problemId");
    filter.problemId = req.query.problemId;
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);

  const submissions = await Submission.find(filter, "-code -testResults")
    .sort({ submittedAt: -1 })
    .limit(limit)
    .populate("solutionId", "title")
    .lean();
  res.json(submissions);
}

// GET /api/submissions/:id — full submission, including code and test results
export async function getSubmission(req, res) {
  const submission = await Submission.findById(req.params.id).populate("solutionId", "title").lean();
  if (!submission) throw notFound("Submission not found");
  res.json(submission);
}
