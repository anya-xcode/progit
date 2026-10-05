import { ExternalLink, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const DIFFICULTY_TEXT = { Easy: "text-success", Medium: "text-warning", Hard: "text-danger" };

export const leetcodeLabel = (link) => `${link.id}. ${link.title}`;

// The similar LeetCode problems of one library problem. One match opens
// straight away; several open a list of all of them. Renders nothing when
// there is no match.
//
// It sits inside the row's <Link>, so it is a <button> (a nested <a> would be
// invalid) and the list is portalled out of the row, which also keeps it from
// being clipped by the step card.
export default function LeetCodeButton({ links = [] }) {
  const [menu, setMenu] = useState(null); // { top, right } while the list is open

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (event) => event.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  if (links.length === 0) return null;
  const single = links.length === 1;

  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (single) {
      window.open(links[0].url, "_blank", "noopener,noreferrer");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu(menu ? null : { top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium whitespace-nowrap text-muted hover:border-accent/60 hover:text-accent"
        title={single ? `Open on LeetCode: ${leetcodeLabel(links[0])}` : `${links.length} similar problems on LeetCode:\n${links.map(leetcodeLabel).join("\n")}`}
        aria-haspopup={single ? undefined : "menu"}
        aria-expanded={single ? undefined : Boolean(menu)}
      >
        LeetCode
        {single ? <ExternalLink className="size-3" /> : <span className="rounded bg-surface-2 px-1 tabular-nums">{links.length}</span>}
      </button>

      {menu &&
        createPortal(
          // React events bubble through portals: stop them here so a click in
          // the list never reaches the row's <Link>. Closing is deferred
          // because a link removed during its own click is not followed.
          <div
            className="fixed inset-0 z-50"
            onClick={(event) => {
              event.stopPropagation();
              setTimeout(() => setMenu(null));
            }}
          >
            <ul
              role="menu"
              aria-label="Similar problems on LeetCode"
              className="fixed max-w-[min(24rem,calc(100vw-1rem))] min-w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
              style={{ top: menu.top, right: menu.right }}
            >
              <li className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">Similar on LeetCode</li>
              {links.map((link) => (
                <li key={link.slug} role="none">
                  <a role="menuitem" href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-surface-2">
                    <span className="min-w-0 flex-1 truncate">{leetcodeLabel(link)}</span>
                    {link.premium && <Lock className="size-3 shrink-0 text-muted" aria-label="LeetCode Premium" />}
                    <span className={`shrink-0 text-xs ${DIFFICULTY_TEXT[link.difficulty] ?? "text-muted"}`}>{link.difficulty}</span>
                    <ExternalLink className="size-3 shrink-0 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}

// Every similar LeetCode problem as its own link, for pages with room to show
// them all (the problem description, reference entries).
export function LeetCodeLinks({ links = [], className = "" }) {
  if (links.length === 0) return null;
  return (
    <div className={className}>
      <p className="mb-2 text-[13px] font-medium">Similar on LeetCode</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.slug}>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[13px] hover:border-accent/60 hover:text-accent"
              title={link.premium ? "Needs LeetCode Premium" : undefined}
            >
              {leetcodeLabel(link)}
              <span className={`text-xs ${DIFFICULTY_TEXT[link.difficulty] ?? "text-muted"}`}>{link.difficulty}</span>
              {link.premium && <Lock className="size-3 text-muted" aria-label="LeetCode Premium" />}
              <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
