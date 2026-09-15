import type * as React from "react";

export function KuberfyMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" {...props}>
      <polygon points="50,10 84,29 84,67 50,86 16,67 16,29" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points="50,26 70.4,37.4 70.4,60.2 50,71.6 29.6,60.2 29.6,37.4" stroke="currentColor" strokeWidth="3.2" opacity="0.8" strokeLinejoin="round" />
      <g stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" opacity="0.8">
        <line x1="50" y1="48.8" x2="70.4" y2="37.4" />
        <line x1="50" y1="48.8" x2="29.6" y2="37.4" />
        <line x1="50" y1="48.8" x2="50" y2="71.6" />
      </g>
    </svg>
  );
}
