import * as React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  positive?: boolean | null;
  className?: string;
}

/**
 * Primary financial metric: muted label, dominant tabular number,
 * optional caption. `positive` tints the value (null = neutral).
 */
export const Stat: React.FC<StatProps> = ({
  label,
  value,
  sub,
  positive = null,
  className,
}) => {
  return (
    <div className={cn("p-5 md:p-6", className)}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "flex items-baseline gap-2 font-bodoni text-[1.65rem] font-medium leading-none tracking-normal lg:text-4xl",
          positive === true ? "text-up" : positive === false ? "text-down" : "text-foreground"
        )}
      >
        {positive === true && <TrendingUp className="size-5 shrink-0 text-up/80" />}
        {positive === false && <TrendingDown className="size-5 shrink-0 text-down/80" />}
        {value}
      </div>
      {sub && <span className="mt-1.5 block text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
};
