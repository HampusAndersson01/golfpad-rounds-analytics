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
  Settings,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";
import {
  aggregateClubPerformance,
  aggregateClubTrends,
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
import { MinGolfImportPanel, parseMinGolfForImport, type MinGolfImportResult } from "./components/MinGolfImportPanel";
import { RoundDetail } from "./components/RoundDetail";
import { StatCard } from "./components/StatCard";
import { parseZipForImport, ZipImportPanel, type ImportResult } from "./components/ZipImportPanel";
import {
  appendHandicapChange,
  attachRoundHandicapContext,
  buildHandicapBlowUpAnalysis,
  buildHandicapForecast,
  buildHandicapInsights,
  buildHandicapOverview,
  buildHandicapRoundMetrics,
  buildHandicapTrendData,
  buildSeasonTrendSummary,
  currentHandicapFromHistory,
  mergeHandicapHistory,
  normalizeHandicapHistory,
  type HandicapEntry,
  type HandicapForecast,
  type HandicapRoundMetric,
  type HandicapTrendSummary,
} from "./handicap";
import {
  clearRoundDatabase,
  downloadRoundDatabase,
  loadRoundDatabase,
  mergeNewRounds,
  saveRoundDatabase,
  type PersistenceStatus,
} from "./storage";
import "./styles.css";

type PageKey = "import" | "overview" | "handicap" | "trends" | "categories" | "form" | "clubs" | "rounds" | "blowups";

const navItems: Array<{ key: PageKey; label: string; icon: React.ReactNode }> = [
  { key: "import", label: "Import", icon: <Upload size={17} /> },
  { key: "overview", label: "Overview", icon: <CircleGauge size={17} /> },
  { key: "handicap", label: "Handicap", icon: <Settings size={17} /> },
  { key: "trends", label: "Score Trends", icon: <LineChart size={17} /> },
  { key: "categories", label: "Categories", icon: <BarChart3 size={17} /> },
  { key: "form", label: "Recent Form", icon: <TrendingUp size={17} /> },
  { key: "clubs", label: "Clubs", icon: <Dumbbell size={17} /> },
  { key: "rounds", label: "Round Detail", icon: <ListChecks size={17} /> },
  { key: "blowups", label: "Blow-ups", icon: <Flag size={17} /> },
];

function App() {
  const [rawRounds, setRawRounds] = React.useState<RawRound[]>([]);
  const [databaseStatus, setDatabaseStatus] = React.useState<PersistenceStatus | null>(null);
  const [handicapHistory, setHandicapHistory] = React.useState<HandicapEntry[]>(() => normalizeHandicapHistory([]));
  const [isLoadingDatabase, setIsLoadingDatabase] = React.useState(true);
  const [page, setPage] = React.useState<PageKey>("overview");
  const [selectedRoundId, setSelectedRoundId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    loadRoundDatabase().then((result) => {
      if (cancelled) return;
      setRawRounds(result.rounds);
      setHandicapHistory(result.handicapHistory);
      setDatabaseStatus(result.status);
      setIsLoadingDatabase(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const rounds = React.useMemo(
    () => buildRoundMetrics(rawRounds.map((data, index) => ({ path: `local:${index}`, data }))),
    [rawRounds],
  );

  React.useEffect(() => {
    if (!selectedRoundId || !rounds.some((round) => round.id === selectedRoundId)) {
      setSelectedRoundId(rounds.at(-1)?.id ?? "");
    }
  }, [rounds, selectedRoundId]);

  const currentHandicap = React.useMemo(() => currentHandicapFromHistory(handicapHistory), [handicapHistory]);
  const handicapRounds = React.useMemo(() => buildHandicapRoundMetrics(rounds, currentHandicap), [rounds, currentHandicap]);
  const overview = React.useMemo(() => getOverviewStats(rounds), [rounds]);
  const handicapOverview = React.useMemo(() => buildHandicapOverview(handicapRounds), [handicapRounds]);
  const clubRows = React.useMemo(() => aggregateClubPerformance(rounds), [rounds]);
  const clubTrends = React.useMemo(() => aggregateClubTrends(rounds).slice(0, 8), [rounds]);
  const form = React.useMemo(() => compareRecentForm(handicapRounds), [handicapRounds]);
  const blowUps = React.useMemo(() => buildHandicapBlowUpAnalysis(handicapRounds, currentHandicap), [handicapRounds, currentHandicap]);
  const [selectedHandicapYear, setSelectedHandicapYear] = React.useState("all");
  const handicapForecast = React.useMemo(() => buildHandicapForecast(handicapHistory, handicapRounds, selectedHandicapYear), [handicapHistory, handicapRounds, selectedHandicapYear]);
  const handicapTrendSummary = React.useMemo(() => buildSeasonTrendSummary(handicapHistory, selectedHandicapYear, handicapForecast), [handicapHistory, selectedHandicapYear, handicapForecast]);
  const handicapInsights = React.useMemo(() => buildHandicapInsights(handicapRounds, blowUps, currentHandicap, handicapHistory, handicapForecast), [handicapRounds, blowUps, currentHandicap, handicapHistory, handicapForecast]);
  const insights = handicapInsights;
  const selectedRound = handicapRounds.find((round) => round.id === selectedRoundId) ?? handicapRounds.at(-1);
  const schema = React.useMemo(() => detectSchema(rawRounds), [rawRounds]);

  const trendData = React.useMemo(
    () =>
      rounds.map((round, index) => ({
        ...round,
        movingAverage: movingAverage(rounds, index, 5, "grossScore18"),
      })),
    [rounds],
  );
  const handicapTrendData = React.useMemo(() => buildHandicapTrendData(handicapHistory, handicapRounds), [handicapHistory, handicapRounds]);

  const handleImport = async (file: File, addLog: Parameters<typeof parseZipForImport>[1]): Promise<ImportResult> => {
    const parsed = await parseZipForImport(file, addLog);
    const merged = mergeNewRounds(rawRounds, parsed.rounds);
    const withContext = attachRoundHandicapContext(merged.rounds, handicapHistory).rounds;
    setRawRounds(withContext);
    setDatabaseStatus(await saveRoundDatabase(withContext, handicapHistory));

    return {
      summary: parsed.summary,
      added: merged.added,
      duplicates: merged.duplicates,
    };
  };

  const handleMinGolfImport = async (file: File, addLog: Parameters<typeof parseMinGolfForImport>[1]): Promise<MinGolfImportResult> => {
    if (!rawRounds.length) throw new Error("Import at least one Golf Pad round before importing handicap history so rounds can be matched.");
    const parsed = await parseMinGolfForImport(file, addLog);
    const nextHistory = mergeHandicapHistory(handicapHistory, parsed.records);
    const contextualized = attachRoundHandicapContext(rawRounds, nextHistory);
    setHandicapHistory(nextHistory);
    setRawRounds(contextualized.rounds);
    setDatabaseStatus(await saveRoundDatabase(contextualized.rounds, nextHistory));

    return {
      summary: parsed.summary,
      imported: parsed.records.length,
      matchedRounds: contextualized.matchedRounds,
    };
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all stored rounds from the persistent database?")) return;
    setDatabaseStatus(await clearRoundDatabase(handicapHistory));
    setRawRounds([]);
    setSelectedRoundId("");
  };

  const updateHandicap = async (nextHandicap: number) => {
    const nextHistory = appendHandicapChange(handicapHistory, nextHandicap);
    setHandicapHistory(nextHistory);
    setDatabaseStatus(await saveRoundDatabase(rawRounds, nextHistory));
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
              <strong>{isLoadingDatabase ? "Loading..." : `${rounds.length} rounds`}</strong>
              <small>{databaseStatus?.message ?? rounds.at(-1)?.courseName ?? "No rounds stored"}</small>
            </div>
            <button type="button" onClick={() => downloadRoundDatabase(rawRounds, handicapHistory)} disabled={!rawRounds.length} title="Export local JSON">
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
          <ImportPage onImport={handleImport} onMinGolfImport={handleMinGolfImport} rawRounds={rawRounds} />
        ) : isLoadingDatabase ? (
          <EmptyDatabase title="Loading stored rounds" detail="Reading the persistent database." />
        ) : !rounds.length && page !== "handicap" ? (
          <EmptyDatabase />
        ) : (
          <>
            {rounds.length > 0 && <InsightPanel insights={insights} />}
            {page === "overview" && <Overview rounds={handicapRounds} overview={overview} handicapOverview={handicapOverview} trendData={trendData} currentHandicap={currentHandicap} />}
            {page === "handicap" && (
              <HandicapPage
                currentHandicap={currentHandicap}
                history={handicapHistory}
                trendData={handicapTrendData}
                trendSummary={handicapTrendSummary}
                forecast={handicapForecast}
                selectedYear={selectedHandicapYear}
                onSelectedYear={setSelectedHandicapYear}
                onUpdateHandicap={updateHandicap}
              />
            )}
            {page === "trends" && <ScoreTrends data={trendData} />}
            {page === "categories" && <CategoryTrends data={rounds} />}
            {page === "form" && <RecentForm form={form} />}
            {page === "clubs" && <ClubPerformance rows={clubRows} trends={clubTrends} />}
            {page === "rounds" && <RoundDetail rounds={handicapRounds} selectedRound={selectedRound} onSelectRound={setSelectedRoundId} />}
            {page === "blowups" && <BlowUpPanel data={blowUps} rounds={handicapRounds} />}
          </>
        )}
      </main>
    </div>
  );
}

function ImportPage({
  onImport,
  onMinGolfImport,
  rawRounds,
}: {
  onImport: (file: File, logs: Parameters<typeof parseZipForImport>[1]) => Promise<ImportResult>;
  onMinGolfImport: (file: File, logs: Parameters<typeof parseMinGolfForImport>[1]) => Promise<MinGolfImportResult>;
  rawRounds: RawRound[];
}) {
  const schema = React.useMemo(() => detectSchema(rawRounds), [rawRounds]);
  const officialEntries = rawRounds.filter((round) => round.round_handicap_context?.nearest_official_record_date).length;

  return (
    <section className="import-page">
      <ZipImportPanel onImport={onImport} />
      <MinGolfImportPanel
        onImport={onMinGolfImport}
        disabled={!rawRounds.length}
        disabledMessage="Import at least one Golf Pad round before importing handicap history so rounds can be matched."
      />
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
          <span>
            <small>Rounds with official HCP context</small>
            <strong>{officialEntries}</strong>
          </span>
        </div>
      </article>
    </section>
  );
}

function EmptyDatabase({ title = "No local rounds stored", detail = "Upload a Golf Pad ZIP to populate the persistent database." }: { title?: string; detail?: string }) {
  return (
    <section className="empty-database panel">
      <Database size={28} />
      <h2>{title}</h2>
      <p>{detail}</p>
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

function Overview({
  rounds,
  overview,
  handicapOverview,
  trendData,
  currentHandicap,
}: {
  rounds: HandicapRoundMetric[];
  overview: ReturnType<typeof getOverviewStats>;
  handicapOverview: ReturnType<typeof buildHandicapOverview>;
  trendData: RoundMetric[];
  currentHandicap: number;
}) {
  return (
    <>
      <section className="kpi-grid">
        <StatCard label="Rounds analyzed" value={overview.totalRounds} />
        <StatCard label="Current handicap" value={formatNumber(currentHandicap, 1)} detail="Active analytics baseline" />
        <StatCard label="Vs handicap expectation" value={formatNumber(handicapOverview.averageVsExpectation, 1)} detail="Negative is outperforming" tone={(handicapOverview.averageVsExpectation ?? 0) <= 0 ? "positive" : "negative"} />
        <StatCard label="Rounds beating baseline" value={handicapOverview.roundsBelowExpectation} detail={`${handicapOverview.roundsAboveExpectation} above expectation`} tone="positive" />
        <StatCard label="Average gross / 18" value={formatNumber(overview.averageGross, 1)} detail={`${overview.normalizedRounds} partial rounds normalized`} />
        <StatCard label="Best score / 18" value={formatNumber(overview.bestScore, 1)} detail={overview.bestRound?.courseName} tone="positive" />
        <StatCard label="Average putts / 18" value={formatNumber(overview.averagePutts, 1)} />
        <StatCard label="Average penalties / 18" value={formatNumber(overview.averagePenalties, 1)} />
      </section>
      <section className="two-col">
        <ChartPanel title="Gross Score Over Time" data={trendData} lines={[{ key: "grossScore18", name: "Gross / 18", color: "var(--green)" }, { key: "movingAverage", name: "5-round avg", color: "var(--gold)" }]} xKey="shortDate" />
        <ChartPanel title="Performance vs Handicap Expectation" data={rounds} lines={[{ key: "performanceVsHandicap18", name: "Vs expectation", color: "var(--green)" }, { key: "handicapMovingAverage", name: "5-round avg", color: "var(--gold)" }]} xKey="shortDate" />
      </section>
    </>
  );
}

function HandicapPage({
  currentHandicap,
  history,
  trendData,
  trendSummary,
  forecast,
  selectedYear,
  onSelectedYear,
  onUpdateHandicap,
}: {
  currentHandicap: number;
  history: HandicapEntry[];
  trendData: ReturnType<typeof buildHandicapTrendData>;
  trendSummary: HandicapTrendSummary;
  forecast: HandicapForecast;
  selectedYear: string;
  onSelectedYear: (year: string) => void;
  onUpdateHandicap: (handicap: number) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(String(currentHandicap));
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(String(currentHandicap));
  }, [currentHandicap]);

  const parsed = Number(draft.replace(",", "."));
  const canSave = Number.isFinite(parsed) && parsed >= 0 && parsed <= 54 && Math.abs(parsed - currentHandicap) >= 0.05;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    await onUpdateHandicap(parsed);
    setIsSaving(false);
  };
  const availableYears = React.useMemo(() => Array.from(new Set(history.map((entry) => entry.date.slice(0, 4)))).sort((a, b) => b.localeCompare(a)), [history]);

  return (
    <section className="chart-stack">
      <section className="kpi-grid">
        <StatCard label="Starting handicap" value={formatNumber(trendSummary.startingHandicap, 1)} detail={selectedYear === "all" ? "First stored entry" : selectedYear} />
        <StatCard label="Latest handicap" value={formatNumber(trendSummary.latestHandicap ?? currentHandicap, 1)} detail="Most recent stored value" />
        <StatCard
          label="Total movement"
          value={formatNumber(trendSummary.totalMovement, 1)}
          detail="Negative means handicap dropped"
          tone={(trendSummary.totalMovement ?? 0) <= 0 ? "positive" : "negative"}
        />
        <StatCard label="Monthly movement" value={formatNumber(trendSummary.monthlyRate, 2)} detail="HCP per month" tone={(trendSummary.monthlyRate ?? 0) <= 0 ? "positive" : "negative"} />
      </section>
      <div className="two-col handicap-settings-grid">
        <article className="panel handicap-settings">
          <h2>Handicap Settings</h2>
          <div className="current-handicap">
            <span>Current handicap</span>
            <strong>{formatNumber(currentHandicap, 1)}</strong>
          </div>
          <form onSubmit={save}>
            <label htmlFor="handicap-input">Edit handicap</label>
            <div className="handicap-form-row">
              <input id="handicap-input" inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} />
              <button type="submit" disabled={!canSave || isSaving}>{isSaving ? "Saving" : "Save"}</button>
            </div>
          </form>
          <label htmlFor="handicap-year">Trend period</label>
          <select id="handicap-year" className="select-input" value={selectedYear} onChange={(event) => onSelectedYear(event.target.value)}>
            <option value="all">All Time</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </article>
        <article className="panel table-panel">
          <h2>Handicap History</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Handicap</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((entry) => (
                <tr key={`${entry.recordId ?? entry.date}-${entry.hcp}`}>
                  <td>{entry.date}</td>
                  <td>{formatNumber(entry.hcp, 1)}</td>
                  <td>{entry.source === "min-golf" ? "Min Golf" : "Manual"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>
      <ChartPanel
        title="Handicap Trend"
        data={trendSummary.points}
        lines={[
          { key: "handicap", name: "Official handicap", color: "var(--gold)" },
          { key: "smoothedHandicap", name: "Smoothed trend", color: "var(--green)" },
          { key: "projected", name: "Projected", color: "var(--blue)" },
        ]}
        xKey="label"
      />
      <section className="two-col">
        <article className="panel forecast-panel">
          <h2>End of Season Forecast</h2>
          <div className="forecast-value">
            <span>If current play trend continues</span>
            <strong>{formatNumber(forecast.projectedHandicap, 1)}</strong>
            <small>Projected handicap by {forecast.seasonEndDate}</small>
          </div>
          <div className="forecast-grid">
            <span><small>Optimistic</small>{formatNumber(forecast.optimistic, 1)}</span>
            <span><small>Conservative</small>{formatNumber(forecast.conservative, 1)}</span>
            <span><small>Confidence</small>{forecast.confidence}</span>
          </div>
        </article>
        <ChartPanel
          title="Forecast Confidence Band"
          data={trendSummary.points}
          lines={[
            { key: "confidenceLow", name: "Low band", color: "var(--green)" },
            { key: "confidenceHigh", name: "High band", color: "var(--red)" },
            { key: "projected", name: "Projection", color: "var(--blue)" },
          ]}
          xKey="label"
        />
      </section>
      <ChartPanel
        title="Handicap vs Actual Scoring Movement"
        data={trendData}
        lines={[
          { key: "handicap", name: "Handicap at round", color: "var(--gold)" },
          { key: "grossAverage", name: "5-round gross avg", color: "var(--blue)" },
          { key: "performanceTrend", name: "Vs handicap trend", color: "var(--green)" },
        ]}
        xKey="label"
      />
    </section>
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

function BlowUpPanel({ data, rounds }: { data: ReturnType<typeof buildHandicapBlowUpAnalysis>; rounds: HandicapRoundMetric[] }) {
  const totalHoles = data.summary.totalHoles || 1;
  return (
    <section className="chart-stack">
      <section className="kpi-grid">
        <StatCard label="True blow-up frequency" value={`${formatNumber((data.summary.trueBlowUps / totalHoles) * 100, 0)}%`} detail={`Threshold: +${data.blowUpThresholdToPar} or worse`} tone="negative" />
        <StatCard label="Mild damage holes" value={`${formatNumber((data.summary.mildDamage / totalHoles) * 100, 0)}%`} detail={`${data.summary.mildDamage} total`} />
        <StatCard label="Stable holes" value={`${formatNumber((data.summary.stable / totalHoles) * 100, 0)}%`} detail={`${data.summary.stable} within expectation`} tone="positive" />
        <StatCard label="Outperforming holes" value={`${formatNumber((data.summary.outperforming / totalHoles) * 100, 0)}%`} detail={`${data.summary.outperforming} better than baseline`} tone="positive" />
      </section>
      <section className="two-col">
      <ChartPanel title="Handicap-Aware Damage Per 18" data={rounds} lines={[{ key: "trueBlowUps18", name: "True blow-ups / 18", color: "var(--red)" }, { key: "mildDamage18", name: "Mild damage / 18", color: "var(--gold)" }, { key: "outperformingHoles18", name: "Better holes / 18", color: "var(--green)" }]} xKey="shortDate" />
      <article className="panel">
        <h2>Worst Holes vs Expectation</h2>
        <div className="rank-list">
          {data.worstHoleNumbers.map((hole) => (
            <div key={hole.holeNumber}>
              <strong>Hole {hole.holeNumber}</strong>
              <span>{formatNumber(hole.averageVsExpectation, 2)} vs expected</span>
              <small>{hole.majorBlowUps} true blow-ups, {hole.mildDamage} mild</small>
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
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
