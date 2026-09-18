export function formatRuntime(ms) {
  if (ms === null || ms === undefined) return "—";
  return `${Math.round(ms)} ms`;
}

export function formatMemory(kb) {
  if (kb === null || kb === undefined) return "—";
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export function timeAgo(value) {
  if (!value) return "";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const units = [
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let amount = Math.round(seconds / 60);
  for (const [size, unit] of units) {
    if (amount < size) return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
    amount = Math.round(amount / size);
  }
  return "";
}

export function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function pluralize(count, word) {
  if (count === 1) return `${count} ${word}`;
  return `${count} ${word}${/(s|x|ch|sh)$/.test(word) ? "es" : "s"}`;
}
