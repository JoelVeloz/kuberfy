import * as React from "react";
import { AnsiUp } from "ansi_up";

const ansiUp = new AnsiUp();

// Terminal output expects a dark background regardless of the dashboard's own theme — matches GitHub Actions/Vercel log viewers.
export const AnsiLog = React.forwardRef<HTMLPreElement, { text: string; className?: string }>(function AnsiLog({ text, className = "" }, ref) {
  const html = React.useMemo(() => ansiUp.ansi_to_html(text), [text]);
  return (
    // eslint-disable-next-line react/no-danger
    <pre
      ref={ref}
      className={`overflow-auto whitespace-pre-wrap bg-neutral-950 p-3 font-mono text-xs text-neutral-200 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
