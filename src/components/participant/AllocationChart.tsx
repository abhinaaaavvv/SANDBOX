"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatINR } from "@/lib/utils";

interface AllocationChartProps {
  chartData: { name: string; value: number }[];
}

// Vibrant categorical palette for the allocation pie — distinct hues
// so each holding is instantly distinguishable.
export const ALLOCATION_COLORS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#14b8a6", // teal
  "#eab308", // yellow
];

// Kept for backwards compatibility with existing imports.
export const CHARCOAL_COLORS = ALLOCATION_COLORS;

/**
 * Recharts-backed allocation donut. Loaded via next/dynamic from
 * PortfolioSection so the ~100 KB gz charting library is only fetched
 * when the Holdings/Leaderboard view is actually opened.
 */
const AllocationChart: React.FC<AllocationChartProps> = ({ chartData }) => (
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie
        data={chartData}
        cx="50%"
        cy="50%"
        innerRadius={40}
        outerRadius={65}
        paddingAngle={2}
        dataKey="value"
        stroke="var(--card)"
        strokeWidth={1}
      >
        {chartData.map((entry, index) => (
          <Cell
            key={`cell-${entry.name}`}
            fill={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]}
          />
        ))}
      </Pie>
      <Tooltip
        formatter={(val) => formatINR(Number(val) || 0)}
        contentStyle={{
          backgroundColor: "#0a0a0b",
          border: "1px solid #1c1c1f",
          borderRadius: "6px",
          color: "#fafafa",
          fontSize: "12px",
          fontFamily: "var(--font-sans)",
        }}
        itemStyle={{ color: "#e4e4e7" }}
      />
    </PieChart>
  </ResponsiveContainer>
);

export default AllocationChart;
