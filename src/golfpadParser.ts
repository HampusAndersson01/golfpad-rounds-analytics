import JSZip from "jszip";
import Papa from "papaparse";
import type { RawHole, RawRound, RawShot } from "./analytics";

export type ImportLogLevel = "info" | "warning" | "error";

export type ImportLog = {
  level: ImportLogLevel;
  message: string;
};

export type ImportSummary = {
  archiveFiles: string[];
  csvFiles: {
    rounds?: string;
    holes?: string;
    shots?: string;
  };
  csvSchemas: Record<string, string[]>;
  roundsFound: number;
  errors: string[];
  logs: ImportLog[];
};

export type ParsedGolfPadExport = {
  rounds: RawRound[];
  summary: ImportSummary;
};

type CsvRow = Record<string, string>;

const REQUIRED = {
  rounds: "rounds",
  holes: "holes",
  shots: "shots",
} as const;

export async function parseGolfPadZip(file: File, onLog?: (log: ImportLog) => void): Promise<ParsedGolfPadExport> {
  const logs: ImportLog[] = [];
  const log = (level: ImportLogLevel, message: string) => {
    const entry = { level, message };
    logs.push(entry);
    onLog?.(entry);
  };

  log("info", `Reading ${file.name}`);
  const zip = await JSZip.loadAsync(file);
  const archiveFiles = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .sort();

  log("info", `Archive contains ${archiveFiles.length} files`);
  const csvFiles = detectCsvFiles(archiveFiles);
  const errors: string[] = [];

  if (!csvFiles.rounds) errors.push("Rounds.csv was not found in the ZIP.");
  if (!csvFiles.holes) log("warning", "Holes.csv was not found; rounds will import without hole detail.");
  if (!csvFiles.shots) log("warning", "Shots.csv was not found; club analytics will be limited.");
  if (!csvFiles.rounds) {
    return {
      rounds: [],
      summary: { archiveFiles, csvFiles, csvSchemas: {}, roundsFound: 0, errors, logs },
    };
  }

  const csvSchemas: Record<string, string[]> = {};
  const roundsRows = await parseCsvFromZip(zip, csvFiles.rounds);
  csvSchemas[csvFiles.rounds] = Object.keys(roundsRows[0] ?? {});
  log("info", `${csvFiles.rounds}: ${roundsRows.length} rows, ${csvSchemas[csvFiles.rounds].length} columns`);

  const holeRows = csvFiles.holes ? await parseCsvFromZip(zip, csvFiles.holes) : [];
  if (csvFiles.holes) {
    csvSchemas[csvFiles.holes] = Object.keys(holeRows[0] ?? {});
    log("info", `${csvFiles.holes}: ${holeRows.length} rows, ${csvSchemas[csvFiles.holes].length} columns`);
  }

  const shotRows = csvFiles.shots ? await parseCsvFromZip(zip, csvFiles.shots) : [];
  if (csvFiles.shots) {
    csvSchemas[csvFiles.shots] = Object.keys(shotRows[0] ?? {});
    log("info", `${csvFiles.shots}: ${shotRows.length} rows, ${csvSchemas[csvFiles.shots].length} columns`);
  }

  const rounds = normalizeCsvRows(roundsRows, holeRows, shotRows);
  log("info", `Normalized ${rounds.length} rounds`);

  return {
    rounds,
    summary: { archiveFiles, csvFiles, csvSchemas, roundsFound: rounds.length, errors, logs },
  };
}

export function buildStableRoundId(round: RawRound) {
  const metadata = round.round_metadata ?? {};
  const summary = round.score_summary ?? {};
  const parts = [
    metadata.date,
    metadata.course_name,
    metadata.tee_name,
    metadata.player_name,
    summary.gross_score,
  ];
  return parts.map((part) => slug(String(part ?? "unknown"))).join("__");
}

function normalizeCsvRows(roundRows: CsvRow[], holeRows: CsvRow[], shotRows: CsvRow[]): RawRound[] {
  const shotsByRoundHole = groupRows(shotRows, (row) => [row["date"], row["course name"], row["hole number"]].join("|"));
  const holesByRound = groupRows(holeRows, (row) => roundKey(row));

  return roundRows.map((row) => {
    const key = roundKey(row);
    const holes = (holesByRound.get(key) ?? [])
      .map((holeRow): RawHole => {
        const holeNumber = toNumber(holeRow["hole number"]) ?? 0;
        const shots = (shotsByRoundHole.get([holeRow["date"], holeRow["course name"], holeRow["hole number"]].join("|")) ?? [])
          .map((shotRow): RawShot => ({
            shot_number: toNumber(shotRow["shot number"]),
            lie: text(shotRow["lie"]),
            club: text(shotRow["club"]),
            club_details: text(shotRow["club details"]),
            shot_length: toNumber(shotRow["shot length meters"]),
            target_distance_before: toNumber(shotRow["target distance before"]),
            target_distance_after: toNumber(shotRow["target distance after"]),
            outcome: text(shotRow["outcome"]),
            included_in_distance_stats: toBool(shotRow["included in distance stats"]),
            strokes_gained: toNumber(shotRow["strokes gained"]),
            fairway_center_offset: toNumber(shotRow[" distance from center of fairway"]) ?? toNumber(shotRow["distance from center of fairway"]),
            time: text(shotRow["time"]),
          }))
          .sort((a, b) => (a.shot_number ?? 0) - (b.shot_number ?? 0));

        const par = toNumber(holeRow["hole par"]) ?? 0;
        const strokes = toNumber(holeRow["total strokes"]) ?? 0;

        return {
          hole_number: holeNumber,
          hole_par: par,
          total_strokes: strokes,
          putts: toNumber(holeRow["putts"]),
          penalties: toNumber(holeRow["penalties"]),
          sand_shots: toNumber(holeRow["sand shots"]),
          fairway_result: normalizeFairway(holeRow["fairway"]),
          gir: toBool(holeRow["GIR"]),
          hole_score_to_par: par && strokes ? strokes - par : null,
          shots,
        };
      })
      .sort((a, b) => (a.hole_number ?? 0) - (b.hole_number ?? 0));

    const rawRound: RawRound = {
      round_metadata: {
        player_name: text(row["player name"]),
        date: text(row["date"]),
        start_time: text(row["start time"]),
        finish_time: text(row["finish time"]),
        course_name: text(row["course name"]),
        course_holes: toNumber(row["course holes"]),
        tee_name: text(row["tee name"]),
        rating: toNumber(row["rating"]),
        slope: toNumber(row["slope"]),
        course_handicap: toNumber(row["course handicap"]),
        scoring_format: text(row["scoring format"]),
        completed_holes: toNumber(row["completed holes"]) ?? holes.length,
      },
      score_summary: {
        gross_score: toNumber(row["gross score"]),
        gross_score_over_par: toNumber(row["gross score over par"]),
        net_score_or_points: toNumber(row["net score or points"]),
        putts: toNumber(row["putts"]),
        penalties: toNumber(row["penalties"]),
        girs: toNumber(row["GIRs"]),
        fairways: toNumber(row["fairways"]),
        sand_shots: toNumber(row["sand shots"]),
      },
      holes,
      derived_ai_metrics: deriveMetrics(holes),
      raw_source_rows: [row],
    };

    rawRound.round_metadata = {
      ...rawRound.round_metadata,
      round_id: buildStableRoundId(rawRound),
    };

    return rawRound;
  });
}

function deriveMetrics(holes: RawHole[]) {
  const front = holes.filter((hole) => (hole.hole_number ?? 0) <= 9);
  const back = holes.filter((hole) => (hole.hole_number ?? 0) > 9);
  const shots = holes.flatMap((hole) => hole.shots ?? []);
  const playableFairways = holes.filter((hole) => (hole.hole_par ?? 0) > 3);
  const fairwayHits = playableFairways.filter((hole) => hole.fairway_result === "fairway" || hole.fairway_result === "hit").length;
  const girs = holes.filter((hole) => hole.gir).length;

  return {
    front9_score: sum(front.map((hole) => hole.total_strokes)),
    back9_score: sum(back.map((hole) => hole.total_strokes)),
    front9_putts: sum(front.map((hole) => hole.putts)),
    back9_putts: sum(back.map((hole) => hole.putts)),
    gir_percentage: holes.length ? (girs / holes.length) * 100 : null,
    fairway_percentage: playableFairways.length ? (fairwayHits / playableFairways.length) * 100 : null,
    average_strokes_gained: average(shots.map((shot) => shot.strokes_gained)),
  };
}

function detectCsvFiles(files: string[]) {
  const csvs = files.filter((name) => name.toLowerCase().endsWith(".csv"));
  return {
    rounds: findCsv(csvs, REQUIRED.rounds),
    holes: findCsv(csvs, REQUIRED.holes),
    shots: findCsv(csvs, REQUIRED.shots),
  };
}

function findCsv(files: string[], requiredName: string) {
  return (
    files.find((name) => basename(name).toLowerCase() === `${requiredName}.csv`) ??
    files.find((name) => basename(name).toLowerCase().includes(requiredName))
  );
}

async function parseCsvFromZip(zip: JSZip, path: string): Promise<CsvRow[]> {
  const content = await zip.file(path)?.async("string");
  if (!content) return [];
  const parsed = Papa.parse<CsvRow>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header) => header.replace(/^\uFEFF/, ""),
  });
  if (parsed.errors.length) {
    throw new Error(`${path}: ${parsed.errors.map((error) => error.message).join("; ")}`);
  }
  return parsed.data;
}

function roundKey(row: CsvRow) {
  return [row["player name"], row["date"], row["course name"], row["tee name"]].join("|");
}

function groupRows<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyFn(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  });
  return map;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (["yes", "true", "1", "hit", "x"].includes(normalized)) return true;
  if (["no", "false", "0", "miss"].includes(normalized)) return false;
  return null;
}

function normalizeFairway(value: unknown) {
  const normalized = text(value)?.toLowerCase();
  return normalized === "hit" ? "fairway" : normalized ?? "";
}

function sum(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? valid.reduce((total, value) => total + value, 0) : null;
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function basename(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}
