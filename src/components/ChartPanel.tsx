import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartLine = {
  key: string;
  name: string;
  color: string;
};

type ChartPanelProps<T> = {
  title: string;
  data: T[];
  lines: ChartLine[];
  xKey: string;
  area?: boolean;
};

export function ChartPanel<T extends Record<string, unknown>>({ title, data, lines, xKey, area = false }: ChartPanelProps<T>) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <article className="panel chart-panel">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={300}>
        <Chart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -12 }}>
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: "#8e9b8d", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis tick={{ fill: "#8e9b8d", fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            contentStyle={{ background: "#151a17", border: "1px solid #2c342e", borderRadius: 8, color: "#f3f4ed" }}
            labelStyle={{ color: "#cbd5c7" }}
          />
          <Legend wrapperStyle={{ color: "#cbd5c7", fontSize: 12 }} />
          {lines.map((line) =>
            area ? (
              <Area key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} fill={line.color} fillOpacity={0.16} connectNulls />
            ) : (
              <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.5} dot={false} connectNulls />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </article>
  );
}
