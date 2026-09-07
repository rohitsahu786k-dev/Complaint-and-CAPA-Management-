import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { monthLabel } from "@/lib/format";
import { EmptyState } from "@/components/ui/Field";

/**
 * One restrained categorical palette for the whole application: ONEPWS red leads,
 * the rest are muted slate, amber and green so status colour keeps its meaning.
 */
export const CHART_COLORS = ["#E31E25", "#2B2A28", "#64748B", "#D97706", "#16A34A", "#7F1D1D", "#94A3B8", "#B45309"];

const AXIS = { fontSize: 11, fill: "#64748B" };
const GRID = "#E2E8F0";

const tooltipStyle = {
  borderRadius: 6,
  border: "1px solid #E2E8F0",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)"
};

export type Datum = { name: string; value: number };

function NoData({ label }: { label: string }) {
  return <EmptyState title="No data yet" description={label} />;
}

export function CategoryBarChart({ data, height = 260, label }: { data: Datum[]; height?: number; label: string }) {
  if (data.length === 0) return <NoData label={label} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} width={140} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
        <Bar dataKey="value" name="Complaints" radius={[0, 3, 3, 0]}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 260, label }: { data: Datum[]; height?: number; label: string }) {
  if (data.length === 0) return <NoData label={label} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={1}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({
  data,
  height = 280,
  series,
  label
}: {
  data: Record<string, string | number>[];
  height?: number;
  series: { key: string; name: string; type?: "bar" | "line"; color?: string; axis?: "left" | "right" }[];
  label: string;
}) {
  if (data.length === 0) return <NoData label={label} />;
  const hasRight = series.some((entry) => entry.axis === "right");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={AXIS} tickFormatter={(value: string) => monthLabel(value)} />
        <YAxis yAxisId="left" tick={AXIS} allowDecimals={false} />
        {hasRight ? <YAxis yAxisId="right" orientation="right" tick={AXIS} unit="%" domain={[0, 100]} /> : null}
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(value: string) => monthLabel(value)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((entry, index) =>
          entry.type === "line" ? (
            <Line
              key={entry.key}
              yAxisId={entry.axis ?? "left"}
              type="monotone"
              dataKey={entry.key}
              name={entry.name}
              stroke={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ) : (
            <Bar
              key={entry.key}
              yAxisId={entry.axis ?? "left"}
              dataKey={entry.key}
              name={entry.name}
              fill={entry.color ?? CHART_COLORS[index % CHART_COLORS.length]}
              radius={[3, 3, 0, 0]}
              maxBarSize={38}
            />
          )
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Pareto: descending bars with the cumulative percentage on a second axis. */
export function ParetoChart({ data, height = 280 }: { data: { name: string; value: number; cumulativePercent: number }[]; height?: number }) {
  if (data.length === 0) return <NoData label="No delay reasons have been recorded yet." />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 60, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} />
        <YAxis yAxisId="left" tick={AXIS} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={AXIS} unit="%" domain={[0, 100]} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="left" dataKey="value" name="Occurrences" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} maxBarSize={44} />
        <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" name="Cumulative %" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
