// "Sections" are the 18 steps of the A2Z sheet (see a2z/index.js).
// Problem data files are named <stepNo>-<key>.yaml.
import { STEPS } from "./a2z/index.js";

const keyOf = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const SECTIONS = STEPS.map((step) => ({
  order: step.stepNo,
  key: keyOf(step.shortTitle),
  name: step.shortTitle,
  fullTitle: step.title,
  total: step.total,
  subSteps: step.subSteps,
}));

export const CUSTOM_SECTION = { order: 99, key: "custom", name: "Custom" };

export const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export function findSectionByKey(key) {
  return SECTIONS.find((section) => section.key === key);
}

export function findSectionByStep(stepNo) {
  return SECTIONS.find((section) => section.order === stepNo);
}

export function sectionOrder(name) {
  return SECTIONS.find((s) => s.name === name)?.order ?? CUSTOM_SECTION.order;
}
