"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function LossChart({
  data,
}: {
  data: { year: number; lossHa: number }[];
}) {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="year" stroke="var(--text-dim)" fontSize={12} />
          <YAxis stroke="var(--text-dim)" fontSize={12} width={80} />
          <Tooltip
            contentStyle={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
            formatter={(value: number) => [
              `${Math.round(value).toLocaleString()} ha`,
            ]}
          />
          {/* deep-orange 500: loss reads as loss in both themes */}
          <Bar dataKey="lossHa" fill="#ff5722" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
