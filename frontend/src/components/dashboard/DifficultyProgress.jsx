import { DIFFICULTY_TONE } from "../../utils/constants.js";
import ProgressBar from "../ui/ProgressBar.jsx";

const TEXT = { success: "text-success", warning: "text-warning", danger: "text-danger" };

export default function DifficultyProgress({ difficulties }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
      {difficulties.map(({ difficulty, solved, total }) => {
        const tone = DIFFICULTY_TONE[difficulty];
        return (
          <div key={difficulty}>
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className={`font-medium ${TEXT[tone]}`}>{difficulty}</span>
              <span className="text-muted tabular-nums">
                {solved} / {total}
              </span>
            </div>
            <ProgressBar value={solved} total={total} tone={tone} />
          </div>
        );
      })}
    </div>
  );
}
