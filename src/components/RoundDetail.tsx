import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber, type RoundMetric } from "../analytics";
import type { HandicapRoundMetric } from "../handicap";

type RoundDetailProps = {
  rounds: Array<RoundMetric | HandicapRoundMetric>;
  selectedRound?: RoundMetric | HandicapRoundMetric;
  onSelectRound: (roundId: string) => void;
};

export function RoundDetail({ rounds, selectedRound, onSelectRound }: RoundDetailProps) {
  if (!selectedRound) return null;

  const categorySummary = summarizeShots(selectedRound);
  const holeRows = selectedRound.holes.map((hole) => ({
    hole: hole.hole_number,
    stableford: selectedRound.stablefordPerHole.find((row) => row.holeNumber === hole.hole_number)?.points ?? null,
  }));
  const handicapEvaluations = "handicapHoleEvaluations" in selectedRound ? selectedRound.handicapHoleEvaluations : [];

  return (
    <section className="round-detail">
      <aside className="round-list panel">
        <h2>Rounds</h2>
        {rounds.map((round) => (
          <button key={round.id} className={round.id === selectedRound.id ? "selected" : ""} onClick={() => onSelectRound(round.id)} type="button">
            <span>{round.dateLabel}</span>
            <strong>{formatNumber(round.stablefordTotal, 0)} pts - {round.courseName}</strong>
            <small>{round.grossScore ?? "-"} gross{round.normalizationFactor !== 1 ? `, ${formatNumber(round.stablefordTotal18, 1)} pts per 18` : ""}</small>
          </button>
        ))}
      </aside>
      <div className="round-main">
        <article className="panel round-summary">
          <h2>{selectedRound.courseName}</h2>
          <div className="summary-strip">
            <span><small>Stableford</small>{formatNumber(selectedRound.stablefordTotal, 0)}</span>
            <span><small>Stableford / 18</small>{formatNumber(selectedRound.stablefordTotal18, 1)}</span>
            <span><small>Vs expectation</small>{formatNumber(selectedRound.stablefordVsExpectation18, 1)}</span>
            <span><small>0-point holes</small>{selectedRound.zeroPointHoles}</span>
            <span><small>3+ point holes</small>{selectedRound.gainedHoles}</span>
            <span><small>Gross</small>{selectedRound.grossScore}</span>
            <span><small>Putts</small>{selectedRound.putts}</span>
            <span><small>Penalties</small>{selectedRound.penalties}</span>
          </div>
        </article>
        <article className="panel chart-panel">
          <h2>Stableford Points Per Hole</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={holeRows} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
              <XAxis dataKey="hole" tick={{ fill: "#8e9b8d", fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#8e9b8d", fontSize: 12 }} tickLine={false} axisLine={false} width={42} />
              <Tooltip contentStyle={{ background: "#151a17", border: "1px solid #2c342e", borderRadius: 8, color: "#f3f4ed" }} />
              <Bar dataKey="stableford" radius={[4, 4, 0, 0]}>
                {holeRows.map((row) => (
                  <Cell key={row.hole} fill={row.stableford === 0 ? "var(--red)" : row.stableford !== null && row.stableford >= 3 ? "var(--green)" : "var(--gold)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="panel table-panel">
          <h2>Hole Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Hole</th>
                <th>Par</th>
                <th>Gross</th>
                <th>SI</th>
                <th>Hcp strokes</th>
                <th>Net</th>
                <th>Pts</th>
                <th>Putts</th>
                <th>Pen</th>
                <th>GIR</th>
                <th>Class</th>
              </tr>
            </thead>
            <tbody>
              {selectedRound.holes.map((hole) => {
                const evaluation = handicapEvaluations.find((row) => row.holeNumber === hole.hole_number);
                const stableford = selectedRound.stablefordPerHole.find((row) => row.holeNumber === hole.hole_number);
                return (
                  <tr key={hole.hole_number} className={stableford?.points === 0 ? "zero-hole" : stableford && stableford.points >= 3 ? "gained-hole" : undefined}>
                    <td>{hole.hole_number}</td>
                    <td>{hole.hole_par}</td>
                    <td>{hole.total_strokes}</td>
                    <td>{stableford?.strokeIndex ?? "-"}</td>
                    <td>{stableford?.handicapStrokes ?? "-"}</td>
                    <td>{stableford?.netScore ?? "-"}</td>
                    <td>{stableford?.points ?? "-"}</td>
                    <td>{hole.putts ?? "-"}</td>
                    <td>{hole.penalties ?? "-"}</td>
                    <td>{hole.gir ? "Yes" : "No"}</td>
                    <td>{stableford ? readableStablefordClass(stableford.points) : evaluation ? readableClass(evaluation.classification) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
        <article className="panel table-panel">
          <h2>Shot Category Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Shots</th>
                <th>Avg SG</th>
              </tr>
            </thead>
            <tbody>
              {categorySummary.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.shots}</td>
                  <td>{formatNumber(row.avgSg, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
    </section>
  );
}

function readableStablefordClass(points: number) {
  if (points === 0) return "0 pts - blow-up";
  if (points === 1) return "1 pt - damage";
  if (points === 2) return "2 pts - stable";
  if (points === 3) return "3 pts - gained";
  return "4+ pts - exceptional";
}

function readableClass(value: string) {
  if (value === "better") return "Better";
  if (value === "stable") return "Stable";
  if (value === "mild-damage") return "Mild damage";
  return "Major blow-up";
}

function summarizeShots(round: RoundMetric) {
  const buckets = new Map<string, number[]>();
  round.shots.forEach((shot) => {
    const category = shot.lie || "Unknown";
    buckets.set(category, [...(buckets.get(category) ?? []), typeof shot.strokes_gained === "number" ? shot.strokes_gained : NaN]);
  });
  return Array.from(buckets.entries()).map(([category, values]) => {
    const valid = values.filter(Number.isFinite);
    return {
      category,
      shots: values.length,
      avgSg: valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null,
    };
  });
}
