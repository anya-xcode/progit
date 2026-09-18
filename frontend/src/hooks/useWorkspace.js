import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { codeApi, githubApi, solutionsApi } from "../api/index.js";
import { useToast } from "../context/ToastContext.jsx";
import { VERDICTS } from "../utils/constants.js";
import { readStorage, removeStorage, writeStorage } from "../utils/storage.js";
import { tidyPython } from "../utils/tidyPython.js";

// State and actions for the coding workspace: which approach is open, the
// editor contents (with local drafts), and run / submit / save.
export function useWorkspace(problem, { initialSolutionId, onActivity }) {
  const toast = useToast();
  const [solutions, setSolutions] = useState([]);
  const [solutionsLoading, setSolutionsLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(null); // "run" | "submit" | "save" | null
  const [result, setResult] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [submissionsVersion, setSubmissionsVersion] = useState(0);
  const solutionsRef = useRef(solutions);
  solutionsRef.current = solutions;

  const problemId = problem._id;
  const starterCode = problem.starterCode?.python ?? "";
  const active = useMemo(() => solutions.find((s) => s._id === activeId) ?? null, [solutions, activeId]);
  const baseline = active ? active.code : starterCode;
  const isDirty = code !== baseline;

  const draftKey = useCallback((id) => `draft:${problemId}:${id ?? "new"}`, [problemId]);

  const openApproach = useCallback(
    (solution) => {
      const id = solution?._id ?? null;
      setActiveId(id);
      setCode(readStorage(draftKey(id)) ?? solution?.code ?? starterCode);
    },
    [draftKey, starterCode]
  );

  // Load saved approaches whenever the problem changes.
  useEffect(() => {
    let cancelled = false;
    setSolutionsLoading(true);
    setResult(null);
    setResultError(null);

    solutionsApi
      .listForProblem(problemId)
      .then((list) => {
        if (cancelled) return;
        setSolutions(list);
        const requested = list.find((s) => s._id === initialSolutionId);
        const hasNewDraft = readStorage(draftKey(null)) !== null;
        const latest = [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
        openApproach(requested ?? (hasNewDraft ? null : latest ?? null));
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error.message);
        openApproach(null);
      })
      .finally(() => !cancelled && setSolutionsLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  // Keep unsaved edits as a local draft so navigating away never loses work.
  useEffect(() => {
    if (solutionsLoading) return undefined;
    const timer = setTimeout(() => {
      if (code !== baseline) writeStorage(draftKey(activeId), code);
      else removeStorage(draftKey(activeId));
    }, 400);
    return () => clearTimeout(timer);
  }, [code, baseline, activeId, draftKey, solutionsLoading]);

  // Save the current draft immediately (the debounced save may not have run),
  // then open another approach with a clean result panel.
  const switchTo = (id) => {
    if (id === activeId) return;
    if (code !== baseline) writeStorage(draftKey(activeId), code);
    else removeStorage(draftKey(activeId));
    openApproach(solutions.find((s) => s._id === id) ?? null);
    setResult(null);
    setResultError(null);
  };

  const replaceSolution = (updated) =>
    setSolutions((current) => current.map((s) => (s._id === updated._id ? updated : s)));

  const run = async ({ customInput } = {}) => {
    if (busy) return;
    setBusy("run");
    setResult(null);
    setResultError(null);
    try {
      setResult(await codeApi.run({ problemId, code, language: "python", customInput }));
    } catch (error) {
      setResultError(error);
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (busy) return;
    setBusy("submit");
    setResult(null);
    setResultError(null);
    try {
      const response = await codeApi.submit({ problemId, code, language: "python", solutionId: activeId ?? undefined });
      setResult(response);
      if (response.solution) {
        replaceSolution(response.solution);
        removeStorage(draftKey(activeId));
      }
      setSubmissionsVersion((v) => v + 1);
      onActivity?.();
      if (response.verdict === VERDICTS.ACCEPTED) {
        const syncing = ["pending", "syncing"].includes(response.solution?.githubStatus);
        toast.success(
          response.solution
            ? `Accepted! "${response.solution.title}" is updated${syncing ? " and syncing to GitHub…" : "."}`
            : "Accepted! Save it as an approach to keep it."
        );
      }
    } catch (error) {
      setResultError(error);
    } finally {
      setBusy(null);
    }
  };

  // Save: updates the open approach, or returns false so the caller can ask
  // for details and create a new one.
  const saveCode = async () => {
    if (!activeId) return false;
    if (busy) return true;
    setBusy("save");
    try {
      const updated = await solutionsApi.update(activeId, { code });
      replaceSolution(updated);
      removeStorage(draftKey(activeId));
      onActivity?.();
      toast.success(`Saved "${updated.title}"`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
    return true;
  };

  // Throws on failure so the details modal can show the error.
  const createApproach = async (details) => {
    // If this exact code was just submitted, the server links that submission
    // and copies its verdict onto the new approach.
    const submissionId = result?.mode === "submit" && !activeId ? result.submissionId : undefined;
    const saved = await solutionsApi.create({ problemId, code, language: "python", submissionId, ...details });
    setSolutions((current) => [...current, saved]);
    removeStorage(draftKey(null));
    setActiveId(saved._id);
    onActivity?.();
    toast.success(`Saved new approach "${saved.title}"`);
    return saved;
  };

  // Manual sync / retry of one approach.
  const syncToGitHub = async (id) => {
    try {
      const { solution } = await githubApi.sync(id);
      replaceSolution(solution);
      toast.info(`Syncing "${solution.title}" to GitHub…`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  // While any approach is being committed, poll so badges update and the
  // outcome is announced.
  const syncInProgress = solutions.some((s) => ["pending", "syncing"].includes(s.githubStatus));
  useEffect(() => {
    if (!syncInProgress) return undefined;
    const timer = setInterval(async () => {
      try {
        const latest = await solutionsApi.listForProblem(problemId);
        for (const next of latest) {
          const previous = solutionsRef.current.find((s) => s._id === next._id);
          if (!previous || !["pending", "syncing"].includes(previous.githubStatus)) continue;
          if (next.githubStatus === "synced") {
            toast.success(`"${next.title}" is on GitHub`, { action: next.githubCommitUrl && { label: "View commit", href: next.githubCommitUrl } });
          } else if (next.githubStatus === "failed") {
            toast.error(`GitHub sync failed for "${next.title}": ${next.githubSyncError}`);
          }
        }
        setSolutions((current) => {
          // Only GitHub fields come from the poll; everything else stays local.
          return current.map((s) => {
            const next = latest.find((x) => x._id === s._id);
            return next
              ? { ...s, githubStatus: next.githubStatus, githubPath: next.githubPath, githubCommitUrl: next.githubCommitUrl, githubSyncError: next.githubSyncError, githubSyncedAt: next.githubSyncedAt }
              : s;
          });
        });
      } catch {
        // Keep polling; a transient error should not stop status updates.
      }
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncInProgress, problemId]);

  const updateDetails = async (id, details) => {
    const updated = await solutionsApi.update(id, details);
    replaceSolution(updated);
    toast.success("Approach details updated");
    return updated;
  };

  const deleteApproach = async (id) => {
    try {
      await solutionsApi.remove(id);
    } catch (error) {
      toast.error(error.message);
      return;
    }
    setSolutions((current) => current.filter((s) => s._id !== id));
    removeStorage(draftKey(id));
    if (id === activeId) openApproach(null);
    onActivity?.();
    toast.success("Approach deleted");
  };

  return {
    syncToGitHub,
    solutions,
    solutionsLoading,
    active,
    activeId,
    code,
    setCode,
    isDirty,
    busy,
    result,
    resultError,
    submissionsVersion,
    selectApproach: (id) => switchTo(id),
    newApproach: () => switchTo(null),
    resetCode: () => setCode(baseline),
    formatCode: () => setCode(tidyPython(code)),
    run,
    submit,
    saveCode,
    createApproach,
    updateDetails,
    deleteApproach,
  };
}
