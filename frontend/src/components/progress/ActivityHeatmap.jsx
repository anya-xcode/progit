// GitHub-style grid of daily submissions. `activity` is oldest → newest.
function level(count) {
  if (count === 0) return "bg-surface-2";
  if (count < 2) return "bg-accent/30";
  if (count < 4) return "bg-accent/55";
  if (count < 7) return "bg-accent/80";
  return "bg-accent";
}

export default function ActivityHeatmap({ activity }) {
  // Pad the start so columns begin on Sunday.
  const firstDay = new Date(`${activity[0]?.date}T12:00:00Z`).getUTCDay();
  const cells = [...Array(firstDay).fill(null), ...activity];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex w-max gap-[3px]">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-[3px]">
            {week.map((day, dayIndex) =>
              day ? (
                <div
                  key={day.date}
                  className={`size-3 rounded-[3px] ${level(day.submissions)}`}
                  title={`${day.date}: ${day.submissions} submission${day.submissions === 1 ? "" : "s"}, ${day.accepted} accepted`}
                />
              ) : (
                <div key={`pad-${dayIndex}`} className="size-3" />
              )
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted">
        Less
        {[0, 1, 3, 5, 8].map((count) => (
          <span key={count} className={`size-3 rounded-[3px] ${level(count)}`} />
        ))}
        More
      </div>
    </div>
  );
}
