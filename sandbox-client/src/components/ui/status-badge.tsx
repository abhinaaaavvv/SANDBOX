"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { MarketStatus } from "@/types/sandbox";
import { cn } from "@/lib/utils";
import { Pause, Clock } from "lucide-react";

const STATUS_CONFIG: Record<
  MarketStatus,
  { label: string; className: string; icon?: "pause" | "clock"; dot?: boolean }
> = {
  MARKET_OPEN: {
    label: "Market Open",
    className: "border-up/25 bg-up/10 text-up",
    dot: true,
  },
  TRADING_PAUSED: {
    label: "Trading Paused",
    className: "border-warn/25 bg-warn/10 text-warn",
    icon: "pause",
  },
  MARKET_CLOSED: {
    label: "Market Closed",
    className: "border-down/25 bg-down/10 text-down",
    icon: "clock",
  },
  ROUND_ENDED: {
    label: "Round Complete",
    className: "border-border bg-muted text-muted-foreground",
    icon: "clock",
  },
  NOT_STARTED: {
    label: "Not Started",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export const MarketStatusBadge: React.FC<{
  status: MarketStatus;
  className?: string;
}> = ({ status, className }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn(cfg.className, className)}>
      {cfg.icon === "pause" && <Pause className="size-3.5" />}
      {cfg.icon === "clock" && <Clock className="size-3.5" />}
      {cfg.dot && <span className="size-1.5 animate-pulse rounded-full bg-up" />}
      {cfg.label}
    </Badge>
  );
};
