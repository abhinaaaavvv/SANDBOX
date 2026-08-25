"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatINR } from "@/lib/utils";

interface AllocationChartProps {
  chartData: { name: string; value: number }[];
}

// Neutral palette for the allocation pie.
export const CHARCOAL_COLORS = [
  "#a1a1aa",
  "#71717a",
  "#52525b",
  "#3f3f46",
  "#d4d4d8",
  "#27272a",
];

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
            fill={CHARCOAL_COLORS[index % CHARCOAL_COLORS.length]}
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
