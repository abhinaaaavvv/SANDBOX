import React from "react";

/**
 * Re-mounts on every route change, replaying the page-enter animation —
 * the App Router idiom for page transitions.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
