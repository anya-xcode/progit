import mongoose from "mongoose";
import { DIFFICULTIES } from "../data/sections.js";

const exampleSchema = new mongoose.Schema(
  {
    input: { type: String, default: "" },
    output: { type: String, default: "" },
    explanation: { type: String, default: "" },
  },
  { _id: false }
);

const testCaseSchema = new mongoose.Schema(
  {
    input: { type: String, default: "" },
    expectedOutput: { type: String, default: "" },
    isHidden: { type: Boolean, default: false },
  },
  { _id: false }
);

const problemSchema = new mongoose.Schema(
  {
    problemNumber: { type: Number, index: true },
    // Identity on the A2Z sheet (null for custom problems).
    sheetId: { type: String, default: null },
    title: { type: String, required: [true, "Title is required"], trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    section: { type: String, required: true, trim: true },
    sectionOrder: { type: Number, default: 99 },
    sectionFullTitle: { type: String, default: "" },
    orderInSection: { type: Number, default: 0 },
    subStepNo: { type: Number, default: 0 },
    // "ready" = solvable; "reference" = theory item that is read and ticked off;
    // "placeholder" = on the sheet, not written yet.
    contentStatus: { type: String, enum: ["ready", "reference", "placeholder"], default: "ready" },
    // Set when a reference item is marked as done (there is nothing to submit).
    manualDoneAt: { type: Date, default: null },
    practiceLinks: {
      leetcode: { type: String, default: "" },
      gfg: { type: String, default: "" },
      code360: { type: String, default: "" },
      article: { type: String, default: "" },
      youtube: { type: String, default: "" },
    },
    topic: { type: String, required: [true, "Topic is required"], trim: true },
    subtopic: { type: String, default: "", trim: true },
    difficulty: { type: String, enum: DIFFICULTIES, required: [true, "Difficulty is required"] },
    tags: { type: [String], default: [] },
    statement: { type: String, required: [true, "Problem statement is required"] },
    inputFormat: { type: String, default: "" },
    outputFormat: { type: String, default: "" },
    constraints: { type: [String], default: [] },
    examples: { type: [exampleSchema], default: [] },
    testCases: { type: [testCaseSchema], default: [] },
    hints: { type: [String], default: [] },
    explanation: { type: String, default: "" },
    starterCode: {
      python: { type: String, default: "" },
    },
    supportedLanguages: { type: [String], default: ["python"] },
    sourceUrl: { type: String, default: "", trim: true },
    isCustom: { type: Boolean, default: false },
  },
  { timestamps: true }
);

problemSchema.index({ sectionOrder: 1, orderInSection: 1 });
problemSchema.index({ sheetId: 1 }, { unique: true, partialFilterExpression: { sheetId: { $type: "string" } } });

export default mongoose.model("Problem", problemSchema);
