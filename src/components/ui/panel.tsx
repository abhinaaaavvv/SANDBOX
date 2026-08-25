import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * SANDBOX section container: bordered surface with a header rule.
 * Replaces the repeated "border bg-card + header row" pattern.
 */
function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel"
      className={cn("rounded-lg border border-border bg-card", className)}
      {...props}
    />
  );
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-4 py-3.5",
        className
      )}
      {...props}
    />
  );
}

function PanelTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="panel-title"
      className={cn("font-bodoni text-lg font-semibold whitespace-nowrap text-foreground", className)}
      {...props}
    />
  );
}

function PanelMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="panel-meta"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Panel, PanelHeader, PanelTitle, PanelMeta };
