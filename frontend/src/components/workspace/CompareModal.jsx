import { useEffect, useState } from "react";
import { Select } from "../ui/Field.jsx";
import Markdown from "../ui/Markdown.jsx";
import Modal from "../ui/Modal.jsx";
import { CodeDiff } from "./CodeEditor.jsx";
import ComplexityTable from "./ComplexityTable.jsx";

export default function CompareModal({ open, solutions, initialIds, onClose }) {
  const [leftId, setLeftId] = useState(null);
  const [rightId, setRightId] = useState(null);

  useEffect(() => {
    if (open && initialIds) {
      setLeftId(initialIds[0]);
      setRightId(initialIds[1]);
    }
  }, [open, initialIds]);

  const left = solutions.find((s) => s._id === leftId);
  const right = solutions.find((s) => s._id === rightId);

  const picker = (value, onChange, label) => (
    <Select value={value ?? ""} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-8 text-[13px]">
      {solutions.map((solution) => (
        <option key={solution._id} value={solution._id}>
          {solution.title}
        </option>
      ))}
    </Select>
  );

  return (
    <Modal open={open} onClose={onClose} title="Compare approaches" size="xl">
      {left && right && (
        <div className="space-y-4">
          <ComplexityTable solutions={[left, right]} />
          <div className="grid grid-cols-2 gap-3">
            {picker(leftId, setLeftId, "Left approach")}
            {picker(rightId, setRightId, "Right approach")}
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <CodeDiff original={left.code} modified={right.code} height={420} />
          </div>
          {(left.explanation || right.explanation) && (
            <div className="grid gap-4 md:grid-cols-2">
              {[left, right].map((solution) => (
                <div key={solution._id} className="rounded-lg border border-border p-3">
                  <p className="mb-1 text-xs font-semibold text-muted">{solution.title}</p>
                  {solution.explanation ? (
                    <Markdown className="text-[13px]">{solution.explanation}</Markdown>
                  ) : (
                    <p className="text-[13px] text-muted">No explanation.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
