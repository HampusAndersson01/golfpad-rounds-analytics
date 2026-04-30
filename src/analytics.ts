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
  total_strokes?: number | null;
  putts?: number | null;
  penalties?: number | null;
  sand_shots?: number | null;
  fairway_result?: string | null;
  gir?: boolean | null;
  hole_score_to_par?: number | null;
  shots?: RawShot[] | null;
};

export type NormalizedHole = Omit<RawHole, "hole_number" | "hole_par" | "total_strokes" | "putts" | "penalties" | "sand_shots" | "hole_score_to_par"> & {
  hole_number: number;
  hole_par: number;
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
  derived_ai_metrics?: Record<string, number | null | undefined>;
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

export function buildRoundMetrics(entries: Array<{ path: string; data: unknown }>): RoundMetric[] {
  return entries
    .map(({ path, data }) => normalizeRound(path, data as RawRound))
    .filter((round): round is RoundMetric => Boolean(round))
    .sort((a, b) => `${a.date}-${a.path}`.localeCompare(`${b.date}-${b.path}`));
}

function normalizeRound(path: string, raw: RawRound): RoundMetric | null {
  const metadata = raw.round_metadata ?? {};
  const summary = raw.score_summary ?? {};
  const date = metadata.date ?? path.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (!date) return null;

  const holes = (raw.holes ?? [])
    .filter((hole) => num(hole.hole_number) !== null && num(hole.hole_par) !== null && num(hole.total_strokes) !== null)
    .map((hole) => ({
      ...hole,
      hole_number: num(hole.hole_number) ?? 0,
      hole_par: num(hole.hole_par) ?? 0,
      total_strokes: num(hole.total_strokes) ?? 0,
      putts: num(hole.putts),
      penalties: num(hole.penalties),
      sand_shots: num(hole.sand_shots),
      hole_score_to_par: num(hole.hole_score_to_par),
    }));
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
  const grossRounds = rounds.filter((round) => round.grossScore18 !== null);
  const sortedByGross = [...grossRounds].sort((a, b) => (a.grossScore18 ?? Infinity) - (b.grossScore18 ?? Infinity));
  return {
    totalRounds: rounds.length,
    normalizedRounds: rounds.filter((round) => round.normalizationFactor !== 1).length,
    averageGross: average(rounds.map((round) => round.grossScore18)),
    bestScore: sortedByGross[0]?.grossScore18 ?? null,
    bestRound: sortedByGross[0],
    worstScore: sortedByGross.at(-1)?.grossScore18 ?? null,
    worstRound: sortedByGross.at(-1),
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
    { metric: "Gross score / 18", key: "grossScore18" as const, lowerBetter: true },
    { metric: "Over par / 18", key: "grossOverPar18" as const, lowerBetter: true },
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
      return {
        club,
        uses: shots.length,
        avgLength: average(shots.filter((shot) => shot.included_in_distance_stats !== false).map((shot) => num(shot.shot_length))),
        avgStrokesGained: average(shots.map((shot) => num(shot.strokes_gained))),
        badOutcomeRate: shots.length ? (bad / shots.length) * 100 : 0,
        penalties: penaltyShots,
        roughOrSand,
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

export function buildBlowUpAnalysis(rounds: RoundMetric[]) {
  const byHole = new Map<number, Array<{ toPar: number; doubleBogey: boolean }>>();
  rounds.forEach((round) => {
    round.holes.forEach((hole) => {
      const toPar = num(hole.hole_score_to_par) ?? hole.total_strokes - hole.hole_par;
      byHole.set(hole.hole_number, [...(byHole.get(hole.hole_number) ?? []), { toPar, doubleBogey: toPar >= 2 }]);
    });
  });

  const worstHoleNumbers = Array.from(byHole.entries())
    .map(([holeNumber, rows]) => ({
      holeNumber,
      averageToPar: average(rows.map((row) => row.toPar)) ?? 0,
      doubleBogeys: rows.filter((row) => row.doubleBogey).length,
    }))
    .sort((a, b) => b.averageToPar - a.averageToPar)
    .slice(0, 6);

  return {
    worstHoleNumbers,
    backNineCollapses: rounds.filter((round) => round.front9Score !== null && round.back9Score !== null && round.back9Score - round.front9Score >= 4).length,
  };
}

export function buildInsights(rounds: RoundMetric[], clubs: ClubMetric[], blowUps: ReturnType<typeof buildBlowUpAnalysis>) {
  const insights: string[] = [];
  const last10 = rounds.slice(-10);
  const prev10 = rounds.slice(-20, -10);
  const recentScore = average(last10.map((round) => round.grossScore18));
  const previousScore = average(prev10.map((round) => round.grossScore18));
  if (recentScore !== null && previousScore !== null) {
    const diff = recentScore - previousScore;
    insights.push(`Scoring ${diff <= 0 ? "improved" : "declined"} by ${formatNumber(Math.abs(diff), 1)} strokes per 18 over the latest 10 rounds versus the previous 10.`);
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
  if (bestClub) insights.push(`${bestClub.club} is the strongest recorded club by strokes gained among clubs with 5+ shots.`);

  if (blowUps.worstHoleNumbers[0]) {
    insights.push(`Hole ${blowUps.worstHoleNumbers[0].holeNumber} has been the costliest hole number at ${formatNumber(blowUps.worstHoleNumbers[0].averageToPar, 2)} strokes over par on average.`);
  }

  return insights.slice(0, 5);
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
