import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, type ClubMetric, type ClubTrend, type ClubTrendPoint } from "../analytics";

export function ClubPerformance({ rows, trends }: { rows: ClubMetric[]; trends: ClubTrend[] }) {
  const topUsed = rows.slice(0, 12);
  const distanceRows = rows.filter((row) => row.avgLength !== null).slice(0, 12);
  const sgRows = rows.filter((row) => row.avgStrokesGained !== null && row.uses >= 3).sort((a, b) => (b.avgStrokesGained ?? 0) - (a.avgStrokesGained ?? 0));

  return (
    <>
      <section className="club-grid">
        <ClubChart title="Most Used Clubs" data={topUsed} dataKey="uses" fill="var(--green)" />
        <ClubChart title="Average Shot Length" data={distanceRows} dataKey="avgLength" fill="var(--blue)" />
        <article className="panel table-panel">
          <h2>Club Quality</h2>
          <table>
            <thead>
              <tr>
                <th>Club</th>
                <th>Shots</th>
                <th>Avg SG</th>
                <th>Bad outcomes</th>
              </tr>
            </thead>
            <tbody>
              {sgRows.map((row) => (
                <tr key={row.club}>
                  <td>{row.club}</td>
                  <td>{row.uses}</td>
                  <td className={(row.avgStrokesGained ?? 0) >= 0 ? "good" : "bad"}>{formatNumber(row.avgStrokesGained, 2)}</td>
                  <td>{formatNumber(row.badOutcomeRate, 0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <ClubChart title="Bad Outcome Frequency" data={rows.slice(0, 12)} dataKey="badOutcomeRate" fill="var(--red)" />
      </section>
      <section className="club-trend-section">
        <div className="section-heading">
          <h2>Club Trends Over Time</h2>
          <p>Each chart averages that club's shots within a round. Distance ignores shots excluded from distance stats.</p>
        </div>
        <div className="club-trend-grid">
          {trends.map((trend) => (
            <ClubTrendChart key={trend.club} trend={trend} />
          ))}
        </div>
      </section>
    </>
  );
}

function ClubChart({ title, data, dataKey, fill }: { title: string; data: ClubMetric[]; dataKey: keyof ClubMetric; fill: string }) {
  return (
    <article className="panel chart-panel">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey="club" tick={{ fill: "#8e9b8d", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: "#8e9b8d", fontSize: 12 }} tickLine={false} axisLine={false} width={42} />
          <Tooltip contentStyle={{ background: "#151a17", border: "1px solid #2c342e", borderRadius: 8, color: "#f3f4ed" }} />
          <Bar dataKey={dataKey} fill={fill} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </article>
  );
}

function ClubTrendChart({ trend }: { trend: ClubTrend }) {
  const latest = trend.points.at(-1);
  const data = trend.points.map((point) => ({
    ...point,
    badOutcomeIndex: point.badOutcomeRate === null ? null : point.badOutcomeRate / 100,
  }));
  return (
    <article className="panel club-trend-card">
      <div className="club-trend-header">
        <div>
          <h3>{trend.club}</h3>
          <span>{trend.uses} recorded shots - {trend.points.length} rounds</span>
        </div>
        {latest && <small>Latest: {formatNumber(latest.avgLength, 0)} m - SG {formatNumber(latest.avgStrokesGained, 2)}</small>}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey="shortDate" tick={{ fill: "#8e9b8d", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis yAxisId="distance" tick={{ fill: "#8e9b8d", fontSize: 11 }} tickLine={false} axisLine={false} width={38} />
          <YAxis yAxisId="sg" orientation="right" tick={{ fill: "#8e9b8d", fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            content={<ClubTrendTooltip />}
            cursor={{ stroke: "rgba(255,255,255,.15)" }}
          />
          <Legend wrapperStyle={{ color: "#cbd5c7", fontSize: 12 }} />
          <Line yAxisId="distance" type="monotone" dataKey="avgLength" name="Distance m" stroke="var(--blue)" strokeWidth={2.2} dot={{ r: 2 }} connectNulls />
          <Line yAxisId="sg" type="monotone" dataKey="avgStrokesGained" name="Avg SG" stroke="var(--green)" strokeWidth={2.2} dot={{ r: 2 }} connectNulls />
          <Line yAxisId="sg" type="monotone" dataKey="badOutcomeIndex" name="Bad rate" stroke="var(--red)" strokeWidth={1.8} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </article>
  );
}

function ClubTrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ClubTrendPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{point.shortDate}</strong>
      <span>{point.courseName}</span>
      <span>{point.shots} shots</span>
      <span>Distance: {formatNumber(point.avgLength, 1)} m</span>
      <span>Avg SG: {formatNumber(point.avgStrokesGained, 2)}</span>
      <span>Bad outcomes: {formatNumber(point.badOutcomeRate, 0)}%</span>
    </div>
  );
}
