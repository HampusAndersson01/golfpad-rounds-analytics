export type RawShot = {
  shot_number?: number | null;
  lie?: string | null;
  club?: string | null;
  club_details?: string | null;
  shot_length?: number | null;
  target_distance_before?: number | null;
  target_distance_after?: number | null;
  outcome?: string | null;
  included_in_distance_stats?: boolean | null;
  strokes_gained?: number | null;
  fairway_center_offset?: number | null;
  time?: string | null;
};

export type RawHole = {
  hole_number?: number | null;
  hole_par?: number | null;
  stroke_index?: number | null;
  handicap_stroke_index?: number | null;
  hole_handicap?: number | null;
  total_strokes?: number | null;
  putts?: number | null;
  penalties?: number | null;
  sand_shots?: number | null;
  fairway_result?: string | null;
  gir?: boolean | null;
  hole_score_to_par?: number | null;
  shots?: RawShot[] | null;
};

export type StablefordClass = "zero" | "damage" | "stable" | "gained" | "exceptional";

export type StablefordHoleResult = {
  holeNumber: number;
  par: number;
  gross: number;
  strokeIndex: number | null;
  strokeIndexSource: "import" | "manual" | "fallback";
  handicapStrokes: number;
  netScore: number;
  points: number;
  classification: StablefordClass;
};

export type ManualStrokeIndexConfig = {
  courseName: string;
  teeName: string;
  strokeIndexes: number[];
  updatedAt?: string;
};

export type NormalizedHole = Omit<RawHole, "hole_number" | "hole_par" | "stroke_index" | "handicap_stroke_index" | "hole_handicap" | "total_strokes" | "putts" | "penalties" | "sand_shots" | "hole_score_to_par"> & {
  hole_number: number;
  hole_par: number;
  stroke_index: number | null;
  total_strokes: number;
  putts: number | null;
  penalties: number | null;
  sand_shots: number | null;
  hole_score_to_par: number | null;
};

export type RawRound = {
  round_metadata?: {
    round_id?: string | null;
    player_name?: string | null;
    date?: string | null;
    start_time?: string | null;
    finish_time?: string | null;
    course_name?: string | null;
    course_holes?: number | null;
    tee_name?: string | null;
    rating?: number | null;
    slope?: number | null;
    course_handicap?: number | null;
    scoring_format?: string | null;
    completed_holes?: number | null;
  };
  score_summary?: {
    gross_score?: number | null;
    gross_score_over_par?: number | null;
    net_score_or_points?: number | null;
    putts?: number | null;
    penalties?: number | null;
    girs?: number | null;
    fairways?: number | null;
    sand_shots?: number | null;
  };
  holes?: RawHole[] | null;
  club_usage_summary?: Record<string, unknown>;
  stableford_total?: number | null;
  stableford_per_hole?: StablefordHoleResult[];
  derived_ai_metrics?: Record<string, number | null | undefined>;
  round_handicap_context?: {
    handicap_at_round: number | null;
    handicap_source: "manual" | "min-golf" | "default" | null;
    official_stableford_points?: number | null;
    official_playing_handicap?: number | null;
    official_holes_played?: number | null;
    nearest_official_record_date: string | null;
    nearest_official_handicap: number | null;
    matched_official_record_id: string | null;
    match_confidence: "exact" | "date" | "near-date" | "none";
    match_notes: string[];
  };
  raw_source_rows?: unknown[];
};

export type RoundMetric = {
  id: string;
  path: string;
  playerName: string;
  date: string;
  dateLabel: string;
  shortDate: string;
  courseName: string;
  teeName: string;
  completedHoles: number;
  normalizationFactor: number;
  grossScore: number | null;
  grossScore18: number | null;
  grossOverPar: number | null;
  grossOverPar18: number | null;
  stablefordTotal: number | null;
  stablefordTotal18: number | null;
  stablefordPerHole: StablefordHoleResult[];
  stablefordExpectation18: number;
  stablefordVsExpectation18: number | null;
  stablefordMovingAverage5?: number | null;
  stablefordMovingAverage10?: number | null;
  stablefordConsistency: number | null;
  averagePointsPerHole: number | null;
  scoringHolePct: number | null;
  stableHolePct: number | null;
  zeroPointHoles: number;
  zeroPointHoles18: number;
  onePointHoles: number;
  onePointHoles18: number;
  twoPointHoles: number;
  twoPointHoles18: number;
  gainedHoles: number;
  gainedHoles18: number;
  exceptionalHoles: number;
  noZeroPointRound: boolean;
  highScoringMomentum: boolean;
  front9Stableford: number | null;
  back9Stableford: number | null;
  putts: number | null;
  putts18: number | null;
  penalties: number | null;
  penalties18: number | null;
  girPct: number | null;
  firPct: number | null;
  sandShots: number | null;
  sandShots18: number | null;
  averageStrokesGained: number | null;
  front9Score: number | null;
  back9Score: number | null;
  front9Putts: number | null;
  back9Putts: number | null;
  doubleBogeyPlus: number;
  doubleBogeyPlus18: number;
  penaltyHoles: number;
  penaltyHoles18: number;
  holes: NormalizedHole[];
  shots: RawShot[];
  raw: RawRound;
};

export type ClubMetric = {
  club: string;
  uses: number;
  avgLength: number | null;
  avgStrokesGained: number | null;
  badOutcomeRate: number;
  penalties: number;
  roughOrSand: number;
  confidenceScore: number | null;
};

export type ClubTrendPoint = {
  club: string;
  roundId: string;
  date: string;
  shortDate: string;
  courseName: string;
  shots: number;
  avgLength: number | null;
  avgStrokesGained: number | null;
  badOutcomeRate: number | null;
};

export type ClubTrend = {
  club: string;
  uses: number;
  points: ClubTrendPoint[];
};

export function detectSchema(rawRounds: RawRound[]) {
  const keys = {
    topLevelKeys: new Set<string>(),
    metadataKeys: new Set<string>(),
    scoreKeys: new Set<string>(),
    holeKeys: new Set<string>(),
    shotKeys: new Set<string>(),
    derivedKeys: new Set<string>(),
    clubSummaryKeys: new Set<string>(),
  };

  rawRounds.forEach((round) => {
    Object.keys(round ?? {}).forEach((key) => keys.topLevelKeys.add(key));
    Object.keys(round.round_metadata ?? {}).forEach((key) => keys.metadataKeys.add(key));
    Object.keys(round.score_summary ?? {}).forEach((key) => keys.scoreKeys.add(key));
    Object.keys(round.derived_ai_metrics ?? {}).forEach((key) => keys.derivedKeys.add(key));
    Object.keys(round.club_usage_summary ?? {}).forEach((key) => keys.clubSummaryKeys.add(key));
    round.holes?.forEach((hole) => {
      Object.keys(hole ?? {}).forEach((key) => keys.holeKeys.add(key));
      hole.shots?.forEach((shot) => Object.keys(shot ?? {}).forEach((key) => keys.shotKeys.add(key)));
    });
  });

  return Object.fromEntries(
    Object.entries(keys).map(([key, value]) => [key, Array.from(value).sort()]),
  ) as Record<keyof typeof keys, string[]>;
}

export function buildRoundMetrics(entries: Array<{ path: string; data: unknown }>, strokeIndexConfigs: ManualStrokeIndexConfig[] = []): RoundMetric[] {
  const normalized = entries
    .map(({ path, data }) => normalizeRound(path, data as RawRound, strokeIndexConfigs))
    .filter((round): round is RoundMetric => Boolean(round))
    .sort((a, b) => `${a.date}-${a.path}`.localeCompare(`${b.date}-${b.path}`));

  return normalized.map((round, index) => ({
    ...round,
    stablefordMovingAverage5: movingAverage(normalized, index, 5, "stablefordTotal18"),
    stablefordMovingAverage10: movingAverage(normalized, index, 10, "stablefordTotal18"),
  }));
}

export function recalculateStablefordForRounds(rawRounds: RawRound[], strokeIndexConfigs: ManualStrokeIndexConfig[] = [], fallbackHandicap = 28.8): RawRound[] {
  return rawRounds.map((round) => {
    const holes = normalizeHoles(round.holes ?? []);
    const stableford = calculateStableford(round, holes, strokeIndexConfigs, fallbackHandicap);
    return {
      ...round,
      stableford_total: stableford.total,
      stableford_per_hole: stableford.perHole,
    };
  });
}

export function strokeIndexConfigKey(courseName: string | null | undefined, teeName: string | null | undefined) {
  return `${slug(courseName)}__${slug(teeName)}`;
}

function normalizeRound(path: string, raw: RawRound, strokeIndexConfigs: ManualStrokeIndexConfig[] = []): RoundMetric | null {
  const metadata = raw.round_metadata ?? {};
  const summary = raw.score_summary ?? {};
  const date = metadata.date ?? path.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (!date) return null;

  const holes = normalizeHoles(raw.holes ?? []);
  const shots = holes.flatMap((hole) => hole.shots ?? []);
  const derived = raw.derived_ai_metrics ?? {};
  const playableFairways = holes.filter((hole) => hole.hole_par > 3);
  const fairwaysHit = playableFairways.filter((hole) => String(hole.fairway_result ?? "").toLowerCase() === "fairway").length;
  const girs = holes.filter((hole) => hole.gir === true).length;
  const completedHoles = num(metadata.completed_holes) ?? holes.length;
  const normalizationFactor = completedHoles > 0 && completedHoles < 18 ? 18 / completedHoles : 1;
  const grossScore = num(summary.gross_score) ?? sum(holes.map((hole) => hole.total_strokes));
  const totalPar = sum(holes.map((hole) => hole.hole_par));
  const grossOverPar = num(summary.gross_score_over_par) ?? (grossScore !== null ? grossScore - totalPar : null);
  const stableford = raw.stableford_per_hole?.length
    ? { total: officialStablefordTotal(raw) ?? num(raw.stableford_total), perHole: raw.stableford_per_hole }
    : calculateStableford(raw, holes, strokeIndexConfigs);
  const stablefordTotal = stableford.total ?? sumNullable(stableford.perHole.map((hole) => hole.points));
  const stablefordTotal18 = scaleTo18(stablefordTotal, normalizationFactor);
  const zeroPointHoles = stableford.perHole.filter((hole) => hole.points === 0).length;
  const onePointHoles = stableford.perHole.filter((hole) => hole.points === 1).length;
  const twoPointHoles = stableford.perHole.filter((hole) => hole.points === 2).length;
  const gainedHoles = stableford.perHole.filter((hole) => hole.points >= 3).length;
  const exceptionalHoles = stableford.perHole.filter((hole) => hole.points >= 4).length;
  const scoringHoles = stableford.perHole.filter((hole) => hole.points >= 1).length;
  const stableOrBetterHoles = stableford.perHole.filter((hole) => hole.points >= 2).length;
  const front9Stableford = sumNullable(stableford.perHole.filter((hole) => hole.holeNumber <= 9).map((hole) => hole.points));
  const back9Stableford = sumNullable(stableford.perHole.filter((hole) => hole.holeNumber > 9).map((hole) => hole.points));
  const pointsStdDev = standardDeviation(stableford.perHole.map((hole) => hole.points));
  const putts = num(summary.putts) ?? sumNullable(holes.map((hole) => num(hole.putts)));
  const penalties = num(summary.penalties) ?? sumNullable(holes.map((hole) => num(hole.penalties)));
  const sandShots = num(summary.sand_shots) ?? sumNullable(holes.map((hole) => num(hole.sand_shots)));
  const doubleBogeyPlus = holes.filter((hole) => (num(hole.hole_score_to_par) ?? hole.total_strokes - hole.hole_par) >= 2).length;
  const penaltyHoles = holes.filter((hole) => (num(hole.penalties) ?? 0) > 0).length;

  return {
    id: metadata.round_id ?? path,
    path,
    playerName: metadata.player_name ?? "Unknown player",
    date,
    dateLabel: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`)),
    shortDate: date.slice(2),
    courseName: metadata.course_name ?? "Unknown course",
    teeName: metadata.tee_name ?? "Unknown tee",
    completedHoles,
    normalizationFactor,
    grossScore,
    grossScore18: scaleTo18(grossScore, normalizationFactor),
    grossOverPar,
    grossOverPar18: scaleTo18(grossOverPar, normalizationFactor),
    stablefordTotal,
    stablefordTotal18,
    stablefordPerHole: stableford.perHole,
    stablefordExpectation18: 36,
    stablefordVsExpectation18: stablefordTotal18 === null ? null : stablefordTotal18 - 36,
    stablefordConsistency: pointsStdDev === null ? null : Math.max(0, 100 - pointsStdDev * 28),
    averagePointsPerHole: average(stableford.perHole.map((hole) => hole.points)),
    scoringHolePct: percent(scoringHoles, stableford.perHole.length),
    stableHolePct: percent(stableOrBetterHoles, stableford.perHole.length),
    zeroPointHoles,
    zeroPointHoles18: zeroPointHoles * normalizationFactor,
    onePointHoles,
    onePointHoles18: onePointHoles * normalizationFactor,
    twoPointHoles,
    twoPointHoles18: twoPointHoles * normalizationFactor,
    gainedHoles,
    gainedHoles18: gainedHoles * normalizationFactor,
    exceptionalHoles,
    noZeroPointRound: stableford.perHole.length > 0 && zeroPointHoles === 0,
    highScoringMomentum: stableford.perHole.slice(-6).reduce((total, hole) => total + hole.points, 0) >= 14,
    front9Stableford,
    back9Stableford,
    putts,
    putts18: scaleTo18(putts, normalizationFactor),
    penalties,
    penalties18: scaleTo18(penalties, normalizationFactor),
    girPct: num(derived.gir_percentage) ?? percent(num(summary.girs) ?? girs, holes.length),
    firPct: num(derived.fairway_percentage) ?? percent(num(summary.fairways) ?? fairwaysHit, playableFairways.length),
    sandShots,
    sandShots18: scaleTo18(sandShots, normalizationFactor),
    averageStrokesGained: num(derived.average_strokes_gained) ?? average(shots.map((shot) => num(shot.strokes_gained))),
    front9Score: num(derived.front9_score) ?? sumNullable(holes.filter((hole) => hole.hole_number <= 9).map((hole) => hole.total_strokes)),
    back9Score: num(derived.back9_score) ?? sumNullable(holes.filter((hole) => hole.hole_number > 9).map((hole) => hole.total_strokes)),
    front9Putts: num(derived.front9_putts) ?? sumNullable(holes.filter((hole) => hole.hole_number <= 9).map((hole) => num(hole.putts))),
    back9Putts: num(derived.back9_putts) ?? sumNullable(holes.filter((hole) => hole.hole_number > 9).map((hole) => num(hole.putts))),
    doubleBogeyPlus,
    doubleBogeyPlus18: doubleBogeyPlus * normalizationFactor,
    penaltyHoles,
    penaltyHoles18: penaltyHoles * normalizationFactor,
    holes,
    shots,
    raw,
  };
}

export function getOverviewStats(rounds: RoundMetric[]) {
  const stablefordRounds = rounds.filter((round) => round.stablefordTotal18 !== null);
  const sortedByStableford = [...stablefordRounds].sort((a, b) => (b.stablefordTotal18 ?? -Infinity) - (a.stablefordTotal18 ?? -Infinity));
  return {
    totalRounds: rounds.length,
    normalizedRounds: rounds.filter((round) => round.normalizationFactor !== 1).length,
    averageStableford: average(rounds.map((round) => round.stablefordTotal18)),
    bestStableford: sortedByStableford[0]?.stablefordTotal18 ?? null,
    bestStablefordRound: sortedByStableford[0],
    stablefordTrend: average(rounds.slice(-5).map((round) => round.stablefordTotal18)),
    stablefordVsExpectation: average(rounds.map((round) => round.stablefordVsExpectation18)),
    stableHolePct: average(rounds.map((round) => round.stableHolePct)),
    zeroPointFrequency: average(rounds.map((round) => round.zeroPointHoles18)),
    noZeroPointRounds: rounds.filter((round) => round.noZeroPointRound).length,
    averageGross: average(rounds.map((round) => round.grossScore18)),
    averagePutts: average(rounds.map((round) => round.putts18)),
    averageGirPct: average(rounds.map((round) => round.girPct)),
    averageFirPct: average(rounds.map((round) => round.firPct)),
    averagePenalties: average(rounds.map((round) => round.penalties18)),
  };
}

export function movingAverage(rounds: RoundMetric[], index: number, windowSize: number, key: keyof RoundMetric): number | null {
  return average(rounds.slice(Math.max(0, index - windowSize + 1), index + 1).map((round) => num(round[key])));
}

export function compareRecentForm(rounds: RoundMetric[]) {
  const configs = [
    { metric: "Stableford points / 18", key: "stablefordTotal18" as const, lowerBetter: false },
    { metric: "Stable holes %", key: "stableHolePct" as const, lowerBetter: false },
    { metric: "Zero-point holes / 18", key: "zeroPointHoles18" as const, lowerBetter: true },
    { metric: "Putts / 18", key: "putts18" as const, lowerBetter: true },
    { metric: "Penalties / 18", key: "penalties18" as const, lowerBetter: true },
    { metric: "GIR %", key: "girPct" as const, lowerBetter: false },
    { metric: "FIR %", key: "firPct" as const, lowerBetter: false },
    { metric: "Avg strokes gained", key: "averageStrokesGained" as const, lowerBetter: false },
  ];

  return configs.map((config) => {
    const last5 = average(rounds.slice(-5).map((round) => num(round[config.key])));
    const last10 = average(rounds.slice(-10).map((round) => num(round[config.key])));
    const allTime = average(rounds.map((round) => num(round[config.key])));
    const delta = last5 !== null && allTime !== null ? last5 - allTime : 0;
    const threshold = config.metric.includes("%") ? 2 : 0.5;
    const improving = config.lowerBetter ? delta < -threshold : delta > threshold;
    const declining = config.lowerBetter ? delta > threshold : delta < -threshold;
    return {
      metric: config.metric,
      last5,
      last10,
      allTime,
      direction: improving ? "improving" : declining ? "declining" : "flat",
    };
  });
}

export function aggregateClubPerformance(rounds: RoundMetric[]): ClubMetric[] {
  const map = new Map<string, RawShot[]>();
  rounds.flatMap((round) => round.shots).forEach((shot) => {
    const club = canonicalizeClubName(shot.club);
    if (!club) return;
    map.set(club, [...(map.get(club) ?? []), shot]);
  });

  return Array.from(map.entries())
    .map(([club, shots]) => {
      const penaltyShots = shots.filter((shot) => shot.outcome === "Penalty").length;
      const roughOrSand = shots.filter((shot) => shot.outcome === "Rough" || shot.outcome === "Sand" || shot.outcome === "Recovery").length;
      const bad = penaltyShots + roughOrSand;
      const avgStrokesGained = average(shots.map((shot) => num(shot.strokes_gained)));
      return {
        club,
        uses: shots.length,
        avgLength: average(shots.filter((shot) => shot.included_in_distance_stats !== false).map((shot) => num(shot.shot_length))),
        avgStrokesGained,
        badOutcomeRate: shots.length ? (bad / shots.length) * 100 : 0,
        penalties: penaltyShots,
        roughOrSand,
        confidenceScore: average([shotScore(shots.length, 16), invertRate(badOutcomesRate(bad, shots.length)), avgStrokesGained === null ? null : clamp((avgStrokesGained + 1) * 50, 0, 100)]),
      };
    })
    .sort((a, b) => b.uses - a.uses);
}

export function aggregateClubTrends(rounds: RoundMetric[]): ClubTrend[] {
  const byClub = new Map<string, ClubTrendPoint[]>();

  rounds.forEach((round) => {
    const roundShots = new Map<string, RawShot[]>();
    round.shots.forEach((shot) => {
      const club = canonicalizeClubName(shot.club);
      if (!club) return;
      roundShots.set(club, [...(roundShots.get(club) ?? []), shot]);
    });

    roundShots.forEach((shots, club) => {
      const badOutcomes = shots.filter((shot) => shot.outcome === "Penalty" || shot.outcome === "Rough" || shot.outcome === "Sand" || shot.outcome === "Recovery").length;
      byClub.set(club, [
        ...(byClub.get(club) ?? []),
        {
          club,
          roundId: round.id,
          date: round.date,
          shortDate: round.shortDate,
          courseName: round.courseName,
          shots: shots.length,
          avgLength: average(shots.filter((shot) => shot.included_in_distance_stats !== false).map((shot) => num(shot.shot_length))),
          avgStrokesGained: average(shots.map((shot) => num(shot.strokes_gained))),
          badOutcomeRate: shots.length ? (badOutcomes / shots.length) * 100 : null,
        },
      ]);
    });
  });

  return Array.from(byClub.entries())
    .map(([club, points]) => ({
      club,
      uses: points.reduce((total, point) => total + point.shots, 0),
      points: points.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.uses - a.uses);
}

export function canonicalizeClubName(club: string | null | undefined): string | null {
  if (!club?.trim()) return null;

  const cleaned = club
    .trim()
    .replace(/Â°/g, "°")
    .replace(/\s+/g, " ");
  const lower = cleaned.toLowerCase();

  if (lower === "pt" || lower === "putter") return "Pt";
  if (lower === "d" || lower === "dr" || lower === "driver") return "D";
  if (lower === "pw" || lower === "pitching wedge") return "PW";

  const loftMatch = lower.match(/^(\d{2})\s*(?:°|deg|degree|degrees)?(?:\s*wedge)?$/);
  if (loftMatch) return `${loftMatch[1]}°`;

  const ironMatch = lower.match(/^([2-9])\s*(?:i|iron)$/);
  if (ironMatch) return `${ironMatch[1]}i`;

  const woodMatch = lower.match(/^([3-7])\s*(?:w|wood)$/);
  if (woodMatch) return `${woodMatch[1]}w`;

  const hybridMatch = lower.match(/^([2-7])\s*(?:h|hybrid)$/);
  if (hybridMatch) return `${hybridMatch[1]}h`;

  return cleaned;
}

export function buildStablefordDamageAnalysis(rounds: RoundMetric[]) {
  const byHole = new Map<number, StablefordHoleResult[]>();
  const byPar = new Map<number, StablefordHoleResult[]>();
  const penaltyZeroHoles = new Map<string, number>();
  rounds.forEach((round) => {
    round.stablefordPerHole.forEach((hole) => {
      byHole.set(hole.holeNumber, [...(byHole.get(hole.holeNumber) ?? []), hole]);
      byPar.set(hole.par, [...(byPar.get(hole.par) ?? []), hole]);
      const rawHole = round.holes.find((row) => row.hole_number === hole.holeNumber);
      if (hole.points === 0) {
        const cause = (rawHole?.penalties ?? 0) > 0 ? "Penalty strokes" : (rawHole?.putts ?? 0) >= 3 ? "Three-putt or worse" : rawHole?.gir === false ? "Missed GIR recovery" : "High gross score";
        penaltyZeroHoles.set(cause, (penaltyZeroHoles.get(cause) ?? 0) + 1);
      }
    });
  });

  return {
    summary: {
      totalHoles: rounds.reduce((total, round) => total + round.stablefordPerHole.length, 0),
      zeroPointHoles: rounds.reduce((total, round) => total + round.zeroPointHoles, 0),
      onePointHoles: rounds.reduce((total, round) => total + round.onePointHoles, 0),
      twoPointHoles: rounds.reduce((total, round) => total + round.twoPointHoles, 0),
      gainedHoles: rounds.reduce((total, round) => total + round.gainedHoles, 0),
      roundsWithoutZeroes: rounds.filter((round) => round.noZeroPointRound).length,
      averagePointsPerHole: average(rounds.map((round) => round.averagePointsPerHole)),
      scoringHolePct: average(rounds.map((round) => round.scoringHolePct)),
      stableHolePct: average(rounds.map((round) => round.stableHolePct)),
      highScoringMomentumRounds: rounds.filter((round) => round.highScoringMomentum).length,
    },
    byHoleNumber: Array.from(byHole.entries()).map(([holeNumber, holes]) => ({
      holeNumber,
      zeroRate: percent(holes.filter((hole) => hole.points === 0).length, holes.length) ?? 0,
      averagePoints: average(holes.map((hole) => hole.points)) ?? 0,
    })).sort((a, b) => b.zeroRate - a.zeroRate),
    byPar: Array.from(byPar.entries()).map(([par, holes]) => ({
      par,
      zeroRate: percent(holes.filter((hole) => hole.points === 0).length, holes.length) ?? 0,
      averagePoints: average(holes.map((hole) => hole.points)) ?? 0,
    })).sort((a, b) => a.par - b.par),
    recurringZeroCauses: Array.from(penaltyZeroHoles.entries()).map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count),
    frontBackGap: average(rounds.map((round) => round.front9Stableford !== null && round.back9Stableford !== null ? round.back9Stableford - round.front9Stableford : null)),
    practiceLeak: buildPracticeLeak(rounds),
  };
}

export function buildInsights(rounds: RoundMetric[], clubs: ClubMetric[], blowUps: ReturnType<typeof buildStablefordDamageAnalysis>) {
  const insights: string[] = [];
  const last10 = rounds.slice(-10);
  const prev10 = rounds.slice(-20, -10);
  const recentPoints = average(last10.map((round) => round.stablefordTotal18));
  const previousPoints = average(prev10.map((round) => round.stablefordTotal18));
  if (recentPoints !== null) {
    insights.push(`You are averaging ${formatNumber(recentPoints, 1)} Stableford points over the last 10 rounds.`);
  }
  if (recentPoints !== null && previousPoints !== null) {
    const diff = recentPoints - previousPoints;
    insights.push(`Stableford scoring ${diff >= 0 ? "improved" : "declined"} by ${formatNumber(Math.abs(diff), 1)} points versus the previous 10 rounds.`);
  }

  const penaltyRecent = average(rounds.slice(-5).map((round) => round.penalties18));
  const penaltyLong = average(rounds.map((round) => round.penalties18));
  if (penaltyRecent !== null && penaltyLong !== null) {
    insights.push(`Penalties are ${penaltyRecent <= penaltyLong ? "trending downward" : "running above baseline"}: ${formatNumber(penaltyRecent, 1)} recently vs ${formatNumber(penaltyLong, 1)} all time per 18.`);
  }

  const puttRecent = average(rounds.slice(-5).map((round) => round.putts18));
  const puttLong = average(rounds.map((round) => round.putts18));
  if (puttRecent !== null && puttLong !== null) {
    insights.push(`Putting is ${puttRecent <= puttLong ? "saving strokes recently" : "worsening recently"}: ${formatNumber(puttRecent, 1)} vs ${formatNumber(puttLong, 1)} putts per 18.`);
  }

  const bestClub = [...clubs].filter((club) => club.uses >= 5 && club.avgStrokesGained !== null).sort((a, b) => (b.avgStrokesGained ?? -99) - (a.avgStrokesGained ?? -99))[0];
  if (bestClub) insights.push(`${bestClub.club} has the strongest recorded club confidence among clubs with 5+ shots.`);

  if (blowUps.summary.totalHoles) {
    insights.push(`Zero-point holes are running at ${formatNumber((blowUps.summary.zeroPointHoles / blowUps.summary.totalHoles) * 100, 0)}% of played holes.`);
  }

  if (blowUps.byHoleNumber[0]) {
    insights.push(`Hole ${blowUps.byHoleNumber[0].holeNumber} is the main zero-point leak at ${formatNumber(blowUps.byHoleNumber[0].zeroRate, 0)}% zeroes.`);
  }

  return insights.slice(0, 5);
}

function normalizeHoles(holes: RawHole[]): NormalizedHole[] {
  return holes
    .filter((hole) => num(hole.hole_number) !== null && num(hole.hole_par) !== null && num(hole.total_strokes) !== null)
    .map((hole) => ({
      ...hole,
      hole_number: num(hole.hole_number) ?? 0,
      hole_par: num(hole.hole_par) ?? 0,
      stroke_index: firstNumber(hole.stroke_index, hole.handicap_stroke_index, hole.hole_handicap),
      total_strokes: num(hole.total_strokes) ?? 0,
      putts: num(hole.putts),
      penalties: num(hole.penalties),
      sand_shots: num(hole.sand_shots),
      hole_score_to_par: num(hole.hole_score_to_par),
    }));
}

function calculateStableford(raw: RawRound, holes: NormalizedHole[], strokeIndexConfigs: ManualStrokeIndexConfig[] = [], fallbackHandicap = 28.8) {
  const config = strokeIndexConfigs.find((row) => strokeIndexConfigKey(row.courseName, row.teeName) === strokeIndexConfigKey(raw.round_metadata?.course_name, raw.round_metadata?.tee_name));
  const officialTotal = officialStablefordTotal(raw);
  const handicap = Math.round(firstNumber(raw.round_handicap_context?.official_playing_handicap, raw.round_metadata?.course_handicap, raw.round_handicap_context?.handicap_at_round, fallbackHandicap) ?? fallbackHandicap);
  const perHole = holes.map((hole) => {
    const importedIndex = firstNumber(hole.stroke_index);
    const manualIndex = config?.strokeIndexes[hole.hole_number - 1] ?? null;
    const strokeIndex = importedIndex ?? manualIndex ?? hole.hole_number;
    const source: StablefordHoleResult["strokeIndexSource"] = importedIndex !== null ? "import" : manualIndex !== null ? "manual" : "fallback";
    const handicapStrokes = strokesForIndex(handicap, strokeIndex);
    const netScore = hole.total_strokes - handicapStrokes;
    const points = Math.max(0, 2 + hole.hole_par - netScore);
    return {
      holeNumber: hole.hole_number,
      par: hole.hole_par,
      gross: hole.total_strokes,
      strokeIndex,
      strokeIndexSource: source,
      handicapStrokes,
      netScore,
      points,
      classification: stablefordClass(points),
    };
  });

  return { total: officialTotal ?? sumNullable(perHole.map((hole) => hole.points)), perHole };
}

function strokesForIndex(handicap: number, strokeIndex: number) {
  const base = Math.floor(Math.max(0, handicap) / 18);
  const remainder = Math.max(0, handicap) % 18;
  return base + (strokeIndex <= remainder ? 1 : 0);
}

function officialStablefordTotal(raw: RawRound) {
  const contextPoints = num(raw.round_handicap_context?.official_stableford_points);
  if (contextPoints !== null) return contextPoints;
  const scoringFormat = String(raw.round_metadata?.scoring_format ?? "").toLowerCase();
  const summaryPoints = num(raw.score_summary?.net_score_or_points);
  if (summaryPoints !== null && /stableford|points|poäng|poang/.test(scoringFormat)) return summaryPoints;
  return null;
}

function stablefordClass(points: number): StablefordClass {
  if (points <= 0) return "zero";
  if (points === 1) return "damage";
  if (points === 2) return "stable";
  if (points === 3) return "gained";
  return "exceptional";
}

function buildPracticeLeak(rounds: RoundMetric[]) {
  const zeroes = rounds.reduce((total, round) => total + round.zeroPointHoles18, 0);
  const penalties = average(rounds.map((round) => round.penalties18)) ?? 0;
  const putts = average(rounds.map((round) => round.putts18)) ?? 0;
  const gir = average(rounds.map((round) => round.girPct)) ?? 0;
  if (penalties >= 2) return { area: "Penalty avoidance", estimate: Math.min(zeroes, penalties * 0.8), reason: "Penalty holes are frequently turning into zero-point holes." };
  if (putts >= 36) return { area: "Putting stability", estimate: Math.min(zeroes, (putts - 34) * 0.35), reason: "High putt volume is limiting two-point holes." };
  if (gir < 22) return { area: "Approach and recovery", estimate: Math.min(zeroes, (22 - gir) * 0.08), reason: "Missed GIR recovery is the largest path to more scoring holes." };
  return { area: "Zero-point prevention", estimate: zeroes / Math.max(rounds.length, 1), reason: "The fastest gain is turning zeroes into one-point holes." };
}

export function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function sumNullable(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? sum(valid) : null;
}

function standardDeviation(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length < 2) return null;
  const avg = valid.reduce((total, value) => total + value, 0) / valid.length;
  return Math.sqrt(valid.reduce((total, value) => total + (value - avg) ** 2, 0) / valid.length);
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = num(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function shotScore(uses: number, target: number) {
  return Math.min(100, (uses / target) * 100);
}

function badOutcomesRate(bad: number, total: number) {
  return total ? (bad / total) * 100 : 0;
}

function invertRate(rate: number) {
  return Math.max(0, 100 - rate);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function slug(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function percent(value: number | null, total: number) {
  return value !== null && total > 0 ? (value / total) * 100 : null;
}

function scaleTo18(value: number | null, normalizationFactor: number) {
  return value === null ? null : value * normalizationFactor;
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatNumber(value: number | string | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  return Number.isInteger(value) && decimals === 0 ? String(value) : value.toFixed(decimals);
}
