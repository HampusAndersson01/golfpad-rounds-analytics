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
  buildStablefordDamageAnalysis,
  buildRoundMetrics,
  compareRecentForm,
  detectSchema,
  formatNumber,
  getOverviewStats,
  movingAverage,
  recalculateStablefordForRounds,
  strokeIndexConfigKey,
  type ManualStrokeIndexConfig,
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
  { key: "trends", label: "Stableford Trends", icon: <LineChart size={17} /> },
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
  const [strokeIndexConfigs, setStrokeIndexConfigs] = React.useState<ManualStrokeIndexConfig[]>([]);
  const [isLoadingDatabase, setIsLoadingDatabase] = React.useState(true);
  const [page, setPage] = React.useState<PageKey>("overview");
  const [selectedRoundId, setSelectedRoundId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    loadRoundDatabase().then((result) => {
      if (cancelled) return;
      const enrichedRounds = recalculateStablefordForRounds(result.rounds, result.strokeIndexConfigs, currentHandicapFromHistory(result.handicapHistory));
      setRawRounds(enrichedRounds);
      setHandicapHistory(result.handicapHistory);
      setStrokeIndexConfigs(result.strokeIndexConfigs);
      setDatabaseStatus(result.status);
      setIsLoadingDatabase(false);
      if (JSON.stringify(enrichedRounds) !== JSON.stringify(result.rounds)) {
        void saveRoundDatabase(enrichedRounds, result.handicapHistory, result.strokeIndexConfigs).then(setDatabaseStatus);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const rounds = React.useMemo(
    () => buildRoundMetrics(rawRounds.map((data, index) => ({ path: `local:${index}`, data })), strokeIndexConfigs),
    [rawRounds, strokeIndexConfigs],
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
  const blowUps = React.useMemo(() => buildStablefordDamageAnalysis(handicapRounds), [handicapRounds]);
  const [selectedHandicapYear, setSelectedHandicapYear] = React.useState("all");
  const handicapForecast = React.useMemo(() => buildHandicapForecast(handicapHistory, handicapRounds, selectedHandicapYear), [handicapHistory, handicapRounds, selectedHandicapYear]);
  const handicapTrendSummary = React.useMemo(() => buildSeasonTrendSummary(handicapHistory, selectedHandicapYear, handicapForecast), [handicapHistory, selectedHandicapYear, handicapForecast]);
  const handicapDamage = React.useMemo(() => buildHandicapBlowUpAnalysis(handicapRounds, currentHandicap), [handicapRounds, currentHandicap]);
  const handicapInsights = React.useMemo(() => buildHandicapInsights(handicapRounds, handicapDamage, currentHandicap, handicapHistory, handicapForecast), [handicapRounds, handicapDamage, currentHandicap, handicapHistory, handicapForecast]);
  const insights = handicapInsights;
  const selectedRound = handicapRounds.find((round) => round.id === selectedRoundId) ?? handicapRounds.at(-1);
  const schema = React.useMemo(() => detectSchema(rawRounds), [rawRounds]);

  const trendData = React.useMemo(
    () =>
      rounds.map((round, index) => ({
        ...round,
        movingAverage: movingAverage(rounds, index, 5, "stablefordTotal18"),
        grossMovingAverage: movingAverage(rounds, index, 5, "grossScore18"),
      })),
    [rounds],
  );
  const handicapTrendData = React.useMemo(() => buildHandicapTrendData(handicapHistory, handicapRounds), [handicapHistory, handicapRounds]);

  const handleImport = async (file: File, addLog: Parameters<typeof parseZipForImport>[1]): Promise<ImportResult> => {
    const parsed = await parseZipForImport(file, addLog);
    const merged = mergeNewRounds(rawRounds, parsed.rounds);
    const withContext = recalculateStablefordForRounds(attachRoundHandicapContext(merged.rounds, handicapHistory).rounds, strokeIndexConfigs, currentHandicap);
    setRawRounds(withContext);
    setDatabaseStatus(await saveRoundDatabase(withContext, handicapHistory, strokeIndexConfigs));

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
    const withStableford = recalculateStablefordForRounds(contextualized.rounds, strokeIndexConfigs, currentHandicapFromHistory(nextHistory));
    setHandicapHistory(nextHistory);
    setRawRounds(withStableford);
    setDatabaseStatus(await saveRoundDatabase(withStableford, nextHistory, strokeIndexConfigs));

    return {
      summary: parsed.summary,
      imported: parsed.records.length,
      matchedRounds: contextualized.matchedRounds,
    };
  };

  const clearAll = async () => {
    if (!window.confirm("Clear all stored rounds from the persistent database?")) return;
    setDatabaseStatus(await clearRoundDatabase(handicapHistory, strokeIndexConfigs));
    setRawRounds([]);
    setSelectedRoundId("");
  };

  const updateHandicap = async (nextHandicap: number) => {
    const nextHistory = appendHandicapChange(handicapHistory, nextHandicap);
    const recalculated = recalculateStablefordForRounds(attachRoundHandicapContext(rawRounds, nextHistory).rounds, strokeIndexConfigs, nextHandicap);
    setHandicapHistory(nextHistory);
    setRawRounds(recalculated);
    setDatabaseStatus(await saveRoundDatabase(recalculated, nextHistory, strokeIndexConfigs));
  };

  const saveStrokeIndexConfig = async (config: ManualStrokeIndexConfig) => {
    const nextConfigs = [...strokeIndexConfigs.filter((row) => strokeIndexConfigKey(row.courseName, row.teeName) !== strokeIndexConfigKey(config.courseName, config.teeName)), config];
    const recalculated = recalculateStablefordForRounds(rawRounds, nextConfigs, currentHandicap);
    setStrokeIndexConfigs(nextConfigs);
    setRawRounds(recalculated);
    setDatabaseStatus(await saveRoundDatabase(recalculated, handicapHistory, nextConfigs));
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
            <button type="button" onClick={() => downloadRoundDatabase(rawRounds, handicapHistory, strokeIndexConfigs)} disabled={!rawRounds.length} title="Export local JSON">
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
          <ImportPage onImport={handleImport} onMinGolfImport={handleMinGolfImport} rawRounds={rawRounds} strokeIndexConfigs={strokeIndexConfigs} onSaveStrokeIndexConfig={saveStrokeIndexConfig} />
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
            {page === "trends" && <ScoreTrends data={trendData} handicapData={handicapTrendData} />}
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
  strokeIndexConfigs,
  onSaveStrokeIndexConfig,
}: {
  onImport: (file: File, logs: Parameters<typeof parseZipForImport>[1]) => Promise<ImportResult>;
  onMinGolfImport: (file: File, logs: Parameters<typeof parseMinGolfForImport>[1]) => Promise<MinGolfImportResult>;
  rawRounds: RawRound[];
  strokeIndexConfigs: ManualStrokeIndexConfig[];
  onSaveStrokeIndexConfig: (config: ManualStrokeIndexConfig) => Promise<void>;
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
      <StrokeIndexSetup rawRounds={rawRounds} configs={strokeIndexConfigs} onSave={onSaveStrokeIndexConfig} />
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

function StrokeIndexSetup({ rawRounds, configs, onSave }: { rawRounds: RawRound[]; configs: ManualStrokeIndexConfig[]; onSave: (config: ManualStrokeIndexConfig) => Promise<void> }) {
  const courseTees = React.useMemo(
    () =>
      Array.from(
        new Map(
          rawRounds.map((round) => {
            const courseName = round.round_metadata?.course_name ?? "Unknown course";
            const teeName = round.round_metadata?.tee_name ?? "Unknown tee";
            return [strokeIndexConfigKey(courseName, teeName), { courseName, teeName }];
          }),
        ).values(),
      ),
    [rawRounds],
  );
  const [selectedKey, setSelectedKey] = React.useState("");
  const selected = courseTees.find((row) => strokeIndexConfigKey(row.courseName, row.teeName) === selectedKey) ?? courseTees[0];
  const existing = selected ? configs.find((row) => strokeIndexConfigKey(row.courseName, row.teeName) === strokeIndexConfigKey(selected.courseName, selected.teeName)) : undefined;
  const [draft, setDraft] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!selected) return;
    setSelectedKey(strokeIndexConfigKey(selected.courseName, selected.teeName));
  }, [selected]);

  React.useEffect(() => {
    setDraft(existing?.strokeIndexes.join(", ") ?? "");
  }, [existing, selectedKey]);

  if (!courseTees.length) return null;

  const parsed = draft.split(/[,\s]+/).map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
  const isValid = parsed.length === 18 && new Set(parsed).size === 18 && parsed.every((value) => value >= 1 && value <= 18);

  const save = async () => {
    if (!selected || !isValid) return;
    setIsSaving(true);
    await onSave({ ...selected, strokeIndexes: parsed, updatedAt: new Date().toISOString() });
    setIsSaving(false);
  };

  return (
    <article className="panel stroke-index-panel">
      <h2>Manual Hole Stroke Index</h2>
      <div className="stroke-index-grid">
        <label>
          Course tee
          <select className="select-input" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
            {courseTees.map((row) => (
              <option key={strokeIndexConfigKey(row.courseName, row.teeName)} value={strokeIndexConfigKey(row.courseName, row.teeName)}>
                {row.courseName} - {row.teeName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stroke index order for holes 1-18
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="10, 4, 16, 2, ..." />
        </label>
        <button type="button" onClick={save} disabled={!isValid || isSaving}>{isSaving ? "Saving" : "Save index"}</button>
      </div>
      <p>{existing ? "Manual index is active for this course and tee." : "Add this when Golf Pad exports do not include exact hole stroke index."}</p>
    </article>
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
        <StatCard label="Average Stableford Points" value={formatNumber(overview.averageStableford, 1)} detail={`${overview.normalizedRounds} partial rounds normalized`} tone={(overview.averageStableford ?? 0) >= 36 ? "positive" : undefined} />
        <StatCard label="Best Stableford Round" value={formatNumber(overview.bestStableford, 1)} detail={overview.bestStablefordRound?.courseName} tone="positive" />
        <StatCard label="Stableford Trend" value={formatNumber(overview.stablefordTrend, 1)} detail="Last 5 rounds" tone={(overview.stablefordTrend ?? 0) >= (overview.averageStableford ?? 36) ? "positive" : "negative"} />
        <StatCard label="Stableford vs Handicap Expectation" value={formatNumber(overview.stablefordVsExpectation, 1)} detail="36 points is handicap target" tone={(overview.stablefordVsExpectation ?? 0) >= 0 ? "positive" : "negative"} />
        <StatCard label="Stable Holes %" value={`${formatNumber(overview.stableHolePct, 0)}%`} detail="Holes with 2+ points" tone="positive" />
        <StatCard label="0 Point Hole Frequency" value={formatNumber(overview.zeroPointFrequency, 1)} detail="Per 18 holes" tone="negative" />
        <StatCard label="Current handicap" value={formatNumber(currentHandicap, 1)} detail="Round-time handicap is used where available" />
        <StatCard label="Average gross / 18" value={formatNumber(overview.averageGross, 1)} detail="Secondary reference" />
      </section>
      <section className="two-col">
        <ChartPanel title="Stableford Points Over Time" data={trendData} lines={[{ key: "stablefordTotal18", name: "Stableford / 18", color: "var(--green)" }, { key: "movingAverage", name: "5-round avg", color: "var(--gold)" }, { key: "stablefordExpectation18", name: "36-point expectation", color: "var(--blue)" }]} xKey="shortDate" />
        <ChartPanel title="Stableford vs Handicap Expectation" data={rounds} lines={[{ key: "stablefordVsExpectation18", name: "Points vs 36", color: "var(--green)" }, { key: "handicapMovingAverage", name: "5-round deficit", color: "var(--gold)" }]} xKey="shortDate" />
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

function ScoreTrends({ data, handicapData }: { data: RoundMetric[]; handicapData: ReturnType<typeof buildHandicapTrendData> }) {
  return (
    <section className="chart-stack">
      <ChartPanel title="Stableford Points Per 18" data={data} lines={[{ key: "stablefordTotal18", name: "Stableford / 18", color: "var(--green)" }, { key: "stablefordMovingAverage5", name: "5-round avg", color: "var(--gold)" }, { key: "stablefordMovingAverage10", name: "10-round avg", color: "var(--blue)" }]} xKey="shortDate" />
      <ChartPanel title="Stableford and Handicap Progression" data={handicapData} lines={[{ key: "stablefordAverage", name: "5-round Stableford", color: "var(--green)" }, { key: "handicap", name: "Handicap", color: "var(--gold)" }]} xKey="label" />
      <ChartPanel title="Stableford Consistency Trend" data={data} lines={[{ key: "stablefordConsistency", name: "Consistency index", color: "var(--green)" }, { key: "stableHolePct", name: "Stable holes %", color: "var(--blue)" }]} xKey="shortDate" />
      <ChartPanel title="Front 9 vs Back 9 Stableford" data={data} lines={[{ key: "front9Stableford", name: "Front 9 points", color: "var(--blue)" }, { key: "back9Stableford", name: "Back 9 points", color: "var(--gold)" }]} xKey="shortDate" />
      <section className="two-col">
        <ChartPanel title="Gross Score Per 18" data={data} lines={[{ key: "grossScore18", name: "Gross / 18", color: "var(--muted)" }, { key: "grossMovingAverage", name: "5-round avg", color: "var(--gold)" }]} xKey="shortDate" />
        <ChartPanel title="Gross Over Par Per 18" data={data} lines={[{ key: "grossOverPar18", name: "Over par / 18", color: "var(--red)" }]} xKey="shortDate" />
      </section>
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

function BlowUpPanel({ data, rounds }: { data: ReturnType<typeof buildStablefordDamageAnalysis>; rounds: HandicapRoundMetric[] }) {
  const totalHoles = data.summary.totalHoles || 1;
  return (
    <section className="chart-stack">
      <section className="kpi-grid">
        <StatCard label="0 Point Hole Frequency" value={`${formatNumber((data.summary.zeroPointHoles / totalHoles) * 100, 0)}%`} detail={`${data.summary.zeroPointHoles} true blow-up holes`} tone="negative" />
        <StatCard label="Average 1 Point Holes" value={formatNumber(averageRoundValue(rounds, "onePointHoles18"), 1)} detail="Mild damage per 18" />
        <StatCard label="Average Stable Holes" value={formatNumber(averageRoundValue(rounds, "twoPointHoles18"), 1)} detail="2-point holes per 18" tone="positive" />
        <StatCard label="Average Gained Holes" value={formatNumber(averageRoundValue(rounds, "gainedHoles18"), 1)} detail="3+ point holes per 18" tone="positive" />
        <StatCard label="Scoring Holes %" value={`${formatNumber(data.summary.scoringHolePct, 0)}%`} detail="1+ Stableford points" />
        <StatCard label="Stable Holes %" value={`${formatNumber(data.summary.stableHolePct, 0)}%`} detail="2+ Stableford points" tone="positive" />
        <StatCard label="No-Zero Rounds" value={data.summary.roundsWithoutZeroes} detail={`${rounds.length} total rounds`} tone="positive" />
        <StatCard label="High Momentum Rounds" value={data.summary.highScoringMomentumRounds} detail="Strong closing scoring stretches" tone="positive" />
      </section>
      <section className="two-col">
      <ChartPanel title="Zero-Point Holes Per Round" data={rounds} lines={[{ key: "zeroPointHoles18", name: "0-point holes / 18", color: "var(--red)" }, { key: "onePointHoles18", name: "1-point holes / 18", color: "var(--gold)" }, { key: "gainedHoles18", name: "3+ point holes / 18", color: "var(--green)" }]} xKey="shortDate" />
      <article className="panel">
        <h2>Zero-Point Frequency by Hole</h2>
        <div className="rank-list">
          {data.byHoleNumber.slice(0, 8).map((hole) => (
            <div key={hole.holeNumber}>
              <strong>Hole {hole.holeNumber}</strong>
              <span>{formatNumber(hole.zeroRate, 0)}% zeroes</span>
              <small>{formatNumber(hole.averagePoints, 2)} avg points</small>
            </div>
          ))}
        </div>
      </article>
      </section>
      <section className="two-col">
        <article className="panel">
          <h2>Zero-Point Causes</h2>
          <div className="rank-list">
            {data.recurringZeroCauses.map((row) => (
              <div key={row.cause}>
                <strong>{row.cause}</strong>
                <span>{row.count}</span>
                <small>Recorded zero-point holes</small>
              </div>
            ))}
          </div>
          <div className="collapse-meter">
            <span>Practice ROI estimate</span>
            <strong>{data.practiceLeak.area}</strong>
            <p>{data.practiceLeak.reason} Estimated upside: {formatNumber(data.practiceLeak.estimate, 1)} Stableford points per round.</p>
          </div>
        </article>
        <article className="panel">
          <h2>Zero-Point Frequency by Par</h2>
          <div className="rank-list">
            {data.byPar.map((row) => (
              <div key={row.par}>
                <strong>Par {row.par}</strong>
                <span>{formatNumber(row.zeroRate, 0)}% zeroes</span>
                <small>{formatNumber(row.averagePoints, 2)} avg points</small>
              </div>
            ))}
          </div>
          <div className="collapse-meter">
            <span>Back-nine Stableford gap</span>
            <strong>{formatNumber(data.frontBackGap, 1)}</strong>
            <p>Positive values mean the back nine is scoring more Stableford points than the front nine.</p>
          </div>
        </article>
      </section>
    </section>
  );
}

function averageRoundValue(rounds: HandicapRoundMetric[], key: keyof HandicapRoundMetric) {
  const values = rounds.map((round) => {
    const value = round[key];
    return typeof value === "number" ? value : null;
  });
  const valid = values.filter((value): value is number => value !== null);
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
