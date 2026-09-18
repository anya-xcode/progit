import { Plus, Trash2 } from "lucide-react";
import Button from "../ui/Button.jsx";

// Editable list of objects (examples, test cases) for the custom problem form.
export default function RepeatableList({ items, onChange, createItem, addLabel, renderItem, itemLabel, minItems = 0 }) {
  const update = (index, changes) => onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  const remove = (index) => onChange(items.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted">
              {itemLabel} {index + 1}
            </p>
            {items.length > minItems && (
              <Button size="xs" variant="danger-ghost" icon={Trash2} onClick={() => remove(index)}>
                Remove
              </Button>
            )}
          </div>
          {renderItem(item, (changes) => update(index, changes), index)}
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => onChange([...items, createItem()])}>
        {addLabel}
      </Button>
    </div>
  );
}
