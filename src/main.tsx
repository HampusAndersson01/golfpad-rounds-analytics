import React from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CircleGauge,
  Database,
  Download,
  Dumbbell,
  Flag,
  LineChart,
  ListChecks,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  aggregateClubPerformance,
  aggregateClubTrends,
  buildBlowUpAnalysis,
  buildInsights,
  buildRoundMetrics,
  compareRecentForm,
  detectSchema,
  formatNumber,
  getOverviewStats,
  movingAverage,
  type RawRound,
  type RoundMetric,
} from "./analytics";
import { ChartPanel } from "./components/ChartPanel";
import { ClubPerformance } from "./components/ClubPerformance";
import { RoundDetail } from "./components/RoundDetail";
import { StatCard } from "./components/StatCard";
import { parseZipForImport, ZipImportPanel, type ImportResult } from "./components/ZipImportPanel";
import {
  clearRoundDatabase,
  downloadRoundDatabase,
  loadRoundDatabase,
  mergeNewRounds,
  saveRoundDatabase,
} from "./storage";
import "./styles.css";

type PageKey = "import" | "overview" | "trends" | "categories" | "form" | "clubs" | "rounds" | "blowups";

const navItems: Array<{ key: PageKey; label: string; icon: React.ReactNode }> = [
  { key: "import", label: "Import", icon: <Upload size={17} /> },
  { key: "overview", label: "Overview", icon: <CircleGauge size={17} /> },
  { key: "trends", label: "Score Trends", icon: <LineChart size={17} /> },
  { key: "categories", label: "Categories", icon: <BarChart3 size={17} /> },
  { key: "form", label: "Recent Form", icon: <TrendingUp size={17} /> },
  { key: "clubs", label: "Clubs", icon: <Dumbbell size={17} /> },
  { key: "rounds", label: "Round Detail", icon: <ListChecks size={17} /> },
  { key: "blowups", label: "Blow-ups", icon: <Flag size={17} /> },
];

function App() {
  const [rawRounds, setRawRounds] = React.useState<RawRound[]>(() => loadRoundDatabase());
  const [page, setPage] = React.useState<PageKey>("overview");
  const [selectedRoundId, setSelectedRoundId] = React.useState("");

  const rounds = React.useMemo(
    () => buildRoundMetrics(rawRounds.map((data, index) => ({ path: `local:${index}`, data }))),
    [rawRounds],
  );

  React.useEffect(() => {
    if (!selectedRoundId || !rounds.some((round) => round.id === selectedRoundId)) {
      setSelectedRoundId(rounds.at(-1)?.id ?? "");
    }
  }, [rounds, selectedRoundId]);

  const overview = React.useMemo(() => getOverviewStats(rounds), [rounds]);
  const clubRows = React.useMemo(() => aggregateClubPerformance(rounds), [rounds]);
  const clubTrends = React.useMemo(() => aggregateClubTrends(rounds).slice(0, 8), [rounds]);
  const form = React.useMemo(() => compareRecentForm(rounds), [rounds]);
  const blowUps = React.useMemo(() => buildBlowUpAnalysis(rounds), [rounds]);
  const insights = React.useMemo(() => buildInsights(rounds, clubRows, blowUps), [rounds, clubRows, blowUps]);
  const selectedRound = rounds.find((round) => round.id === selectedRoundId) ?? rounds.at(-1);
  const schema = React.useMemo(() => detectSchema(rawRounds), [rawRounds]);

  const trendData = React.useMemo(
    () =>
      rounds.map((round, index) => ({
        ...round,
        movingAverage: movingAverage(rounds, index, 5, "grossScore18"),
      })),
    [rounds],
  );

  const handleImport = async (file: File, addLog: Parameters<typeof parseZipForImport>[1]): Promise<ImportResult> => {
    const parsed = await parseZipForImport(file, addLog);
    const merged = mergeNewRounds(rawRounds, parsed.rounds);
    setRawRounds(merged.rounds);
    saveRoundDatabase(merged.rounds);

    return {
      summary: parsed.summary,
      added: merged.added,
      duplicates: merged.duplicates,
    };
  };

  const clearAll = () => {
    if (!window.confirm("Clear all locally stored rounds?")) return;
    clearRoundDatabase();
    setRawRounds([]);
    setSelectedRoundId("");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">GP</div>
          <div>
            <strong>GolfPad Rounds Analytics</strong>
            <span>{rounds.length} stored rounds</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)} type="button">
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="schema-note">
          <span>Detected schema</span>
          <strong>{schema.scoreKeys.length}</strong> score fields
          <strong>{schema.shotKeys.length}</strong> shot fields
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <div>
            <h1>{navItems.find((item) => item.key === page)?.label}</h1>
            <p>{rounds.length ? `${rounds[0].dateLabel} to ${rounds.at(-1)?.dateLabel}` : "Upload a Golf Pad ZIP to populate the dashboard"}</p>
          </div>
          <div className="db-actions">
            <div className="topbar-stat">
              <span>Local database</span>
              <strong>{rounds.length} rounds</strong>
              <small>{rounds.at(-1)?.courseName ?? "No rounds stored"}</small>
            </div>
            <button type="button" onClick={() => downloadRoundDatabase(rawRounds)} disabled={!rawRounds.length} title="Export local JSON">
              <Download size={16} />
              Export
            </button>
            <button type="button" onClick={clearAll} disabled={!rawRounds.length} title="Clear local database">
              <Trash2 size={16} />
              Clear
            </button>
          </div>
        </header>

        {page === "import" ? (
          <ImportPage onImport={handleImport} rawRounds={rawRounds} />
        ) : !rounds.length ? (
          <EmptyDatabase />
        ) : (
          <>
            <InsightPanel insights={insights} />
            {page === "overview" && <Overview rounds={rounds} overview={overview} trendData={trendData} />}
            {page === "trends" && <ScoreTrends data={trendData} />}
            {page === "categories" && <CategoryTrends data={rounds} />}
            {page === "form" && <RecentForm form={form} />}
            {page === "clubs" && <ClubPerformance rows={clubRows} trends={clubTrends} />}
            {page === "rounds" && <RoundDetail rounds={rounds} selectedRound={selectedRound} onSelectRound={setSelectedRoundId} />}
            {page === "blowups" && <BlowUpPanel data={blowUps} rounds={rounds} />}
          </>
        )}
      </main>
    </div>
  );
}

function ImportPage({ onImport, rawRounds }: { onImport: (file: File, logs: Parameters<typeof parseZipForImport>[1]) => Promise<ImportResult>; rawRounds: RawRound[] }) {
  const schema = React.useMemo(() => detectSchema(rawRounds), [rawRounds]);

  return (
    <section className="import-page">
      <ZipImportPanel onImport={onImport} />
      <article className="panel import-details">
        <h2>Stored Data</h2>
        <div className="import-detail-grid">
          <span>
            <small>Rounds</small>
            <strong>{rawRounds.length}</strong>
          </span>
          <span>
            <small>Score fields</small>
            <strong>{schema.scoreKeys.length}</strong>
          </span>
          <span>
            <small>Hole fields</small>
            <strong>{schema.holeKeys.length}</strong>
          </span>
          <span>
            <small>Shot fields</small>
            <strong>{schema.shotKeys.length}</strong>
          </span>
        </div>
      </article>
    </section>
  );
}

function EmptyDatabase() {
  return (
    <section className="empty-database panel">
      <Database size={28} />
      <h2>No local rounds stored</h2>
      <p>The ZIP never leaves this browser. After parsing, only normalized round data is kept in local storage.</p>
    </section>
  );
}

function InsightPanel({ insights }: { insights: string[] }) {
  return (
    <section className="insight-panel">
      <h2>Insight Summary</h2>
      <div className="insight-grid">
        {insights.map((insight) => (
          <p key={insight}>{insight}</p>
        ))}
      </div>
    </section>
  );
}

function Overview({ rounds, overview, trendData }: { rounds: RoundMetric[]; overview: ReturnType<typeof getOverviewStats>; trendData: RoundMetric[] }) {
  return (
    <>
      <section className="kpi-grid">
        <StatCard label="Rounds analyzed" value={overview.totalRounds} />
        <StatCard label="Average gross / 18" value={formatNumber(overview.averageGross, 1)} detail={`${overview.normalizedRounds} partial rounds normalized`} />
        <StatCard label="Best score / 18" value={formatNumber(overview.bestScore, 1)} detail={overview.bestRound?.courseName} tone="positive" />
        <StatCard label="Worst score / 18" value={formatNumber(overview.worstScore, 1)} detail={overview.worstRound?.courseName} tone="negative" />
        <StatCard label="Average putts / 18" value={formatNumber(overview.averagePutts, 1)} />
        <StatCard label="Average GIR" value={`${formatNumber(overview.averageGirPct, 1)}%`} />
        <StatCard label="Average FIR" value={`${formatNumber(overview.averageFirPct, 1)}%`} />
        <StatCard label="Average penalties / 18" value={formatNumber(overview.averagePenalties, 1)} />
      </section>
      <section className="two-col">
        <ChartPanel title="Gross Score Over Time" data={trendData} lines={[{ key: "grossScore18", name: "Gross / 18", color: "var(--green)" }, { key: "movingAverage", name: "5-round avg", color: "var(--gold)" }]} xKey="shortDate" />
        <ChartPanel title="Game Mix Per 18" data={rounds} lines={[{ key: "putts18", name: "Putts / 18", color: "var(--blue)" }, { key: "penalties18", name: "Penalties / 18", color: "var(--red)" }, { key: "sandShots18", name: "Sand / 18", color: "var(--gold)" }]} xKey="shortDate" />
      </section>
    </>
  );
}

function ScoreTrends({ data }: { data: RoundMetric[] }) {
  return (
    <section className="chart-stack">
      <ChartPanel title="Gross Score Per 18" data={data} lines={[{ key: "grossScore18", name: "Gross / 18", color: "var(--green)" }, { key: "movingAverage", name: "5-round avg", color: "var(--gold)" }]} xKey="shortDate" />
      <ChartPanel title="Score Over Par Per 18" data={data} lines={[{ key: "grossOverPar18", name: "Over par / 18", color: "var(--red)" }]} xKey="shortDate" />
      <ChartPanel title="Front 9 vs Back 9" data={data} lines={[{ key: "front9Score", name: "Front", color: "var(--blue)" }, { key: "back9Score", name: "Back", color: "var(--gold)" }]} xKey="shortDate" />
    </section>
  );
}

function CategoryTrends({ data }: { data: RoundMetric[] }) {
  return (
    <section className="chart-stack">
      <ChartPanel title="GIR and FIR %" data={data} lines={[{ key: "girPct", name: "GIR %", color: "var(--green)" }, { key: "firPct", name: "FIR %", color: "var(--blue)" }]} xKey="shortDate" />
      <ChartPanel title="Putts, Penalties, Sand Per 18" data={data} lines={[{ key: "putts18", name: "Putts / 18", color: "var(--blue)" }, { key: "penalties18", name: "Penalties / 18", color: "var(--red)" }, { key: "sandShots18", name: "Sand / 18", color: "var(--gold)" }]} xKey="shortDate" />
      <ChartPanel title="Average Strokes Gained" data={data} lines={[{ key: "averageStrokesGained", name: "Avg SG", color: "var(--green)" }]} xKey="shortDate" />
    </section>
  );
}

function RecentForm({ form }: { form: ReturnType<typeof compareRecentForm> }) {
  return (
    <section className="form-grid">
      {form.map((row) => (
        <article className="form-card" key={row.metric}>
          <h3>{row.metric}</h3>
          <div className="form-values">
            <span><small>Last 5</small>{formatNumber(row.last5, 1)}</span>
            <span><small>Last 10</small>{formatNumber(row.last10, 1)}</span>
            <span><small>All time</small>{formatNumber(row.allTime, 1)}</span>
          </div>
          <p className={row.direction === "improving" ? "good" : row.direction === "declining" ? "bad" : ""}>
            {row.direction === "flat" ? "Holding steady" : row.direction === "improving" ? "Trending better" : "Trending worse"}
          </p>
        </article>
      ))}
    </section>
  );
}

function BlowUpPanel({ data, rounds }: { data: ReturnType<typeof buildBlowUpAnalysis>; rounds: RoundMetric[] }) {
  return (
    <section className="two-col">
      <ChartPanel title="Double Bogey+ Frequency Per 18" data={rounds} lines={[{ key: "doubleBogeyPlus18", name: "DB+ / 18", color: "var(--red)" }, { key: "penaltyHoles18", name: "Penalty holes / 18", color: "var(--gold)" }]} xKey="shortDate" />
      <article className="panel">
        <h2>Worst Hole Numbers</h2>
        <div className="rank-list">
          {data.worstHoleNumbers.map((hole) => (
            <div key={hole.holeNumber}>
              <strong>Hole {hole.holeNumber}</strong>
              <span>{formatNumber(hole.averageToPar, 2)} avg to par</span>
              <small>{hole.doubleBogeys} double bogey+ holes</small>
            </div>
          ))}
        </div>
        <div className="collapse-meter">
          <span>Back nine collapse rounds</span>
          <strong>{data.backNineCollapses}</strong>
          <p>Rounds where the back nine was at least 4 strokes worse than the front nine.</p>
        </div>
      </article>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
