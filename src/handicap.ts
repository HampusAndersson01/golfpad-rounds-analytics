import { average, formatNumber, num, type NormalizedHole, type RawRound, type RoundMetric } from "./analytics";

export const DEFAULT_HANDICAP = 28.8;

export type HandicapEntry = {
  date: string;
  hcp: number;
  source?: "manual" | "min-golf";
  recordId?: string;
  importedAt?: string;
  startTime?: string | null;
  club?: string | null;
  courseName?: string | null;
  holesPlayed?: number | null;
  par?: number | null;
  tee?: string | null;
  courseRating?: number | null;
  slope?: number | null;
  adjustedGrossScore?: number | null;
  playingHandicap?: number | null;
  points?: number | null;
  pcc?: number | null;
  adjustedHandicapResult?: number | null;
  includedInHandicapCalculation?: boolean | null;
};

export type RoundHandicapContext = NonNullable<RawRound["round_handicap_context"]>;

export type HoleExpectationClass = "better" | "stable" | "mild-damage" | "major-blow-up";

export type HandicapHoleEvaluation = {
  holeNumber: number;
  par: number;
  strokes: number;
  toPar: number;
  expectedOverPar: number;
  expectedStrokes: number;
  deltaToExpectation: number;
  classification: HoleExpectationClass;
};

export type HandicapRoundMetric = RoundMetric & {
  handicapBaseline: number;
  expectedScore: number | null;
  expectedScore18: number | null;
  performanceVsHandicap: number | null;
  performanceVsHandicap18: number | null;
  handicapHoleEvaluations: HandicapHoleEvaluation[];
  outperformingHoles: number;
  stableHoles: number;
  mildDamageHoles: number;
  majorBlowUpHoles: number;
  trueBlowUps18: number;
  mildDamage18: number;
  stableHoles18: number;
  outperformingHoles18: number;
  handicapMovingAverage: number | null;
};

export type HandicapForecast = {
  projectedHandicap: number | null;
  optimistic: number | null;
  conservative: number | null;
  confidenceLow: number | null;
  confidenceHigh: number | null;
  monthlyRate: number | null;
  officialMonthlyRate: number | null;
  scoringAdjustmentMonthly: number | null;
  confidence: "low" | "medium" | "high";
  seasonEndDate: string;
};

export type HandicapTrendSummary = {
  year: string;
  points: Array<{
    date: string;
    label: string;
    handicap: number;
    smoothedHandicap: number | null;
    confidenceLow?: number | null;
    confidenceHigh?: number | null;
    projected?: number | null;
    optimistic?: number | null;
    conservative?: number | null;
  }>;
  startingHandicap: number | null;
  latestHandicap: number | null;
  totalMovement: number | null;
  monthlyRate: number | null;
};

export type HandicapBlowUpAnalysis = {
  blowUpThresholdToPar: number;
  summary: {
    trueBlowUps: number;
    mildDamage: number;
    stable: number;
    outperforming: number;
    totalHoles: number;
  };
  worstHoleNumbers: Array<{
    holeNumber: number;
    averageVsExpectation: number;
    majorBlowUps: number;
    mildDamage: number;
  }>;
  backNineCollapses: number;
};

export function normalizeHandicapHistory(history: HandicapEntry[] | null | undefined): HandicapEntry[] {
  const cleaned = (history ?? [])
    .map((entry) => ({
      ...entry,
      date: normalizeDate(entry.date),
      hcp: roundHandicap(entry.hcp),
      source: entry.source ?? "manual",
      recordId: entry.recordId ?? buildHandicapRecordId(entry),
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.hcp) && entry.hcp >= 0 && entry.hcp <= 54);

  const byKey = new Map<string, HandicapEntry>();
  cleaned.forEach((entry) => {
    const sameDateManualKey = `manual:${entry.date}`;
    if (entry.source === "min-golf") byKey.delete(sameDateManualKey);
    const key = entry.source === "manual" ? sameDateManualKey : `${entry.source}:${entry.recordId ?? entry.date}:${entry.hcp}`;
    byKey.set(key, entry);
  });

  const normalized = Array.from(byKey.values()).sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return sourcePriority(a.source) - sourcePriority(b.source);
  });
  const changePoints = collapseUnchangedHandicapEntries(normalized);
  return changePoints.length ? changePoints : [{ date: todayIso(), hcp: DEFAULT_HANDICAP, source: "manual", recordId: `manual-${todayIso()}` }];
}

export function currentHandicapFromHistory(history: HandicapEntry[]): number {
  return normalizeHandicapHistory(history).at(-1)?.hcp ?? DEFAULT_HANDICAP;
}

export function appendHandicapChange(history: HandicapEntry[], hcp: number, date = todayIso()): HandicapEntry[] {
  const next = roundHandicap(hcp);
  const normalized = normalizeHandicapHistory(history);
  const latest = normalized.at(-1);
  if (latest && Math.abs(latest.hcp - next) < 0.05) return normalized;

  return normalizeHandicapHistory([...normalized, { date, hcp: next, source: "manual", recordId: `manual-${date}` }]);
}

export function mergeHandicapHistory(existing: HandicapEntry[], incoming: HandicapEntry[]): HandicapEntry[] {
  return normalizeHandicapHistory([...existing, ...incoming]);
}

export function buildHandicapRoundMetrics(rounds: RoundMetric[], fallbackHandicap: number): HandicapRoundMetric[] {
  const performances = rounds.map((round) => calculateRoundPerformanceVsHandicap18(round, handicapForRound(round, fallbackHandicap)));
  return rounds.map((round, index) => {
    const handicap = handicapForRound(round, fallbackHandicap);
    const holeEvaluations = round.holes.map((hole) => evaluateHole(hole, handicap));
    const expectedScore = holeEvaluations.length
      ? holeEvaluations.reduce((total, hole) => total + hole.expectedStrokes, 0)
      : round.grossOverPar !== null
        ? round.grossScore
        : null;
    const performanceVsHandicap = expectedScore !== null && round.grossScore !== null ? round.grossScore - expectedScore : null;
    const stableHoles = holeEvaluations.filter((hole) => hole.classification === "stable").length;
    const mildDamageHoles = holeEvaluations.filter((hole) => hole.classification === "mild-damage").length;
    const majorBlowUpHoles = holeEvaluations.filter((hole) => hole.classification === "major-blow-up").length;
    const outperformingHoles = holeEvaluations.filter((hole) => hole.classification === "better").length;

    return {
      ...round,
      handicapBaseline: handicap,
      expectedScore,
      expectedScore18: scaleTo18(expectedScore, round.normalizationFactor),
      performanceVsHandicap,
      performanceVsHandicap18: scaleTo18(performanceVsHandicap, round.normalizationFactor),
      handicapHoleEvaluations: holeEvaluations,
      outperformingHoles,
      stableHoles,
      mildDamageHoles,
      majorBlowUpHoles,
      trueBlowUps18: majorBlowUpHoles * round.normalizationFactor,
      mildDamage18: mildDamageHoles * round.normalizationFactor,
      stableHoles18: stableHoles * round.normalizationFactor,
      outperformingHoles18: outperformingHoles * round.normalizationFactor,
      handicapMovingAverage: average(performances.slice(Math.max(0, index - 4), index + 1)),
    };
  });
}

export function buildHandicapOverview(rounds: HandicapRoundMetric[]) {
  const above = rounds.filter((round) => (round.performanceVsHandicap18 ?? 0) > 0.5).length;
  const below = rounds.filter((round) => (round.performanceVsHandicap18 ?? 0) < -0.5).length;
  const last5 = average(rounds.slice(-5).map((round) => round.performanceVsHandicap18));
  const allTime = average(rounds.map((round) => round.performanceVsHandicap18));

  return {
    averageVsExpectation: allTime,
    recentVsExpectation: last5,
    roundsAboveExpectation: above,
    roundsBelowExpectation: below,
    stableRounds: rounds.length - above - below,
    averageExpectedScore: average(rounds.map((round) => round.expectedScore18)),
  };
}

export function buildHandicapBlowUpAnalysis(rounds: HandicapRoundMetric[], handicap: number): HandicapBlowUpAnalysis {
  const byHole = new Map<number, HandicapHoleEvaluation[]>();
  rounds.forEach((round) => {
    round.handicapHoleEvaluations.forEach((hole) => {
      byHole.set(hole.holeNumber, [...(byHole.get(hole.holeNumber) ?? []), hole]);
    });
  });

  const summary = rounds.reduce(
    (total, round) => ({
      trueBlowUps: total.trueBlowUps + round.majorBlowUpHoles,
      mildDamage: total.mildDamage + round.mildDamageHoles,
      stable: total.stable + round.stableHoles,
      outperforming: total.outperforming + round.outperformingHoles,
      totalHoles: total.totalHoles + round.handicapHoleEvaluations.length,
    }),
    { trueBlowUps: 0, mildDamage: 0, stable: 0, outperforming: 0, totalHoles: 0 },
  );

  return {
    blowUpThresholdToPar: blowUpThresholdToPar(handicap),
    summary,
    worstHoleNumbers: Array.from(byHole.entries())
      .map(([holeNumber, holes]) => ({
        holeNumber,
        averageVsExpectation: average(holes.map((hole) => hole.deltaToExpectation)) ?? 0,
        majorBlowUps: holes.filter((hole) => hole.classification === "major-blow-up").length,
        mildDamage: holes.filter((hole) => hole.classification === "mild-damage").length,
      }))
      .sort((a, b) => b.averageVsExpectation - a.averageVsExpectation)
      .slice(0, 6),
    backNineCollapses: rounds.filter((round) => round.front9Score !== null && round.back9Score !== null && round.back9Score - round.front9Score >= 4).length,
  };
}

export function buildHandicapTrendData(history: HandicapEntry[], rounds: HandicapRoundMetric[]) {
  const roundPoints = rounds.map((round, index) => ({
    date: round.date,
    label: round.shortDate,
    handicap: handicapForDate(history, round.date),
    grossAverage: average(rounds.slice(Math.max(0, index - 4), index + 1).map((round) => round.grossScore18)),
    performanceVsHandicap: round.performanceVsHandicap18,
    performanceTrend: average(rounds.slice(Math.max(0, index - 4), index + 1).map((round) => round.performanceVsHandicap18)),
  }));

  const historyPoints = normalizeHandicapHistory(history).map((entry) => ({
    date: entry.date,
    label: entry.date.slice(2),
    handicap: entry.hcp,
    grossAverage: null,
    performanceVsHandicap: null,
    performanceTrend: null,
  }));

  const byDate = new Map<string, (typeof roundPoints)[number]>();
  [...historyPoints, ...roundPoints].forEach((point) => {
    byDate.set(point.date, { ...(byDate.get(point.date) ?? point), ...point });
  });

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildSeasonTrendSummary(history: HandicapEntry[], selectedYear: string, forecast: HandicapForecast): HandicapTrendSummary {
  const normalized = normalizeHandicapHistory(history);
  const effective = buildEffectiveTrendEntries(normalized, selectedYear);
  const points: HandicapTrendSummary["points"] = effective.map((entry, index) => ({
    date: entry.date,
    label: selectedYear === "all" ? entry.date.slice(2) : entry.date.slice(5),
    handicap: entry.hcp,
    smoothedHandicap: average(effective.slice(Math.max(0, index - 2), index + 1).map((row) => row.hcp)),
  }));

  if (forecast.projectedHandicap !== null && effective.length) {
    points.push({
      date: forecast.seasonEndDate,
      label: selectedYear === "all" ? forecast.seasonEndDate.slice(2) : forecast.seasonEndDate.slice(5),
      handicap: forecast.projectedHandicap,
      smoothedHandicap: forecast.projectedHandicap,
      confidenceLow: forecast.confidenceLow,
      confidenceHigh: forecast.confidenceHigh,
      projected: forecast.projectedHandicap,
      optimistic: forecast.optimistic,
      conservative: forecast.conservative,
    });
  }

  const first = effective[0]?.hcp ?? null;
  const latest = effective.at(-1)?.hcp ?? null;
  return {
    year: selectedYear,
    points,
    startingHandicap: first,
    latestHandicap: latest,
    totalMovement: first !== null && latest !== null ? latest - first : null,
    monthlyRate: calculateMonthlyRate(effective),
  };
}

export function buildHandicapForecast(history: HandicapEntry[], rounds: HandicapRoundMetric[], selectedYear: string): HandicapForecast {
  const normalized = normalizeHandicapHistory(history);
  const scopedHistory = buildEffectiveTrendEntries(normalized, selectedYear);
  const seasonYear = selectedYear === "all" ? Number(todayIso().slice(0, 4)) : Number(selectedYear);
  const scopedRounds = rounds.filter((round) => selectedYear === "all" || round.date.startsWith(`${selectedYear}-`));
  const latest = scopedHistory.at(-1) ?? effectiveHandicapEntryForDate(normalized, todayIso());
  const seasonEndDate = `${seasonYear}-10-31`;
  const officialMonthlyRate = calculateMonthlyRate(scopedHistory);
  const recentPerformance = average(scopedRounds.slice(-6).map((round) => round.performanceVsHandicap18));
  const priorPerformance = average(scopedRounds.slice(-12, -6).map((round) => round.performanceVsHandicap18));
  const performanceMomentum = recentPerformance !== null && priorPerformance !== null ? recentPerformance - priorPerformance : 0;
  const scoringAdjustmentMonthly = recentPerformance === null ? 0 : clamp((-recentPerformance * 0.18) + (-performanceMomentum * 0.1), -1.2, 1.2);
  const blendedMonthlyRate = average([officialMonthlyRate, scoringAdjustmentMonthly]) ?? officialMonthlyRate ?? scoringAdjustmentMonthly;
  const monthsRemaining = latest ? Math.max(0, monthDiff(latest.date, seasonEndDate)) : 0;
  const projectedHandicap = latest && Number.isFinite(blendedMonthlyRate) ? roundHandicap(latest.hcp + blendedMonthlyRate * monthsRemaining) : null;
  const volatility = standardDeviation(scopedRounds.slice(-8).map((round) => round.performanceVsHandicap18));
  const confidenceWidth = roundHandicap(Math.max(0.4, (volatility ?? 1.8) * Math.sqrt(Math.max(monthsRemaining, 1)) * 0.18));

  return {
    projectedHandicap,
    optimistic: projectedHandicap === null ? null : roundHandicap(projectedHandicap - confidenceWidth),
    conservative: projectedHandicap === null ? null : roundHandicap(projectedHandicap + confidenceWidth),
    confidenceLow: projectedHandicap === null ? null : roundHandicap(projectedHandicap - confidenceWidth),
    confidenceHigh: projectedHandicap === null ? null : roundHandicap(projectedHandicap + confidenceWidth),
    monthlyRate: blendedMonthlyRate,
    officialMonthlyRate,
    scoringAdjustmentMonthly,
    confidence: scopedHistory.length >= 5 && scopedRounds.length >= 6 ? "high" : scopedHistory.length >= 3 && scopedRounds.length >= 3 ? "medium" : "low",
    seasonEndDate,
  };
}

export function buildHandicapInsights(rounds: HandicapRoundMetric[], analysis: HandicapBlowUpAnalysis, handicap: number, history: HandicapEntry[] = [], forecast?: HandicapForecast): string[] {
  const insights: string[] = [];
  const currentYear = new Date().getFullYear().toString();
  const yearEntries = buildEffectiveTrendEntries(normalizeHandicapHistory(history), currentYear);
  const seasonStart = yearEntries[0]?.hcp;
  const seasonLatest = yearEntries.at(-1)?.hcp;
  if (seasonStart !== undefined && seasonLatest !== undefined && Math.abs(seasonLatest - seasonStart) >= 0.05) {
    const delta = seasonLatest - seasonStart;
    insights.push(`Your handicap has ${delta <= 0 ? "dropped" : "risen"} ${formatNumber(Math.abs(delta), 1)} this season.`);
  }
  if (forecast?.projectedHandicap !== null && forecast?.projectedHandicap !== undefined) {
    insights.push(`Recent scoring suggests pace for reaching ${formatNumber(forecast.projectedHandicap, 1)} by season end.`);
  }
  const recent = average(rounds.slice(-5).map((round) => round.performanceVsHandicap18));
  const allTime = average(rounds.map((round) => round.performanceVsHandicap18));
  if (recent !== null) {
    insights.push(`Recent rounds are ${recent <= 0 ? "outperforming" : "trailing"} your ${formatNumber(handicap, 1)} handicap baseline by ${formatNumber(Math.abs(recent), 1)} strokes.`);
  }
  if (allTime !== null) {
    insights.push(`${rounds.filter((round) => (round.performanceVsHandicap18 ?? 0) < -0.5).length} rounds beat handicap expectation; ${rounds.filter((round) => (round.performanceVsHandicap18 ?? 0) > 0.5).length} finished above it.`);
  }
  if (forecast?.officialMonthlyRate !== null && forecast?.scoringAdjustmentMonthly !== null && forecast?.officialMonthlyRate !== undefined && forecast?.scoringAdjustmentMonthly !== undefined) {
    if (forecast.scoringAdjustmentMonthly < forecast.officialMonthlyRate - 0.15) {
      insights.push("Official handicap is falling slower than your Golf Pad scoring trend.");
    } else if (Math.abs(forecast.scoringAdjustmentMonthly) < 0.1 && recent !== null && Math.abs(recent) < 0.75) {
      insights.push("Recent rounds indicate stagnation.");
    }
  }

  const totals = analysis.summary;
  if (totals.totalHoles) {
    const stableRate = ((totals.stable + totals.outperforming) / totals.totalHoles) * 100;
    insights.push(`${formatNumber(stableRate, 0)}% of holes are stable or better against the current handicap model.`);
  }

  if (analysis.blowUpThresholdToPar >= 3) {
    insights.push(`${analysis.blowUpThresholdToPar === 3 ? "Triple bogeys" : "Quadruple bogeys"}, not doubles, are the true blow-up line at your current handicap.`);
  } else {
    insights.push("Double bogeys are the current blow-up line because the handicap baseline is below mid-handicap range.");
  }

  const worst = analysis.worstHoleNumbers[0];
  if (worst) {
    insights.push(`Hole ${worst.holeNumber} is leaking ${formatNumber(worst.averageVsExpectation, 1)} strokes versus handicap expectation on average.`);
  }

  return insights.slice(0, 5);
}

export function attachRoundHandicapContext(rounds: RawRound[], history: HandicapEntry[]): { rounds: RawRound[]; matchedRounds: number } {
  const normalized = normalizeHandicapHistory(history);
  let matchedRounds = 0;
  const next = rounds.map((round) => {
    const date = round.round_metadata?.date;
    if (!date) return round;
    const officialMatch = findOfficialMatch(round, normalized);
    const hcpEntry = [...normalized].reverse().find((entry) => entry.date <= date);
    if (officialMatch.context.match_confidence !== "none") matchedRounds += 1;
    return {
      ...round,
      round_handicap_context: {
        handicap_at_round: hcpEntry?.hcp ?? DEFAULT_HANDICAP,
        handicap_source: hcpEntry?.source ?? "default" as const,
        nearest_official_record_date: officialMatch.context.nearest_official_record_date,
        nearest_official_handicap: officialMatch.context.nearest_official_handicap,
        matched_official_record_id: officialMatch.context.matched_official_record_id,
        match_confidence: officialMatch.context.match_confidence,
        match_notes: officialMatch.context.match_notes,
      },
    };
  });

  return { rounds: next, matchedRounds };
}

export function expectedOverParForHole(hole: Pick<NormalizedHole, "hole_number" | "hole_par">, handicap: number): number {
  const perHole = clamp(handicap, 0, 54) / 18;
  const parWeight = hole.hole_par <= 3 ? 0.85 : hole.hole_par >= 5 ? 1.12 : 1;
  const indexWeight = 1.08 - Math.min(Math.max(hole.hole_number - 1, 0), 17) * 0.01;
  return perHole * parWeight * indexWeight;
}

export function blowUpThresholdToPar(handicap: number): number {
  if (handicap < 10) return 2;
  if (handicap < 24) return 3;
  return 4;
}

function evaluateHole(hole: NormalizedHole, handicap: number): HandicapHoleEvaluation {
  const toPar = num(hole.hole_score_to_par) ?? hole.total_strokes - hole.hole_par;
  const expectedOverPar = expectedOverParForHole(hole, handicap);
  const deltaToExpectation = toPar - expectedOverPar;
  const threshold = blowUpThresholdToPar(handicap);
  const classification: HoleExpectationClass =
    deltaToExpectation <= -0.65
      ? "better"
      : deltaToExpectation <= 0.75
        ? "stable"
        : toPar >= threshold || deltaToExpectation >= 1.75
          ? "major-blow-up"
          : "mild-damage";

  return {
    holeNumber: hole.hole_number,
    par: hole.hole_par,
    strokes: hole.total_strokes,
    toPar,
    expectedOverPar,
    expectedStrokes: hole.hole_par + expectedOverPar,
    deltaToExpectation,
    classification,
  };
}

function calculateRoundPerformanceVsHandicap18(round: RoundMetric, handicap: number) {
  const holeEvaluations = round.holes.map((hole) => evaluateHole(hole, handicap));
  if (!holeEvaluations.length || round.grossScore === null) return null;
  const expectedScore = holeEvaluations.reduce((total, hole) => total + hole.expectedStrokes, 0);
  return scaleTo18(round.grossScore - expectedScore, round.normalizationFactor);
}

function handicapForDate(history: HandicapEntry[], date: string) {
  const normalized = normalizeHandicapHistory(history);
  return [...normalized].reverse().find((entry) => entry.date <= date)?.hcp ?? normalized[0]?.hcp ?? DEFAULT_HANDICAP;
}

function handicapForRound(round: RoundMetric, fallbackHandicap: number) {
  const value = round.raw.round_handicap_context?.handicap_at_round;
  return typeof value === "number" && Number.isFinite(value) ? value : fallbackHandicap;
}

function scaleTo18(value: number | null, normalizationFactor: number) {
  return value === null ? null : value * normalizationFactor;
}

function roundHandicap(value: number) {
  return Math.round(clamp(value, 0, 54) * 10) / 10;
}

function normalizeDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayIso();
}

function buildHandicapRecordId(entry: Pick<HandicapEntry, "date" | "source" | "hcp" | "club" | "courseName" | "adjustedGrossScore">) {
  return `${entry.source ?? "manual"}-${entry.date}-${entry.hcp}-${slug(entry.club)}-${slug(entry.courseName)}-${entry.adjustedGrossScore ?? ""}`;
}

function sourcePriority(source: HandicapEntry["source"]) {
  return source === "manual" ? 0 : 1;
}

function collapseUnchangedHandicapEntries(entries: HandicapEntry[]) {
  const collapsed: HandicapEntry[] = [];

  entries.forEach((entry) => {
    const previous = collapsed.at(-1);
    if (!previous) {
      collapsed.push(entry);
      return;
    }

    if (Math.abs(previous.hcp - entry.hcp) >= 0.05) {
      collapsed.push(entry);
      return;
    }

    if (entry.source === "min-golf" && previous.source === "manual" && previous.date === entry.date) {
      collapsed[collapsed.length - 1] = entry;
    }
  });

  return collapsed;
}

function findOfficialMatch(round: RawRound, history: HandicapEntry[]): { context: RoundHandicapContext } {
  const date = round.round_metadata?.date ?? "";
  const gross = num(round.score_summary?.gross_score);
  const course = `${round.round_metadata?.course_name ?? ""} ${round.round_metadata?.tee_name ?? ""}`.toLowerCase();
  const official = history.filter((entry) => entry.source === "min-golf" && entry.date <= date).sort((a, b) => b.date.localeCompare(a.date));
  const nearest = official[0];
  let best = official.find((entry) => entry.date === date && (gross === null || entry.adjustedGrossScore === null || Math.abs((entry.adjustedGrossScore ?? 0) - gross) <= 1));
  let confidence: RoundHandicapContext["match_confidence"] = best ? "exact" : "none";
  const notes: string[] = [];

  if (!best) {
    best = official.find((entry) => entry.date === date);
    if (best) confidence = "date";
  }

  if (!best) {
    best = official.find((entry) => Math.abs(daysBetween(entry.date, date)) <= 2 && (!entry.courseName || course.includes(entry.courseName.toLowerCase().split(" ")[0] ?? "")));
    if (best) confidence = "near-date";
  }

  if (best?.adjustedGrossScore !== null && best?.adjustedGrossScore !== undefined && gross !== null) notes.push(`gross ${gross} vs official adjusted gross ${best.adjustedGrossScore}`);
  if (best?.courseName) notes.push(`official course ${best.courseName}`);

  return {
    context: {
      handicap_at_round: null,
      handicap_source: null,
      nearest_official_record_date: nearest?.date ?? null,
      nearest_official_handicap: nearest?.hcp ?? null,
      matched_official_record_id: best?.recordId ?? null,
      match_confidence: confidence,
      match_notes: notes,
    },
  };
}

function calculateMonthlyRate(entries: HandicapEntry[]) {
  if (entries.length < 2) return null;
  const first = entries[0];
  const last = entries.at(-1);
  if (!last) return null;
  const months = Math.max(monthDiff(first.date, last.date), 0.25);
  return (last.hcp - first.hcp) / months;
}

function buildEffectiveTrendEntries(history: HandicapEntry[], selectedYear: string): HandicapEntry[] {
  if (!history.length) return [];
  const today = todayIso();

  if (selectedYear === "all") {
    const entries = [...history];
    const latest = entries.at(-1);
    if (latest && latest.date < today) {
      entries.push({ ...latest, date: today, recordId: `effective-current-${today}` });
    }
    return entries;
  }

  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = selectedYear === today.slice(0, 4) ? today : `${selectedYear}-12-31`;
  const entries = history.filter((entry) => entry.date >= yearStart && entry.date <= yearEnd);
  const startingEntry = effectiveHandicapEntryForDate(history, yearStart);
  const endingEntry = effectiveHandicapEntryForDate(history, yearEnd);

  const effective = [...entries];
  if (startingEntry && !effective.some((entry) => entry.date === yearStart)) {
    effective.unshift({ ...startingEntry, date: yearStart, recordId: `effective-start-${yearStart}` });
  }
  if (endingEntry && !effective.some((entry) => entry.date === yearEnd)) {
    effective.push({ ...endingEntry, date: yearEnd, recordId: `effective-end-${yearEnd}` });
  }

  return effective.sort((a, b) => a.date.localeCompare(b.date));
}

function effectiveHandicapEntryForDate(history: HandicapEntry[], date: string): HandicapEntry | null {
  return [...history].reverse().find((entry) => entry.date <= date) ?? history[0] ?? null;
}

function monthDiff(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

function daysBetween(a: string, b: string) {
  return (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24);
}

function standardDeviation(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length < 2) return null;
  const avg = valid.reduce((total, value) => total + value, 0) / valid.length;
  return Math.sqrt(valid.reduce((total, value) => total + (value - avg) ** 2, 0) / valid.length);
}

function slug(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
